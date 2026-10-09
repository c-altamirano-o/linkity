/**
 * Corte diario (2026-10-09, a petición de Carlos): reglas de "cambió el día"
 * que comparten la sesión del administrador y el aviso de caja sin cerrar.
 *
 * Mismo offset fijo (UTC-6, México sin horario de verano) que ya usa
 * lib/asistencia.ts para el personal con PIN. Se replica aquí, sin
 * "server-only", para poder probarlo con datos simulados.
 */

const MX_OFFSET_MS = 6 * 60 * 60 * 1000;

/** "YYYY-MM-DD" del día calendario en México al que pertenece ese instante. */
export function diaMXDe(epochMs: number): string {
  const mx = new Date(epochMs - MX_OFFSET_MS);
  return `${mx.getUTCFullYear()}-${String(mx.getUTCMonth() + 1).padStart(2, "0")}-${String(mx.getUTCDate()).padStart(2, "0")}`;
}

/** Instante (UTC) de la medianoche de HOY en México. */
export function inicioDeHoyMXDe(ahoraMs: number): Date {
  const mx = new Date(ahoraMs - MX_OFFSET_MS);
  return new Date(Date.UTC(mx.getUTCFullYear(), mx.getUTCMonth(), mx.getUTCDate(), 0, 0, 0, 0) + MX_OFFSET_MS);
}

/**
 * true si la sesión del administrador se inició en un día distinto al de hoy
 * (México) y por lo tanto debe cerrarse. Sin dato de inicio de sesión devuelve
 * false: no se cierra una sesión por no poder comprobarla.
 */
export function sesionAdminDeOtroDia(ultimoInicioSesionIso: string | null | undefined, ahoraMs: number = Date.now()): boolean {
  if (!ultimoInicioSesionIso) return false;
  const inicio = Date.parse(ultimoInicioSesionIso);
  if (!Number.isFinite(inicio)) return false;
  return diaMXDe(inicio) !== diaMXDe(ahoraMs);
}

/** true si una caja abierta en `abiertaEn` es de un día anterior al de hoy (México). */
export function cajaEsDeDiaAnterior(abiertaEn: Date, ahoraMs: number = Date.now()): boolean {
  return abiertaEn.getTime() < inicioDeHoyMXDe(ahoraMs).getTime();
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "dd/mmm" del día (México) de un instante, p. ej. "08/oct". */
export function formatoDiaMes(fecha: Date): string {
  const mx = new Date(fecha.getTime() - MX_OFFSET_MS);
  return `${String(mx.getUTCDate()).padStart(2, "0")}/${MESES_CORTOS[mx.getUTCMonth()]}`;
}
