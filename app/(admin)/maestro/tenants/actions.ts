"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/maestro-auth";
import { MODULE_CATALOG } from "@/lib/modules-catalog";

export type AccionMaestroResult = { ok: true } | { ok: false; error: string };

// Prender/apagar un módulo para UN negocio en particular, desde su pantalla
// de detalle (antes esto solo se decidía una vez, al darlo de alta, en
// tenants/nuevo/actions.ts — no había forma de cambiarlo después sin entrar
// directo a la base de datos).
export async function alternarModuloTenantAction(params: {
  tenantId: string;
  slug: string;
  moduleCode: string;
  activar: boolean;
}): Promise<AccionMaestroResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  const info = MODULE_CATALOG[params.moduleCode];
  if (!info) return { ok: false, error: "Módulo desconocido" };
  if (info.isCore && !params.activar) {
    return { ok: false, error: "Este módulo es parte del núcleo y no se puede desactivar" };
  }

  try {
    const mod = await prisma.module.upsert({
      where: { code: params.moduleCode },
      update: {},
      create: { code: params.moduleCode, name: info.name, isCore: info.isCore },
    });

    await prisma.tenantModule.upsert({
      where: { tenantId_moduleId: { tenantId: params.tenantId, moduleId: mod.id } },
      update: { isActive: params.activar },
      create: { tenantId: params.tenantId, moduleId: mod.id, isActive: params.activar },
    });

    revalidatePath(`/maestro/tenants/${params.slug}`);
    revalidatePath("/maestro/tenants");
    revalidatePath("/maestro/dashboard");
    return { ok: true };
  } catch (err) {
    console.error("Error al actualizar el módulo del negocio:", err);
    return { ok: false, error: "No se pudo actualizar el módulo" };
  }
}

// Reasignar el esquema (límite de sucursales/personal) de un negocio desde
// su pantalla de detalle — así Carlos "migra" a un cliente de esquema según
// el volumen que vea, sin tocar la base de datos a mano. esquemaId=null
// quita el límite (el tenant queda sin esquema asignado, sin restricción).
export async function asignarEsquemaAction(params: {
  tenantId: string;
  slug: string;
  esquemaId: string | null;
}): Promise<AccionMaestroResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  try {
    if (params.esquemaId) {
      const esquema = await prisma.planEsquema.findUnique({
        where: { id: params.esquemaId },
        select: { id: true },
      });
      if (!esquema) return { ok: false, error: "Esquema no encontrado" };
    }

    await prisma.tenant.update({
      where: { id: params.tenantId },
      data: { esquemaId: params.esquemaId },
    });

    revalidatePath(`/maestro/tenants/${params.slug}`);
    revalidatePath("/maestro/tenants");
    return { ok: true };
  } catch (err) {
    console.error("Error al asignar esquema al negocio:", err);
    return { ok: false, error: "No se pudo asignar el esquema" };
  }
}
