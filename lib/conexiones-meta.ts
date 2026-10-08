/**
 * Piezas PURAS de la pantalla Panel Maestro → Conexiones (2026-10-08): traducen
 * lo que responde Meta a frases que entienda un dueño sin conocimientos
 * técnicos. Sin "server-only" a propósito: se prueban solas
 * (test/conexiones-meta.test.ts).
 */

/** Versión de la Graph API de Meta que usa la prueba de conexión. */
export const VERSION_GRAPH = "v25.0";

export interface ErrorGraph {
  code?: number;
  error_subcode?: number;
  message?: string;
  type?: string;
}

export type ContextoError = "numero" | "secret";

/** Convierte un error de la API de Meta en una frase con la acción a seguir. */
export function mensajeErrorMeta(e: ErrorGraph | null | undefined, contexto: ContextoError = "numero"): string {
  const code = e?.code;
  if (code === 190) {
    return "El token de acceso ya no sirve (venció o fue revocado). Genera uno nuevo en Meta, pégalo arriba y vuelve a guardar.";
  }
  if (contexto === "secret") {
    return "El App Secret no corresponde a esta app de Meta. Cópialo otra vez desde Configuración de la app → Básica → Clave secreta de la app.";
  }
  if (code === 100 || code === 803 || code === 33) {
    return "Meta no encontró ese Phone Number ID con este token. Revisa que lo copiaste completo (solo números) y que es del mismo número de WhatsApp para el que generaste el token.";
  }
  if (code === 10 || code === 200 || code === 299) {
    return "El token no tiene permiso para este número. Al generar el token, elige tu cuenta de WhatsApp en la lista.";
  }
  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 80007) {
    return "Meta pide esperar unos minutos antes de volver a probar.";
  }
  const detalle = (e?.message ?? "").trim().slice(0, 160);
  return detalle ? `Meta respondió: ${detalle}` : "Meta no respondió como se esperaba. Intenta de nuevo en un momento.";
}

/** Horas que le quedan a un token. null = no vence (permanente). `expiresAt` en segundos (formato de Meta; 0 o vacío = no vence). */
export function horasRestantes(expiresAt: number | null | undefined, ahoraMs: number = Date.now()): number | null {
  if (!expiresAt || expiresAt <= 0) return null;
  return (expiresAt * 1000 - ahoraMs) / 3_600_000;
}

export type NivelPrueba = "ok" | "aviso" | "error";

/** Texto y color para la vigencia del token de acceso. */
export function resumenVigenciaToken(horas: number | null): { nivel: NivelPrueba; texto: string } {
  if (horas === null) return { nivel: "ok", texto: "El token es permanente (no vence)." };
  if (horas <= 0) return { nivel: "error", texto: "El token ya venció. Genera uno nuevo en Meta." };
  if (horas < 72) {
    const h = Math.max(1, Math.floor(horas));
    return {
      nivel: "aviso",
      texto: `El token vence en ${h} ${h === 1 ? "hora" : "horas"}: es temporal. Sirve para probar, pero antes de usarlo con clientes crea uno permanente.`,
    };
  }
  const dias = Math.floor(horas / 24);
  return { nivel: "ok", texto: `El token vence en ${dias} días.` };
}

/** "52 1 639 115 6227" → "+5216391156227". */
export function formatearNumeroInternacional(visible: string | null | undefined): string | null {
  const digitos = (visible ?? "").replace(/\D/g, "");
  return digitos.length >= 8 && digitos.length <= 15 ? `+${digitos}` : null;
}

/** Enlaces directos a las pantallas de Meta (si ya se conoce el ID de la app; si no, a la lista de apps). */
export function enlacesMeta(appId: string | null): { api: string; webhook: string; basico: string } {
  if (!appId || !/^\d{5,30}$/.test(appId)) {
    const lista = "https://developers.facebook.com/apps/";
    return { api: lista, webhook: lista, basico: lista };
  }
  const base = `https://developers.facebook.com/apps/${appId}`;
  return {
    api: `${base}/use_cases/customize/wa-dev-console/?use_case_enum=WHATSAPP_BUSINESS_MESSAGING&selected_tab=wa-dev-console&product_route=whatsapp-business`,
    webhook: `${base}/use_cases/customize/wa-settings/?use_case_enum=WHATSAPP_BUSINESS_MESSAGING&selected_tab=wa-settings&product_route=whatsapp-business`,
    basico: `${base}/settings/basic/`,
  };
}

/**
 * Dirección pública del sitio para mostrar las URLs de los webhooks.
 * Importante: se toma de la dirección con la que se abrió Panel Maestro,
 * porque `linkitysoluciones.mx` (sin www) REDIRIGE a `www.` y Meta no sigue
 * redirecciones al verificar un webhook.
 */
export function urlPublicaDelSitio(host: string | null | undefined, _proto: string | null | undefined, respaldo: string | undefined): string {
  const limpio = (host ?? "").split(",")[0].trim();
  if (limpio && /^[a-z0-9.\-]+(:\d+)?$/i.test(limpio)) {
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(limpio);
    return `${local ? "http" : "https"}://${limpio}`;
  }
  return (respaldo || "https://linkitysoluciones.mx").replace(/\/+$/, "");
}
