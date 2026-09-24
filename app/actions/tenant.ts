"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { resolverActor } from "@/lib/actor";

// intensity: 0–200 (100 = paleta original, ver INTENSIDAD_DEFAULT en
// lib/theme-presets.ts). Se guarda junto con el preset porque ambos valores
// viajan siempre juntos desde el slider de Configuración — ver el comentario
// largo en resolverPresetTenant sobre por qué esa función es el único punto
// que debe interpretar la combinación de los dos.
//
// intensityFondo (2026-09-24, a petición de Carlos: segundo modulador
// independiente para el fondo/color primario, ver el comentario largo en
// construirPresetWindowsPhone): opcional para no romper ninguna llamada
// vieja — si se omite, se guarda igual a `intensity` (mismo comportamiento
// de antes de que existiera este control).
export async function updateThemePreset(
  tenantSlug: string,
  preset: any,
  intensity: number,
  intensityFondo?: number,
) {
  const intensidadValida = Number.isFinite(intensity)
    ? Math.max(0, Math.min(200, Math.round(intensity)))
    : 100;
  const intensidadFondoValida = Number.isFinite(intensityFondo)
    ? Math.max(0, Math.min(200, Math.round(intensityFondo as number)))
    : intensidadValida;

  try {
    await prisma.tenant.update({
      where: { slug: tenantSlug },
      data: {
        themePreset: preset,
        themeIntensity: intensidadValida,
        themeIntensityFondo: intensidadFondoValida,
      },
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

// Día de inicio de la semana laboral (2026-09-18, a petición de Carlos: ver
// el comentario largo en Tenant.weekStartDay, schema.prisma, y en
// lib/periodo-laboral.ts). A diferencia de updateThemePreset/
// updateBusinessType de arriba (que confían en el tenantSlug recibido sin
// verificar sesión — deuda previa a este archivo, no se toca aquí), esta
// función sí valida con resolverActor: cambia un valor que afecta cálculos
// de nómina (horas trabajadas, comisiones por período), así que solo el
// administrador dueño de la cuenta (nunca un empleado con PIN —
// "configuracion" no aparece en ninguna matriz de acceso de rol, ver
// lib/roles.ts) debería poder tocarlo.
// Teléfono de soporte del negocio (Tenant.phone, ya existía en el schema
// pero no tenía ninguna pantalla propia para capturarlo — solo lo podía
// tocar el panel maestro/superadmin). A petición de Carlos, 2026-09-21:
// "en el ticket debe venir el teléfono de soporte del taller o del
// negocio. No vi un campo para capturar eso al dar de alta el negocio."
// Mismo criterio de validación que updateWeekStartDay: solo el
// administrador dueño de la cuenta (resolverActor con "configuracion",
// que ningún rol con PIN de empleado tiene en su matriz de acceso).
export async function updateSupportPhone(tenantSlug: string, phone: string) {
  const limpio = phone.trim();
  if (limpio && !/^[0-9+()\-\s]{7,20}$/.test(limpio)) {
    return { success: false, error: "Ese teléfono no parece válido" };
  }

  const resuelto = await resolverActor(tenantSlug, "configuracion");
  if (!resuelto.ok) return { success: false, error: resuelto.error };

  try {
    await prisma.tenant.update({
      where: { id: resuelto.tenant.id },
      data: { phone: limpio || null },
    });

    // Se usa en los tickets imprimibles/digitales de Reparaciones y Ventas.
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar el teléfono de soporte:", error);
    return { success: false, error: "No se pudo actualizar el teléfono" };
  }
}

// Cobro en devoluciones (Tenant.cobrarEnDevolucion, 2026-09-22, a petición
// de Carlos, ejemplo "Fix Expres": "eso debe ser configurable desde la
// pantalla del administrador" — una sola regla para TODO el negocio, no por
// sucursal ("una sola regla para todo el negocio", respuesta explícita de
// Carlos). Cuando está activo, entregar un equipo en devolución (SHOP_RETURN
// -> DELIVERED) exige pasar por el cobro de "Cobrar y entregar" en vez de
// una entrega directa sin cargo — ver avanzarEstadoAction/
// cobrarYEntregarAction en reparaciones-actions.ts. Mismo criterio de
// validación que updateWeekStartDay/updateSupportPhone: solo el
// administrador dueño de la cuenta.
export async function updateCobrarEnDevolucion(tenantSlug: string, valor: boolean) {
  const resuelto = await resolverActor(tenantSlug, "configuracion");
  if (!resuelto.ok) return { success: false, error: resuelto.error };

  try {
    await prisma.tenant.update({
      where: { id: resuelto.tenant.id },
      data: { cobrarEnDevolucion: valor },
    });

    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar cobro en devoluciones:", error);
    return { success: false, error: "No se pudo actualizar esta configuración" };
  }
}

export async function updateWeekStartDay(tenantSlug: string, weekStartDay: number) {
  if (!Number.isInteger(weekStartDay) || weekStartDay < 0 || weekStartDay > 6) {
    return { success: false, error: "Día inválido" };
  }

  const resuelto = await resolverActor(tenantSlug, "configuracion");
  if (!resuelto.ok) return { success: false, error: resuelto.error };

  try {
    await prisma.tenant.update({
      where: { id: resuelto.tenant.id },
      data: { weekStartDay },
    });

    // Afecta Dashboard, Personal y Asistencia — se purga todo el árbol
    // igual que el tema/rubro.
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar el día de inicio de semana:", error);
    return { success: false, error: "No se pudo actualizar el día de inicio de semana" };
  }
}