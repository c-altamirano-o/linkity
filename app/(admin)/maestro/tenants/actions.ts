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
