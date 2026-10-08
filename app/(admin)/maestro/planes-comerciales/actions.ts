"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/maestro-auth";

export type AccionPlanComercialResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

// Tope razonable (la columna es Decimal(12,2)); evita valores absurdos por error de dedo.
const LIMITE_MAXIMO = 100000;

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