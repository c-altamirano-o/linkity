/**
 * Identificación del plan comercial a partir de una compra de Hotmart
 * (Paso 4 de planes comerciales, 2026-10-08). Módulo PURO (sin Prisma ni
 * "server-only") para poder probarlo aislado.
 *
 * Reglas, de lo más específico a lo más general:
 *  1. Código de oferta (`data.purchase.offer.code`) igual al
 *     `hotmartOfferCode` de exactamente UN plan → ese plan.
 *  2. Si ninguna oferta coincide: el ID de producto (`data.product.id`)
 *     igual al `hotmartProductId` de planes que NO tienen oferta configurada
 *     → ese plan, solo si es exactamente uno.
 *  3. Cualquier otro caso es "sin_coincidencia" (o "ambiguo" si hay más de
 *     un candidato). NUNCA se adivina: quien llama debe dejar la compra
 *     marcada para revisión en Panel Maestro en vez de activar un plan al
 *     azar (un plan equivocado = límites o precio equivocados).
 *
 * Un plan con oferta configurada y producto igual pero oferta distinta NO
 * coincide: es otra oferta del mismo producto.
 */

export interface PlanParaHotmart {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  hotmartProductId: string | null;
  hotmartOfferCode: string | null;
}

export type ResultadoPlan<P extends PlanParaHotmart = PlanParaHotmart> =
  | { tipo: "ok"; plan: P; por: "oferta" | "producto" }
  | { tipo: "ambiguo"; candidatos: P[] }
  | { tipo: "sin_coincidencia" };

/** Normaliza un código/ID de Hotmart (puede venir número o texto). */
export function normalizarCodigo(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "string" && typeof valor !== "number") return null;
  const s = String(valor).trim().toLowerCase();
  return s.length > 0 ? s : null;
}

export function identificarPlan<P extends PlanParaHotmart>(
  planes: P[],
  compra: { offerCode?: unknown; productId?: unknown }
): ResultadoPlan<P> {
  const oferta = normalizarCodigo(compra.offerCode);
  const producto = normalizarCodigo(compra.productId);

  if (oferta) {
    const porOferta = planes.filter((p) => normalizarCodigo(p.hotmartOfferCode) === oferta);
    if (porOferta.length === 1) return { tipo: "ok", plan: porOferta[0], por: "oferta" };
    if (porOferta.length > 1) return { tipo: "ambiguo", candidatos: porOferta };
  }

  if (producto) {
    const porProducto = planes.filter(
      (p) => normalizarCodigo(p.hotmartProductId) === producto && !normalizarCodigo(p.hotmartOfferCode)
    );
    if (porProducto.length === 1) return { tipo: "ok", plan: porProducto[0], por: "producto" };
    if (porProducto.length > 1) return { tipo: "ambiguo", candidatos: porProducto };
  }

  return { tipo: "sin_coincidencia" };
}
