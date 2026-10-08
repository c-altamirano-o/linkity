import "server-only";

/**
 * Enlaces para que un negocio se suscriba (2026-10-06, a petición de
 * Carlos). Lo usan el banner de días restantes (components/tenant/
 * BannerSuscripcion.tsx, vía [tenant]/layout.tsx) y la pantalla de bloqueo
 * (CuentaBloqueada). Son variables de entorno de servidor — se resuelven
 * aquí y se pasan como props a los componentes, nunca se exponen al
 * cliente por otro camino.
 *
 *  - HOTMART_CHECKOUT_URL: link de pago del producto de suscripción de
 *    Linkity en Hotmart. Es el camino principal.
 *  - LINKITY_CONTACT_WHATSAPP / LINKITY_CONTACT_EMAIL: respaldo (ya existían
 *    para la pantalla de bloqueo) para cuando Carlos todavía no ha puesto el
 *    link de Hotmart — nunca queda un botón roto.
 */
export interface EnlacesSuscripcion {
  checkoutUrl: string | null;
  contactoHref: string | null;
}

export function obtenerEnlacesSuscripcion(): EnlacesSuscripcion {
  const checkoutUrl = process.env.HOTMART_CHECKOUT_URL || null;
  const whatsapp = process.env.LINKITY_CONTACT_WHATSAPP; // wa.me: solo dígitos con código de país
  const correo = process.env.LINKITY_CONTACT_EMAIL;
  const contactoHref = whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent("Hola, quiero suscribirme a Linkity")}`
    : correo
      ? `mailto:${correo}?subject=${encodeURIComponent("Quiero suscribirme a Linkity")}`
      : null;
  return { checkoutUrl, contactoHref };
}
