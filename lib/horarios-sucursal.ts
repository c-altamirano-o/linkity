import "server-only";

/**
 * Lógica de "¿ya se pasó la hora esperada de apertura/cierre de esta
 * sucursal?" — Fase 2 de notificaciones en tiempo real (2026-09-22, a
 * petición de Carlos: "cuando se llegue determinada hora y una sucursal no
 * haya reportado apertura de caja o que a la hora del cierre no hayan
 * cerrado caja"). La usa app/api/cron/revisar-horarios-caja/route.ts, que
 * corre cada 15 minutos (ver .github/workflows/revisar-horarios-caja.yml).
 *
 * Todo esto vive separado del route.ts del cron a propósito: son funciones
 * puras (reciben la hora/sucursal, regresan un booleano), fáciles de
 * probar mentalmente sin tocar la base de datos.
 */

// Única zona horaria que maneja hoy el proyecto — mismo criterio ya usado
// en formatHoraLlegada/formatHoraCorta (lib/dashboard-data.ts). México
// eliminó el horario de verano a nivel nacional en 2022 (excepto la franja
// fronteriza norte, que no es el caso de este proyecto), así que
// America/Mexico_City es UTC-6 fijo todo el año — antes de esa reforma
// este offset habría tenido que cambiar dos veces al año.
export const ZONA_HORARIA_NEGOCIO = "America/Mexico_City";
const OFFSET_ZONA_NEGOCIO = "-06:00";

// Margen de gracia antes de considerar "no reportó" (Carlos, al elegir
// entre las opciones que se le presentaron: "15 minutos") — evita avisos
// falsos por unos minutos normales de retraso.
export const MARGEN_GRACIA_MINUTOS = 15;

export interface HorarioSucursal {
  id: string;
  horaAperturaEsperada: string | null;
  horaCierreEsperada: string | null;
  diasOperacion: number[];
}

export interface AhoraEnZonaNegocio {
  /** YYYY-MM-DD, calendario de America/Mexico_City. */
  fechaStr: string;
  /** 0=domingo … 6=sábado, mismo índice que Tenant.weekStartDay. */
  diaSemana: number;
  minutosDesdeMedianoche: number;
}

const DIAS_SEMANA_INTL: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/**
 * Descompone el instante dado (default: ahora) en fecha/hora/día de la
 * semana tal como se ven en America/Mexico_City — sin esto, un servidor
 * corriendo en otra zona horaria (Vercel normalmente corre en UTC) podría
 * calcular un día u hora distintos a los que el dueño de la sucursal tiene
 * en mente al configurar su horario.
 */
export function ahoraEnZonaNegocio(ahora: Date = new Date()): AhoraEnZonaNegocio {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA_NEGOCIO,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
    weekday: "short",
  }).formatToParts(ahora);

  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  const fechaStr = `${valor("year")}-${valor("month")}-${valor("day")}`;
  const hora = parseInt(valor("hour"), 10) || 0;
  const minuto = parseInt(valor("minute"), 10) || 0;
  const diaSemana = DIAS_SEMANA_INTL[valor("weekday")] ?? 0;

  return { fechaStr, diaSemana, minutosDesdeMedianoche: hora * 60 + minuto };
}

/**
 * Medianoche de la fecha dada (formato YYYY-MM-DD) en America/Mexico_City,
 * como instante UTC real — se usa para acotar "¿ya hubo una apertura HOY?"
 * y "¿ya se avisó de esto HOY?" a las queries de Prisma.
 */
export function inicioDeHoyEnZonaNegocio(fechaStr: string): Date {
  return new Date(`${fechaStr}T00:00:00${OFFSET_ZONA_NEGOCIO}`);
}

function parseHoraAMinutos(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function debeRevisar(horaEsperada: string | null, sucursal: HorarioSucursal, ahora: AhoraEnZonaNegocio): boolean {
  if (!horaEsperada) return false;
  if (!sucursal.diasOperacion.includes(ahora.diaSemana)) return false;
  const limite = parseHoraAMinutos(horaEsperada);
  if (limite === null) return false;
  return ahora.minutosDesdeMedianoche >= limite + MARGEN_GRACIA_MINUTOS;
}

/** ¿Ya se cumplió (con margen de gracia) la hora de apertura esperada de hoy? */
export function debeRevisarAperturaTardia(sucursal: HorarioSucursal, ahora: AhoraEnZonaNegocio): boolean {
  return debeRevisar(sucursal.horaAperturaEsperada, sucursal, ahora);
}

/** ¿Ya se cumplió (con margen de gracia) la hora de cierre esperada de hoy? */
export function debeRevisarCierreTardio(sucursal: HorarioSucursal, ahora: AhoraEnZonaNegocio): boolean {
  return debeRevisar(sucursal.horaCierreEsperada, sucursal, ahora);
}

/**
 * Valida el formato "HH:MM" que captura el dueño en Sucursales — se usa
 * tanto en sucursales-actions.ts (validación del servidor) como en
 * SucursalesClient.tsx (el input ya es type="time", pero esto es la
 * verificación real, nunca confiar solo en el input del navegador).
 */
export function horaValida(hhmm: string): boolean {
  return parseHoraAMinutos(hhmm) !== null;
}
