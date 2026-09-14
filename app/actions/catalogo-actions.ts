"use server";

import { prisma, getTenantPrisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Server Actions del módulo Catálogo (M6). Antes de este cambio no existía
 * ningún actions.ts para este módulo — tanto el botón "Nuevo" del sidebar
 * como la tarjeta punteada "Agregar" eran decorativos, y no había forma de
 * editar un producto ya creado ni de dar de alta una categoría nueva desde
 * la UI (solo existían las que trajera el seed).
 *
 * Mismo criterio que en clientes-actions.ts / sucursales-actions.ts:
 * resolverTenantYUsuario duplicado localmente, retorno discriminado
 * {ok:true,...}|{ok:false,error}.
 *
 * Nota: crear/editar un producto NO toca Inventory (el stock por sucursal)
 * — esa es información que ya entra por un camino real y probado
 * (recibir una Compra incrementa Inventory, ver compras-actions.ts).
 * Reutilizar ese mismo mecanismo en vez de inventar un segundo lugar para
 * "poner stock a mano" evita que los dos caminos se desincronicen.
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

export type TipoProductoInput = "PRODUCT" | "PART" | "SERVICE";

export interface DatosProducto {
  name: string;
  sku?: string | null;
  price: number;
  cost?: number | null;
  type: TipoProductoInput;
  categoryId?: string | null;
  emoji?: string | null;
}

function validarDatosProducto(datos: DatosProducto): string | null {
  if (!datos.name?.trim()) return "El nombre es obligatorio";
  if (!Number.isFinite(datos.price) || datos.price <= 0) return "El precio debe ser mayor a cero";
  if (datos.cost != null && (!Number.isFinite(datos.cost) || datos.cost < 0)) return "El costo no puede ser negativo";
  if (!["PRODUCT", "PART", "SERVICE"].includes(datos.type)) return "Tipo de producto inválido";
  return null;
}

export type AccionProductoResult = { ok: true; id: string } | { ok: false; error: string };

export async function crearProductoAction(
  params: { tenantSlug: string } & DatosProducto
): Promise<AccionProductoResult> {
  const { tenantSlug, ...datos } = params;
  const errorValidacion = validarDatosProducto(datos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    if (datos.sku?.trim()) {
      const existente = await db.product.findFirst({ where: { sku: datos.sku.trim() }, select: { id: true } });
      if (existente) return { ok: false, error: `Ya existe un producto con el SKU "${datos.sku.trim()}"` };
    }

    const nuevo = await db.product.create({
      data: {
        tenantId: tenant.id,
        name: datos.name.trim(),
        sku: datos.sku?.trim() || null,
        price: datos.price,
        cost: datos.cost ?? null,
        type: datos.type,
        categoryId: datos.categoryId || null,
        emoji: datos.emoji?.trim() || null,
      },
    });

    revalidatePath(`/${tenantSlug}/catalogo`);
    revalidatePath(`/${tenantSlug}/inventario`);
    return { ok: true, id: nuevo.id };
  } catch (err: any) {
    return manejarErrorAcceso(err, "No se pudo registrar el producto");
  }
}

export async function editarProductoAction(
  params: { tenantSlug: string; productId: string; isActive: boolean } & DatosProducto
): Promise<AccionProductoResult> {
  const { tenantSlug, productId, isActive, ...datos } = params;
  const errorValidacion = validarDatosProducto(datos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const existente = await db.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!existente) return { ok: false, error: "Producto no encontrado" };

    if (datos.sku?.trim()) {
      const duplicado = await db.product.findFirst({
        where: { sku: datos.sku.trim(), NOT: { id: productId } },
        select: { id: true },
      });
      if (duplicado) return { ok: false, error: `Ya existe otro producto con el SKU "${datos.sku.trim()}"` };
    }

    await db.product.update({
      where: { id: productId },
      data: {
        name: datos.name.trim(),
        sku: datos.sku?.trim() || null,
        price: datos.price,
        cost: datos.cost ?? null,
        type: datos.type,
        categoryId: datos.categoryId || null,
        emoji: datos.emoji?.trim() || null,
        isActive,
      },
    });

    revalidatePath(`/${tenantSlug}/catalogo`);
    revalidatePath(`/${tenantSlug}/inventario`);
    return { ok: true, id: productId };
  } catch (err: any) {
    return manejarErrorAcceso(err, "No se pudo actualizar el producto");
  }
}

export interface DatosCategoria {
  name: string;
  type: TipoProductoInput;
  color?: string | null;
}

export type AccionCategoriaResult = { ok: true; id: string } | { ok: false; error: string };

export async function crearCategoriaAction(
  params: { tenantSlug: string } & DatosCategoria
): Promise<AccionCategoriaResult> {
  const { tenantSlug, ...datos } = params;
  if (!datos.name?.trim()) return { ok: false, error: "El nombre de la categoría es obligatorio" };
  if (!["PRODUCT", "PART", "SERVICE"].includes(datos.type)) return { ok: false, error: "Tipo de categoría inválido" };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const nueva = await db.category.create({
      data: {
        tenantId: tenant.id,
        name: datos.name.trim(),
        type: datos.type,
        color: datos.color?.trim() || null,
      },
    });

    revalidatePath(`/${tenantSlug}/catalogo`);
    return { ok: true, id: nueva.id };
  } catch (err: any) {
    return manejarErrorAcceso(err, "No se pudo crear la categoría");
  }
}
