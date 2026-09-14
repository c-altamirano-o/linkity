import "server-only";

import { getTenantPrisma } from "@/lib/prisma";
import { efectivoDeVenta } from "@/lib/caja-data";
import { CashSessionStatus, MovementType, RepairStatus } from "@prisma/client";

/**
 * Capa de datos reales del módulo Sucursales. Antes de este cambio,
 * sucursales/page.tsx era un mockup completo (3 sucursales ficticias con
 * ventas/caja/stock/personal inventados, `const sucursales = [...]`, sin
 * ninguna consulta a Prisma). Las sucursales reales del negocio (Branch) ya
 * se usan correctamente en Reparaciones, Caja, Compras, Inventario,
 * Personal y POS — lo que faltaba era esta pantalla de administración.
 *
 * "Caja actual" reutiliza efectivoDeVenta() de lib/caja-data.ts para que el
 * cálculo de cuánto efectivo hay realmente en caja sea el MISMO criterio en
 * las dos pantallas (apertura + ventas en efectivo desde que se abrió la
 * sesión + movimientos manuales), en vez de duplicar la fórmula con una
 * variante ligeramente distinta.
 *
 * No existe un campo "sucursal principal" en el schema — se toma como tal
 * la de creación más antigua (la que el sistema crea automáticamente al
 * registrar el negocio), solo para fines de la insignia visual.
 */

export interface SucursalUI {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  esPrincipal: boolean;
  ventasHoy: number;
  reparacionesActivas: number;
  cajaAbierta: boolean;
  cajaActual: number | null;
  stockTotal: number;
  personalActivo: number;
  personalIniciales: string[];
}

export interface ProductoTransferible {
  id: string;
  name: string;
  sku: string | null;
}

export interface SucursalesData {
  sucursales: SucursalUI[];
  productos: ProductoTransferible[];
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const ini = (partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "");
  return ini.toUpperCase() || "?";
}

export async function getSucursalesData(tenantId: string): Promise<SucursalesData> {
  // Branch, Sale, Repair, CashSession, Staff tienen tenantId propio →
  // getTenantPrisma lo inyecta solo. Inventory no tiene tenantId propio
  // (se llega a él vía branchId, que ya está escopado al tenant).
  const db = getTenantPrisma(tenantId);

  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);

  const branches = await db.branch.findMany({ orderBy: { createdAt: "asc" } });
  const branchIds = branches.map((b) => b.id);

  const [ventasHoyRaw, reparacionesActivasRaw, sesionesAbiertas, staffRaw, inventoryRaw, productosRaw] =
    await Promise.all([
      db.sale.findMany({
        where: { branchId: { in: branchIds }, status: "COMPLETED", createdAt: { gte: inicioHoy } },
        select: { branchId: true, total: true },
      }),
      db.repair.findMany({
        where: { branchId: { in: branchIds }, status: { notIn: [RepairStatus.DELIVERED, RepairStatus.CANCELLED] } },
        select: { branchId: true },
      }),
      db.cashSession.findMany({
        where: { branchId: { in: branchIds }, status: CashSessionStatus.OPEN },
        include: { movements: true },
      }),
      db.staff.findMany({
        where: { branchId: { in: branchIds }, isActive: true },
        select: { branchId: true, name: true },
      }),
      db.inventory.findMany({ where: { branchId: { in: branchIds } }, select: { branchId: true, stock: true } }),
      db.product.findMany({
        where: { isActive: true, type: { not: "SERVICE" } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, sku: true },
      }),
    ]);

  // Para el efectivo esperado necesitamos las ventas en efectivo desde que
  // se abrió cada sesión (no solo las de hoy — una sesión pudo abrirse ayer).
  const ventasParaCaja = sesionesAbiertas.length
    ? await db.sale.findMany({
        where: { OR: sesionesAbiertas.map((s) => ({ branchId: s.branchId, createdAt: { gte: s.openedAt } })) },
        select: { branchId: true, paymentMethod: true, total: true, mixedPayments: true },
      })
    : [];

  const ventasHoyPorBranch = new Map<string, number>();
  for (const v of ventasHoyRaw) ventasHoyPorBranch.set(v.branchId, (ventasHoyPorBranch.get(v.branchId) ?? 0) + Number(v.total));

  const reparacionesActivasPorBranch = new Map<string, number>();
  for (const r of reparacionesActivasRaw)
    reparacionesActivasPorBranch.set(r.branchId, (reparacionesActivasPorBranch.get(r.branchId) ?? 0) + 1);

  const stockPorBranch = new Map<string, number>();
  for (const inv of inventoryRaw) stockPorBranch.set(inv.branchId, (stockPorBranch.get(inv.branchId) ?? 0) + inv.stock);

  const staffPorBranch = new Map<string, string[]>();
  for (const s of staffRaw) {
    const arr = staffPorBranch.get(s.branchId) ?? [];
    arr.push(iniciales(s.name));
    staffPorBranch.set(s.branchId, arr);
  }

  const ventasCajaPorBranch = new Map<string, number>();
  for (const v of ventasParaCaja)
    ventasCajaPorBranch.set(v.branchId, (ventasCajaPorBranch.get(v.branchId) ?? 0) + efectivoDeVenta(v as any));

  const sesionPorBranch = new Map(sesionesAbiertas.map((s) => [s.branchId, s]));

  function cajaDeSesion(sesion: (typeof sesionesAbiertas)[number]): number {
    const manual = sesion.movements.reduce(
      (s, m) => s + (m.type === MovementType.INCOME ? Number(m.amount) : -Number(m.amount)),
      0
    );
    return Number(sesion.openingCash) + (ventasCajaPorBranch.get(sesion.branchId) ?? 0) + manual;
  }

  const sucursales: SucursalUI[] = branches.map((b, idx) => {
    const sesion = sesionPorBranch.get(b.id) ?? null;
    return {
      id: b.id,
      name: b.name,
      address: b.address,
      phone: b.phone,
      isActive: b.isActive,
      esPrincipal: idx === 0,
      ventasHoy: ventasHoyPorBranch.get(b.id) ?? 0,
      reparacionesActivas: reparacionesActivasPorBranch.get(b.id) ?? 0,
      cajaAbierta: !!sesion,
      cajaActual: sesion ? cajaDeSesion(sesion) : null,
      stockTotal: stockPorBranch.get(b.id) ?? 0,
      personalActivo: (staffPorBranch.get(b.id) ?? []).length,
      personalIniciales: (staffPorBranch.get(b.id) ?? []).slice(0, 3),
    };
  });

  const productos: ProductoTransferible[] = productosRaw.map((p) => ({ id: p.id, name: p.name, sku: p.sku }));

  return { sucursales, productos };
}
