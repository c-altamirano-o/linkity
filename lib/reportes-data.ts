import "server-only";

import { getTenantPrisma } from "@/lib/prisma";
import type { RepairStatus, PaymentMethod } from "@prisma/client";

/**
 * Capa de datos reales del módulo Reportes. Antes de este cambio,
 * reportes/page.tsx tenía un objeto `mockMetrics` fijo (15 productos, 6
 * clientes, 5 reparaciones) sin ningún query a Prisma, y una tarjeta de
 * "Análisis de Operaciones" con un párrafo genérico sin datos.
 *
 * Igual que en lib/reparaciones-data.ts: los estados de RepairStatus se
 * dejan como el valor crudo del enum — el texto que ve el usuario sale de
 * lib/labels.ts (repair.status.*), que se resuelve en el propio Server
 * Component de la página (no hace falta un Client Component aquí porque
 * esta pantalla no tiene interactividad).
 */

export interface ReparacionesPorEstadoItem {
  estado: RepairStatus;
  count: number;
}

export interface VentasPorMetodoItem {
  metodo: PaymentMethod;
  total: number;
}

export interface ReportesData {
  totalProductos: number;
  totalClientes: number;
  totalReparaciones: number;
  reparacionesActivas: number;
  ventasMes: number;
  ventasMesAnterior: number;
  crecimientoVentasPct: number | null; // null = sin ventas el mes anterior para comparar
  reparacionesPorEstado: ReparacionesPorEstadoItem[];
  ventasPorMetodo: VentasPorMetodoItem[];
  // Módulo "Reparaciones" activo para este tenant (2026-09-18) — mismo
  // campo y mismo motivo que DashboardData.reparacionesActiva en
  // lib/dashboard-data.ts: cuando es false, reportes/page.tsx oculta las
  // tarjetas "Reparaciones Totales" y "Reparaciones por estatus" en vez de
  // mostrarlas siempre en cero para un negocio que no usa ese módulo.
  reparacionesActiva: boolean;
}

const CLOSED_STATUSES: RepairStatus[] = ["DELIVERED", "CANCELLED"];

function monthRange(monthsAgo: number) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 1));
  return { start, end };
}

// Reportes clínicos (M17 — Fase 2, Tarea #42, 2026-09-21). Solo aplica a
// rubros con el módulo expediente-clinico activo (dental/médico/veterinaria)
// — mismo criterio "apagado = no se consulta ni se manda al cliente" que
// reparacionesActiva de arriba.
//
// "Ocupación de sillón/agenda" REAL necesitaría un concepto de
// capacidad/horario por sucursal (ej. horas disponibles por doctor por día)
// que Linkity no modela todavía — lo que sí se puede calcular hoy es
// completadas/no-show/canceladas por doctor, que es un proxy razonable
// (una tasa alta de no-show/cancelación es la señal de "agenda mal
// aprovechada" que le importa a Carlos, aunque no dé un % de ocupación
// exacto). Evaluar a futuro si vale la pena agregar un modelo de horario
// para un % real — anotado para Fase 3, no bloqueante para esta tarea.
export interface ProduccionDoctorItem {
  doctorUserId: string;
  doctor: string;
  ventas: number; // suma de Sale.total (COMPLETED) del mes, atribuida a quien registró la venta
  tratamientos: number; // suma de TreatmentPlanItem.cost (PAGADO) del mes, atribuida al doctor que propuso el plan
  total: number;
}

export interface AceptacionPresupuestos {
  aceptados: number; // ACEPTADO + PAGADO — ya fue decidido a favor, esté pagado o no
  rechazados: number;
  propuestos: number; // todavía sin decidir — informativo, no cuenta para la tasa
  tasaAceptacionPct: number | null; // null si no hay ningún item decidido (aceptado o rechazado) todavía
}

export interface CitasPorDoctorItem {
  doctorUserId: string;
  doctor: string;
  completadas: number;
  noShow: number;
  canceladas: number;
}

