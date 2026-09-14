import "server-only";

import { prisma } from "@/lib/prisma";
import type { BillingCycle, SubscriptionStatus } from "@prisma/client";

/**
 * Capa de datos reales del Dashboard de Panel Maestro. Antes de este
 * cambio, maestro/dashboard/page.tsx tenía 4 arreglos fijos (`metrics`,
 * `tenants`, `activity`, `plans`) sin ningún query a Prisma.
 *
 * A diferencia de los módulos dentro de un tenant, esta es una vista
 * ADMIN cruzada entre negocios — se usa `prisma` directo (nunca
 * getTenantPrisma, que existe justo para escopar a UN tenant).
 *
 * No existe ningún modelo de "actividad"/bitácora en el schema, así que la
 * tarjeta de "Actividad reciente" del mockup (con texto inventado como
 * "Cell Express activó módulo Facturación CFDI") no se reconstruye — se
 * reemplaza por "Negocios recientes" con datos reales (los últimos
 * registrados), mismo criterio que se usó para quitar Garantías de
 * Clientes en vez de inventar un modelo que no existe.
 */

export interface MaestroTenantRow {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  plan: string | null;
  subscriptionStatus: SubscriptionStatus | null; // null = tenant sin Subscription (no debería pasar en negocios creados desde el flujo actual)
  modulosActivos: number;
  modulosTotal: number;
}

export interface MaestroPlanDist {
  plan: string;
  count: number;
}

export interface MaestroRecienteRow {
  id: string;
  name: string;
  city: string | null;
  createdAt: string; // ISO
}

export interface MaestroData {
  negociosActivos: number;
  enPrueba: number;
  mrr: number;
  suscripcionesVencidas: number;
  tenants: MaestroTenantRow[];
  recientes: MaestroRecienteRow[];
  distribucionPlanes: MaestroPlanDist[];
  totalModulosCatalogo: number;
}

// Normaliza el precio de cualquier ciclo de facturación a un equivalente
// mensual, para poder sumarlos todos en un solo número de MRR.
function equivalenteMensual(price: number, cycle: BillingCycle): number {
  switch (cycle) {
    case "MENSUAL":
      return price;
    case "TRIMESTRAL":
      return price / 3;
    case "SEMESTRAL":
      return price / 6;
    case "ANUAL":
      return price / 12;
    default:
      return price;
  }
}

export async function getMaestroData(): Promise<MaestroData> {
  const now = new Date();

  const [tenantsRaw, totalModulosCatalogo, recientesRaw] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        subscription: true,
        modules: { where: { isActive: true }, select: { moduleId: true } },
      },
    }),
    prisma.module.count(),
    prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, city: true, createdAt: true },
    }),
  ]);

  const tenants: MaestroTenantRow[] = tenantsRaw.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    city: t.city,
    state: t.state,
    plan: t.subscription?.plan ?? null,
    subscriptionStatus: t.subscription?.status ?? null,
    modulosActivos: t.modules.length,
    modulosTotal: totalModulosCatalogo,
  }));

  const negociosActivos = tenants.filter((t) => t.subscriptionStatus === "ACTIVE").length;
  const enPrueba = tenants.filter((t) => t.subscriptionStatus === "TRIAL").length;

  const mrr = tenantsRaw.reduce((sum, t) => {
    if (!t.subscription || t.subscription.status !== "ACTIVE") return sum;
    return sum + equivalenteMensual(Number(t.subscription.price), t.subscription.billingCycle);
  }, 0);

  // "Vencida" = el estatus ya quedó en SUSPENDED, o sigue marcada ACTIVE
  // pero su vigencia (endDate) ya pasó — no existe todavía un job
  // automático que actualice el status cuando se cumple el plazo, así que
  // esta segunda condición es la única forma de detectarlo hoy.
  const suscripcionesVencidas = tenantsRaw.filter((t) => {
    const s = t.subscription;
    if (!s) return false;
    if (s.status === "SUSPENDED") return true;
    if (s.status === "ACTIVE" && s.endDate && s.endDate < now) return true;
    return false;
  }).length;

  const planCounts = new Map<string, number>();
  for (const t of tenantsRaw) {
    if (!t.subscription) continue;
    planCounts.set(t.subscription.plan, (planCounts.get(t.subscription.plan) ?? 0) + 1);
  }
  const distribucionPlanes: MaestroPlanDist[] = Array.from(planCounts.entries())
    .map(([plan, count]) => ({ plan, count }))
    .sort((a, b) => b.count - a.count);

  const recientes: MaestroRecienteRow[] = recientesRaw.map((t) => ({
    id: t.id,
    name: t.name,
    city: t.city,
    createdAt: t.createdAt.toISOString(),
  }));

  return {
    negociosActivos,
    enPrueba,
    mrr: Math.round(mrr),
    suscripcionesVencidas,
    tenants,
    recientes,
    distribucionPlanes,
    totalModulosCatalogo,
  };
}
