import "server-only";

import { getTenantPrisma } from "@/lib/prisma";
import type { Branch } from "@prisma/client";

/**
 * Capa de datos reales del módulo Catálogo (M6). Sigue la misma convención
 * que lib/dashboard-data.ts: se importa solo desde Server Components
 * (page.tsx), hace un puñado de consultas en paralelo y deja todo el
 * cálculo derivado en JS para que el Client Component reciba props ya
 * listas para pintar.
 */

export type TipoCatalogo = "PRODUCT" | "PART" | "SERVICE";

export interface CategoriaCatalogo {
  id: string;
  name: string;
  type: TipoCatalogo;
  color: string;
}

export interface ProductoCatalogo {
  id: string;
  name: string;
  sku: string | null;
  emoji: string;
  categoryId: string | null;
  categoryName: string;
  type: TipoCatalogo;
  isService: boolean;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
}

// Un renglón por cada línea de venta completada — se manda "en crudo" al
// cliente (dentro de una ventana de tiempo razonable) para que los filtros
// de sucursal/período de "Top Ventas" respondan al instante sin ida y
// vuelta al servidor, igual que hace el gráfico semanal del Dashboard.
export interface VentaDetalleItem {
  productId: string;
  productName: string;
  categoryName: string;
  branchId: string;
  quantity: number;
  subtotal: number;
  fecha: string; // ISO
}

export interface CatalogoData {
  categorias: CategoriaCatalogo[];
  productos: ProductoCatalogo[];
  ventasDetalle: VentaDetalleItem[];
}

const TYPE_FALLBACK_EMOJI: Record<TipoCatalogo, string> = {
  PRODUCT: "📦",
  PART: "🔩",
  SERVICE: "🔧",
};

// Solo si el tenant no definió un color propio para la categoría.
const CATEGORY_FALLBACK_COLOR = "#94A3B8";

// Ventana para "Top Ventas": suficiente para cubrir el filtro de período
// más amplio ("Año") sin traer todo el historial de ventas del tenant.
const VENTANA_VENTAS_DIAS = 400;

export async function getCatalogoData(
  tenantId: string,
  branches: Pick<Branch, "id" | "isActive">[]
): Promise<CatalogoData> {
  // Category y Product tienen tenantId propio → getTenantPrisma lo inyecta
  // solo. SaleItem no lo tiene (se llega a su tenant vía la relación con
  // Sale), así que ese filtro anidado se mantiene manual.
  const db = getTenantPrisma(tenantId);

  const activeBranchIds = branches.filter((b) => b.isActive).map((b) => b.id);

  const ventasDesde = new Date();
  ventasDesde.setDate(ventasDesde.getDate() - VENTANA_VENTAS_DIAS);

  const [categoriesRaw, productsRaw, saleItemsRaw] = await Promise.all([
    db.category.findMany({
      orderBy: { name: "asc" },
    }),
    db.product.findMany({
      include: {
        category: true,
        inventory: { where: { branchId: { in: activeBranchIds } } },
      },
      orderBy: { name: "asc" },
    }),
    db.saleItem.findMany({
      where: {
        sale: { tenantId, status: "COMPLETED", createdAt: { gte: ventasDesde } },
      },
      select: {
        quantity: true,
        subtotal: true,
        product: { select: { id: true, name: true, category: { select: { name: true } } } },
        sale: { select: { branchId: true, createdAt: true } },
      },
    }),
  ]);

  const categorias: CategoriaCatalogo[] = categoriesRaw.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type as TipoCatalogo,
    color: c.color ?? CATEGORY_FALLBACK_COLOR,
  }));

  const productos: ProductoCatalogo[] = productsRaw.map((p) => {
    const type = p.type as TipoCatalogo;
    const isService = type === "SERVICE";
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      emoji: p.emoji ?? TYPE_FALLBACK_EMOJI[type],
      categoryId: p.categoryId,
      categoryName: p.category?.name ?? "Sin categoría",
      type,
      isService,
      price: Number(p.price),
      cost: p.cost != null ? Number(p.cost) : 0,
      stock: isService ? 0 : p.inventory.reduce((s, i) => s + i.stock, 0),
      minStock: isService ? 0 : p.inventory.reduce((s, i) => s + i.minStock, 0),
    };
  });

  const ventasDetalle: VentaDetalleItem[] = saleItemsRaw.map((it) => ({
    productId: it.product.id,
    productName: it.product.name,
    categoryName: it.product.category?.name ?? "Sin categoría",
    branchId: it.sale.branchId,
    quantity: it.quantity,
    subtotal: Number(it.subtotal),
    fecha: it.sale.createdAt.toISOString(),
  }));

  return { categorias, productos, ventasDetalle };
}