export interface ReportesClinicosData {
  activo: boolean; // expedienteActiva — page.tsx ya lo sabe, pero se repite aquí para que el tipo sea autocontenido
  produccionPorDoctor: ProduccionDoctorItem[];
  aceptacionPresupuestos: AceptacionPresupuestos;
  citasPorDoctor: CitasPorDoctorItem[];
}

const VACIO_CLINICOS: ReportesClinicosData = {
  activo: false,
  produccionPorDoctor: [],
  aceptacionPresupuestos: { aceptados: 0, rechazados: 0, propuestos: 0, tasaAceptacionPct: null },
  citasPorDoctor: [],
};

export async function getReportesClinicosData(tenantId: string, expedienteActiva: boolean, branchIdFiltro?: string): Promise<ReportesClinicosData> {
  if (!expedienteActiva) return VACIO_CLINICOS;

  const db = getTenantPrisma(tenantId);
  const mesActual = monthRange(0);

  // branchIdFiltro (2026-09-21, a petición de Carlos): reportes/page.tsx lo
  // manda cuando quien pide el reporte es un empleado de PIN, para que solo
  // vea la producción/agenda de SU sucursal — un administrador no manda
  // nada y sigue viendo el negocio completo, igual que siempre.
  const [ventasPorDoctorRaw, itemsPagadosRaw, itemsDecididosRaw, citasRaw] = await Promise.all([
    db.sale.groupBy({
      by: ["userId"],
      where: {
        status: "COMPLETED",
        createdAt: { gte: mesActual.start, lt: mesActual.end },
        ...(branchIdFiltro ? { branchId: branchIdFiltro } : {}),
      },
      _sum: { total: true },
    }),
    // TreatmentPlanItem no tiene tenantId propio (ver el comentario largo en
    // schema.prisma y en tenantModels, lib/prisma.ts) — getTenantPrisma NO
    // lo inyecta automáticamente aquí, se filtra a mano vía
    // `treatmentPlan: { tenantId }`, mismo criterio que
    // verificarItemDelTenant en tratamiento-actions.ts. branchId SÍ vive en
    // TreatmentPlan, así que el filtro de sucursal se cuelga del mismo join.
    db.treatmentPlanItem.findMany({
      where: {
        status: "PAGADO",
        paidAt: { gte: mesActual.start, lt: mesActual.end },
        treatmentPlan: { tenantId, ...(branchIdFiltro ? { branchId: branchIdFiltro } : {}) },
      },
      select: { cost: true, treatmentPlan: { select: { userId: true } } },
    }),
    db.treatmentPlanItem.groupBy({
      by: ["status"],
      where: {
        status: { in: ["ACEPTADO", "RECHAZADO", "PAGADO"] },
        treatmentPlan: { tenantId, ...(branchIdFiltro ? { branchId: branchIdFiltro } : {}) },
      },
      _count: { _all: true },
    }),
    db.appointment.groupBy({
      by: ["userId", "status"],
      where: {
        status: { in: ["COMPLETED", "NO_SHOW", "CANCELLED"] },
        startsAt: { gte: mesActual.start, lt: mesActual.end },
        ...(branchIdFiltro ? { branchId: branchIdFiltro } : {}),
      },
      _count: { _all: true },
    }),
  ]);

  // Resolver nombres de doctor de una sola vez para los 3 sub-reportes —
  // Record en vez de Map (más simple y sin ambigüedad de tipos con el
  // patrón `new Map(arr.map(...))`).
  const doctorIds = new Set<string>();
  ventasPorDoctorRaw.forEach((g) => doctorIds.add(g.userId));
  itemsPagadosRaw.forEach((it) => doctorIds.add(it.treatmentPlan.userId));
  citasRaw.forEach((g) => doctorIds.add(g.userId));
  const doctoresRaw = doctorIds.size > 0
    ? await db.user.findMany({ where: { id: { in: [...doctorIds] } }, select: { id: true, name: true } })
    : [];
  const nombreDoctor: Record<string, string> = {};
  for (const d of doctoresRaw) nombreDoctor[d.id] = d.name;

  // Producción por doctor — combina ventas (Sale) y tratamientos pagados
  // (TreatmentPlanItem) del mes en un solo total por doctor.
  const produccionPorDoctorMap: Record<string, ProduccionDoctorItem> = {};
  function filaProduccion(doctorUserId: string): ProduccionDoctorItem {
    const existente = produccionPorDoctorMap[doctorUserId];
    if (existente) return existente;
    const nueva: ProduccionDoctorItem = {
      doctorUserId,
      doctor: nombreDoctor[doctorUserId] ?? "Doctor no encontrado",
      ventas: 0,
      tratamientos: 0,
      total: 0,
    };
    produccionPorDoctorMap[doctorUserId] = nueva;
    return nueva;
  }
  for (const g of ventasPorDoctorRaw) {
    const f = filaProduccion(g.userId);
    f.ventas += Number(g._sum.total ?? 0);
    f.total += Number(g._sum.total ?? 0);
  }
  for (const it of itemsPagadosRaw) {
    const f = filaProduccion(it.treatmentPlan.userId);
    f.tratamientos += Number(it.cost);
    f.total += Number(it.cost);
  }
  const produccionPorDoctor = Object.values(produccionPorDoctorMap).sort((a, b) => b.total - a.total);

  // Tasa de aceptación de presupuestos — ACEPTADO y PAGADO cuentan como
  // "aceptado" (PAGADO siempre pasó por ACEPTADO antes), PROPUESTO queda
  // fuera de la tasa por ser una decisión todavía pendiente.
  let aceptados = 0;
  let rechazados = 0;
  for (const g of itemsDecididosRaw) {
    if (g.status === "RECHAZADO") rechazados += g._count._all;
    else aceptados += g._count._all; // ACEPTADO o PAGADO
  }
  const propuestosRaw = await db.treatmentPlanItem.count({
    where: { status: "PROPUESTO", treatmentPlan: { tenantId, ...(branchIdFiltro ? { branchId: branchIdFiltro } : {}) } },
  });
  const decididos = aceptados + rechazados;
  const aceptacionPresupuestos: AceptacionPresupuestos = {
    aceptados,
    rechazados,
    propuestos: propuestosRaw,
    tasaAceptacionPct: decididos > 0 ? Math.round((aceptados / decididos) * 100) : null,
  };

  // Citas por doctor — completadas/no-show/canceladas del mes, proxy de
  // ocupación de agenda (ver el comentario largo arriba de esta sección).
  const citasPorDoctorMap: Record<string, CitasPorDoctorItem> = {};
  function filaCitas(doctorUserId: string): CitasPorDoctorItem {
    const existente = citasPorDoctorMap[doctorUserId];
    if (existente) return existente;
    const nueva: CitasPorDoctorItem = {
      doctorUserId,
      doctor: nombreDoctor[doctorUserId] ?? "Doctor no encontrado",
      completadas: 0,
      noShow: 0,
      canceladas: 0,
    };
    citasPorDoctorMap[doctorUserId] = nueva;
    return nueva;
  }
  for (const g of citasRaw) {
    const f = filaCitas(g.userId);
    if (g.status === "COMPLETED") f.completadas += g._count._all;
    else if (g.status === "NO_SHOW") f.noShow += g._count._all;
    else if (g.status === "CANCELLED") f.canceladas += g._count._all;
  }
  const citasPorDoctor = Object.values(citasPorDoctorMap).sort(
    (a, b) => (b.completadas + b.noShow + b.canceladas) - (a.completadas + a.noShow + a.canceladas)
  );

  return { activo: true, produccionPorDoctor, aceptacionPresupuestos, citasPorDoctor };
}

