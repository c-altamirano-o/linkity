"use server";

import { getTenantPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PurchaseStatus } from "@prisma/client";
import { resolverActor, puedeOperarSucursal, type ActorResult } from "@/lib/actor";

/**
 * Server Actions del módulo Compras/Proveedores (M12). Mismo criterio que
 * el resto de los módulos transaccionales (POS, Reparaciones, Caja): el
 * cliente solo manda ids, cantidades y costos "propuestos" — el subtotal
 * de cada renglón y el total de la compra SIEMPRE se recalculan aquí,
 * nunca se confía en lo que ya traía sumado la UI.
 *
 * "Marcar recibida" es la operación más delicada: además de cambiar el
 * status, incrementa Inventory de cada producto en la sucursal de la
 * compra (upsert por la clave compuesta productId_branchId, mismo patrón
 * que ajustarStock en inventario-actions.ts). Por eso branchId es
 * obligatorio en toda compra nueva, aunque el campo en el schema haya
 * quedado opcional por compatibilidad con una compra sembrada antes de
 * este cambio (ver el comentario en schema.prisma) — si esa compra vieja
 * llegara a marcarse como recibida, se rechaza explícitamente en vez de
 * fallar a medias sin saber a qué sucursal sumarle stock.
 */

type ResolverResult = ActorResult;

// Delega en resolverActor (lib/actor.ts) — Gerente tiene "compras" en su
// matriz de acceso (lib/roles.ts), Cajero y Técnico no.
async function resolverTenantYUsuario(tenantSlug: string): Promise<ResolverResult> {
  return resolverActor(tenantSlug, "compras");
}

export interface ItemCompraParams {
  productId: string;
  quantity: number;
  cost: number;
}

export interface CrearCompraParams {
  tenantSlug: string;
  branchId: string;
  supplierId?: string | null;
  proveedorNuevo?: { name: string; phone?: string; email?: string } | null;
  items: ItemCompraParams[];
  notes?: string | null;
}

export type CrearCompraResult = { ok: true; id: string; folio: string } | { ok: false; error: string };

export async function crearCompraAction(params: CrearCompraParams): Promise<CrearCompraResult> {
  const { tenantSlug, branchId, supplierId, proveedorNuevo, items, notes } = params;

  if (!branchId) return { ok: false, error: "Selecciona una sucursal" };
  if (!supplierId && !proveedorNuevo?.name.trim()) {
    return { ok: false, error: "Selecciona o registra un proveedor" };
  }
  if (!items.length) return { ok: false, error: "Agrega al menos un producto a la compra" };
  for (const it of items) {
    if (!it.productId) return { ok: false, error: "Hay un renglón sin producto seleccionado" };
    if (!Number.isFinite(it.quantity) || it.quantity <= 0) {
      return { ok: false, error: "Hay una cantidad inválida en los productos" };
    }
    if (!Number.isFinite(it.cost) || it.cost < 0) {
      return { ok: false, error: "Hay un costo inválido en los productos" };
    }
  }

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  // 2026-09-21, a petición de Carlos: un empleado de PIN solo puede
  // registrar compras para SU sucursal.
  if (!puedeOperarSucursal(resuelto, branchId)) {
    return { ok: false, error: "No tienes acceso a esa sucursal" };
  }

  const db = getTenantPrisma(tenant.id);

  try {
    const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!branch) return { ok: false, error: "Sucursal no encontrada" };

    let finalSupplierId = supplierId ?? null;
    if (finalSupplierId) {
      const proveedor = await db.supplier.findUnique({ where: { id: finalSupplierId }, select: { id: true } });
      if (!proveedor) return { ok: false, error: "Proveedor no encontrado" };
    } else if (proveedorNuevo?.name.trim()) {
      const nuevoProveedor = await db.supplier.create({
        data: {
          tenantId: tenant.id,
          name: proveedorNuevo.name.trim(),
          phone: proveedorNuevo.phone?.trim() || null,
          email: proveedorNuevo.email?.trim() || null,
        },
      });
      finalSupplierId = nuevoProveedor.id;
    }
    if (!finalSupplierId) return { ok: false, error: "Selecciona o registra un proveedor" };

    // Los productos deben pertenecer a este tenant — se validan todos de
    // una sola vez antes de crear nada.
    const productIds = items.map((it) => it.productId);
    const productosValidos = await db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true },
    });
    if (productosValidos.length !== new Set(productIds).size) {
      return { ok: false, error: "Alguno de los productos no es válido" };
    }

    // Folio secuencial simple OC-0012, OC-0013, ... — mismo patrón (y misma
    // limitación de concurrencia, ya documentada) que el folio de
    // reparaciones y ventas.
    //
    // 2026-09-24, mismo bug real (y misma corrección) que crearReparacionAction
    // en reparaciones-actions.ts: tomar "la compra más reciente por
    // createdAt" y sumarle 1 falla si algún folio ya existente quedó con una
    // fecha fuera de orden respecto a su número — "más reciente por fecha"
    // no es lo mismo que "de folio más alto", y calcular un folio que ya
    // existe truena con Prisma ("Unique constraint failed") antes de
    // registrar la compra. Ahora se revisan TODOS los folios OC- y se toma
    // el número más alto entre todos, sin importar su fecha.
    const comprasExistentes = await db.purchase.findMany({ select: { folio: true } });
    let siguienteNum = 1;
    for (const { folio: f } of comprasExistentes) {
      const m = f.match(/^OC-(\d+)$/);
      if (m) siguienteNum = Math.max(siguienteNum, parseInt(m[1], 10) + 1);
    }
    const folio = `OC-${String(siguienteNum).padStart(4, "0")}`;

    // Subtotales y total SIEMPRE recalculados aquí, nunca confiando en lo
    // que ya traía sumado el cliente.
    const itemsConSubtotal = items.map((it) => ({
      productId: it.productId,
      quantity: it.quantity,
      cost: it.cost,
      subtotal: Math.round(it.quantity * it.cost * 100) / 100,
    }));
    const total = Math.round(itemsConSubtotal.reduce((s, it) => s + it.subtotal, 0) * 100) / 100;

    const compra = await db.purchase.create({
      data: {
        tenantId: tenant.id,
        supplierId: finalSupplierId,
        branchId,
        folio,
        total,
        status: PurchaseStatus.PENDING,
        notes: notes?.trim() || null,
        items: { create: itemsConSubtotal },
      },
    });

    revalidatePath(`/${tenantSlug}/compras`);
    revalidatePath(`/${tenantSlug}/dashboard`);

    return { ok: true, id: compra.id, folio: compra.folio };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al crear compra:", err);
    return { ok: false, error: "No se pudo crear la compra" };
  }
}

