"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/maestro-auth";

export type AccionPlanComercialResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

// Tope razonable (la columna es Decimal(12,2)); evita valores absurdos por error de dedo.
const LIMITE_MAXIMO = 100000;

const CODIGO_VALIDO = /^[A-Z][A-Z0-9_]{2,49}$/;

function validarCatalogo(params: { code: string; name: string; description?: string | null }): string | null {
  if (!CODIGO_VALIDO.test(params.code)) {
    return "El código debe ir en MAYÚSCULAS, con letras, números o guion bajo (de 3 a 50 caracteres), empezando con letra. Ej. REPORTES_AVANZADOS";
  }
  const nombre = params.name?.trim() ?? "";
  if (nombre.length < 3 || nombre.length > 80) return "El nombre debe tener entre 3 y 80 caracteres";
  if ((params.description?.trim().length ?? 0) > 200) return "La descripción no puede pasar de 200 caracteres";
  return null;
}

function esCodigoDuplicado(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

function validarId(id: string): string | null {
  if (!id?.trim()) return "El identificador del plan es obligatorio";
  return null;
}

export async function actualizarHotmartPlanAction(params: {
  planId: string;
  hotmartProductId: string | null;
  hotmartOfferCode: string | null;
}): Promise<AccionPlanComercialResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  const errorId = validarId(params.planId);
  if (errorId) return { ok: false, error: errorId };

  try {
    const plan = await prisma.commercialPlan.findUnique({
      where: { id: params.planId },
      select: { id: true },
    });

    if (!plan) return { ok: false, error: "Plan comercial no encontrado" };

    await prisma.commercialPlan.update({
      where: { id: params.planId },
      data: {
        hotmartProductId: params.hotmartProductId?.trim() || null,
        hotmartOfferCode: params.hotmartOfferCode?.trim() || null,
      },
    });

    revalidatePath("/maestro/planes-comerciales");
    return { ok: true, id: params.planId };
  } catch (err) {
    console.error("Error al actualizar configuración de Hotmart:", err);
    return { ok: false, error: "No se pudo actualizar la configuración de Hotmart" };
  }
}

export async function alternarFeaturePlanAction(params: {
  planId: string;
  featureId: string;
  enabled: boolean;
}): Promise<AccionPlanComercialResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  if (!params.planId?.trim() || !params.featureId?.trim()) {
    return { ok: false, error: "Plan o función no especificados" };
  }

  try {
    const [plan, feature] = await Promise.all([
      prisma.commercialPlan.findUnique({
        where: { id: params.planId },
        select: { id: true },
      }),
      prisma.commercialFeature.findUnique({
        where: { id: params.featureId },
        select: { id: true },
      }),
    ]);

    if (!plan) return { ok: false, error: "Plan comercial no encontrado" };
    if (!feature) return { ok: false, error: "Función comercial no encontrada" };

    if (params.enabled) {
      await prisma.commercialPlanFeature.upsert({
        where: {
          planId_featureId: {
            planId: params.planId,
            featureId: params.featureId,
          },
        },
        create: {
          planId: params.planId,
          featureId: params.featureId,
        },
        update: {},
      });
    } else {
      await prisma.commercialPlanFeature.deleteMany({
        where: {
          planId: params.planId,
          featureId: params.featureId,
        },
      });
    }

    revalidatePath("/maestro/planes-comerciales");
    return { ok: true, id: params.planId };
  } catch (err) {
    console.error("Error al actualizar función del plan:", err);
    return { ok: false, error: "No se pudo actualizar la función del plan" };
  }
}

export async function actualizarLimitePlanAction(params: {
  planId: string;
  limitId: string;
  value: number | null;
  isUnlimited: boolean;
}): Promise<AccionPlanComercialResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  if (!params.planId?.trim() || !params.limitId?.trim()) {
    return { ok: false, error: "Plan o límite no especificados" };
  }

  if (!params.isUnlimited) {
    if (
      params.value === null ||
      !Number.isInteger(params.value) ||
      params.value < 0 ||
      params.value > LIMITE_MAXIMO
    ) {
      return {
        ok: false,
        error: `El límite debe ser un número entero entre 0 y ${LIMITE_MAXIMO}`,
      };
    }
  }

  try {
    const [plan, limit] = await Promise.all([
      prisma.commercialPlan.findUnique({
        where: { id: params.planId },
        select: { id: true },
      }),
      prisma.commercialLimit.findUnique({
        where: { id: params.limitId },
        select: { id: true },
      }),
    ]);

    if (!plan) return { ok: false, error: "Plan comercial no encontrado" };
    if (!limit) return { ok: false, error: "Límite comercial no encontrado" };

    await prisma.commercialPlanLimit.upsert({
      where: {
        planId_limitId: {
          planId: params.planId,
          limitId: params.limitId,
        },
      },
      create: {
        planId: params.planId,
        limitId: params.limitId,
        value: params.isUnlimited ? null : params.value,
        isUnlimited: params.isUnlimited,
      },
      update: {
        value: params.isUnlimited ? null : params.value,
        isUnlimited: params.isUnlimited,
      },
    });

    revalidatePath("/maestro/planes-comerciales");
    return { ok: true, id: params.planId };
  } catch (err) {
    console.error("Error al actualizar límite del plan:", err);
    return { ok: false, error: "No se pudo actualizar el límite del plan" };
  }
}

