import { getTenantPrisma } from "@/lib/prisma";
import type { Branch, Priority, RepairStatus } from "@prisma/client";
import { rangoSemanaLaboral } from "@/lib/periodo-laboral";

// ============================================
// Tipos que consume DashboardClient
// ============================================

export interface VentaHoyRow {
  id: string;
  folio: string;
  hora: string;
  articulos: string;
  count: number;
  metodo: "Efectivo" | "Tarjeta" | "Transferencia" | "Mixto";
  total: number;
}

export interface RepairRow {
  id: string;
  folio: string;
  cliente: string;
  telefono: string;
  equipo: string;
  status: RepairStatus;
  tecnico: string;
  prioridad: Priority;
  costo: number | null;
  falla: string | null;
  razon: string | null;
  espera: string;
}

export interface AlertaRow {
  id: string;
  tipo: "stock_bajo" | "agotado" | "repair_stale";
  texto: string;
}

export interface CategoriaVenta {
  name: string;
  value: number; // porcentaje del mes, 0-100
  color: string;
}

export interface VentaSemanaDia {
  dia: string;
  ventas: number;
  reparaciones: number;
  total: number;
}

export interface SucursalResumen {
  id: string;
  nombre: string;
  estado: "activa" | "prueba";
  ventasDia: number;
  ticketsVenta: number;
  ticketsRep: number;
  equiposRecibidos: number;
  repActivas: number;
  listosEntrega: number;
  devoluciones: number;
  vsAyer: number | null; // null = sin ventas ayer para comparar ("primer día")
}

export interface DashboardData {
  totalVentasHoy: number;
  numVentasHoy: number;
  ticketPromedio: number;
  reparacionesActivasCount: number;
  equiposListosCount: number;
  equiposDevolucionCount: number;
  ventasHoy: VentaHoyRow[];
  reparacionesActivas: RepairRow[];
  equiposListos: RepairRow[];
  equiposDevolucion: RepairRow[];
  alertas: AlertaRow[];
  categorias: CategoriaVenta[];
  ventasSemana: VentaSemanaDia[];
  totalSemana: number;
  promedioVentasSemana: number;
  sucursales: SucursalResumen[];
  multiSucursal: boolean;
  // Módulo "Reparaciones" activo para este tenant (2026-09-18) — cuando es
  // false (ej. una barbería, que trae este módulo apagado por default, ver
  // lib/modulos-rubro.ts) ninguna de las queries de reparaciones de abajo
  // se ejecuta y todos los conteos/arreglos de reparaciones quedan en
  // cero/vacío — DashboardClient.tsx usa este campo para ocultar por
  // completo la UI de reparaciones en vez de mostrarla con puros ceros,
  // que es justo lo que Carlos reportó como bug ("Sigue mostrando
  // Reparaciones activas... Es una barbería, eso no aplica ahí").
  reparacionesActiva: boolean;
}

// ============================================
// Utilidades de fecha (zona horaria de negocio)
// ============================================

// México (Zona Centro) opera en UTC-6 fijo desde la reforma de horario de
// verano de 2022. Si más adelante quieres soportar sucursales en la Zona
// Frontera (UTC-7 con horario de verano), esto se vuelve un campo por
// tenant/sucursal en vez de una constante.
const MX_OFFSET_MS = 6 * 60 * 60 * 1000;

function mxDayBoundary(daysAgo: number, endOfDay = false) {
  const now = new Date();
  const mxNow = new Date(now.getTime() - MX_OFFSET_MS);
  const y = mxNow.getUTCFullYear();
  const m = mxNow.getUTCMonth();
  const d = mxNow.getUTCDate() - daysAgo + (endOfDay ? 1 : 0);
  const boundaryMx = new Date(Date.UTC(y, m, d, 0, 0, 0));
  return new Date(boundaryMx.getTime() + MX_OFFSET_MS);
}

function dayRange(daysAgo: number) {
  return { start: mxDayBoundary(daysAgo), end: mxDayBoundary(daysAgo, true) };
}

function monthRange() {
  const now = new Date();
  const mxNow = new Date(now.getTime() - MX_OFFSET_MS);
  const y = mxNow.getUTCFullYear();
  const m = mxNow.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0).valueOf() + MX_OFFSET_MS);
  const end = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0).valueOf() + MX_OFFSET_MS);
  return { start, end };
}

