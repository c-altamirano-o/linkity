import "server-only";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
import { calcularEstadoCiclo } from "@/lib/ciclo-suscripcion";
import { calcularExcesos, LIMITE_EMPLEADOS_POR_SUCURSAL } from "@/lib/capacidades-comerciales";
import { calcularEstadoExceso, type EstadoExceso } from "@/lib/exceso-plan-estado";

/**
 * EXCESO DE PLAN (Paso 5, 2026-10-08) — qué pasa cuando un negocio tiene más
 * sucursales activas, o más empleados activos en una sucursal, de lo que
 * permite su plan (porque bajó de plan, porque terminó la prueba y compró uno
 * menor, o porque Carlos redujo un límite del catálogo).
 *
 * Reglas acordadas con Carlos:
 *  1. Al detectarse el exceso se avisa y corren 7 días de gracia.
 *  2. Pasados los 7 días, TODO el sistema queda bloqueado hasta que el
 *     administrador elija qué sucursales (y qué empleados por sucursal)
 *     conservar activos. Lo demás se DESACTIVA (nunca se borra) y se puede
 *     reactivar si después sube de plan.
 *  3. Prueba gratis = sin límites, así que nunca hay exceso durante la prueba.
 *
 * La fecha de detección vive en Subscription.excesoDetectadoAt. No hay un
 * proceso que la "ponga": se sincroniza sola (aquí) cada vez que se carga el
 * negocio y en el cron diario, así que no depende de que nadie se acuerde de
 * llamarla al cambiar un plan o un límite — añadir planes o límites nuevos no
 * requiere tocar este archivo.
 */

/**
 * Pone o quita la marca de exceso según el uso REAL del negocio contra su
 * plan, y devuelve el estado del plazo. Idempotente y segura de llamar en
 * cada request. Si algo falla NO bloquea al negocio (falla "abierta" y deja
 * el error en el log): bloquear por un fallo nuestro costaría más que
 * dejar pasar unos minutos.
 */
export async function sincronizarExceso(
  tenantId: string,
  sub: { status: string; excesoDetectadoAt: Date | null }
): Promise<EstadoExceso> {
  const ahora = new Date();
  try {
    // Solo las cuentas de paga (ACTIVE) tienen límites. TRIAL no tiene; el
    // resto (cancelada, suspendida…) ya está bloqueada por otro camino.
    if (sub.status !== "ACTIVE") {
      if (sub.excesoDetectadoAt) await limpiarMarcaExceso(tenantId);
      return calcularEstadoExceso(null);
    }

    const ex = await calcularExcesos(tenantId);

    if (!ex.hayExceso) {
      if (sub.excesoDetectadoAt) await limpiarMarcaExceso(tenantId);
      return calcularEstadoExceso(null);
    }

    if (sub.excesoDetectadoAt) return calcularEstadoExceso(sub.excesoDetectadoAt, ahora);

    // Primer momento en que se ve el exceso. updateMany con "IS NULL" para que,
    // si dos requests lo detectan a la vez, solo uno ponga la fecha.
    const r = await prisma.subscription.updateMany({
      where: { tenantId, excesoDetectadoAt: null },
      data: { excesoDetectadoAt: ahora, excesoNoticeSentAt: null, excesoFinalNoticeSentAt: null },
    });
    if (r.count === 0) {
      const actual = await prisma.subscription.findUnique({ where: { tenantId }, select: { excesoDetectadoAt: true } });
      return calcularEstadoExceso(actual?.excesoDetectadoAt ?? ahora, ahora);
    }
    return calcularEstadoExceso(ahora, ahora);
  } catch (err) {
    console.error(`❌ No se pudo sincronizar el exceso de plan del negocio ${tenantId}:`, err);
    return calcularEstadoExceso(null);
  }
}

async function limpiarMarcaExceso(tenantId: string) {
  await prisma.subscription.updateMany({
    where: { tenantId },
    data: { excesoDetectadoAt: null, excesoNoticeSentAt: null, excesoFinalNoticeSentAt: null },
  });
}

// ---------------------------------------------------------------------------
// Datos para la pantalla "Ajustar plan"
// ---------------------------------------------------------------------------

export interface EmpleadoAjuste {
  id: string;
  name: string;
  position: string | null;
}

