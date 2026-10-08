import "server-only";

/**
 * Envío de correos transaccionales (acceso de cuentas nuevas) por Resend.
 * Mismas variables que los avisos de suscripción: RESEND_API_KEY y
 * RESEND_FROM_EMAIL (dominio verificado en Resend). Aparte de
 * lib/notificaciones-suscripcion.ts a propósito: aquello es un aviso
 * opcional que "se omite si no hay configuración"; esto es VITAL (si el
 * correo no sale, el cliente no puede entrar), así que quien lo llama
 * necesita saber con certeza si salió o no.
 */

export function correoConfigurado(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

export type ResultadoCorreo = { ok: true } | { ok: false; motivo: string };

export async function enviarCorreo(params: { to: string; subject: string; text: string }): Promise<ResultadoCorreo> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { ok: false, motivo: "Resend no está configurado" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: params.to, subject: params.subject, text: params.text }),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      console.error(`❌ Resend respondió ${res.status} al enviar "${params.subject}":`, detalle);
      return { ok: false, motivo: `Resend ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("❌ Error de red enviando correo por Resend:", err);
    return { ok: false, motivo: "error de red" };
  }
}

/**
 * Correo con la contraseña temporal. NO incluye el nombre del negocio ni del
 * dueño a propósito: los escribe quien se registra, y un tercero podría
 * usarlos para meter texto engañoso en un correo que llega a OTRA persona
 * (alguien que se registre con un correo ajeno).
 */
export function correoAccesoTemporal(params: { password: string }): { subject: string; text: string } {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://linkitysoluciones.mx";
  return {
    subject: "Tu acceso a Linkity — contraseña temporal",
    text: [
      "Hola,",
      "",
      "Se creó una cuenta de Linkity con este correo. Para entrar usa esta contraseña temporal:",
      "",
      params.password,
      "",
      `Inicia sesión en: ${base}/login`,
      "Al entrar te pediremos crear tu propia contraseña.",
      "",
      "Si no solicitaste esta cuenta, ignora este correo: sin usar la contraseña no pasa nada.",
    ].join("\n"),
  };
}

/**
 * Correo de bienvenida cuando la cuenta se crea sola porque el cliente se
 * suscribió en Hotmart. Solo incluye datos nuestros (plan, fecha) y nunca
 * texto escrito por el comprador, igual que correoAccesoTemporal: el correo
 * puede llegar a una persona distinta de quien llenó el checkout.
 */
export function correoBienvenidaSuscripcion(params: { password: string; plan: string; finDePrueba?: Date | null }): { subject: string; text: string } {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://linkitysoluciones.mx";
  const lineasPrueba = params.finDePrueba
    ? [
        `Tu prueba gratis dura hasta el ${params.finDePrueba.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City" })}.`,
        "Después, Hotmart cobrará la mensualidad a la tarjeta que registraste. Si no quieres continuar, cancela tu suscripción en Hotmart antes de esa fecha.",
        "",
      ]
    : [];
  return {
    subject: "Bienvenido a Linkity — tu acceso",
    text: [
      "Hola,",
      "",
      `Gracias por suscribirte a Linkity (plan ${params.plan}). Ya creamos tu cuenta con este correo.`,
      "",
      ...lineasPrueba,
      "Para entrar usa esta contraseña temporal:",
      "",
      params.password,
      "",
      `Inicia sesión en: ${base}/login`,
      "Al entrar te pediremos crear tu propia contraseña y los datos de tu negocio.",
      "",
      "Si no te suscribiste a Linkity, ignora este correo: sin usar la contraseña no pasa nada.",
    ].join("\n"),
  };
}
