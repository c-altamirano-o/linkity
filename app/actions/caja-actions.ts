"use server";

import { prisma, getTenantPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { CashSessionStatus, MovementType, NotificacionTipo } from "@prisma/client";
import { efectivoDeVenta } from "@/lib/caja-data";
import { resolverActor, puedeOperarSucursal, type ActorResult } from "@/lib/actor";
import { crearNotificacionCaja } from "@/lib/notificaciones";

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
 *
 * Cambio de turno (2026-09-22, a petición de Carlos): no existe un flujo
 * dedicado de "turno" — un cambio de turno es simplemente que alguien
 * cierre la caja (cerrarCajaAction) y la siguiente persona la vuelva a
 * abrir (abrirCajaAction) más tarde ese mismo día; ya funcionaba porque
 * abrirCajaAction solo exige que NO haya otra sesión OPEN en la sucursal,
 * sin límite de cuántas sesiones puede haber por día. Lo que sí faltaba
 * era quedarse con registro de quién cerró cada sesión (antes solo se
 * guardaba quién la abrió) — ver closedByUserId más abajo.
 */

type ResolverResult = ActorResult;

// Delega en resolverActor (lib/actor.ts) — acepta tanto una cuenta real
// (Supabase Auth) como una sesión de PIN de personal (M11); Cajero y
// Gerente tienen "caja" en su matriz de acceso (lib/roles.ts), Técnico no.
// El tipo de retorno se queda idéntico al de siempre (`ok`/`tenant`/
// `dbUser`) para no tocar ninguna otra línea de este archivo.
async function resolverTenantYUsuario(tenantSlug: string): Promise<ResolverResult> {
  return resolverActor(tenantSlug, "caja");
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

  // 2026-09-21, a petición de Carlos: un empleado de PIN solo puede abrir
  // caja en SU sucursal (ver puedeOperarSucursal, lib/actor.ts) — antes
  // esta acción confiaba en el branchId que mandara el cliente sin más.
  if (!puedeOperarSucursal(resuelto, branchId)) {
    return { ok: false, error: "No tienes acceso a esa sucursal" };
  }

  const db = getTenantPrisma(tenant.id);

  try {
    const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true } });
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

    // 2026-09-22, a petición de Carlos ("panel de administrador en tiempo
    // real"): no debe tumbar la apertura si esto falla por lo que sea — la
    // caja ya quedó abierta (arriba), notificar es secundario a eso.
    try {
      const quienAbrio = await prisma.user.findUnique({ where: { id: dbUser.id }, select: { name: true } });
      await crearNotificacionCaja({
        tenantId: tenant.id,
        branchId,
        branchName: branch.name,
        tipo: NotificacionTipo.CAJA_ABIERTA,
        mensaje: `${branch.name} abrió caja — ${quienAbrio?.name ?? "alguien"} · fondo $${montoApertura.toLocaleString("es-MX")}`,
      });
    } catch (err) {
      console.error("No se pudo crear la notificación de apertura de caja:", err);
    }

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
      select: { id: true, status: true, branchId: true },
    });
    if (!sesion) return { ok: false, error: "Sesión de caja no encontrada" };
    if (sesion.status !== CashSessionStatus.OPEN) {
      return { ok: false, error: "Esa sesión de caja ya está cerrada" };
    }
    // 2026-09-21, a petición de Carlos: un empleado de PIN solo puede
    // registrar movimientos en la caja de SU sucursal.
    if (!puedeOperarSucursal(resuelto, sesion.branchId)) {
      return { ok: false, error: "No tienes acceso a esa sucursal" };
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
  const { tenant, dbUser } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const sesion = await db.cashSession.findUnique({
      where: { id: cashSessionId },
      select: { id: true, status: true, branchId: true, openingCash: true, openedAt: true, branch: { select: { name: true } } },
    });
    if (!sesion) return { ok: false, error: "Sesión de caja no encontrada" };
    if (sesion.status !== CashSessionStatus.OPEN) {
      return { ok: false, error: "Esa sesión de caja ya está cerrada" };
    }
    // 2026-09-21, a petición de Carlos: un empleado de PIN solo puede
    // cerrar la caja de SU sucursal.
    if (!puedeOperarSucursal(resuelto, sesion.branchId)) {
      return { ok: false, error: "No tienes acceso a esa sucursal" };
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
        closedByUserId: dbUser.id,
        notes: notas?.trim() || undefined,
      },
    });

    // Mismo criterio que en abrirCajaAction: un fallo aquí no debe tumbar
    // el cierre, que ya quedó guardado arriba.
    try {
      const quienCerro = await prisma.user.findUnique({ where: { id: dbUser.id }, select: { name: true } });
      const signo = difference === 0 ? "" : difference > 0 ? "+" : "";
      await crearNotificacionCaja({
        tenantId: tenant.id,
        branchId: sesion.branchId,
        branchName: sesion.branch.name,
        tipo: NotificacionTipo.CAJA_CERRADA,
        mensaje: `${sesion.branch.name} cerró caja — ${quienCerro?.name ?? "alguien"} · diferencia ${signo}$${difference.toLocaleString("es-MX")}`,
      });
    } catch (err) {
      console.error("No se pudo crear la notificación de cierre de caja:", err);
    }

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