const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// "Hoy" se marca comparando fechas reales, no por posición dentro del
// arreglo — desde que la semana es calendario (lib/periodo-laboral.ts) en
// vez de una ventana rodante terminando siempre hoy, el día de hoy puede
// caer en cualquier posición de la semana (ej. el 2° día si la semana
// laboral del negocio abre en martes).
function diaLabel(date: Date, hoyInicio: Date) {
  if (date.getTime() === hoyInicio.getTime()) return "Hoy";
  const mxDate = new Date(date.getTime() - MX_OFFSET_MS);
  return DIAS_SEMANA[mxDate.getUTCDay()];
}

function formatHoraMx(date: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Mexico_City",
  }).format(date);
}

function formatEspera(date: Date, now: Date) {
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return "Justo ahora";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `Hace ${diffHrs} ${diffHrs === 1 ? "hora" : "hrs"}`;
  const diffDias = Math.floor(diffHrs / 24);
  if (diffDias === 1) return "Ayer";
  return `Hace ${diffDias} días`;
}

const METODO_LABEL: Record<string, VentaHoyRow["metodo"]> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  MIXED: "Mixto",
};

const ACTIVE_STATUSES: RepairStatus[] = ["RECEIVED", "DIAGNOSING", "WAITING_PARTS", "IN_REPAIR"];
const READY_STATUSES: RepairStatus[] = ["READY", "WORKSHOP_READY", "SHOP_READY"];
const RETURN_STATUSES: RepairStatus[] = ["WORKSHOP_RETURN", "SHOP_RETURN"];
const CLOSED_STATUSES: RepairStatus[] = ["DELIVERED", "CANCELLED"];

// Id que ningún Repair real puede tener (usado para forzar "sin resultados"
// en las queries de reparaciones cuando el módulo está inactivo — ver el
// comentario junto al Promise.all de getDashboardData).
const REPARACIONES_INACTIVA_ID = "__reparaciones_modulo_inactivo__";

const CATEGORY_FALLBACK_COLORS = [
  "var(--primary)", "#06B6D4", "#10B981", "#F59E0B",
  "#EF4444", "#8B5CF6", "#EC4899", "#F97316",
];

