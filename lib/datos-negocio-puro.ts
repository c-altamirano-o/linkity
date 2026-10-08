/**
 * Validación pura (sin base de datos) de los datos que el dueño captura la
 * primera vez que entra a un negocio creado desde Hotmart: nombre del negocio
 * y giro. Módulo sin dependencias para poder probarlo con un test simple.
 */

export const NOMBRE_NEGOCIO_MIN = 2;
export const NOMBRE_NEGOCIO_MAX = 80;

export type ResultadoValidacionDatos =
  | { ok: true; businessName: string; businessType: string }
  | { ok: false; error: string };

/** Quita espacios de los extremos y colapsa los repetidos del interior. */
export function limpiarNombreNegocio(texto: string): string {
  return String(texto ?? "").replace(/\s+/g, " ").trim();
}

export function validarDatosNegocio(
  entrada: { businessName: string; businessType: string },
  girosValidos: readonly string[],
): ResultadoValidacionDatos {
  const businessName = limpiarNombreNegocio(entrada.businessName);
  if (businessName.length < NOMBRE_NEGOCIO_MIN) {
    return { ok: false, error: "Escribe el nombre de tu negocio." };
  }
  if (businessName.length > NOMBRE_NEGOCIO_MAX) {
    return { ok: false, error: `El nombre es demasiado largo (máximo ${NOMBRE_NEGOCIO_MAX} caracteres).` };
  }
  const businessType = String(entrada.businessType ?? "").trim();
  if (!businessType) return { ok: false, error: "Selecciona el giro de tu negocio." };
  if (!girosValidos.includes(businessType)) return { ok: false, error: "El giro seleccionado no es válido." };
  return { ok: true, businessName, businessType };
}
