import "server-only";

import { prisma } from "@/lib/prisma";

export type PlanComercialUI = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  currency: string;
  billingCycle: string;
  isActive: boolean;
  displayOrder: number;
  hotmartProductId: string | null;
  hotmartOfferCode: string | null;
  features: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    enabled: boolean;
  }>;
  limits: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    unit: string | null;
    scope: string | null;
    value: number | null;
    isUnlimited: boolean;
    /** false = el plan todavía no tiene fila para este límite (sin restricción). */
    configured: boolean;
  }>;
};

/**
 * Datos de la pantalla Planes comerciales (Panel Maestro).
 *
 * Tanto las funciones como los límites se listan desde el CATÁLOGO (no desde
 * lo que el plan ya tiene ligado): así, cuando se agrega una función o un
 * límite nuevo al catálogo, aparece de inmediato en todos los planes para
 * configurarlo, sin tocar nada más.
 */
export async function getPlanesComercialesData(): Promise<PlanComercialUI[]> {
  const [planes, featuresCatalogo, limitesCatalogo] = await Promise.all([
    prisma.commercialPlan.findMany({
      orderBy: { displayOrder: "asc" },
      include: {
        features: true,
        limits: true,
      },
    }),
    prisma.commercialFeature.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
    }),
    prisma.commercialLimit.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
    }),
  ]);

  return planes.map((plan) => ({
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    currency: plan.currency,
    billingCycle: plan.billingCycle,
    isActive: plan.isActive,
    displayOrder: plan.displayOrder,
    hotmartProductId: plan.hotmartProductId,
    hotmartOfferCode: plan.hotmartOfferCode,
    features: featuresCatalogo.map((feature) => ({
      id: feature.id,
      code: feature.code,
      name: feature.name,
      description: feature.description,
      enabled: plan.features.some((item) => item.featureId === feature.id),
    })),
    limits: limitesCatalogo.map((limit) => {
      const fila = plan.limits.find((item) => item.limitId === limit.id);
      return {
        id: limit.id,
        code: limit.code,
        name: limit.name,
        description: limit.description,
        unit: limit.unit,
        scope: limit.scope,
        value: fila && fila.value !== null ? Number(fila.value) : null,
        isUnlimited: fila?.isUnlimited ?? false,
        configured: Boolean(fila),
      };
    }),
  }));
}

export type PlanComercialOpcion = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  /** Texto corto con los límites del plan, p. ej. "4 sucursales · 5 empleados". */
  resumen: string;
};

/**
 * Lista ligera de planes para los selectores de Panel Maestro (asignar plan,
 * Renovar). El resumen se arma desde el catálogo de límites, así un límite
 * nuevo aparece solo en el texto sin tocar nada aquí.
 */
export async function getPlanesComercialesOpciones(): Promise<PlanComercialOpcion[]> {
  const [planes, limitesCatalogo] = await Promise.all([
    prisma.commercialPlan.findMany({ orderBy: { displayOrder: "asc" }, include: { limits: true } }),
    prisma.commercialLimit.findMany({ where: { isActive: true }, orderBy: { displayOrder: "asc" } }),
  ]);

  return planes.map((plan) => ({
    id: plan.id,
    code: plan.code,
    name: plan.name,
    isActive: plan.isActive,
    resumen: limitesCatalogo
      .map((limit) => {
        const fila = plan.limits.find((l) => l.limitId === limit.id);
        if (!fila) return null;
        const unidad = (limit.unit ?? limit.name) + (limit.scope === "branch" ? " por sucursal" : "");
        return fila.isUnlimited || fila.value === null ? `${unidad} sin límite` : `${Number(fila.value)} ${unidad}`;
      })
      .filter(Boolean)
      .join(" · "),
  }));
}
