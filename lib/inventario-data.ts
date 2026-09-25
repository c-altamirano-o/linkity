import "server-only";

import { getTenantPrisma } from "@/lib/prisma";
import type { Branch } from "@prisma/client";

/**
 * Capa de datos reales del módulo Inventario (M12). A diferencia de
 * Catálogo (que agrega el stock de todas las sucursales para un vistazo
 * general), aquí se manda el desglose POR sucursal de cada producto, para
 * que el cliente pueda ver el total agregado o filtrar a una sucursal
 * específica — necesario porque los ajustes de stock siempre aplican a
 * una sucursal concreta (Inventory es un modelo por producto+sucursal).
 *
 * Los servicios (ProductType.SERVICE) no manejan inventario físico y se
 * excluyen de este módulo por completo.
 */

export type TipoInventario = "PRODUCT" | "PART";

export interface InventarioBranchStock {
  branchId: string;
  branchName: string;
  stock: number;
  minStock: number;
}

export interface ProductoInventario {
  id: string;
  name: string;
  sku: string | null;
  emoji: string;
  categoryName: string;
  type: TipoInventario;
  price: number;
  cost: number;
  porSucursal: InventarioBranchStock[];
  stockTotal: number;
  minStockTotal: number;
}

export interface InventarioData {
  productos: ProductoInventario[];
}

/**
 * Redacta el costo de compra de cada producto — 2026-09-24, mismo hueco que
 * el resto de la auditoría de permisos (Carlos: "cada empleado solo lo que
 * necesite... nunca un panorama general de las finanzas"): `cost` es el
 * precio de COSTO (información de margen del negocio), a diferencia de
 * `price` (precio de VENTA al público, que un Cajero sí necesita ver para
 * vender) — nunca se le mandaba este recorte a ningún rol. Se redacta en el
 * servidor (no solo en la UI) para que el costo real ni siquiera llegue al
 * navegador de ese empleado. `price`, `stock`, `minStock` y todo lo demás no
 * son dinero-de-margen y se conservan tal cual.
 */
export function redactarMontosInventario(data: InventarioData): InventarioData {
  return {
    productos: data.productos.map((p) => ({ ...p, cost: 0 })),
  };
}

const TYPE_FALLBACK_EMOJI: Record<TipoInventario, string> = {
  PRODUCT: "📦",
  PART: "🔩",
};

export async function getInventarioData(
  tenantId: string,
  branches: Pick<Branch, "id" | "name" | "isActive">[]
): Promise<InventarioData> {
  // Product tiene tenantId propio → getTenantPrisma lo inyecta solo.
  const db = getTenantPrisma(tenantId);

  const activeBranches = branches.filter((b) => b.isActive);
  const activeBranchIds = activeBranches.map((b) => b.id);

  const productsRaw = await db.product.findMany({
    where: { type: { not: "SERVICE" } },
    include: {
      category: true,
      inventory: { where: { branchId: { in: activeBranchIds } } },
    },
    orderBy: { name: "asc" },
  });

  const productos: ProductoInventario[] = productsRaw.map((p) => {
    const type = p.type as TipoInventario;
    const porSucursal: InventarioBranchStock[] = activeBranches.map((b) => {
      const inv = p.inventory.find((i) => i.branchId === b.id);
      return {
        branchId: b.id,
        branchName: b.name,
        stock: inv?.stock ?? 0,
        minStock: inv?.minStock ?? 0,
      };
    });
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      emoji: p.emoji ?? TYPE_FALLBACK_EMOJI[type],
      categoryName: p.category?.name ?? "Sin categoría",
      type,
      price: Number(p.price),
      cost: p.cost != null ? Number(p.cost) : 0,
      porSucursal,
      stockTotal: porSucursal.reduce((s, x) => s + x.stock, 0),
      minStockTotal: porSucursal.reduce((s, x) => s + x.minStock, 0),
    };
  });

  return { productos };
}