export async function getReportesData(tenantId: string, reparacionesActiva: boolean, branchIdFiltro?: string): Promise<ReportesData> {
  // Product, Customer, Repair y Sale tienen tenantId propio → getTenantPrisma
  // lo inyecta solo en cada query de primer nivel de abajo.
  const db = getTenantPrisma(tenantId);

  const mesActual = monthRange(0);
  const mesAnterior = monthRange(1);

  // branchIdFiltro (2026-09-21, a petición de Carlos: "que sirva desde un
  // autoempleado hasta un corporativo con muchas sucursales") — antes este
  // reporte siempre agregaba TODO el negocio sin importar quién lo pidiera,
  // así que cualquier empleado con el módulo "Reportes" veía las ventas y
  // reparaciones de sucursales ajenas a la suya. reportes/page.tsx lo manda
  // cuando quien pide el reporte es un empleado de PIN; un administrador no
  // manda nada y sigue viendo el negocio completo, igual que siempre.
  // totalProductos/totalClientes se quedan tenant-wide a propósito: un
  // producto del catálogo y un cliente no "pertenecen" a una sola sucursal
  // en este modelo de datos (el stock sí, pero el conteo de catálogo/
  // clientes no es información financiera sensible por sucursal).
  const [
    totalProductos,
    totalClientes,
    totalReparaciones,
    reparacionesActivasCount,
    reparacionesPorEstadoRaw,
    ventasMesRaw,
    ventasMesAnteriorRaw,
    ventasPorMetodoRaw,
  ] = await Promise.all([
    db.product.count({ where: { isActive: true } }),
    db.customer.count(),
    // Con el módulo inactivo (ej. barbería) estos 3 conteos/agrupación
    // deben quedar en cero/vacío — no solo por evitar carga a la BD, sino
    // porque reportes/page.tsx ya no renderiza las tarjetas que los usan.
    reparacionesActiva ? db.repair.count({ where: branchIdFiltro ? { branchId: branchIdFiltro } : undefined }) : Promise.resolve(0),
    reparacionesActiva
      ? db.repair.count({ where: { status: { notIn: CLOSED_STATUSES }, ...(branchIdFiltro ? { branchId: branchIdFiltro } : {}) } })
      : Promise.resolve(0),
    reparacionesActiva
      ? db.repair.groupBy({ by: ["status"], where: branchIdFiltro ? { branchId: branchIdFiltro } : undefined, _count: { _all: true } })
      : Promise.resolve([]),
    db.sale.aggregate({
      where: {
        status: "COMPLETED",
        createdAt: { gte: mesActual.start, lt: mesActual.end },
        ...(branchIdFiltro ? { branchId: branchIdFiltro } : {}),
      },
      _sum: { total: true },
    }),
    db.sale.aggregate({
      where: {
        status: "COMPLETED",
        createdAt: { gte: mesAnterior.start, lt: mesAnterior.end },
        ...(branchIdFiltro ? { branchId: branchIdFiltro } : {}),
      },
      _sum: { total: true },
    }),
    db.sale.groupBy({
      by: ["paymentMethod"],
      where: {
        status: "COMPLETED",
        createdAt: { gte: mesActual.start, lt: mesActual.end },
        ...(branchIdFiltro ? { branchId: branchIdFiltro } : {}),
      },
      _sum: { total: true },
    }),
  ]);

  const ventasMes = Number(ventasMesRaw._sum.total ?? 0);
  const ventasMesAnterior = Number(ventasMesAnteriorRaw._sum.total ?? 0);
  const crecimientoVentasPct =
    ventasMesAnterior > 0 ? Math.round(((ventasMes - ventasMesAnterior) / ventasMesAnterior) * 100) : null;

  const reparacionesPorEstado: ReparacionesPorEstadoItem[] = reparacionesPorEstadoRaw
    .map((g) => ({ estado: g.status, count: g._count._all }))
    .sort((a, b) => b.count - a.count);

  const ventasPorMetodo: VentasPorMetodoItem[] = ventasPorMetodoRaw
    .map((g) => ({ metodo: g.paymentMethod, total: Number(g._sum.total ?? 0) }))
    .sort((a, b) => b.total - a.total);

  return {
    totalProductos,
    totalClientes,
    totalReparaciones,
    reparacionesActivas: reparacionesActivasCount,
    ventasMes,
    ventasMesAnterior,
    crecimientoVentasPct,
    reparacionesPorEstado,
    ventasPorMetodo,
    reparacionesActiva,
  };
}