export type AccionCompraResult = { ok: true } | { ok: false; error: string };

export async function actualizarEstadoCompraAction(params: {
  tenantSlug: string;
  purchaseId: string;
  nuevoEstado: "RECEIVED" | "CANCELLED";
}): Promise<AccionCompraResult> {
  const { tenantSlug, purchaseId, nuevoEstado } = params;

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const compra = await db.purchase.findUnique({
      where: { id: purchaseId },
      include: { items: { select: { productId: true, quantity: true } } },
    });
    if (!compra) return { ok: false, error: "Compra no encontrada" };
    if (compra.status !== PurchaseStatus.PENDING) {
      return { ok: false, error: "Esta compra ya no está pendiente" };
    }
    // 2026-09-21, a petición de Carlos: un empleado de PIN solo puede
    // actualizar compras de SU sucursal — una compra sin sucursal asignada
    // (dato viejo, ver el comentario del archivo) queda fuera del alcance
    // de cualquier empleado de PIN, solo un administrador puede resolverla.
    if (resuelto.branchId !== null && (!compra.branchId || compra.branchId !== resuelto.branchId)) {
      return { ok: false, error: "No tienes acceso a esa sucursal" };
    }

    if (nuevoEstado === "RECEIVED") {
      // Solo puede pasar aquí una compra sembrada antes de que branchId
      // existiera en el schema — toda compra nueva ya lo exige desde
      // crearCompraAction. Se rechaza en vez de adivinar a qué sucursal
      // sumarle stock.
      if (!compra.branchId) {
        return {
          ok: false,
          error: "Esta compra no tiene sucursal asignada y no se puede recibir automáticamente",
        };
      }

      await db.$transaction(async (tx: any) => {
        await tx.purchase.update({
          where: { id: purchaseId },
          data: { status: PurchaseStatus.RECEIVED, receivedAt: new Date() },
        });

        for (const item of compra.items) {
          await tx.inventory.upsert({
            where: { productId_branchId: { productId: item.productId, branchId: compra.branchId! } },
            update: { stock: { increment: item.quantity } },
            create: {
              productId: item.productId,
              branchId: compra.branchId!,
              stock: item.quantity,
            },
          });
        }
      });

      revalidatePath(`/${tenantSlug}/compras`);
      revalidatePath(`/${tenantSlug}/inventario`);
      revalidatePath(`/${tenantSlug}/dashboard`);
      return { ok: true };
    }

    // CANCELLED: solo cambia el status, no toca Inventory.
    await db.purchase.update({
      where: { id: purchaseId },
      data: { status: PurchaseStatus.CANCELLED },
    });

    revalidatePath(`/${tenantSlug}/compras`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al actualizar estado de compra:", err);
    return { ok: false, error: "No se pudo actualizar la compra" };
  }
}
