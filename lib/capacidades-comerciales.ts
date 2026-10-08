import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * CAPA CENTRAL DE CAPACIDADES COMERCIALES (2026-10-08).
 *
 * Es el ÚNICO lugar que responde dos preguntas sobre un negocio:
 *   - ¿su plan incluye esta función?   → tieneFeature(tenantId, "API_FACTURACION")
 *   - ¿cuánto permite este límite?     → obtenerLimite(tenantId, "MAX_SUCURSALES")
 *
 * Ninguna otra parte del sistema debe leer CommercialPlan / CommercialPlanFeature
 * / CommercialPlanLimit directamente: así, agregar una función o un límite nuevo
 * es agregar una fila al catálogo (Panel Maestro) y llamar a esta capa donde se
 * necesite, sin tocar el núcleo ni afectar a los negocios que ya existen.
 *
 * Esto es restricción COMERCIAL (lo que el cliente compró). No tiene nada que
 * ver con los permisos internos del negocio (Role / RolePermission), que
 * decide el administrador de cada negocio y que los planes nunca modifican.
 *
 * REGLAS (acordadas con Carlos):
 *  - Prueba gratis (Subscription.status = TRIAL): TODAS las funciones y SIN
 *    límites. Si la prueba ya venció el acceso lo bloquea el layout; aquí no
 *    se restringe nada más.
 *  - ACTIVE (incluye los 7 días de gracia): lo que diga su plan comercial.
 *  - Nadie debería estar ACTIVE sin plan. Si pasa (venta no identificada, dato
 *    viejo, alta manual incompleta) NO se deja sin límites: se aplican los del
 *    plan BASICO y se deja un aviso en el log para corregirlo.
 *  - Un límite que el plan no tiene configurado = sin restricción (así un
 *    límite nuevo del catálogo no recorta a nadie hasta que Carlos lo fija).
 *  - Una función que el plan no tiene ligada = NO incluida.
 */

export const LIMITE_SUCURSALES = "MAX_SUCURSALES";
export const LIMITE_EMPLEADOS_POR_SUCURSAL = "MAX_EMPLEADOS_POR_SUCURSAL";
export const FUNCION_API_FACTURACION = "API_FACTURACION";

const PLAN_POR_DEFECTO = "BASICO";

/** Último recurso si ni siquiera existe el plan BASICO en la base. */
const RESPALDO_BASICO = {
  nombre: "Básico",
  limites: { [LIMITE_SUCURSALES]: 1, [LIMITE_EMPLEADOS_POR_SUCURSAL]: 2 } as Record<string, number>,
};

export type ModoComercial =
  /** Prueba gratis: todo habilitado, sin límites. */
  | "prueba"
  /** Plan comercial asignado: se aplica tal cual. */
  | "plan"
  /** Sin plan asignado (no debería pasar): se aplican los límites de Básico. */
  | "plan_por_defecto";

export interface LimiteResuelto {
  /** true = sin tope. */
  ilimitado: boolean;
  /** Tope numérico; null cuando es ilimitado. */
  valor: number | null;
}

export interface Capacidades {
  modo: ModoComercial;
  planCode: string | null;
  planNombre: string | null;
  tieneFeature: (codigo: string) => boolean;
  limite: (codigo: string) => LimiteResuelto;
}

const SIN_LIMITE: LimiteResuelto = { ilimitado: true, valor: null };

const CAPACIDADES_PRUEBA: Capacidades = {
  modo: "prueba",
  planCode: null,
  planNombre: "Prueba gratis",
  tieneFeature: () => true,
  limite: () => SIN_LIMITE,
};

async function cargarPlan(where: { id: string } | { code: string }) {
  return prisma.commercialPlan.findUnique({
    where,
    select: {
      code: true,
      name: true,
      features: { select: { feature: { select: { code: true, isActive: true } } } },
      limits: { select: { value: true, isUnlimited: true, limit: { select: { code: true } } } },
    },
  });
}

type PlanCargado = NonNullable<Awaited<ReturnType<typeof cargarPlan>>>;

function capacidadesDePlan(plan: PlanCargado, modo: ModoComercial): Capacidades {
  const funciones = new Set(plan.features.filter((f) => f.feature.isActive).map((f) => f.feature.code));
  const limites = new Map<string, LimiteResuelto>();
  for (const l of plan.limits) {
    limites.set(
      l.limit.code,
      l.isUnlimited || l.value === null ? SIN_LIMITE : { ilimitado: false, valor: Number(l.value) }
    );
  }
  return {
    modo,
    planCode: plan.code,
    planNombre: plan.name,
    tieneFeature: (codigo) => funciones.has(codigo),
    limite: (codigo) => limites.get(codigo) ?? SIN_LIMITE,
  };
}

function capacidadesDeRespaldo(): Capacidades {
  return {
    modo: "plan_por_defecto",
    planCode: PLAN_POR_DEFECTO,
    planNombre: RESPALDO_BASICO.nombre,
    tieneFeature: () => false,
    limite: (codigo) => {
      const v = RESPALDO_BASICO.limites[codigo];
      return v === undefined ? SIN_LIMITE : { ilimitado: false, valor: v };
    },
  };
}

