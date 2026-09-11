import "server-only";

import { getTenantPrisma } from "@/lib/prisma";

/**
 * Capa de datos reales del módulo Compras/Proveedores (M12). Antes de este
 * cambio, compras/page.tsx era un mockup con un arreglo `compras` fijo y
 * botones no funcionales ("Ver perfil", "Imprimir", "Marcar recibida") —
 * ver la nota de PurchaseStatus/branchId en schema.prisma para el porqué
 * de Purchase.branchId opcional.
 *
 * "Marcar recibida" (actualizarEstadoCompraAction en compras-actions.ts)
 * es la operación con más consecuencias del módulo: al pasar una compra a
 * RECEIVED, incrementa Inventory de cada producto en la sucursal de la
 * compra — por eso branchId es obligatorio en toda compra NUEVA aunque el
 * campo del schema haya quedado opcional por compatibilidad con datos
 * sembrados antes de este cambio.
 */

export type EstadoCompra = "PENDING" | "RECEIVED" | "CANCELLED";

export interface ItemCompraUI {
  id: string;
  productId: string;
  productName: string;
  productSku: string | null;
  quantity: number;
  cost: number;
  subtotal: number;
}

export interface CompraUI {
  id: string;
  folio: string;
  supplierId: string;
  supplierName: string;
  supplierPhone: string | null;
  supplierEmail: string | null;
  branchId: string | null;
  branchName: string | null;
  total: number;
  status: EstadoCompra;
  notes: string | null;
  createdAt: string; // ISO
  receivedAt: string | null; // ISO
  items: ItemCompraUI[];
}

export interface ProveedorOption {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface ProductoOption {
  id: string;
  name: string;
  sku: string | null;
  cost: number;
}

export interface ComprasData {
  compras: CompraUI[];
  proveedores: ProveedorOption[];
  productos: ProductoOption[];
}

export async function getComprasData(tenantId: string): Promise<ComprasData> {
  // Purchase, Supplier y Product tienen tenantId propio → getTenantPrisma
  // los inyecta solo. PurchaseItem no tiene tenantId propio (se llega a su
  // tenant vía Purchase), pero aquí solo se lee anidado desde una Purchase
  // ya escopada, así que no hace falta filtro manual adicional.
  const db = getTenantPrisma(tenantId);

  const [comprasRaw, proveedoresRaw, productosRaw] = await Promise.all([
    db.purchase.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        supplier: { select: { name: true, phone: true, email: true } },
        branch: { select: { name: true } },
        items: {
          include: { product: { select: { name: true, sku: true } } },
        },
      },
    }),
    db.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, email: true },
    }),
    db.product.findMany({
      where: { isActive: true, type: { not: "SERVICE" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, cost: true },
    }),
  ]);

  const compras: CompraUI[] = comprasRaw.map((c) => ({
    id: c.id,
    folio: c.folio,
    supplierId: c.supplierId,
    supplierName: c.supplier.name,
    supplierPhone: c.supplier.phone,
    supplierEmail: c.supplier.email,
    branchId: c.branchId,
    branchName: c.branch?.name ?? null,
    total: Number(c.total),
    status: c.status as EstadoCompra,
    notes: c.notes,
    createdAt: c.createdAt.toISOString(),
    receivedAt: c.receivedAt ? c.receivedAt.toISOString() : null,
    items: c.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: it.product.name,
      productSku: it.product.sku,
      quantity: it.quantity,
      cost: Number(it.cost),
      subtotal: Number(it.subtotal),
    })),
  }));

  const proveedores: ProveedorOption[] = proveedoresRaw.map((s) => ({
    id: s.id,
    name: s.name,
    phone: s.phone,
    email: s.email,
  }));

  const productos: ProductoOption[] = productosRaw.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    cost: p.cost != null ? Number(p.cost) : 0,
  }));

  return { compras, proveedores, productos };
}
