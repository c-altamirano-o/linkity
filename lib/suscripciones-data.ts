import "server-only";

import { prisma } from "@/lib/prisma";
import type { BillingCycle, SubscriptionStatus } from "@prisma/client";
import { calcularEstadoCiclo, type EtapaCiclo } from "@/lib/ciclo-suscripcion";

/**
 * Capa de datos de la pantalla "Suscripciones" de Panel Maestro (menú que
 * existía en el sidebar desde antes pero sin pantalla construida detrás).
 *
 * A diferencia del Dashboard (que da un vistazo general del negocio-SaaS),
 * esta pantalla existe para UNA sola pregunta de Carlos como dueño de la
 * plataforma: "¿quién está usando esto y cuándo me toca cobrarle?" — no
 * analítica de uso, solo vigencia de cada suscripción y qué tan cerca (o
 * qué tan vencida) está de su fecha de renovación. Reutiliza el mismo
 * patrón cross-tenant de lib/maestro-data.ts (prisma directo, nunca
 * getTenantPrisma).
 */

export type Urgencia = "vencida" | "por_vencer" | "ok" | "inactiva" | "sin_suscripcion";

export interface SuscripcionRow {
  id: string; // tenantId
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  plan: string | null;
  price: number | null;
  currency: string | null;
  billingCycle: BillingCycle | null;
  status: SubscriptionStatus | null;
  startDate: string | null; // ISO
  endDate: string | null; // ISO
  autoRenew: boolean;
  diasRestantes: number | null; // negativo = días de vencida; null = sin fecha de vigencia
  urgencia: Urgencia;
  // Ciclo de vida de suscripción vencida (2026-09-22, ver lib/ciclo-suscripcion.ts)
  etapaCiclo: EtapaCiclo;
}

export interface SuscripcionesResumen {
  activas: number;
  porVencerPronto: number;
  vencidas: number;
  enPrueba: number;
  suspendidas: number;
  canceladas: number;
  mrr: number;
  // 2026-09-22: negocios que llevan 90+ días bloqueados sin responder — ver
  // lib/ciclo-suscripcion.ts. Se muestra como alerta en Panel Maestro para
  // que Carlos decida a mano si los borra (nunca automático).
  listosParaEliminar: number;
}

export interface SuscripcionesData {
  rows: SuscripcionRow[];
  resumen: SuscripcionesResumen;
}

const MS_DIA = 1000 * 60 * 60 * 24;
const UMBRAL_POR_VENCER_DIAS = 7;

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

const PRIORIDAD_URGENCIA: Record<Urgencia, number> = {
  vencida: 0,
  por_vencer: 1,
  ok: 2,
  sin_suscripcion: 3,
  inactiva: 4,
};

export async function getSuscripcionesData(): Promise<SuscripcionesData> {
  const now = new Date();

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: { subscription: true },
  });

  const rows: SuscripcionRow[] = tenants.map((t) => {
    const s = t.subscription;
    let diasRestantes: number | null = null;
    let urgencia: Urgencia;

    if (!s) {
      urgencia = "sin_suscripcion";
    } else if (s.status === "SUSPENDED" || s.status === "CANCELLED") {
      // Ya está fuera de operación — no hace falta perseguir un cobro aquí,
      // eso ya se decidió (o se decide) con el botón Suspender/Reactivar.
      urgencia = "inactiva";
      if (s.endDate) diasRestantes = Math.ceil((s.endDate.getTime() - now.getTime()) / MS_DIA);
    } else if (s.endDate) {
      diasRestantes = Math.ceil((s.endDate.getTime() - now.getTime()) / MS_DIA);
      if (diasRestantes < 0) urgencia = "vencida";
      else if (diasRestantes <= UMBRAL_POR_VENCER_DIAS) urgencia = "por_vencer";
      else urgencia = "ok";
    } else {
      urgencia = "ok";
    }

    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      city: t.city,
      state: t.state,
      plan: s?.plan ?? null,
      price: s ? Number(s.price) : null,
      currency: s?.currency ?? null,
      billingCycle: s?.billingCycle ?? null,
      status: s?.status ?? null,
      startDate: s?.startDate ? s.startDate.toISOString() : null,
      endDate: s?.endDate ? s.endDate.toISOString() : null,
      autoRenew: s?.autoRenew ?? false,
      diasRestantes,
      urgencia,
      etapaCiclo: calcularEstadoCiclo(s, now).etapa,
    };
  });

  rows.sort((a, b) => {
    const p = PRIORIDAD_URGENCIA[a.urgencia] - PRIORIDAD_URGENCIA[b.urgencia];
    if (p !== 0) return p;
    if (a.diasRestantes === null && b.diasRestantes === null) return 0;
    if (a.diasRestantes === null) return 1;
    if (b.diasRestantes === null) return -1;
    return a.diasRestantes - b.diasRestantes;
  });

  const resumen: SuscripcionesResumen = {
    activas: rows.filter((r) => r.status === "ACTIVE").length,
    porVencerPronto: rows.filter((r) => r.urgencia === "por_vencer").length,
    vencidas: rows.filter((r) => r.urgencia === "vencida").length,
    enPrueba: rows.filter((r) => r.status === "TRIAL").length,
    suspendidas: rows.filter((r) => r.status === "SUSPENDED").length,
    canceladas: rows.filter((r) => r.status === "CANCELLED").length,
    mrr: Math.round(
      tenants.reduce((sum, t) => {
        if (!t.subscription || t.subscription.status !== "ACTIVE") return sum;
        return sum + equivalenteMensual(Number(t.subscription.price), t.subscription.billingCycle);
      }, 0)
    ),
    listosParaEliminar: rows.filter((r) => r.etapaCiclo === "lista_para_eliminar").length,
  };

  return { rows, resumen };
}
