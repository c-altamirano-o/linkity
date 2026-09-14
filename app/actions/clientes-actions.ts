"use server";

import { prisma, getTenantPrisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Server Actions del módulo Clientes (M7). Mismo criterio de siempre: el
 * cliente del navegador solo manda los campos capturados, y aquí se valida
 * y se resuelve el tenant/usuario antes de tocar la base de datos. Antes de
 * este cambio no existía ningún actions.ts para este módulo — la pantalla
 * era de solo lectura de datos inventados.
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

export interface DatosCliente {
  name: string;
  phone?: string | null;
  email?: string | null;
  rfc?: string | null;
  address?: string | null;
}

function validarDatosCliente(datos: DatosCliente): string | null {
  if (!datos.name?.trim()) return "El nombre del cliente es obligatorio";
  return null;
}

export type AccionClienteResult = { ok: true; id: string } | { ok: false; error: string };

export async function crearClienteAction(
  params: { tenantSlug: string } & DatosCliente
): Promise<AccionClienteResult> {
  const { tenantSlug, ...datos } = params;
  const errorValidacion = validarDatosCliente(datos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const nuevo = await db.customer.create({
      data: {
        tenantId: tenant.id,
        name: datos.name.trim(),
        phone: datos.phone?.trim() || null,
        email: datos.email?.trim() || null,
        rfc: datos.rfc?.trim() || null,
        address: datos.address?.trim() || null,
      },
    });

    revalidatePath(`/${tenantSlug}/clientes`);
    return { ok: true, id: nuevo.id };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al crear cliente:", err);
    return { ok: false, error: "No se pudo registrar el cliente" };
  }
}

export async function editarClienteAction(
  params: { tenantSlug: string; clienteId: string } & DatosCliente
): Promise<AccionClienteResult> {
  const { tenantSlug, clienteId, ...datos } = params;
  const errorValidacion = validarDatosCliente(datos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const existente = await db.customer.findUnique({ where: { id: clienteId }, select: { id: true } });
    if (!existente) return { ok: false, error: "Cliente no encontrado" };

    await db.customer.update({
      where: { id: clienteId },
      data: {
        name: datos.name.trim(),
        phone: datos.phone?.trim() || null,
        email: datos.email?.trim() || null,
        rfc: datos.rfc?.trim() || null,
        address: datos.address?.trim() || null,
      },
    });

    revalidatePath(`/${tenantSlug}/clientes`);
    return { ok: true, id: clienteId };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al editar cliente:", err);
    return { ok: false, error: "No se pudo actualizar el cliente" };
  }
}