export interface SucursalAjuste {
  id: string;
  name: string;
  code: string | null;
  /** Hay una caja abierta: conviene cerrarla antes de desactivar la sucursal. */
  cajaAbierta: boolean;
  empleados: EmpleadoAjuste[];
  /** Esta sucursal tiene más empleados activos de los que permite el plan. */
  excedeEmpleados: boolean;
}

export interface DatosAjustePlan {
  planNombre: string | null;
  /** null = sin tope. */
  limiteSucursales: number | null;
  limiteEmpleados: number | null;
  excedeSucursales: boolean;
  sucursales: SucursalAjuste[];
  diasRestantes: number | null;
  vencido: boolean;
}

export async function obtenerDatosAjuste(tenantId: string, estado: EstadoExceso): Promise<DatosAjustePlan> {
  const ex = await calcularExcesos(tenantId);

  const [sucursales, staff, cajas] = await Promise.all([
    prisma.branch.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.staff.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, position: true, branchId: true },
      orderBy: { id: "asc" },
    }),
    prisma.cashSession.findMany({
      where: { tenantId, status: "OPEN" },
      select: { branchId: true },
    }),
  ]);

  const limEmp = ex.capacidades.limite(LIMITE_EMPLEADOS_POR_SUCURSAL);
  const cajasAbiertas = new Set(cajas.map((c) => c.branchId));

  return {
    planNombre: ex.capacidades.planNombre,
    limiteSucursales: ex.sucursales.limite.ilimitado ? null : ex.sucursales.limite.valor,
    limiteEmpleados: limEmp.ilimitado ? null : limEmp.valor,
    excedeSucursales: ex.sucursales.excede,
    sucursales: sucursales.map((s) => {
      const empleados = staff
        .filter((e) => e.branchId === s.id)
        .map((e) => ({ id: e.id, name: e.name, position: e.position }));
      return {
        id: s.id,
        name: s.name,
        code: s.code,
        cajaAbierta: cajasAbiertas.has(s.id),
        empleados,
        excedeEmpleados: !limEmp.ilimitado && empleados.length > (limEmp.valor ?? 0),
      };
    }),
    diasRestantes: estado.diasRestantes,
    vencido: estado.vencido,
  };
}

// ---------------------------------------------------------------------------
// Identidad: ¿quién puede ajustar el plan?
// ---------------------------------------------------------------------------

export type AdminNegocioResult =
  | { ok: true; tenantId: string; excesoDetectadoAt: Date | null; status: string }
  | { ok: false; error: string };

/**
 * Solo el administrador con cuenta REAL (Supabase Auth) del propio negocio
 * puede decidir qué conservar. Se rechaza cuando en este navegador hay además
 * una sesión de PIN de ese negocio (mismo criterio que el resto del sistema:
 * la sesión de personal manda, un empleado que tecleó un PIN nunca hereda el
 * poder de administrador).
 *
 * No exige que la suscripción esté al corriente en lo comercial, pero sí que
 * NO esté bloqueada por el ciclo (vencida/cancelada): en ese caso lo que
 * toca es renovar, no ajustar.
 */
export async function resolverAdminNegocio(tenantSlug: string): Promise<AdminNegocioResult> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, subscription: { select: { status: true, endDate: true, excesoDetectadoAt: true } } },
  });
  if (!tenant) return { ok: false, error: "Negocio no encontrado" };

  if (calcularEstadoCiclo(tenant.subscription).bloqueada) {
    return { ok: false, error: "Esta cuenta está bloqueada por falta de renovación." };
  }

  const sesionPersonal = await verificarSesionPersonalVigente();
  if (sesionPersonal && sesionPersonal.tenantId === tenant.id) {
    return { ok: false, error: "Solo el administrador del negocio puede hacer este ajuste." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión no válida, vuelve a iniciar sesión" };

  const dbUser = await prisma.user.findUnique({
    where: { supabaseId: user.id },
    select: { tenantId: true, isActive: true },
  });
  if (!dbUser || !dbUser.isActive || dbUser.tenantId !== tenant.id) {
    return { ok: false, error: "Sesión no válida, vuelve a iniciar sesión" };
  }

  return {
    ok: true,
    tenantId: tenant.id,
    status: tenant.subscription?.status ?? "NONE",
    excesoDetectadoAt: tenant.subscription?.excesoDetectadoAt ?? null,
  };
}
