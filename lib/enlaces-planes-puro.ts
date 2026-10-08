/**
 * Enlace de pago de Hotmart para UN plan (Etapa 4, 2026-10-08). Módulo puro.
 *
 * El link de pago que se guarda en Panel Maestro → Conexiones es el del
 * PRODUCTO (ej. https://pay.hotmart.com/A12345678B). Cada plan es una oferta
 * dentro de ese producto, y Hotmart la selecciona con el parámetro `off`
 * (ej. ...?off=abc123xy). Sin código de oferta NO se arma enlace: abrir el
 * link del producto "a secas" dejaría que Hotmart muestre su oferta por
 * defecto, y alguien que eligió Pro podría terminar contratando Básico.
 */

export function construirEnlaceCheckout(base: string | null | undefined, offerCode: string | null | undefined): string | null {
  const codigo = String(offerCode ?? "").trim();
  if (!codigo) return null;
  const crudo = String(base ?? "").trim();
  if (!crudo) return null;
  let url: URL;
  try {
    url = new URL(crudo);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  url.searchParams.set("off", codigo);
  return url.toString();
}
