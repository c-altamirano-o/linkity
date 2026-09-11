/**
 * Utilidades de vigencia de suscripción — compartidas entre el flujo de
 * pago de auto-registro (app/(auth)/register) y, a futuro, el panel de
 * Suscripciones de Panel Maestro (todavía no construido: hoy solo existe
 * el link en el sidebar). Nada de esto envía recordatorios ni cobra nada
 * de verdad — solo calcula fechas y etiquetas a partir de los datos que
 * ya guarda Subscription.billingCycle/autoRenew.
 */

export type BillingCycle = "MENSUAL" | "TRIMESTRAL" | "SEMESTRAL" | "ANUAL";

export const BILLING_CYCLE_MESES: Record<BillingCycle, number> = {
  MENSUAL: 1,
  TRIMESTRAL: 3,
  SEMESTRAL: 6,
  ANUAL: 12,
};

export const BILLING_CYCLE_LABEL: Record<BillingCycle, string> = {
  MENSUAL: "1 mes",
  TRIMESTRAL: "3 meses",
  SEMESTRAL: "6 meses",
  ANUAL: "1 año",
};

/** Fecha de vencimiento a partir de hoy (o de `desde`) según el ciclo elegido. */
export function calcularVigencia(cycle: BillingCycle, desde: Date = new Date()): Date {
  const fin = new Date(desde);
  fin.setMonth(fin.getMonth() + BILLING_CYCLE_MESES[cycle]);
  return fin;
}

/** Total a cobrar hoy: precio mensual del plan × número de meses del ciclo. */
export function calcularTotalPago(precioMensual: number, cycle: BillingCycle): number {
  return Math.round(precioMensual * BILLING_CYCLE_MESES[cycle] * 100) / 100;
}