/**
 * Agrega una FUNCIÓN nueva al catálogo comercial (p. ej. un módulo premium).
 * Nace HABILITADA en todos los planes: así ningún cliente actual pierde nada
 * por el solo hecho de crearla; después se apaga en los planes donde no
 * aplique desde esta misma pantalla.
 *
 * Ojo: crear la función solo la registra. Para que el sistema la haga cumplir
 * hace falta que el punto del sistema que debe protegerse consulte
 * tieneFeature(tenantId, "<CODIGO>") (lib/capacidades-comerciales.ts).
 */
export async function crearFuncionComercialAction(params: {
  code: string;
  name: string;
  description?: string | null;
  category?: string | null;
}): Promise<AccionPlanComercialResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  const code = params.code?.trim().toUpperCase() ?? "";
  const errorValidacion = validarCatalogo({ code, name: params.name, description: params.description });
  if (errorValidacion) return { ok: false, error: errorValidacion };

  try {
    const id = await prisma.$transaction(async (tx) => {
      const ultima = await tx.commercialFeature.aggregate({ _max: { displayOrder: true } });
      const funcion = await tx.commercialFeature.create({
        data: {
          code,
          name: params.name.trim(),
          description: params.description?.trim() || null,
          category: params.category?.trim() || null,
          isActive: true,
          displayOrder: (ultima._max.displayOrder ?? 0) + 1,
        },
      });
      const planes = await tx.commercialPlan.findMany({ select: { id: true } });
      if (planes.length > 0) {
        await tx.commercialPlanFeature.createMany({
          data: planes.map((p) => ({ planId: p.id, featureId: funcion.id })),
          skipDuplicates: true,
        });
      }
      return funcion.id;
    });

    revalidatePath("/maestro/planes-comerciales");
    return { ok: true, id };
  } catch (err) {
    if (esCodigoDuplicado(err)) return { ok: false, error: `Ya existe una función con el código ${code}` };
    console.error("Error al crear la función comercial:", err);
    return { ok: false, error: "No se pudo crear la función" };
  }
}

/**
 * Agrega un LÍMITE nuevo al catálogo comercial. Nace ILIMITADO en todos los
 * planes (no recorta a nadie); después se fija el número de cada plan desde
 * esta pantalla.
 *
 * Igual que con las funciones: crearlo solo lo registra. Para que se cumpla,
 * el punto del sistema que cuenta ese recurso debe llamar
 * obtenerLimite(tenantId, "<CODIGO>") y puedeAgregarUno(...).
 */
export async function crearLimiteComercialAction(params: {
  code: string;
  name: string;
  description?: string | null;
  unit?: string | null;
  scope: "tenant" | "branch";
}): Promise<AccionPlanComercialResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  const code = params.code?.trim().toUpperCase() ?? "";
  const errorValidacion = validarCatalogo({ code, name: params.name, description: params.description });
  if (errorValidacion) return { ok: false, error: errorValidacion };
  if (params.scope !== "tenant" && params.scope !== "branch") {
    return { ok: false, error: "Indica si el límite es por negocio o por sucursal" };
  }
  if ((params.unit?.trim().length ?? 0) > 30) return { ok: false, error: "La unidad no puede pasar de 30 caracteres" };

  try {
    const id = await prisma.$transaction(async (tx) => {
      const ultimo = await tx.commercialLimit.aggregate({ _max: { displayOrder: true } });
      const limite = await tx.commercialLimit.create({
        data: {
          code,
          name: params.name.trim(),
          description: params.description?.trim() || null,
          unit: params.unit?.trim() || null,
          scope: params.scope,
          isActive: true,
          displayOrder: (ultimo._max.displayOrder ?? 0) + 1,
        },
      });
      const planes = await tx.commercialPlan.findMany({ select: { id: true } });
      if (planes.length > 0) {
        await tx.commercialPlanLimit.createMany({
          data: planes.map((p) => ({ planId: p.id, limitId: limite.id, value: null, isUnlimited: true })),
          skipDuplicates: true,
        });
      }
      return limite.id;
    });

    revalidatePath("/maestro/planes-comerciales");
    return { ok: true, id };
  } catch (err) {
    if (esCodigoDuplicado(err)) return { ok: false, error: `Ya existe un límite con el código ${code}` };
    console.error("Error al crear el límite comercial:", err);
    return { ok: false, error: "No se pudo crear el límite" };
  }
}
