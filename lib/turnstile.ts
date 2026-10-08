import "server-only";

/**
 * Verificación de Cloudflare Turnstile (captcha casi invisible) para el
 * registro público — 2026-10-08, punto 10 de la revisión. Se suma al límite
 * de intentos por IP (lib/limite-intentos.ts), no lo reemplaza.
 *
 * Variables de entorno (Vercel):
 *  - NEXT_PUBLIC_TURNSTILE_SITE_KEY: llave pública, la usa el navegador.
 *  - TURNSTILE_SECRET_KEY: llave secreta, solo el servidor.
 * Si falta la secreta NO se verifica (se avisa en el log): así el registro no
 * se rompe mientras no estén puestas, pero queda protegido solo por el límite
 * de intentos. Si SÍ está configurada y Cloudflare no responde, se rechaza el
 * intento (falla cerrada): es preferible pedir reintentar a dejar pasar bots.
 */

const URL_VERIFICACION = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileConfigurado(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

export type ResultadoTurnstile = { ok: true; omitido: boolean } | { ok: false; error: string };

export async function verificarTurnstile(token: string | undefined | null, ip: string | null): Promise<ResultadoTurnstile> {
  const secreto = process.env.TURNSTILE_SECRET_KEY;
  if (!secreto) {
    console.warn("⚠️  Turnstile no está configurado (TURNSTILE_SECRET_KEY): el registro solo está protegido por el límite de intentos.");
    return { ok: true, omitido: true };
  }
  if (!token || typeof token !== "string" || token.length > 2048) {
    return { ok: false, error: "No pudimos verificar que eres una persona. Recarga la página e inténtalo de nuevo." };
  }

  try {
    const cuerpo = new URLSearchParams({ secret: secreto, response: token });
    if (ip) cuerpo.set("remoteip", ip);
    const res = await fetch(URL_VERIFICACION, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: cuerpo,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`❌ Turnstile respondió ${res.status}`);
      return { ok: false, error: "No pudimos verificar que eres una persona. Inténtalo de nuevo en un momento." };
    }
    const datos = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!datos.success) {
      console.warn("⚠️  Turnstile rechazó el token:", datos["error-codes"]?.join(", "));
      return { ok: false, error: "No pudimos verificar que eres una persona. Recarga la página e inténtalo de nuevo." };
    }
    return { ok: true, omitido: false };
  } catch (err) {
    console.error("❌ Error al verificar Turnstile:", err);
    return { ok: false, error: "No pudimos verificar que eres una persona. Inténtalo de nuevo en un momento." };
  }
}
