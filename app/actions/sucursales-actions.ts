"use server";

import { prisma, getTenantPrisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Server Actions del módulo Sucursales. Antes de este cambio no existía
 * ningún actions.ts para este módulo — la pantalla era de solo lectura de
 * datos inventados y "Transferir" era un botón decorativo (2 segundos de
 * animación falsa, sin ningún cambio real en Inventory).
 *
 * Mismo criterio que en clientes-actions.ts / compras-actions.ts:
 * resolverTenantYUsuario duplicado localmente (convención del proyecto, no
 * se centraliza), resultado discriminado {ok:true,...}|{ok:false,error}.
 */

type ResolverResult =
  | { ok: true; tenant: { id: string }; dbUser: { id: string; tenantId: string } }
  | { ok: false; error: string };

async function resolverTenantYUsuario(tenantSlug: string): Promise<ResolverResult> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  if (!tenant) return { ok: false, error: "Negocio no encontrado" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión no válida, vuelve a iniciar sesión" };

  const dbUser = await prisma.user.findUnique({
    where: { supabaseId: user.id },
    select: { id: true, tenantId: true },
  });
  if (!dbUser || dbUser.tenantId !== tenant.id) {
    return { ok: false, error: "No tienes acceso a este negocio" };
  }

  return { ok: true, tenant, dbUser };
}

function manejarErrorAcceso(err: any, mensajeGenerico: string): { ok: false; error: string } {
  if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
    return { ok: false, error: "No tienes acceso a este recurso" };
  }
  console.error(mensajeGenerico, err);
  return { ok: false, error: mensajeGenerico };
}

export interface DatosSucursal {
  name: string;
  address?: string | null;
  phone?: string | null;
}

function validarDatosSucursal(datos: DatosSucursal): string | null {
  if (!datos.name?.trim()) return "El nombre de la sucursal es obligatorio";
  return null;
}

export type AccionSucursalResult = { ok: true; id: string } | { ok: false; error: string };

export async function crearSucursalAction(
  params: { tenantSlug: string } & DatosSucursal
): Promise<AccionSucursalResult> {
  const { tenantSlug, ...datos } = params;
  const errorValidacion = validarDatosSucursal(datos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const nueva = await db.branch.create({
      data: {
        tenantId: tenant.id,
        name: datos.name.trim(),
        address: datos.address?.trim() || null,
        phone: datos.phone?.trim() || null,
      },
    });

    revalidatePath(`/${tenantSlug}/sucursales`);
    return { ok: true, id: nueva.id };
  } catch (err: any) {
    return manejarErrorAcceso(err, "No se pudo registrar la sucursal");
  }
}

export async function editarSucursalAction(
  params: { tenantSlug: string; branchId: string; isActive: boolean } & DatosSucursal
): Promise<AccionSucursalResult> {
  const { tenantSlug, branchId, isActive, ...datos } = params;
  const errorValidacion = validarDatosSucursal(datos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const existente = await db.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!existente) return { ok: false, error: "Sucursal no encontrada" };

    await db.branch.update({
      where: { id: branchId },
      data: {
        name: datos.name.trim(),
        address: datos.address?.trim() || null,
        phone: datos.phone?.trim() || null,
        isActive,
      },
    });

    revalidatePath(`/${tenantSlug}/sucursales`);
    return { ok: true, id: branchId };
  } catch (err: any) {
    return manejarErrorAcceso(err, "No se pudo actualizar la sucursal");
  }
}

export type AccionTransferirResult = { ok: true } | { ok: false; error: string };

export async function transferirInventarioAction(params: {
  tenantSlug: string;
  productId: string;
  origenBranchId: string;
  destinoBranchId: string;
  cantidad: number;
}): Promise<AccionTransferirResult> {
  const { tenantSlug, productId, origenBranchId, destinoBranchId, cantidad } = params;

  if (!productId) return { ok: false, error: "Selecciona un producto" };
  if (!origenBranchId || !destinoBranchId) return { ok: false, error: "Selecciona sucursal de origen y destino" };
  if (origenBranchId === destinoBranchId) {
    return { ok: false, error: "La sucursal de origen y destino no pueden ser la misma" };
  }
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    return { ok: false, error: "La cantidad a transferir debe ser un entero mayor a cero" };
  }

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    // Product y Branch tienen tenantId propio → getTenantPrisma ya verifica
    // que las dos sucursales y el producto pertenezcan a este tenant antes
    // de dejar seguir. Inventory no tiene tenantId propio, así que su
    // ownership se hereda de que branchId/productId ya vinieron validados.
    const [producto, origen, destino] = await Promise.all([
      db.product.findUnique({ where: { id: productId }, select: { id: true, type: true } }),
      db.branch.findUnique({ where: { id: origenBranchId }, select: { id: true } }),
      db.branch.findUnique({ where: { id: destinoBranchId }, select: { id: true } }),
    ]);
    if (!producto) return { ok: false, error: "Producto no encontrado" };
    if (producto.type === "SERVICE") return { ok: false, error: "Un servicio no se puede transferir entre sucursales" };
    if (!origen || !destino) return { ok: false, error: "Sucursal no encontrada" };

    await db.$transaction(async (tx: any) => {
      const stockOrigen = await tx.inventory.findUnique({
        where: { productId_branchId: { productId, branchId: origenBranchId } },
        select: { stock: true },
      });
      const disponible = stockOrigen?.stock ?? 0;
      if (disponible < cantidad) {
        throw new Error(`Stock insuficiente en la sucursal de origen (disponible: ${disponible})`);
      }

      await tx.inventory.update({
        where: { productId_branchId: { productId, branchId: origenBranchId } },
        data: { stock: { decrement: cantidad } },
      });

      await tx.inventory.upsert({
        where: { productId_branchId: { productId, branchId: destinoBranchId } },
        update: { stock: { increment: cantidad } },
        create: { productId, branchId: destinoBranchId, stock: cantidad },
      });
    });

    revalidatePath(`/${tenantSlug}/sucursales`);
    revalidatePath(`/${tenantSlug}/inventario`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Stock insuficiente")) {
      return { ok: false, error: err.message };
    }
    return manejarErrorAcceso(err, "No se pudo completar la transferencia");
  }
}
