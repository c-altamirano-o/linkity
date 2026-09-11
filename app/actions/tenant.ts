"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function updateThemePreset(tenantSlug: string, preset: any) {
  try {
    await prisma.tenant.update({
      where: { slug: tenantSlug },
      data: { themePreset: preset },
    });

    // Purga el caché de Next.js para que el layout aplique el nuevo color al instante
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar el tema:", error);
    return { success: false, error: "No se pudo actualizar el tema" };
  }
}

// businessType es String? en el schema (no un enum) para no requerir una
// migración cada vez que se agrega un rubro nuevo — la lista de valores
// válidos vive en código, en lib/labels.ts (BUSINESS_TYPE_OPTIONS +
// VERTICAL_LABEL_DEFAULTS). null = "sin especificar" (cae a los defaults
// genéricos de labels).
export async function updateBusinessType(tenantSlug: string, businessType: string | null) {
  try {
    await prisma.tenant.update({
      where: { slug: tenantSlug },
      data: { businessType },
    });

    // El rubro cambia la terminología (labels) en todo el tenant, así que
    // se purga todo el árbol igual que el tema.
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar el rubro:", error);
    return { success: false, error: "No se pudo actualizar el rubro" };
  }
}