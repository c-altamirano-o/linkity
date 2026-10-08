import "server-only";

import { prisma } from "@/lib/prisma";
import { obtenerHotmartPlataforma } from "@/lib/config-plataforma";

/**
 * Capa de datos de Panel Maestro → Hotmart (Paso 4, 2026-10-08): bitácora
 * de webhooks y estado de la configuración. Cross-tenant, prisma directo.
 */

export interface HotmartEventoUI {
  id: string;
  receivedAt: string; // ISO
  event: string;
  outcome: string;
  needsAttention: boolean;
  attended: boolean;
  attendedAt: string | null;
  note: string | null;
  buyerEmail: string | null;
  productId: string | null;
  offerCode: string | null;
  transaction: string | null;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
  planName: string | null;
}

export interface PlanHotmartConfigUI {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  hotmartProductId: string | null;
  hotmartOfferCode: string | null;
}

export interface HotmartPanelData {
  hottokConfigurado: boolean;
  checkoutConfigurado: boolean;
  pendientes: number;
  eventos: HotmartEventoUI[];
  planes: PlanHotmartConfigUI[];
}

/** Contador para el menú lateral (eventos que esperan una decisión). */
export async function getHotmartPendientesCount(): Promise<number> {
  return prisma.hotmartEvent.count({ where: { needsAttention: true, attendedAt: null } });
}

export async function getHotmartPanelData(): Promise<HotmartPanelData> {
  const [filas, pendientes, planes, hotmartCfg] = await Promise.all([
    prisma.hotmartEvent.findMany({ orderBy: { receivedAt: "desc" }, take: 200 }),
    getHotmartPendientesCount(),
    prisma.commercialPlan.findMany({
      orderBy: { displayOrder: "asc" },
      select: { id: true, code: true, name: true, isActive: true, hotmartProductId: true, hotmartOfferCode: true },
    }),
    obtenerHotmartPlataforma(),
  ]);

  const tenantIds = [...new Set(filas.map((f) => f.tenantId).filter((x): x is string => !!x))];
  const planIds = [...new Set(filas.map((f) => f.commercialPlanId).filter((x): x is string => !!x))];
  const [tenants, planesRef] = await Promise.all([
    prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, slug: true, name: true } }),
    prisma.commercialPlan.findMany({ where: { id: { in: planIds } }, select: { id: true, name: true } }),
  ]);
  const tMap = new Map(tenants.map((t) => [t.id, t]));
  const pMap = new Map(planesRef.map((p) => [p.id, p.name]));

  return {
    hottokConfigurado: !!hotmartCfg.hottok,
    checkoutConfigurado: !!hotmartCfg.checkoutUrl,
    pendientes,
    planes,
    eventos: filas.map((f) => ({
      id: f.id,
      receivedAt: f.receivedAt.toISOString(),
      event: f.event,
      outcome: f.outcome,
      needsAttention: f.needsAttention,
      attended: !!f.attendedAt,
      attendedAt: f.attendedAt ? f.attendedAt.toISOString() : null,
      note: f.note,
      buyerEmail: f.buyerEmail,
      productId: f.productId,
      offerCode: f.offerCode,
      transaction: f.transaction,
      tenantId: f.tenantId,
      tenantSlug: f.tenantId ? tMap.get(f.tenantId)?.slug ?? null : null,
      tenantName: f.tenantId ? tMap.get(f.tenantId)?.name ?? null : null,
      planName: f.commercialPlanId ? pMap.get(f.commercialPlanId) ?? null : null,
    })),
  };
}