/**
 * Resuelve las capacidades de un negocio. Hace 2 consultas pequeñas (y dentro
 * de una misma petición el resultado se reutiliza: React `cache`, así el
 * layout, el exceso de plan y las acciones no repiten las consultas); si una
 * acción necesita varias respuestas, conviene llamarla una vez y reutilizar el
 * resultado en vez de llamar tieneFeature/obtenerLimite varias veces.
 *
 * `tenantId` debe venir ya resuelto/confiable (tenant.id de resolverActor o
 * resolverTenantYUsuario), nunca de un parámetro del cliente.
 */
export const obtenerCapacidades = cache(async (tenantId: string): Promise<Capacidades> => {
  const sub = await prisma.subscription.findUnique({
    where: { tenantId },
    select: { status: true, commercialPlanId: true },
  });

  if (sub?.status === "TRIAL") return CAPACIDADES_PRUEBA;

  if (sub?.commercialPlanId) {
    const plan = await cargarPlan({ id: sub.commercialPlanId });
    if (plan) return capacidadesDePlan(plan, "plan");
    console.error(
      `⚠️  Capacidades: el negocio ${tenantId} apunta a un plan comercial que ya no existe (${sub.commercialPlanId}). Se aplican los límites de ${PLAN_POR_DEFECTO}.`
    );
  } else {
    console.warn(
      `⚠️  Capacidades: el negocio ${tenantId} no tiene plan comercial asignado (suscripción ${sub ? sub.status : "inexistente"}). Se aplican los límites de ${PLAN_POR_DEFECTO}; asígnale un plan desde Panel Maestro.`
    );
  }

  const basico = await cargarPlan({ code: PLAN_POR_DEFECTO });
  if (basico) return capacidadesDePlan(basico, "plan_por_defecto");

  console.error(`❌ Capacidades: no existe el plan ${PLAN_POR_DEFECTO} en la base (¿falta correr el seed comercial?). Se usan los límites de respaldo.`);
  return capacidadesDeRespaldo();
});

export async function tieneFeature(tenantId: string, codigo: string): Promise<boolean> {
  return (await obtenerCapacidades(tenantId)).tieneFeature(codigo);
}

export async function obtenerLimite(tenantId: string, codigo: string): Promise<LimiteResuelto> {
  return (await obtenerCapacidades(tenantId)).limite(codigo);
}

/**
 * ¿Se puede agregar UNO más cuando ya hay `usoActual`? Es la pregunta que se
 * hace antes de crear una sucursal o un empleado, o de reactivar uno
 * desactivado (reactivar cuenta igual que crear).
 */
export function puedeAgregarUno(limite: LimiteResuelto, usoActual: number): boolean {
  return limite.ilimitado || usoActual < (limite.valor ?? 0);
}

// ---------------------------------------------------------------------------
// Excedentes (los usa el flujo de baja de plan / límite reducido; ver
// lib/exceso-plan.ts y Subscription.excesoDetectadoAt, Paso 5).
// ---------------------------------------------------------------------------

export interface ExcesoSucursales {
  limite: LimiteResuelto;
  activas: number;
  excede: boolean;
}

export interface ExcesoEmpleadosSucursal {
  branchId: string;
  branchName: string;
  limite: LimiteResuelto;
  activos: number;
  excede: boolean;
}

export interface ExcesosNegocio {
  capacidades: Capacidades;
  sucursales: ExcesoSucursales;
  empleadosPorSucursal: ExcesoEmpleadosSucursal[];
  /** true si hay algo por arreglar (sucursales o empleados). */
  hayExceso: boolean;
}

/**
 * Compara el uso REAL del negocio contra su plan. Solo cuenta sucursales y
 * empleados (Staff) activos: el administrador (cuenta real de Supabase) y la
 * cuenta técnica oculta de cada empleado no cuentan.
 */
export async function calcularExcesos(tenantId: string): Promise<ExcesosNegocio> {
  const capacidades = await obtenerCapacidades(tenantId);

  const [sucursalesActivas, staffPorSucursal] = await Promise.all([
    prisma.branch.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true } }),
    prisma.staff.groupBy({ by: ["branchId"], where: { tenantId, isActive: true }, _count: { _all: true } }),
  ]);

  const limiteSuc = capacidades.limite(LIMITE_SUCURSALES);
  const sucursales: ExcesoSucursales = {
    limite: limiteSuc,
    activas: sucursalesActivas.length,
    excede: !limiteSuc.ilimitado && sucursalesActivas.length > (limiteSuc.valor ?? 0),
  };

  const limiteEmp = capacidades.limite(LIMITE_EMPLEADOS_POR_SUCURSAL);
  const conteo = new Map(staffPorSucursal.map((g) => [g.branchId, g._count._all]));
  const empleadosPorSucursal: ExcesoEmpleadosSucursal[] = sucursalesActivas.map((b) => {
    const activos = conteo.get(b.id) ?? 0;
    return {
      branchId: b.id,
      branchName: b.name,
      limite: limiteEmp,
      activos,
      excede: !limiteEmp.ilimitado && activos > (limiteEmp.valor ?? 0),
    };
  });

  return {
    capacidades,
    sucursales,
    empleadosPorSucursal,
    hayExceso: sucursales.excede || empleadosPorSucursal.some((e) => e.excede),
  };
}
