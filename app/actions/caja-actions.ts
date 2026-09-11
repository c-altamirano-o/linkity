"use server";

import { prisma, getTenantPrisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { CashSessionStatus, MovementType } from "@prisma/client";
import { efectivoDeVenta } from "@/lib/caja-data";

/**
 * Server Actions del módulo Caja (M10). Mismo criterio que POS/Reparaciones:
 * el cliente solo manda ids y montos "propuestos" (ej. el efectivo contado
 * al cerrar) — el efectivo esperado SIEMPRE se recalcula aquí desde las
 * ventas y movimientos reales, nunca se confía en lo que ya traía calculado
 * la UI.
 *
 * Alcance no cubierto todavía: el cobro de una reparación (Repair.finalCost)
 * no genera ningún CashMovement — el flujo actual de Reparaciones no tiene
 * un paso de "marcar como cobrada", así que no hay un evento real del que
 * colgarlo. Si se quiere que el cobro de una reparación afecte el efectivo
 * esperado de caja, el siguiente paso sería agregar ese paso al flujo de
 * Reparaciones (probablemente registrando un CashMovement de tipo INCOME al
 * marcarla como cobrada).
 */

type ResolverResult =
  | { ok: true; tenant: { id: string }; dbUser: { id: string; tenantId: string } }
  | { ok: false; error: string };

// Nota: se usa un discriminante `ok` explícito (en vez de `"error" in resuelto`)
// porque TypeScript no siempre angosta de forma confiable una unión de más de
// dos formas de objeto inferida por control flow — Carlos reportó 3 errores
// TS2322 ("string | undefined" no asignable a "string") en los 3 sitios que
// hacían `if ("error" in resuelto) return { ok:false, error: resuelto.error }`.
// Con `ok` como discriminante explícito y el tipo de retorno anotado, la
// angostura es exacta — mismo patrón que ya usan AccionSimpleResult,
// CrearReparacionResult, etc. en el resto del proyecto.
async function resolverTenantYUsuario(tenantSlug: string): Promise<ResolverResult> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  if (!tenant) return { ok: false, error: "Negocio no encontrado" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión no válida, vuelve a iniciar sesión" };

  const dbUser = await prisma.user.findUnique({
    where: { supabaseId: user.id },
    select: { id: true, tenantId: true },
  });
  if (!dbUser || dbUser.tenantId !== tenant.id) {
    return { ok: false, error: "No tienes acceso a este negocio" };
  }

  return { ok: true, tenant, dbUser };
}

export type AccionCajaResult = { ok: true } | { ok: false; error: string };

export async function abrirCajaAction(params: {
  tenantSlug: string;
  branchId: string;
  montoApertura: number;
  notas?: string | null;
}): Promise<AccionCajaResult> {
  const { tenantSlug, branchId, montoApertura, notas } = params;

  if (!branchId) return { ok: false, error: "Selecciona una sucursal" };
  if (!Number.isFinite(montoApertura) || montoApertura < 0) {
    return { ok: false, error: "El monto de apertura no es válido" };
  }

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant, dbUser } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!branch) return { ok: false, error: "Sucursal no encontrada" };

    const yaAbierta = await db.cashSession.findFirst({
      where: { branchId, status: CashSessionStatus.OPEN },
      select: { id: true },
    });
    if (yaAbierta) return { ok: false, error: "Ya hay una caja abierta en esta sucursal" };

    await db.cashSession.create({
      data: {
        tenantId: tenant.id,
        branchId,
        userId: dbUser.id,
        openingCash: montoApertura,
        notes: notas?.trim() || null,
      },
    });

    revalidatePath(`/${tenantSlug}/caja`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al abrir caja:", err);
    return { ok: false, error: "No se pudo abrir la caja" };
  }
}

export async function registrarMovimientoAction(params: {
  tenantSlug: string;
  cashSessionId: string;
  tipo: "ingreso" | "egreso";
  concepto: string;
  monto: number;
}): Promise<AccionCajaResult> {
  const { tenantSlug, cashSessionId, tipo, concepto, monto } = params;

  if (!concepto.trim()) return { ok: false, error: "Describe el concepto del movimiento" };
  if (!Number.isFinite(monto) || monto <= 0) return { ok: false, error: "El monto no es válido" };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    // CashSession sí tiene tenantId propio → esto valida ownership de
    // verdad. CashMovement no tiene tenantId (ver lib/prisma.ts), así que
    // su pertenencia al tenant se garantiza indirectamente: solo se crea
    // colgado de una sesión que ya pasó esta validación.
    const sesion = await db.cashSession.findUnique({
      where: { id: cashSessionId },
      select: { id: true, status: true },
    });
    if (!sesion) return { ok: false, error: "Sesión de caja no encontrada" };
    if (sesion.status !== CashSessionStatus.OPEN) {
      return { ok: false, error: "Esa sesión de caja ya está cerrada" };
    }

    await prisma.cashMovement.create({
      data: {
        cashSessionId,
        type: tipo === "ingreso" ? MovementType.INCOME : MovementType.EXPENSE,
        amount: monto,
        concept: concepto.trim(),
      },
    });

    revalidatePath(`/${tenantSlug}/caja`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al registrar movimiento de caja:", err);
    return { ok: false, error: "No se pudo registrar el movimiento" };
  }
}

export async function cerrarCajaAction(params: {
  tenantSlug: string;
  cashSessionId: string;
  efectivoContado: number;
  notas?: string | null;
}): Promise<AccionCajaResult> {
  const { tenantSlug, cashSessionId, efectivoContado, notas } = params;

  if (!Number.isFinite(efectivoContado) || efectivoContado < 0) {
    return { ok: false, error: "El efectivo contado no es válido" };
  }

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const sesion = await db.cashSession.findUnique({
      where: { id: cashSessionId },
      select: { id: true, status: true, branchId: true, openingCash: true, openedAt: true },
    });
    if (!sesion) return { ok: false, error: "Sesión de caja no encontrada" };
    if (sesion.status !== CashSessionStatus.OPEN) {
      return { ok: false, error: "Esa sesión de caja ya está cerrada" };
    }

    // Recalculado aquí, no se confía en nada precalculado del lado del
    // cliente — mismo criterio que crearVentaAction en pos-actions.ts.
    const [movimientos, ventas] = await Promise.all([
      prisma.cashMovement.findMany({ where: { cashSessionId }, select: { type: true, amount: true } }),
      db.sale.findMany({
        where: { branchId: sesion.branchId, createdAt: { gte: sesion.openedAt } },
        include: { mixedPayments: true },
      }),
    ]);

    const ingresosManual = movimientos
      .filter((m) => m.type === MovementType.INCOME)
      .reduce((s, m) => s + Number(m.amount), 0);
    const egresosManual = movimientos
      .filter((m) => m.type === MovementType.EXPENSE)
      .reduce((s, m) => s + Number(m.amount), 0);
    const ventasEfectivo = ventas.reduce((s, v) => s + efectivoDeVenta(v), 0);

    const expectedCash = Number(sesion.openingCash) + ventasEfectivo + ingresosManual - egresosManual;
    const difference = efectivoContado - expectedCash;

    await db.cashSession.update({
      where: { id: cashSessionId },
      data: {
        closingCash: efectivoContado,
        expectedCash,
        difference,
        status: CashSessionStatus.CLOSED,
        closedAt: new Date(),
        notes: notas?.trim() || undefined,
      },
    });

    revalidatePath(`/${tenantSlug}/caja`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al cerrar caja:", err);
    return { ok: false, error: "No se pudo cerrar la caja" };
  }
}