export async function getDashboardData(
  tenantId: string,
  branches: Pick<Branch, "id" | "name" | "isActive">[],
  weekStartDay: number,
  reparacionesActiva: boolean
): Promise<DashboardData> {
  // Sale y Repair tienen tenantId propio, así que getTenantPrisma se
  // encarga de inyectarlo — ya no se escribe a mano en su `where` de
  // primer nivel. Inventory y SaleItem NO tienen tenantId propio (se
  // llega a su tenant vía branch/sale), así que ahí el filtro anidado
  // sigue siendo manual — la extensión no toca condiciones anidadas.
  const db = getTenantPrisma(tenantId);

  const now = new Date();
  const today = dayRange(0);
  const ayer = dayRange(1);
  const month = monthRange();

  // Semana laboral configurable por tenant (lib/periodo-laboral.ts) — ya NO
  // es una ventana rodante de 7 días terminando siempre hoy (eso hacía que
  // "Total semana" fuera en realidad "últimos 7 días", sin relación con
  // ningún corte de nómina real — ver el comentario largo en
  // Tenant.weekStartDay, schema.prisma).
  const { start: weekStart, end: weekEnd } = rangoSemanaLaboral(now, weekStartDay);
  const week = Array.from({ length: 7 }, (_, i) => {
    const start = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  });
  // "ayer" puede caer FUERA de la semana laboral en curso (ej. si hoy es el
  // primer día de una semana nueva, ayer perteneció a la semana anterior) —
  // por eso el query de abajo arranca en el más temprano de los dos rangos,
  // en vez de asumir que "ayer" siempre está dentro de la semana.
  const consultaDesde = ayer.start < weekStart ? ayer.start : weekStart;

  const [
    ventasHoyRaw,
    weekSales,
    weekRepairsDelivered,
    openRepairsRaw,
    receivedTodayByBranch,
    inventoryRows,
    categorySaleItems,
  ] = await Promise.all([
    db.sale.findMany({
      where: { status: "COMPLETED", createdAt: { gte: today.start, lt: today.end } },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.sale.findMany({
      where: { status: "COMPLETED", createdAt: { gte: consultaDesde, lt: today.end } },
      select: { branchId: true, total: true, createdAt: true },
    }),
    // Las 3 queries de reparaciones de abajo llevan un filtro `id` extra
    // (2026-09-18, módulo Reparaciones por tenant) que cuando el módulo
    // está inactivo (ej. una barbería) usa un id imposible para forzar un
    // resultado vacío — Prisma ignora una condición en `undefined`, así
    // que con el módulo activo esto no cambia la query original en nada.
    // Se prefiere este filtro sobre "no ejecutar la query" para no
    // depender de tipos genéricos de Prisma en dos ramas distintas —
    // openRepairsRaw en particular alimenta `(typeof openRepairsRaw)[number]`
    // más abajo (toRepairRow), y eso se rompe si su tipo pudiera venir de
    // dos formas de llamada distintas.
    db.repair.findMany({
      where: {
        deliveredAt: { gte: weekStart, lt: weekEnd },
        id: reparacionesActiva ? undefined : REPARACIONES_INACTIVA_ID,
      },
      select: { branchId: true, finalCost: true, deliveredAt: true },
    }),
    db.repair.findMany({
      where: {
        status: { notIn: CLOSED_STATUSES },
        id: reparacionesActiva ? undefined : REPARACIONES_INACTIVA_ID,
      },
      include: { customer: true, user: true },
      orderBy: { receivedAt: "desc" },
    }),
    db.repair.groupBy({
      by: ["branchId"],
      where: {
        receivedAt: { gte: today.start, lt: today.end },
        id: reparacionesActiva ? undefined : REPARACIONES_INACTIVA_ID,
      },
      _count: { _all: true },
    }),
    db.inventory.findMany({
      where: { branch: { tenantId } },
      include: { product: true, branch: true },
    }),
    db.saleItem.findMany({
      where: { sale: { tenantId, status: "COMPLETED", createdAt: { gte: month.start, lt: month.end } } },
      include: { product: { include: { category: true } } },
    }),
  ]);

  // ── Ventas de hoy ──────────────────────────────────────
  const ventasHoy: VentaHoyRow[] = ventasHoyRaw.map((v) => ({
    id: v.id,
    folio: v.folio,
    hora: formatHoraMx(v.createdAt),
    articulos: v.items.map((it) => it.product.name).join(", ") || "Sin artículos",
    count: v.items.reduce((s, it) => s + it.quantity, 0),
    metodo: METODO_LABEL[v.paymentMethod] ?? "Efectivo",
    total: Number(v.total),
  }));
  const totalVentasHoy = ventasHoy.reduce((s, v) => s + v.total, 0);
  const numVentasHoy = ventasHoy.length;
  const ticketPromedio = numVentasHoy > 0 ? Math.round(totalVentasHoy / numVentasHoy) : 0;

  // ── Reparaciones abiertas, partidas por grupo de estatus ─
  function toRepairRow(r: (typeof openRepairsRaw)[number]): RepairRow {
    return {
      id: r.id,
      folio: r.folio,
      cliente: r.customer.name,
      telefono: r.customer.phone ?? "Sin teléfono",
      equipo: [r.deviceBrand, r.deviceModel].filter(Boolean).join(" "),
      status: r.status,
      tecnico: r.user.name,
      prioridad: r.priority,
      costo: r.finalCost != null ? Number(r.finalCost) : r.estimatedCost != null ? Number(r.estimatedCost) : null,
      falla: r.issueDesc,
      razon: r.notes ?? r.diagnosisDesc,
      espera: formatEspera(r.receivedAt, now),
    };
  }

  const reparacionesActivas = openRepairsRaw.filter((r) => ACTIVE_STATUSES.includes(r.status)).map(toRepairRow);
  const equiposListos = openRepairsRaw.filter((r) => READY_STATUSES.includes(r.status)).map(toRepairRow);
  const equiposDevolucion = openRepairsRaw.filter((r) => RETURN_STATUSES.includes(r.status)).map(toRepairRow);

  // ── Alertas: stock bajo/agotado + reparaciones sin avance ─
  const alertas: AlertaRow[] = [];
  for (const inv of inventoryRows) {
    if (inv.stock <= 0) {
      alertas.push({ id: `stock-${inv.id}`, tipo: "agotado", texto: `${inv.product.name} — Agotado` });
    } else if (inv.stock <= inv.minStock) {
      alertas.push({ id: `stock-${inv.id}`, tipo: "stock_bajo", texto: `${inv.product.name} — Stock bajo (${inv.stock} unidades)` });
    }
  }
  const STALE_DAYS = 3;
  for (const r of openRepairsRaw) {
    const diasSinMovimiento = Math.floor((now.getTime() - r.receivedAt.getTime()) / (24 * 3600 * 1000));
    if (diasSinMovimiento >= STALE_DAYS && !RETURN_STATUSES.includes(r.status) && !READY_STATUSES.includes(r.status)) {
      alertas.push({ id: `stale-${r.id}`, tipo: "repair_stale", texto: `${r.folio} lleva ${diasSinMovimiento} días sin actualización` });
    }
  }
  const alertasFinal = alertas.slice(0, 6);

  // ── Ventas por categoría (mes en curso) ───────────────
  const catTotals = new Map<string, { name: string; color: string | null; total: number }>();
  let totalMes = 0;
  for (const item of categorySaleItems) {
    const subtotal = Number(item.subtotal);
    totalMes += subtotal;
    const cat = item.product.category;
    const key = cat?.id ?? "sin-categoria";
    const name = cat?.name ?? "Sin categoría";
    const color = cat?.color ?? null;
    const prev = catTotals.get(key);
    if (prev) prev.total += subtotal;
    else catTotals.set(key, { name, color, total: subtotal });
  }
  const categorias: CategoriaVenta[] = totalMes > 0
    ? Array.from(catTotals.values())
        .sort((a, b) => b.total - a.total)
        .map((c, i) => ({
          name: c.name,
          value: Math.round((c.total / totalMes) * 100),
          color: c.color ?? CATEGORY_FALLBACK_COLORS[i % CATEGORY_FALLBACK_COLORS.length],
        }))
    : [];

  // ── Ventas de la semana (área) ─────────────────────────
  const ventasSemana: VentaSemanaDia[] = week.map(({ start, end }) => {
    const ventasDia = weekSales
      .filter((s) => s.createdAt >= start && s.createdAt < end)
      .reduce((sum, s) => sum + Number(s.total), 0);
    const reparacionesDia = weekRepairsDelivered
      .filter((r) => r.deliveredAt && r.deliveredAt >= start && r.deliveredAt < end)
      .reduce((sum, r) => sum + Number(r.finalCost ?? 0), 0);
    return {
      dia: diaLabel(start, today.start),
      ventas: Math.round(ventasDia),
      reparaciones: Math.round(reparacionesDia),
      total: Math.round(ventasDia + reparacionesDia),
    };
  });
  const totalSemana = ventasSemana.reduce((s, d) => s + d.total, 0);
  const promedioVentasSemana = Math.round(ventasSemana.reduce((s, d) => s + d.ventas, 0) / 7);

  // ── Resumen por sucursal ───────────────────────────────
  const receivedTodayMap = new Map(receivedTodayByBranch.map((g) => [g.branchId, g._count._all]));

  const repairsByBranch = new Map<string, typeof openRepairsRaw>();
  for (const r of openRepairsRaw) {
    const arr = repairsByBranch.get(r.branchId) ?? [];
    arr.push(r);
    repairsByBranch.set(r.branchId, arr);
  }

  const sucursales: SucursalResumen[] = branches.map((b) => {
    const ventasDiaBranch = weekSales
      .filter((s) => s.branchId === b.id && s.createdAt >= today.start && s.createdAt < today.end)
      .reduce((sum, s) => sum + Number(s.total), 0);
    const ventasAyerBranch = weekSales
      .filter((s) => s.branchId === b.id && s.createdAt >= ayer.start && s.createdAt < ayer.end)
      .reduce((sum, s) => sum + Number(s.total), 0);
    const ticketsVenta = weekSales.filter(
      (s) => s.branchId === b.id && s.createdAt >= today.start && s.createdAt < today.end
    ).length;

    const repairsHere = repairsByBranch.get(b.id) ?? [];
    const repActivas = repairsHere.filter((r) => ACTIVE_STATUSES.includes(r.status)).length;
    const listosEntrega = repairsHere.filter((r) => READY_STATUSES.includes(r.status)).length;
    const devoluciones = repairsHere.filter((r) => RETURN_STATUSES.includes(r.status)).length;
    const equiposRecibidos = receivedTodayMap.get(b.id) ?? 0;

    return {
      id: b.id,
      nombre: b.name,
      estado: b.isActive ? "activa" : "prueba",
      ventasDia: Math.round(ventasDiaBranch),
      ticketsVenta,
      ticketsRep: equiposRecibidos,
      equiposRecibidos,
      repActivas,
      listosEntrega,
      devoluciones,
      vsAyer: ventasAyerBranch > 0 ? Math.round(((ventasDiaBranch - ventasAyerBranch) / ventasAyerBranch) * 100) : null,
    };
  });

  return {
    totalVentasHoy: Math.round(totalVentasHoy),
    numVentasHoy,
    ticketPromedio,
    reparacionesActivasCount: reparacionesActivas.length,
    equiposListosCount: equiposListos.length,
    equiposDevolucionCount: equiposDevolucion.length,
    ventasHoy,
    reparacionesActivas,
    equiposListos,
    equiposDevolucion,
    alertas: alertasFinal,
    categorias,
    ventasSemana,
    totalSemana: Math.round(totalSemana),
    promedioVentasSemana,
    sucursales,
    multiSucursal: branches.length > 1,
    reparacionesActiva,
  };
}

// ============================================
// Ventas por día y hora — selector de fecha (2026-09-17, a petición de
// Carlos: "a mí como dueño me gustaría poder checar día por día qué tanto
// se vendió y en qué horas fue el mayor flujo de clientes"). A diferencia
// de getDashboardData de arriba (que siempre mira "hoy"/"esta semana" en
// tiempo real y no acepta parámetros), este bloque responde a una fecha
// arbitraria elegida por el dueño con un selector tipo calendario en
// DashboardClient.tsx, y se recalcula bajo demanda vía
// obtenerVentasPorDiaAction (app/actions/dashboard-actions.ts) cada vez que
// cambia la fecha — la carga inicial (fecha = hoy) sí va en el primer
// render server-side, igual que el resto del Dashboard.
// ============================================

export interface VentaPorHora {
  hora: number; // 0-23, hora civil de México
  horaLabel: string; // "8 a.m.", "5 p.m."...
  numVentas: number;
  totalVentas: number;
}

export interface VentasPorDiaData {
  fecha: string; // "YYYY-MM-DD"
  totalVentas: number;
  numVentas: number;
  ticketPromedio: number;
  porHora: VentaPorHora[]; // siempre 24 posiciones — 0 en las horas sin venta, para que la gráfica tenga el mismo eje todos los días
  horaPico: { hora: number; horaLabel: string; numVentas: number } | null;
}

/** "YYYY-MM-DD" de hoy en México — valor por defecto del selector de fecha. */
export function hoyMx(): string {
  const now = new Date();
  const mx = new Date(now.getTime() - MX_OFFSET_MS);
  return mx.toISOString().slice(0, 10);
}

/** Igual que dayRange()/mxDayBoundary() de arriba, pero a partir de una fecha explícita ("YYYY-MM-DD") en vez de "hace N días". */
function diaMxRangeDesdeFecha(fechaStr: string) {
  const [y, m, d] = fechaStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0).valueOf() + MX_OFFSET_MS);
  const end = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0).valueOf() + MX_OFFSET_MS);
  return { start, end };
}

