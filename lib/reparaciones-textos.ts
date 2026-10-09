// Textos de Reparaciones/Servicios que ve el CLIENTE FINAL (WhatsApp, página
// pública de seguimiento, ticket) y notas internas del historial, adaptados al
// vocabulario del negocio (rubro + personalización, ver lib/labels.ts).
//
// Sin "use client" NI "server-only": son funciones puras, se usan tanto en
// Server Actions / páginas como en Client Components.
//
// Criterio de redacción: NO se usan adjetivos que dependan del género del
// objeto ("listo/lista", "entregado/entregada") junto al nombre del objeto,
// porque el objeto cambia según el rubro (dispositivo, vehículo, calzado,
// mueble...). Se usan verbos ("Terminamos con tu ...", "Ya puedes pasar a
// recoger tu ...") que funcionan igual con cualquier sustantivo.

import { label, type LabelDictionary } from "@/lib/labels";

export type EstadoClienteKey =
  | "RECEIVED" | "DIAGNOSING" | "WAITING_PARTS" | "IN_REPAIR" | "READY"
  | "DELIVERED" | "CANCELLED" | "WORKSHOP_READY" | "WORKSHOP_RETURN"
  | "SHOP_READY" | "SHOP_RETURN";

/** Nombre del objeto que deja el cliente, en minúsculas ("dispositivo", "vehículo", "artículo"...). */
export function objetoCliente(labels: LabelDictionary): string {
  return label(labels, "entity.repair.asset").toLowerCase();
}

/** Nombre de la entidad ("reparación", "orden de servicio", "servicio"...), en minúsculas. */
export function entidadCliente(labels: LabelDictionary): string {
  return label(labels, "entity.repair.singular").toLowerCase();
}

/**
 * Estatus ACTUAL, tal como lo lee el cliente (WhatsApp y página pública —
 * deben coincidir siempre). "Listo para recoger" se reserva a SHOP_READY /
 * SHOP_RETURN, los únicos estatus donde el cliente de verdad puede pasar por
 * su objeto (ver el criterio original, 2026-09-29).
 */
export function estadoClienteTexto(status: string, objeto: string): string {
  switch (status) {
    case "RECEIVED": return `Recibimos tu ${objeto} y el registro ya está en nuestro sistema`;
    case "DIAGNOSING": return `Estamos revisando tu ${objeto}`;
    case "IN_REPAIR": return `Ya estamos trabajando en tu ${objeto}`;
    case "WAITING_PARTS": return `Estamos en espera de material para tu ${objeto}; nos pondremos en contacto contigo para coordinar los siguientes pasos`;
    case "READY": return `Terminamos con tu ${objeto}`;
    case "WORKSHOP_READY":
    case "WORKSHOP_RETURN": return `Estamos terminando con tu ${objeto}, pronto tendrás noticias nuestras`;
    case "SHOP_READY": return `Ya puedes pasar a recoger tu ${objeto}`;
    case "SHOP_RETURN": return `Ya puedes pasar a recoger tu ${objeto} (no fue posible completar el trabajo)`;
    case "DELIVERED": return `Entregamos tu ${objeto}, gracias por tu confianza`;
    case "CANCELLED": return "Este trabajo fue cancelado";
    default: return `Actualización de tu ${objeto}`;
  }
}

/** Mismo criterio, pero como evento del historial ("qué acabamos de hacer"). */
export function checkpointClienteTexto(status: string, objeto: string): string {
  switch (status) {
    case "RECEIVED": return `Recibimos tu ${objeto}`;
    case "DIAGNOSING": return `Comenzamos a revisar tu ${objeto}`;
    case "IN_REPAIR": return `Comenzamos a trabajar en tu ${objeto}`;
    case "WAITING_PARTS": return `Esperamos material para tu ${objeto}`;
    case "READY": return `Terminamos con tu ${objeto}`;
    case "WORKSHOP_READY": return `Terminamos el trabajo en tu ${objeto}`;
    case "WORKSHOP_RETURN": return `No fue posible completar el trabajo en tu ${objeto}`;
    case "SHOP_READY": return `Tu ${objeto} está disponible para recoger`;
    case "SHOP_RETURN": return `Tu ${objeto} está disponible para recoger (sin completar el trabajo)`;
    case "DELIVERED": return `Entregamos tu ${objeto}`;
    case "CANCELLED": return "Trabajo cancelado";
    default: return `Actualización de tu ${objeto}`;
  }
}

/** Pasos de la barra de progreso de la página pública. */
export function pasosProgresoTexto(labels: LabelDictionary): string[] {
  return [
    "Recibido",
    label(labels, "repair.status.IN_REPAIR"),
    "Proceso terminado",
    "Disponible para recoger",
    "Entregado",
  ];
}

export const PREFIJO_ASIGNADO = "Asignado a ";

/** Notas internas del historial al cambiar de estatus (las ve el personal, no el cliente). */
export function notaPorEstado(labels: LabelDictionary): Record<string, string> {
  const lugar = label(labels, "vocab.lugar");
  return {
    IN_REPAIR: "Trabajo iniciado",
    WAITING_PARTS: label(labels, "repair.status.WAITING_PARTS"),
    WORKSHOP_READY: `Trabajo completado — ${label(labels, "repair.status.WORKSHOP_READY").toLowerCase()}`,
    WORKSHOP_RETURN: "No se pudo completar el trabajo — marcado para devolución",
    SHOP_READY: `Trasladado a tienda desde el ${lugar} — disponible para entrega`,
    SHOP_RETURN: `Trasladado a tienda desde el ${lugar} — devolución al cliente`,
    DELIVERED: "Entregado al cliente",
  };
}

export function notaIngreso(labels: LabelDictionary): string {
  return `Ingreso registrado en el ${label(labels, "vocab.lugar")}`;
}

export function notaCorreccionRegresoALugar(labels: LabelDictionary): string {
  return `Regresado al ${label(labels, "vocab.lugar")} — corrección de "Enviar a tienda" (posible error de captura)`;
}
