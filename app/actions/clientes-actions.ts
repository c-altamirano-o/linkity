"use server";

import { getTenantPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { resolverActor, type ActorResult } from "@/lib/actor";
import { PAIS_TELEFONO_DEFAULT } from "@/lib/paises";

/**
 * Server Actions del módulo Clientes (M7). Mismo criterio de siempre: el
 * cliente del navegador solo manda los campos capturados, y aquí se valida
 * y se resuelve el tenant/usuario antes de tocar la base de datos. Antes de
 * este cambio no existía ningún actions.ts para este módulo — la pantalla
 * era de solo lectura de datos inventados.
 *
 * resolverTenantYUsuario ahora delega en resolverActor (lib/actor.ts), que
 * acepta tanto una cuenta real (Supabase Auth) como una sesión de PIN de
 * personal (M11) — Cajero y Técnico tienen "clientes" en su matriz de
 * acceso (lib/roles.ts), así que un empleado con PIN sí puede dar de alta
 * o editar un cliente desde aquí.
 */

type ResolverResult = ActorResult;

async function resolverTenantYUsuario(tenantSlug: string): Promise<ResolverResult> {
  return resolverActor(tenantSlug, "clientes");
}

export interface DatosCliente {
  name: string;
  phone?: string | null;
  // Código de país del teléfono (ej. "+52", "+1") — ver lib/paises.ts. Se
  // guarda por separado del número (no concatenado en `phone`) para poder
  // mostrar el selector ya preseleccionado al editar, y para construir el
  // link de WhatsApp correcto sin tener que parsear el string.
  phoneCountryCode?: string | null;
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
        phoneCountryCode: datos.phoneCountryCode?.trim() || PAIS_TELEFONO_DEFAULT,
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
        phoneCountryCode: datos.phoneCountryCode?.trim() || PAIS_TELEFONO_DEFAULT,
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
