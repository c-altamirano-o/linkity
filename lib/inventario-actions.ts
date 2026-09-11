"use server";

import { prisma, getTenantPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/**
 * Server Action que persiste un ajuste de stock. Es intencionalmente
 * simple por ahora: actualiza Inventory.stock directamente y no deja
 * bitácora — a diferencia de Caja, que sí tiene CashMovement como
 * historial de cada entrada/salida.
 *
 * Si más adelante se quiere auditoría de inventario (quién ajustó qué,
 * cuándo y por qué), el siguiente paso natural es un modelo
 * StockMovement análogo a CashMovement.
 *
 * Nota de seguridad: antes de este cambio, esta función no verificaba en
 * absoluto que productId/branchId pertenecieran al tenant que dice estar
 * haciendo el ajuste — Inventory no tiene tenantId propio (se llega a su
 * tenant vía Product o Branch), así que quedaba fuera del alcance de
 * getTenantPrisma a menos que se verifique explícitamente. Ahora sí se
 * verifica: se resuelve el tenant real por su slug y se usa
 * getTenantPrisma para leer Product y Branch (ambos SÍ tienen tenantId
 * propio) — si cualquiera de los dos no pertenece a este tenant, la
 * extensión lanza "Acceso denegado" antes de tocar Inventory.
 */

export type AjusteTipo = "entrada" | "salida" | "ajuste";

export async function ajustarStock(params: {
  tenantSlug: string;
  productId: string;
  branchId: string;
  tipo: AjusteTipo;
  cantidad: number;
}): Promise<{ ok: true; nuevoStock: number } | { ok: false; error: string }> {
  const { tenantSlug, productId, branchId, tipo, cantidad } = params;

  if (!Number.isFinite(cantidad) || cantidad < 0) {
    return { ok: false, error: "Cantidad inválida" };
  }
  if (!branchId) {
    return { ok: false, error: "Selecciona una sucursal" };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true },
  });
  if (!tenant) {
    return { ok: false, error: "Negocio no encontrado" };
  }

  const db = getTenantPrisma(tenant.id);

  try {
    // findUnique en un modelo con tenantId propio valida ownership solo —
    // si el producto o la sucursal son de otro tenant, esto truena antes
    // de llegar al upsert de Inventory.
    const [product, branch] = await Promise.all([
      db.product.findUnique({ where: { id: productId }, select: { id: true } }),
      db.branch.findUnique({ where: { id: branchId }, select: { id: true } }),
    ]);
    if (!product) return { ok: false, error: "Producto no encontrado" };
    if (!branch) return { ok: false, error: "Sucursal no encontrada" };
  } catch {
    return { ok: false, error: "No tienes acceso a este producto o sucursal" };
  }

  const existing = await prisma.inventory.findUnique({
    where: { productId_branchId: { productId, branchId } },
  });

  let nuevoStock: number;
  if (tipo === "entrada") nuevoStock = (existing?.stock ?? 0) + cantidad;
  else if (tipo === "salida") nuevoStock = Math.max(0, (existing?.stock ?? 0) - cantidad);
  else nuevoStock = cantidad; // "ajuste" fija el valor absoluto

  await prisma.inventory.upsert({
    where: { productId_branchId: { productId, branchId } },
    update: { stock: nuevoStock },
    create: { productId, branchId, stock: nuevoStock, minStock: existing?.minStock ?? 0 },
  });

  revalidatePath(`/${tenantSlug}/inventario`);
  revalidatePath(`/${tenantSlug}/dashboard`);

  return { ok: true, nuevoStock };
}
