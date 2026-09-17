// Sin "use client": son solo datos + funciones puras (ni hooks ni nada
// exclusivo del navegador), así que se puede importar tanto desde Server
// Actions/Server Components (clientes-actions.ts, reparaciones-actions.ts)
// como desde los Client Components que muestran el selector de país
// (ClientesClient.tsx, ReparacionesClient.tsx) — mismo criterio que
// lib/catalogo-iconos.tsx.

/**
 * Catálogo de códigos de país para el campo de teléfono de un cliente.
 *
 * Origen: Carlos reportó que el campo de teléfono en el alta de cliente
 * (Clientes y el mini-formulario de "cliente nuevo" en Reparaciones) solo
 * contemplaba números nacionales (México, 10 dígitos) — con sus planes de
 * expansión a otros países (empezando por EE.UU.) hacía falta un selector
 * de código de país junto al teléfono.
 *
 * Lista deliberadamente corta hoy (México + EE.UU., los dos países que
 * Carlos mencionó) pero pensada para crecer: agregar un país nuevo es
 * agregar una entrada aquí, sin tocar el schema ni los formularios que la
 * consumen. El valor por default (PAIS_TELEFONO_DEFAULT) es México porque
 * es donde opera el negocio hoy — todos los clientes existentes antes de
 * este cambio se asumen México al no tener phoneCountryCode guardado.
 */

export interface PaisTelefono {
  /** Código guardado en Customer.phoneCountryCode, ej. "+52". */
  code: string;
  name: string;
  flag: string;
}

export const PAISES_TELEFONO: PaisTelefono[] = [
  { code: "+52", name: "México", flag: "🇲🇽" },
  { code: "+1", name: "Estados Unidos", flag: "🇺🇸" },
];

export const PAIS_TELEFONO_DEFAULT = "+52";

export function paisPorCodigo(code: string | null | undefined): PaisTelefono {
  return PAISES_TELEFONO.find((p) => p.code === code) ?? PAISES_TELEFONO[0];
}

/**
 * Construye el número en formato internacional (sin espacios ni símbolos,
 * como lo pide la API de wa.me) a partir del código de país guardado y el
 * teléfono capturado. Antes de este cambio, whatsappHref() en
 * ClientesClient.tsx asumía "10 dígitos → anteponer 52" a ciegas; ahora el
 * código de país real del cliente decide el prefijo, sin importar cuántos
 * dígitos tenga el número en cada país.
 */
/**
 * Texto para mostrar el teléfono con su código de país (ej. "+1 5551234567")
 * — útil ahora que puede haber clientes de más de un país en la misma
 * lista y ya no basta con asumir México. Si no hay teléfono, regresa null.
 */
export function formatoTelefono(phone: string | null | undefined, countryCode: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  return `${countryCode || PAIS_TELEFONO_DEFAULT} ${phone.trim()}`;
}

export function telefonoWhatsapp(phone: string | null | undefined, countryCode: string | null | undefined): string | null {
  if (!phone) return null;
  const digitos = phone.replace(/\D/g, "");
  if (!digitos) return null;
  const codigo = (countryCode || PAIS_TELEFONO_DEFAULT).replace(/\D/g, "");
  return `${codigo}${digitos}`;
}
