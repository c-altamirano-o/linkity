"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { resolverActor } from "@/lib/actor";
import { BUSINESS_TYPE_OPTIONS } from "@/lib/labels";
import { MODULE_CATALOG } from "@/lib/modules-catalog";
import { modulosRecomendadosOff } from "@/lib/modulos-rubro";
import { asegurarRolesRubro } from "@/lib/roles-server";
import { generarSlugUnico } from "@/lib/crear-negocio";
import { slugify } from "@/lib/slug";
import { validarDatosNegocio } from "@/lib/datos-negocio-puro";

/**
 * Primer acceso de un negocio creado desde Hotmart (2026-10-08): el checkout
 * de Hotmart no pregunta el nombre del negocio ni su giro, así que el negocio
 * nace con un nombre provisional ("Negocio de Juan") y `businessType` en null.
 * El layout del negocio (app/(tenant)/[tenant]/layout.tsx) muestra la pantalla
 * "Cuéntanos de tu negocio" mientras Tenant.datosPendientes sea true, y esta acción
 * guarda lo que el dueño captura:
 *
 *  - nombre real del negocio y su dirección (slug) nueva, sin choques;
 *  - el giro (businessType);
 *  - los módulos que no aplican a ese giro quedan apagados (solo se APAGAN
 *    los recomendados; nunca se enciende ni se toca nada más);
 *  - los roles con permisos del giro (asegurarRolesRubro).
 *
 * Solo funciona UNA vez por negocio (mientras datosPendientes siga en true): para
 * cambiar nombre o giro después existe Configuración. Solo el administrador
 * con cuenta real puede llamarla (resolverActor con "configuracion", que
 * ningún rol de PIN tiene).
 */

export type GuardarDatosNegocioResult =
  | { ok: true; slug: string }
  | { ok: false; error: string };

const GIROS_VALIDOS = BUSINESS_TYPE_OPTIONS.map((o) => o.value);

function esChoqueDeSlug(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

export async function guardarDatosNegocioAction(params: {
  tenantSlug: string;
  businessName: string;
  businessType: string;
}): Promise<GuardarDatosNegocioResult> {
  const resuelto = await resolverActor(params.tenantSlug, "configuracion");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  if (resuelto.actor !== "admin") return { ok: false, error: "Solo el dueño del negocio puede hacer esto." };

  const datos = validarDatosNegocio({ businessName: params.businessName, businessType: params.businessType }, GIROS_VALIDOS);
  if (!datos.ok) return { ok: false, error: datos.error };

  try {
    const actual = await prisma.tenant.findUnique({
      where: { id: resuelto.tenant.id },
      select: { id: true, slug: true, datosPendientes: true },
    });
    if (!actual) return { ok: false, error: "Negocio no encontrado" };
    if (!actual.datosPendientes) {
      // Ya se capturó antes (doble clic, pestaña vieja): no se vuelve a tocar nada.
      return { ok: true, slug: actual.slug };
    }

    // Dirección nueva a partir del nombre. Si el nombre da la misma dirección
    // que ya tiene, se conserva; si no, se busca una libre.
    let slugFinal = slugify(datos.businessName) === actual.slug ? actual.slug : await generarSlugUnico(datos.businessName);

    let guardado = false;
    for (let intento = 0; intento < 3 && !guardado; intento++) {
      try {
        await prisma.tenant.update({
          where: { id: actual.id },
          data: { name: datos.businessName, slug: slugFinal, businessType: datos.businessType, datosPendientes: false },
        });
        guardado = true;
      } catch (err) {
        // Otro negocio tomó esa dirección justo ahora: se busca otra y se reintenta.
        if (!esChoqueDeSlug(err) || intento === 2) throw err;
        slugFinal = await generarSlugUnico(datos.businessName);
      }
    }

    // Apaga los módulos que no aplican al giro (solo apaga; no toca el resto).
    for (const code of modulosRecomendadosOff(datos.businessType)) {
      const info = MODULE_CATALOG[code];
      if (!info || info.isCore) continue;
      const mod = await prisma.module.upsert({
        where: { code },
        update: {},
        create: { code, name: info.name, isCore: info.isCore },
      });
      await prisma.tenantModule.upsert({
        where: { tenantId_moduleId: { tenantId: actual.id, moduleId: mod.id } },
        update: { isActive: false },
        create: { tenantId: actual.id, moduleId: mod.id, isActive: false },
      });
    }

    try {
      await asegurarRolesRubro(actual.id, datos.businessType);
    } catch (errRoles) {
      // "Roles y permisos" los vuelve a crear solo al abrirse (listarRolesTenant).
      console.error("No se pudieron crear los roles del giro (se crearán al abrir Roles y permisos):", errRoles);
    }

    revalidatePath(`/${actual.slug}`, "layout");
    if (slugFinal !== actual.slug) revalidatePath(`/${slugFinal}`, "layout");
    return { ok: true, slug: slugFinal };
  } catch (err) {
    console.error("Error al guardar los datos del negocio:", err);
    return { ok: false, error: "No se pudieron guardar los datos. Intenta de nuevo." };
  }
}
