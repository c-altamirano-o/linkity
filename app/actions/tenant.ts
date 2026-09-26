"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { resolverActor } from "@/lib/actor";
import { parseColoresPersonalizados, TEMA_PERSONALIZADO_ID } from "@/lib/theme-presets";

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
//
// customColors (2026-09-24, tema "Personalizado"): solo se guarda cuando
// preset === TEMA_PERSONALIZADO_ID Y logra pasar parseColoresPersonalizados
// (nunca se confía en lo que manda el cliente para un campo Json). Si el
// tema elegido NO es el personalizado, este campo simplemente no se toca
// (undefined = Prisma lo deja igual) — así un negocio que configuró sus
// colores, cambió a otro tema y luego regresa a "Personalizado" no pierde
// lo que ya había elegido.
export async function updateThemePreset(
  tenantSlug: string,
  preset: any,
  intensity: number,
  intensityFondo?: number,
  customColors?: unknown,
) {
  const intensidadValida = Number.isFinite(intensity)
    ? Math.max(0, Math.min(200, Math.round(intensity)))
    : 100;
  const intensidadFondoValida = Number.isFinite(intensityFondo)
    ? Math.max(0, Math.min(200, Math.round(intensityFondo as number)))
    : intensidadValida;

  if (preset === TEMA_PERSONALIZADO_ID && parseColoresPersonalizados(customColors) === null) {
    return { success: false, error: "Los colores del tema personalizado no son válidos" };
  }
  const coloresValidados = preset === TEMA_PERSONALIZADO_ID ? parseColoresPersonalizados(customColors) : undefined;

  try {
    await prisma.tenant.update({
      where: { slug: tenantSlug },
      data: {
        themePreset: preset,
        themeIntensity: intensidadValida,
        themeIntensityFondo: intensidadFondoValida,
        ...(coloresValidados !== undefined ? { themeCustomColors: coloresValidados as any } : {}),
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

// Personalización del ticket (2026-09-26, a petición de Carlos: "¿existe un
// apartado para personalizar el ticket?"). Tres datos en un solo botón de
// "Guardar cambios" — logo y teléfono YA tienen su propia sección en esta
// misma pantalla (subirLogoAction / updateSupportPhone) y el nombre del
// negocio en el ticket sigue siendo el mismo que ya se ve en el resto de la
// app (derivado del slug, ver nombreNegocioDeSlug en lib/recibo-imprimible.ts
// y businessName en TenantShell.tsx) — a propósito NO se vuelve editable
// aparte aquí, para no terminar con dos nombres distintos del mismo negocio
// en dos pantallas distintas.
// - direccion/rfc (Tenant.address/Tenant.rfc): ya existían en el schema
//   desde antes (pensados para CFDI/facturación) pero sin ninguna pantalla
//   para capturarlos — se reutilizan aquí, no son campos nuevos.
// - mensaje (Tenant.reciboMensajePie, SÍ es un campo nuevo): reemplaza el
//   "¡Gracias por tu preferencia!" fijo de lib/recibo-imprimible.ts.
// Cualquiera de los tres vacío/solo espacios se guarda como null (esa línea
// simplemente no se imprime, o vuelve al mensaje de pie de siempre) — sin
// necesidad de un botón "restaurar" aparte. Mismo criterio de validación que
// updateSupportPhone/updateWeekStartDay: solo el administrador dueño de la
// cuenta (resolverActor con "configuracion", ningún rol de PIN lo tiene en
// su matriz de acceso).
const MAX_LARGO_DIRECCION = 150;
const MAX_LARGO_RFC = 20;
const MAX_LARGO_MENSAJE_PIE = 200;

export async function updateDatosTicket(
  tenantSlug: string,
  datos: { direccion: string; rfc: string; mensajePie: string }
) {
  const direccion = datos.direccion.trim();
  const rfc = datos.rfc.trim().toUpperCase();
  const mensajePie = datos.mensajePie.trim();

  if (direccion.length > MAX_LARGO_DIRECCION) {
    return { success: false, error: `La dirección no puede pasar de ${MAX_LARGO_DIRECCION} caracteres` };
  }
  if (rfc && !/^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/.test(rfc)) {
    return { success: false, error: "Ese RFC no parece válido" };
  }
  if (mensajePie.length > MAX_LARGO_MENSAJE_PIE) {
    return { success: false, error: `El mensaje no puede pasar de ${MAX_LARGO_MENSAJE_PIE} caracteres` };
  }

  const resuelto = await resolverActor(tenantSlug, "configuracion");
  if (!resuelto.ok) return { success: false, error: resuelto.error };

  try {
    await prisma.tenant.update({
      where: { id: resuelto.tenant.id },
      data: {
        address: direccion || null,
        rfc: rfc || null,
        reciboMensajePie: mensajePie || null,
      },
    });

    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar los datos del ticket:", error);
    return { success: false, error: "No se pudo actualizar" };
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

// Monto fijo a cobrar por una devolución (Tenant.montoDevolucion, 2026-09-26,
// junto con la unificación del botón "Entregar" de Aduana/Reparaciones —
// ver el comentario largo en Tenant.montoDevolucion, schema.prisma). Solo
// tiene efecto mientras cobrarEnDevolucion esté activo — se guarda aparte
// (no junto con el toggle de arriba) porque es un campo de texto que el
// administrador edita y confirma, no un switch que se guarda al instante.
export async function updateMontoDevolucion(tenantSlug: string, valor: number) {
  if (!Number.isFinite(valor) || valor < 0) {
    return { success: false, error: "El monto debe ser un número válido mayor o igual a cero" };
  }

  const resuelto = await resolverActor(tenantSlug, "configuracion");
  if (!resuelto.ok) return { success: false, error: resuelto.error };

  try {
    await prisma.tenant.update({
      where: { id: resuelto.tenant.id },
      data: { montoDevolucion: Math.round(valor * 100) / 100 },
    });

    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    console.error("Error al actualizar el monto de devolución:", error);
    return { success: false, error: "No se pudo actualizar este monto" };
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