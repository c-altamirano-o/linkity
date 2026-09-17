"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { resolverActor } from "@/lib/actor";
import { MODULE_CATALOG } from "@/lib/modules-catalog";
import { modulosRecomendadosOff } from "@/lib/modulos-rubro";

/**
 * Personalización de módulos por el propio negocio (2026-09-17) — la
 * versión "self-service" de alternarModuloTenantAction (Panel Maestro,
 * app/(admin)/maestro/tenants/actions.ts): ahí Carlos prende/apaga un
 * módulo de CUALQUIER negocio; aquí el dueño de SU PROPIO negocio hace lo
 * mismo desde Configuración, sin necesitar a Carlos de por medio — es lo
 * que Carlos pidió desde el diseño original ("que cada uno escoja lo que
 * necesita y desea ver en su pantalla").
 *
 * Semántica de TenantModule.isActive (importante, compartida con el guard
 * de app/(tenant)/[tenant]/layout.tsx): "sin fila, o fila con isActive:
 * true" = módulo ACTIVO. Solo una fila explícita con isActive:false lo
 * oculta. Esto es a propósito "default abierto": así ningún negocio que ya
 * estaba en producción antes de este cambio (todos sus módulos activados
 * con los códigos VIEJOS "M1".."M14", ver lib/modules-catalog.ts) pierde un
 * módulo de golpe solo porque no existe todavía una fila con el código
 * NUEVO — hasta que alguien (el negocio o Carlos) apague algo a propósito,
 * o el negocio aplique el recomendado de su rubro.
 *
 * Seguridad: resolverActor(tenantSlug, "configuracion") solo regresa
 * ok:true para una cuenta real de administrador de ESE tenant —
 * "configuracion" no está en la matriz de acceso de ningún rol de PIN
 * (lib/roles.ts), así que un empleado con PIN nunca puede llamar esto, ni
 * aunque conozca el nombre de la acción.
 */

export type AccionModulosResult = { ok: true } | { ok: false; error: string };

export async function alternarModuloPropioAction(params: {
  tenantSlug: string;
  moduleCode: string;
  activar: boolean;
}): Promise<AccionModulosResult> {
  const resuelto = await resolverActor(params.tenantSlug, "configuracion");
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
      where: { tenantId_moduleId: { tenantId: resuelto.tenant.id, moduleId: mod.id } },
      update: { isActive: params.activar },
      create: { tenantId: resuelto.tenant.id, moduleId: mod.id, isActive: params.activar },
    });

    revalidatePath(`/${params.tenantSlug}`, "layout");
    return { ok: true };
  } catch (err) {
    console.error("Error al actualizar el módulo del negocio:", err);
    return { ok: false, error: "No se pudo actualizar el módulo" };
  }
}

// Aplica de un solo golpe la recomendación de módulos del rubro actual del
// negocio (lib/modulos-rubro.ts) — deja explícitamente activados todos los
// módulos no recomendados como inactivos, y desactivados los que sí, sin
// importar cómo estuvieran configurados antes. No borra ningún dato ya
// capturado (ej. reparaciones que ya existan) — solo cambia qué aparece en
// el menú.
export async function aplicarRecomendadoRubroAction(params: {
  tenantSlug: string;
}): Promise<AccionModulosResult> {
  const resuelto = await resolverActor(params.tenantSlug, "configuracion");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: resuelto.tenant.id },
      select: { businessType: true },
    });
    if (!tenant) return { ok: false, error: "Negocio no encontrado" };

    const recomendadosOff = new Set(modulosRecomendadosOff(tenant.businessType));

    const codigosNoNucleo = Object.entries(MODULE_CATALOG)
      .filter(([, info]) => !info.isCore)
      .map(([code]) => code);

    for (const code of codigosNoNucleo) {
      const info = MODULE_CATALOG[code];
      const mod = await prisma.module.upsert({
        where: { code },
        update: {},
        create: { code, name: info.name, isCore: info.isCore },
      });
      await prisma.tenantModule.upsert({
        where: { tenantId_moduleId: { tenantId: resuelto.tenant.id, moduleId: mod.id } },
        update: { isActive: !recomendadosOff.has(code) },
        create: { tenantId: resuelto.tenant.id, moduleId: mod.id, isActive: !recomendadosOff.has(code) },
      });
    }

    revalidatePath(`/${params.tenantSlug}`, "layout");
    return { ok: true };
  } catch (err) {
    console.error("Error al aplicar el recomendado de rubro:", err);
    return { ok: false, error: "No se pudo aplicar la recomendación" };
  }
}
