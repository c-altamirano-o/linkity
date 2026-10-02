// Sin "use client" NI "server-only": son solo datos + funciones puras (mismo
// criterio que lib/paises.ts) — se necesitan tanto del lado servidor
// (lib/whatsapp-tenant.ts, modo API) como del lado cliente
// (ReparacionesClient.tsx, modo MANUAL, y app/rep/[token]/page.tsx), y debe
// ser EXACTAMENTE el mismo texto/criterio en los tres lugares para que un
// negocio nunca vea un mensaje distinto según qué modo tenga conectado.

/**
 * Decide qué modo de WhatsApp está activo para un negocio — el ÚNICO lugar
 * que define esta prioridad (2026-10-02, a petición de Carlos: "apliquemos
 * ambas opciones y que el negocio elija"). Si un negocio llega a tener
 * configurados los dos (conectó su API Y dejó capturado un número manual de
 * antes), el modo API siempre gana — es la opción más completa (automático,
 * sin que nadie tenga que tocar nada) y no tiene sentido ofrecerle el enlace
 * manual de regreso.
 */
export type WhatsappModoReparacion = "API" | "MANUAL" | "DESACTIVADO";

export function whatsappModoActivo(params: {
  apiConectado: boolean;
  numeroManual: string | null | undefined;
}): WhatsappModoReparacion {
  if (params.apiConectado) return "API";
  if (params.numeroManual && params.numeroManual.trim()) return "MANUAL";
  return "DESACTIVADO";
}

/**
 * Limpia un número capturado en modo MANUAL (formato libre, mismo criterio
 * que Tenant.phone/updateSupportPhone — el negocio puede escribirlo con o
 * sin "+52", espacios, guiones, paréntesis) a solo dígitos, listo para un
 * link "wa.me/<dígitos>". null si no quedó ningún dígito.
 */
export function numeroWhatsappManualLimpio(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digitos = raw.replace(/\D/g, "");
  return digitos || null;
}

/**
 * Link "wa.me/..." hacia el NÚMERO MANUAL DEL NEGOCIO (Tenant.whatsappNumeroManual)
 * con un mensaje prellenado — usado por la página pública de seguimiento
 * (app/rep/[token]/page.tsx) para el botón "Contáctanos por WhatsApp": aquí
 * es el CLIENTE quien le escribe AL NEGOCIO, al revés del botón "Avisar" de
 * Reparaciones (ese usa whatsappHref de lib/paises.ts, con el teléfono DEL
 * CLIENTE, porque ahí es el negocio quien le escribe a él) — por eso son dos
 * funciones separadas aunque arman un link con la misma forma.
 */
export function hrefWhatsappManual(numeroManual: string | null | undefined, mensaje: string): string | null {
  const numero = numeroWhatsappManualLimpio(numeroManual);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/**
 * Primer nombre de un nombre completo — mismo criterio en los tres lugares
 * que arman el saludo del mensaje (getReparacionPublica en
 * lib/reparaciones-data.ts, y desde 2026-10-02 también el botón "Avisar" en
 * modo MANUAL, ReparacionesClient.tsx), para no duplicar la regex tres
 * veces y que el saludo sea idéntico sin importar de dónde se arme.
 */
export function primerNombre(nombreCompleto: string): string {
  return nombreCompleto.trim().split(/\s+/)[0] ?? nombreCompleto;
}

/**
 * Arma el mensaje que ve el cliente final — mismo texto tanto para los
 * avisos automáticos del modo API (creación/cambio de estatus) como para el
 * envío manual ("Avisar" en Reparaciones, en cualquiera de los dos modos).
 * `estadoTexto` es siempre ESTADO_CLIENTE_TEXTO[...] (lib/reparaciones-data.ts)
 * — MISMO texto que ya ve el cliente en la página pública, para que el
 * WhatsApp y la página jamás se contradigan.
 */
export function construirMensajeReparacion(params: {
  negocio: string;
  clientePrimerNombre: string;
  folio: string;
  estadoTexto: string;
  urlSeguimiento: string;
}): string {
  const { negocio, clientePrimerNombre, folio, estadoTexto, urlSeguimiento } = params;
  return `Hola ${clientePrimerNombre}, este es un mensaje de ${negocio}. Folio ${folio}: ${estadoTexto}. Sigue el estatus en tiempo real aquí: ${urlSeguimiento}`;
}
