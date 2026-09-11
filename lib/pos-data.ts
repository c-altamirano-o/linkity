import "server-only";

import { getTenantPrisma } from "@/lib/prisma";
import type { Branch } from "@prisma/client";

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

  const [categoriesRaw, productsRaw, customersRaw] = await Promise.all([
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
      stockPorSucursal,
    };
  });

  const clientes: ClientePOS[] = customersRaw.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
  }));

  return { categorias, productos, clientes };
}