function formatHoraCorta(hora: number): string {
  const d = new Date(Date.UTC(2000, 0, 1, hora, 0, 0));
  return new Intl.DateTimeFormat("es-MX", { hour: "numeric", hour12: true, timeZone: "UTC" }).format(d);
}

export async function getVentasPorDia(tenantId: string, fechaStr: string): Promise<VentasPorDiaData> {
  const db = getTenantPrisma(tenantId);
  const { start, end } = diaMxRangeDesdeFecha(fechaStr);

  const ventas = await db.sale.findMany({
    where: { status: "COMPLETED", createdAt: { gte: start, lt: end } },
    select: { total: true, createdAt: true },
  });

  // Flujo de clientes por hora = número de ventas (tickets), no el monto —
  // un solo ticket grande no debe aparentar "mucho flujo" en su hora.
  const porHoraMap = new Map<number, { numVentas: number; totalVentas: number }>();
  for (const v of ventas) {
    const horaMx = new Date(v.createdAt.getTime() - MX_OFFSET_MS).getUTCHours();
    const prev = porHoraMap.get(horaMx) ?? { numVentas: 0, totalVentas: 0 };
    prev.numVentas += 1;
    prev.totalVentas += Number(v.total);
    porHoraMap.set(horaMx, prev);
  }

  const porHora: VentaPorHora[] = Array.from({ length: 24 }, (_, hora) => {
    const d = porHoraMap.get(hora);
    return {
      hora,
      horaLabel: formatHoraCorta(hora),
      numVentas: d?.numVentas ?? 0,
      totalVentas: Math.round(d?.totalVentas ?? 0),
    };
  });

  const totalVentas = ventas.reduce((s, v) => s + Number(v.total), 0);
  const numVentas = ventas.length;
  const ticketPromedio = numVentas > 0 ? Math.round(totalVentas / numVentas) : 0;

  const horaPico = porHora.reduce<VentaPorHora | null>(
    (max, h) => (h.numVentas > 0 && (!max || h.numVentas > max.numVentas) ? h : max),
    null
  );

  return {
    fecha: fechaStr,
    totalVentas: Math.round(totalVentas),
    numVentas,
    ticketPromedio,
    porHora,
    horaPico: horaPico ? { hora: horaPico.hora, horaLabel: horaPico.horaLabel, numVentas: horaPico.numVentas } : null,
  };
}
