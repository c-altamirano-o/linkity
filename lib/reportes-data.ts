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
}

const CLOSED_STATUSES: RepairStatus[] = ["DELIVERED", "CANCELLED"];

function monthRange(monthsAgo: number) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 1));
  return { start, end };
}

export async function getReportesData(tenantId: string): Promise<ReportesData> {
  // Product, Customer, Repair y Sale tienen tenantId propio → getTenantPrisma
  // lo inyecta solo en cada query de primer nivel de abajo.
  const db = getTenantPrisma(tenantId);

  const mesActual = monthRange(0);
  const mesAnterior = monthRange(1);

  const [
    totalProductos,
    totalClientes,
    totalReparaciones,
    reparacionesActivas,
    reparacionesPorEstadoRaw,
    ventasMesRaw,
    ventasMesAnteriorRaw,
    ventasPorMetodoRaw,
  ] = await Promise.all([
    db.product.count({ where: { isActive: true } }),
    db.customer.count(),
    db.repair.count(),
    db.repair.count({ where: { status: { notIn: CLOSED_STATUSES } } }),
    db.repair.groupBy({ by: ["status"], _count: { _all: true } }),
    db.sale.aggregate({
      where: { status: "COMPLETED", createdAt: { gte: mesActual.start, lt: mesActual.end } },
      _sum: { total: true },
    }),
    db.sale.aggregate({
      where: { status: "COMPLETED", createdAt: { gte: mesAnterior.start, lt: mesAnterior.end } },
      _sum: { total: true },
    }),
    db.sale.groupBy({
      by: ["paymentMethod"],
      where: { status: "COMPLETED", createdAt: { gte: mesActual.start, lt: mesActual.end } },
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
    reparacionesActivas,
    ventasMes,
    ventasMesAnterior,
    crecimientoVentasPct,
    reparacionesPorEstado,
    ventasPorMetodo,
  };
}
