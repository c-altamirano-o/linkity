import "server-only";

import { getTenantPrisma } from "@/lib/prisma";
import type { Branch } from "@prisma/client";
import { CashSessionStatus } from "@prisma/client";

/**
 * Capa de datos reales del módulo POS (M8). Sigue la misma convención que
 * lib/catalogo-data.ts / lib/inventario-data.ts: se importa solo desde
 * Server Components (page.tsx), y trae el stock de CADA sucursal activa en
 * una sola consulta (no solo la sucursal inicial) para que el selector de
 * sucursal en el cliente pueda cambiar sin necesidad de otro viaje al
 * servidor — igual que hace Inventario.
 */

export type TipoPOS = "PRODUCT" | "PART" | "SERVICE";

export interface CategoriaPOS {
  id: string;
  name: string;
  type: TipoPOS;
}

export interface ProductoPOS {
  id: string;
  name: string;
  emoji: string;
  categoryId: string | null;
  categoryName: string;
  type: TipoPOS;
  isService: boolean;
  price: number;
  taxRate: number;
  // SKU/código de barras (Product.sku/barcode) — 2026-09-22, pendiente
  // registrado: el botón "Escanear" de POS no hacía nada todavía. Se usan
  // para (a) que la búsqueda de texto también encuentre por código, no
  // solo por nombre, y (b) resolver el código que detecta la cámara en
  // EscanearModal.tsx a un producto concreto. null si el producto nunca
  // los capturó en Catálogo (son opcionales ahí).
  sku: string | null;
  barcode: string | null;
  // Solo tiene entradas para productos/refacciones (no servicios); la
  // sucursal seleccionada en el cliente decide qué valor leer de aquí.
  stockPorSucursal: Record<string, number>;
}

export interface ClientePOS {
  id: string;
  name: string;
  phone: string | null;
}

export interface PosData {
  categorias: CategoriaPOS[];
  productos: ProductoPOS[];
  clientes: ClientePOS[];
  // 2026-09-22, a petición de Carlos: reportó que pudo vender en POS sin
  // tener la caja abierta en esa sucursal — crearVentaAction nunca lo
  // validaba, así que esas ventas en efectivo quedaban fuera del cuadre de
  // cualquier cierre de caja (cerrarCajaAction solo suma las ventas con
  // createdAt >= sesion.openedAt de la sesión que se está cerrando). Se
  // trae aquí, por sucursal, para que el cliente pueda deshabilitar "Cobrar"
  // de una vez sin depender de un viaje aparte al servidor — la validación
  // real (la que de verdad importa) vive en crearVentaAction.
  cajaAbiertaPorSucursal: Record<string, boolean>;
}

const TYPE_FALLBACK_EMOJI: Record<TipoPOS, string> = {
  PRODUCT: "📦",
  PART: "🔩",
  SERVICE: "🔧",
};

export async function getPosData(
  tenantId: string,
  branches: Pick<Branch, "id" | "isActive">[]
): Promise<PosData> {
  // Category/Product/Customer tienen tenantId propio → getTenantPrisma lo
  // inyecta solo en cada consulta.
  const db = getTenantPrisma(tenantId);

  const activeBranchIds = branches.filter((b) => b.isActive).map((b) => b.id);

  const [categoriesRaw, productsRaw, customersRaw, sesionesAbiertas] = await Promise.all([
    db.category.findMany({ orderBy: { name: "asc" } }),
    db.product.findMany({
      where: { isActive: true },
      include: {
        category: true,
        inventory: { where: { branchId: { in: activeBranchIds } } },
      },
      orderBy: { name: "asc" },
    }),
    db.customer.findMany({ orderBy: { name: "asc" } }),
    db.cashSession.findMany({
      where: { branchId: { in: activeBranchIds }, status: CashSessionStatus.OPEN },
      select: { branchId: true },
    }),
  ]);

  const categorias: CategoriaPOS[] = categoriesRaw.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type as TipoPOS,
  }));

  const productos: ProductoPOS[] = productsRaw.map((p) => {
    const type = p.type as TipoPOS;
    const isService = type === "SERVICE";
    const stockPorSucursal: Record<string, number> = {};
    if (!isService) {
      for (const inv of p.inventory) stockPorSucursal[inv.branchId] = inv.stock;
    }
    return {
      id: p.id,
      name: p.name,
      emoji: p.emoji ?? TYPE_FALLBACK_EMOJI[type],
      categoryId: p.categoryId,
      categoryName: p.category?.name ?? "Sin categoría",
      type,
      isService,
      price: Number(p.price),
      taxRate: Number(p.taxRate),
      sku: p.sku,
      barcode: p.barcode,
      stockPorSucursal,
    };
  });

  const clientes: ClientePOS[] = customersRaw.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
  }));

  const cajaAbiertaPorSucursal: Record<string, boolean> = {};
  for (const id of activeBranchIds) cajaAbiertaPorSucursal[id] = false;
  for (const s of sesionesAbiertas) cajaAbiertaPorSucursal[s.branchId] = true;

  return { categorias, productos, clientes, cajaAbiertaPorSucursal };
}
