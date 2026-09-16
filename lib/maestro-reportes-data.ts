import "server-only";

import { prisma } from "@/lib/prisma";
import type { BillingCycle } from "@prisma/client";

/**
 * Capa de datos de "Reportes" DENTRO DE PANEL MAESTRO: cómo va el negocio
 * de SaaS en el tiempo (tuyo, no el de tus clientes — eso ya se descartó
 * explícitamente, ver suscripciones-data.ts). No confundir con
 * lib/reportes-data.ts, que es el reporte de UN negocio para SU dueño
 * (ventas, reparaciones, etc.) — nombre distinto a propósito para no
 * pisarlo.
 *
 * A propósito solo se calcula lo que de verdad se puede reconstruir con los
 * datos que existen hoy:
 *
 * - Altas por mes: Tenant.createdAt es un timestamp real desde que se creó
 *   cada negocio, así que el histórico de altas es exacto.
 * - MRR actual y su desglose por plan: es una foto de AHORA (Subscription
 *   no guarda historial de cambios de precio/estado).
 *
 * Lo que NO se construye aquí, y por qué: un histórico de MRR mes a mes
 * ("cuánto facturabas en marzo") requeriría saber cuánto valía cada
 * suscripción EN ESE MOMENTO, y no existe ninguna bitácora de cambios de
 * Subscription — solo su estado actual. Inventar esa serie de tiempo sería
 * mostrar números que no pasaron. Mismo criterio de "no fabricar datos que
 * no existen" que ya se usó en maestro-data.ts para la actividad reciente.
 */

export interface AltaMes {
  mes: string; // "ene 26"
  count: number;
}

export interface IngresoPlan {
  plan: string;
  mrr: number;
  negocios: number;
}

export interface ReportesEstados {
  activos: number;
  enPrueba: number;
  suspendidos: number;
  cancelados: number;
  sinSuscripcion: number;
}

export interface MaestroReportesData {
  altasPorMes: AltaMes[];
  mrrActual: number;
  arpu: number;
  ingresosPorPlan: IngresoPlan[];
  estados: ReportesEstados;
  totalNegocios: number;
}

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

export async function getMaestroReportesData(): Promise<MaestroReportesData> {
  const tenants = await prisma.tenant.findMany({
    select: {
      createdAt: true,
      subscription: { select: { plan: true, status: true, price: true, billingCycle: true } },
    },
  });

  // Últimos 12 meses, incluyendo el actual.
  const now = new Date();
  const cubetas: { key: string; mes: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    cubetas.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      mes: d.toLocaleDateString("es-MX", { month: "short", year: "2-digit" }),
      count: 0,
    });
  }
  const indicePorClave = new Map(cubetas.map((c, i) => [c.key, i]));
  for (const t of tenants) {
    const clave = `${t.createdAt.getFullYear()}-${t.createdAt.getMonth()}`;
    const idx = indicePorClave.get(clave);
    if (idx !== undefined) cubetas[idx].count++;
  }

  const negociosActivos = tenants.filter((t) => t.subscription?.status === "ACTIVE");
  const porPlan = new Map<string, { mrr: number; negocios: number }>();
  let mrrActual = 0;

  for (const t of negociosActivos) {
    const s = t.subscription!;
    const mensual = equivalenteMensual(Number(s.price), s.billingCycle);
    mrrActual += mensual;
    const actual = porPlan.get(s.plan) ?? { mrr: 0, negocios: 0 };
    actual.mrr += mensual;
    actual.negocios += 1;
    porPlan.set(s.plan, actual);
  }

  const ingresosPorPlan: IngresoPlan[] = Array.from(porPlan.entries())
    .map(([plan, v]) => ({ plan, mrr: Math.round(v.mrr), negocios: v.negocios }))
    .sort((a, b) => b.mrr - a.mrr);

  const estados: ReportesEstados = {
    activos: negociosActivos.length,
    enPrueba: tenants.filter((t) => t.subscription?.status === "TRIAL").length,
    suspendidos: tenants.filter((t) => t.subscription?.status === "SUSPENDED").length,
    cancelados: tenants.filter((t) => t.subscription?.status === "CANCELLED").length,
    sinSuscripcion: tenants.filter((t) => !t.subscription).length,
  };

  return {
    altasPorMes: cubetas.map(({ mes, count }) => ({ mes, count })),
    mrrActual: Math.round(mrrActual),
    arpu: negociosActivos.length > 0 ? Math.round(mrrActual / negociosActivos.length) : 0,
    ingresosPorPlan,
    estados,
    totalNegocios: tenants.length,
  };
}
