import { getTenantPrisma } from "@/lib/prisma";
import type { Branch, Priority, RepairStatus } from "@prisma/client";

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

function diaLabel(date: Date, daysAgo: number) {
  if (daysAgo === 0) return "Hoy";
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

const CATEGORY_FALLBACK_COLORS = [
  "var(--primary)", "#06B6D4", "#10B981", "#F59E0B",
  "#EF4444", "#8B5CF6", "#EC4899", "#F97316",
];

export async function getDashboardData(
  tenantId: string,
  branches: Pick<Branch, "id" | "name" | "isActive">[]
): Promise<DashboardData> {
  // Sale y Repair tienen tenantId propio, así que getTenantPrisma se
  // encarga de inyectarlo — ya no se escribe a mano en su `where` de
  // primer nivel. Inventory y SaleItem NO tienen tenantId propio (se
  // llega a su tenant vía branch/sale), así que ahí el filtro anidado
  // sigue siendo manual — la extensión no toca condiciones anidadas.
  const db = getTenantPrisma(tenantId);

  const now = new Date();
  const today = dayRange(0);
  const month = monthRange();
  const week = Array.from({ length: 7 }, (_, i) => {
    const daysAgo = 6 - i;
    return { daysAgo, ...dayRange(daysAgo) };
  });
  const weekStart = week[0].start;

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
      where: { status: "COMPLETED", createdAt: { gte: weekStart, lt: today.end } },
      select: { branchId: true, total: true, createdAt: true },
    }),
    db.repair.findMany({
      where: { deliveredAt: { gte: weekStart, lt: today.end } },
      select: { branchId: true, finalCost: true, deliveredAt: true },
    }),
    db.repair.findMany({
      where: { status: { notIn: CLOSED_STATUSES } },
      include: { customer: true, user: true },
      orderBy: { receivedAt: "desc" },
    }),
    db.repair.groupBy({
      by: ["branchId"],
      where: { receivedAt: { gte: today.start, lt: today.end } },
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
  const ventasSemana: VentaSemanaDia[] = week.map(({ daysAgo, start, end }) => {
    const ventasDia = weekSales
      .filter((s) => s.createdAt >= start && s.createdAt < end)
      .reduce((sum, s) => sum + Number(s.total), 0);
    const reparacionesDia = weekRepairsDelivered
      .filter((r) => r.deliveredAt && r.deliveredAt >= start && r.deliveredAt < end)
      .reduce((sum, r) => sum + Number(r.finalCost ?? 0), 0);
    return {
      dia: diaLabel(start, daysAgo),
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
      .filter((s) => s.branchId === b.id && s.createdAt >= week[5].start && s.createdAt < week[5].end)
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
  };
}
