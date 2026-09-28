import { getTenantPrisma } from "@/lib/prisma";
import type { Branch, Priority, RepairStatus } from "@prisma/client";
import { rangoSemanaLaboral } from "@/lib/periodo-laboral";

// ============================================
// Tipos que consume DashboardClient
// ============================================

export interface VentaHoyRow {
  id: string;
  folio: string;
  hora: string;
  articulos: string;
  count: number;
  metodo: "Efectivo" | "Tarjeta" | "Transferencia" | "Mixto";
  total: number;
}

export interface RepairRow {
  id: string;
  folio: string;
  cliente: string;
  telefono: string;
  equipo: string;
  status: RepairStatus;
  tecnico: string;
  prioridad: Priority;
  costo: number | null;
  falla: string | null;
  razon: string | null;
  espera: string;
}

export interface AlertaRow {
  id: string;
  tipo: "stock_bajo" | "agotado" | "repair_stale";
  texto: string;
}

export interface CategoriaVenta {
  name: string;
  value: number; // porcentaje del mes, 0-100
  color: string;
  // Si esta categoría se muestra en la gráfica de pastel del Dashboard —
  // 2026-09-22, ver Tenant.dashboardCategoriasConfig (schema.prisma) y
  // aplicarConfigCategorias más abajo. Antes era un cálculo puramente
  // local en DashboardClient.tsx (las primeras 6, sin persistir); ahora
  // ya viene resuelto desde el servidor con la config guardada del tenant.
  visible: boolean;
}

/**
 * Entrada guardada en Tenant.dashboardCategoriasConfig — un JSON libre,
 * así que se valida forma por forma en vez de confiar en el tipo de
 * Prisma (Prisma.JsonValue es básicamente `unknown`).
 */
interface CategoriaDashboardConfigGuardada {
  name: string;
  color: string;
  visible: boolean;
}

/**
 * Aplica la config de categorías del Dashboard guardada por el tenant
 * (Tenant.dashboardCategoriasConfig) sobre la lista de categorías
 * calculada este mes. Separado de getDashboardData para poder razonar
 * sobre los 2 casos por separado:
 *
 * - Sin config guardada (null — tenant que nunca ha tocado el modal de
 *   configuración, o creado antes de que existiera este campo):
 *   comportamiento de siempre, las primeras 6 por monto vendido.
 * - Con config guardada: cada categoría de ESTE mes se busca por NOMBRE
 *   en la config guardada (no por posición ni por id, ver el comentario
 *   largo en el schema) — si se encuentra, usa su color/visible
 *   guardados; si no (una categoría nueva que nunca se vio antes de
 *   guardar la config), queda oculta por default — el dueño la muestra a
 *   mano si quiere, en vez de que aparezca sola y potencialmente rompa el
 *   límite de 6 visibles que ya impone el modal.
 */
function aplicarConfigCategorias(
  categoriasBase: { name: string; value: number; color: string }[],
  categoriasConfigGuardada: unknown
): CategoriaVenta[] {
  if (!Array.isArray(categoriasConfigGuardada)) {
    return categoriasBase.map((c, i) => ({ ...c, visible: i < 6 }));
  }
  const porNombre = new Map<string, CategoriaDashboardConfigGuardada>();
  for (const entrada of categoriasConfigGuardada as any[]) {
    if (entrada && typeof entrada.name === "string") {
      porNombre.set(entrada.name, entrada);
    }
  }
  return categoriasBase.map((c) => {
    const guardada = porNombre.get(c.name);
    return {
      name: c.name,
      value: c.value,
      color: guardada?.color ?? c.color,
      visible: guardada ? !!guardada.visible : false,
    };
  });
}

export interface VentaSemanaDia {
  dia: string;
  ventas: number;
  reparaciones: number;
  total: number;
}

export interface SucursalResumen {
  id: string;
  nombre: string;
  estado: "activa" | "prueba";
  ventasDia: number;
  ticketsVenta: number;
  ticketsRep: number;
  equiposRecibidos: number;
  repActivas: number;
  listosEntrega: number;
  devoluciones: number;
  // 2026-09-28, a petición de Carlos ("todos los apartados del dashboard
  // deberían mostrar el periodo seleccionado"): antes era "vsAyer" — SIEMPRE
  // ventas de hoy contra ventas de ayer, sin importar el selector de
  // periodo. Ahora compara `ventasDia` (que también dejó de ser "hoy" fijo,
  // ver el comentario largo junto a su cálculo más abajo) contra el periodo
  // INMEDIATAMENTE ANTERIOR de la MISMA duración — con "Hoy" eso sigue
  // siendo exactamente "ayer" (un periodo de 1 día), con "Semana" la semana
  // pasada, con "Mes"/"Año"/personalizado el tramo equivalente justo antes.
  // null = sin ventas en ese periodo anterior para comparar (no hay contra
  // qué medir el cambio).
  vsPeriodoAnterior: number | null;
}

export interface DashboardData {
  totalVentasHoy: number;
  numVentasHoy: number;
  ticketPromedio: number;
  reparacionesActivasCount: number;
  equiposListosCount: number;
  equiposDevolucionCount: number;
  ventasHoy: VentaHoyRow[];
  reparacionesActivas: RepairRow[];
  equiposListos: RepairRow[];
  equiposDevolucion: RepairRow[];
  alertas: AlertaRow[];
  categorias: CategoriaVenta[];
  // 2026-09-28: dejó de ser SIEMPRE la semana laboral en curso — ahora son
  // los "buckets" del periodo elegido en el selector (ver el comentario
  // largo junto a construirBucketsTendencia más abajo): un bucket por día
  // si el periodo cabe en ~31 días (Hoy/Semana/Mes/personalizado corto), o
  // un bucket por MES si es más largo (Año/personalizado largo) — el campo
  // `dia` de cada uno sigue siendo la etiqueta a mostrar en el eje X, sea
  // cual sea la unidad real. `tendenciaGranularidad` le dice al cliente cuál
  // de las dos es, para poder mostrar "Promedio diario"/"Promedio mensual"
  // correctamente en vez de asumir siempre "diario".
  ventasSemana: VentaSemanaDia[];
  tendenciaGranularidad: "dia" | "mes";
  totalSemana: number;
  promedioVentasSemana: number;
  // Ventas por hora del día, SUMADAS a lo largo de TODO el periodo elegido
  // (2026-09-28, a petición de Carlos — reemplaza el selector de un solo
  // día que tenía antes esta sección, ver el comentario largo junto a
  // getVentasPorDia más abajo, ahora sin usar desde el Dashboard). Con
  // "Hoy" esto es exactamente un solo día (comportamiento idéntico al
  // anterior); con "Semana"/"Mes"/"Año" sí sirve para algo nuevo: en qué
  // hora del día se concentran más ventas A LO LARGO de todo ese periodo.
  ventasPorHora: VentaPorHora[];
  horaPico: { hora: number; horaLabel: string; numVentas: number } | null;
  sucursales: SucursalResumen[];
  multiSucursal: boolean;
  // Módulo "Reparaciones" activo para este tenant (2026-09-18) — cuando es
  // false (ej. una barbería, que trae este módulo apagado por default, ver
  // lib/modulos-rubro.ts) ninguna de las queries de reparaciones de abajo
  // se ejecuta y todos los conteos/arreglos de reparaciones quedan en
  // cero/vacío — DashboardClient.tsx usa este campo para ocultar por
  // completo la UI de reparaciones en vez de mostrarla con puros ceros,
  // que es justo lo que Carlos reportó como bug ("Sigue mostrando
  // Reparaciones activas... Es una barbería, eso no aplica ahí").
  reparacionesActiva: boolean;
  // Periodo resuelto para esta carga (2026-09-26, ver resolverPeriodoDashboard
  // más arriba) — se manda de vuelta al cliente para pintar el selector
  // (fechas + atajo activo) sin recalcularlo por separado y sin arriesgarse
  // a que la UI muestre un atajo distinto al que en realidad filtró el
  // servidor.
  periodo: PeriodoDashboard;
}

/**
 * 2026-09-24, a petición de Carlos (revisión de permisos) — hueco real que
 * él mismo encontró probando el sistema como "Jefe de Taller" (Role con
 * verMontosCaja=false): Caja y Sucursales ya redactan montos para un rol
 * sin ese permiso desde antes ese mismo día (ver redactarMontosSucursales,
 * lib/sucursales-data.ts), pero el Dashboard se quedó fuera — y como
 * prácticamente todo el personal de PIN aterriza en esta misma pantalla al
 * iniciar sesión (dashboard/page.tsx), cualquier rol sin ese permiso veía
 * aquí las ventas del día, el total de la semana, el costo cotizado de
 * cada reparación, etc. de su sucursal — justo lo que Carlos pidió evitar
 * ("cada empleado solo lo que necesite... nunca un panorama general de las
 * finanzas").
 *
 * Redacta TODO monto en pesos de un golpe, dejando intactos los conteos
 * (num. de ventas, reparaciones activas, tickets, categorías — que son un
 * % de mezcla de ventas, no un monto) que no son dinero. El servidor ni
 * siquiera manda el número real al cliente — no es solo "ocultar en
 * pantalla", mismo criterio que el resto del proyecto.
 *
 * costo/vsPeriodoAnterior quedan en `null` en vez de 0 (mismo motivo que
 * cajaActual en redactarMontosSucursales): un 0 literal se leería como "no
 * hay nada" o "sin cambio vs el periodo anterior", no como "tu rol no
 * puede ver esto" —
 * DashboardClient.tsx distingue ambos casos con el prop `montosVisibles`,
 * nunca mirando solo si el valor es 0/null.
 */
export function redactarMontosDashboard(data: DashboardData): DashboardData {
  return {
    ...data,
    totalVentasHoy: 0,
    ticketPromedio: 0,
    ventasHoy: data.ventasHoy.map((v) => ({ ...v, total: 0 })),
    reparacionesActivas: data.reparacionesActivas.map((r) => ({ ...r, costo: null })),
    equiposListos: data.equiposListos.map((r) => ({ ...r, costo: null })),
    equiposDevolucion: data.equiposDevolucion.map((r) => ({ ...r, costo: null })),
    ventasSemana: data.ventasSemana.map((d) => ({ ...d, ventas: 0, reparaciones: 0, total: 0 })),
    totalSemana: 0,
    promedioVentasSemana: 0,
    // 2026-09-28: mismo criterio que ventasSemana/totalSemana de arriba —
    // numVentas (conteo) se conserva, totalVentas (dinero) se redacta.
    ventasPorHora: data.ventasPorHora.map((h) => ({ ...h, totalVentas: 0 })),
    sucursales: data.sucursales.map((s) => ({ ...s, ventasDia: 0, vsPeriodoAnterior: null })),
  };
}

// ============================================
// Utilidades de fecha (zona horaria de negocio)
// ============================================

// México (Zona Centro) opera en UTC-6 fijo desde la reforma de horario de
// verano de 2022. Si más adelante quieres soportar sucursales en la Zona
// Frontera (UTC-7 con horario de verano), esto se vuelve un campo por
// tenant/sucursal en vez de una constante.
const MX_OFFSET_MS = 6 * 60 * 60 * 1000;

function mxDayBoundary(daysAgo: number, endOfDay = false) {
  const now = new Date();
  const mxNow = new Date(now.getTime() - MX_OFFSET_MS);
  const y = mxNow.getUTCFullYear();
  const m = mxNow.getUTCMonth();
  const d = mxNow.getUTCDate() - daysAgo + (endOfDay ? 1 : 0);
  const boundaryMx = new Date(Date.UTC(y, m, d, 0, 0, 0));
  return new Date(boundaryMx.getTime() + MX_OFFSET_MS);
}

function dayRange(daysAgo: number) {
  return { start: mxDayBoundary(daysAgo), end: mxDayBoundary(daysAgo, true) };
}

function monthRange() {
  const now = new Date();
  const mxNow = new Date(now.getTime() - MX_OFFSET_MS);
  const y = mxNow.getUTCFullYear();
  const m = mxNow.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0).valueOf() + MX_OFFSET_MS);
  const end = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0).valueOf() + MX_OFFSET_MS);
  return { start, end };
}

// Año calendario en curso (2026-09-26, atajo "Año" del selector de periodo
// del Dashboard — ver resolverPeriodoDashboard más abajo).
function yearRange() {
  const now = new Date();
  const mxNow = new Date(now.getTime() - MX_OFFSET_MS);
  const y = mxNow.getUTCFullYear();
  const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0).valueOf() + MX_OFFSET_MS);
  const end = new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0).valueOf() + MX_OFFSET_MS);
  return { start, end };
}

// ============================================
// Selector de periodo del Dashboard (2026-09-26, a petición explícita de
// Carlos: "para un administrador es importante poder medir periodos de
// tiempo extensos, semanas, meses, años... con atajos para Hoy, Semana,
// Mes, Año" — antes getDashboardData siempre miraba "hoy" a fuerza, sin
// aceptar ningún parámetro de fecha, lo mismo para "Dispositivos listos"/
// "Dispositivos devolución" que, además, miraban el estatus ACTUAL del
// equipo en vez de si de verdad pasó por ese estatus dentro del periodo —
// ver el comentario largo más abajo en esas dos fichas).
//
// dashboard/page.tsx resuelve el periodo UNA vez (con este helper) a partir
// de ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD en la URL, y se lo pasa ya resuelto
// tanto a getDashboardData (para las queries) como a DashboardClient (para
// pintar el selector y resaltar el atajo activo) — mismo patrón que
// branchIdFiltro (?sucursal=), un parámetro de la URL, no un useState local
// que se perdería al compartir el link o recargar la página.
// ============================================

export type AtajoPeriodo = "hoy" | "semana" | "mes" | "año" | "personalizado";

export interface PeriodoDashboard {
  start: Date; // inclusivo
  end: Date;   // exclusivo
  desde: string; // "YYYY-MM-DD", para el input date del selector
  hasta: string; // "YYYY-MM-DD", inclusivo
  atajo: AtajoPeriodo;
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resuelve el periodo real a partir de los `desde`/`hasta` de la URL (o
 * "Hoy" si vienen ausentes/inválidos — mismo comportamiento que tenía el
 * Dashboard antes de este selector, así que un link viejo sin estos
 * parámetros sigue funcionando igual). Si `hasta` < `desde` se intercambian
 * en vez de devolver un rango vacío o tronar.
 */
export function resolverPeriodoDashboard(
  desdeParam: string | undefined,
  hastaParam: string | undefined,
  weekStartDay: number
): PeriodoDashboard {
  const hoy = hoyMx();
  const desdeValido = desdeParam && FECHA_RE.test(desdeParam) ? desdeParam : hoy;
  const hastaValido = hastaParam && FECHA_RE.test(hastaParam) ? hastaParam : desdeValido;
  const [desde, hasta] = desdeValido <= hastaValido ? [desdeValido, hastaValido] : [hastaValido, desdeValido];

  const start = diaMxRangeDesdeFecha(desde).start;
  const end = diaMxRangeDesdeFecha(hasta).end;

  // Se compara contra los 4 atajos (por rango de fechas exacto, no por
  // nombre) solo para saber cuál botón resaltar en el selector — si no
  // coincide con ninguno, el usuario editó las fechas a mano ("personalizado").
  let atajo: AtajoPeriodo = "personalizado";
  const hoyRango = dayRange(0);
  const semanaRango = rangoSemanaLaboral(new Date(), weekStartDay);
  const mesRango = monthRange();
  const anioRango = yearRange();
  if (start.getTime() === hoyRango.start.getTime() && end.getTime() === hoyRango.end.getTime()) atajo = "hoy";
  else if (start.getTime() === semanaRango.start.getTime() && end.getTime() === semanaRango.end.getTime()) atajo = "semana";
  else if (start.getTime() === mesRango.start.getTime() && end.getTime() === mesRango.end.getTime()) atajo = "mes";
  else if (start.getTime() === anioRango.start.getTime() && end.getTime() === anioRango.end.getTime()) atajo = "año";

  return { start, end, desde, hasta, atajo };
}

/** "YYYY-MM-DD" en México de una fecha real (mismo truco que hoyMx(), para una fecha arbitraria en vez de "ahora"). */
function fechaMxStr(d: Date): string {
  const mx = new Date(d.getTime() - MX_OFFSET_MS);
  return mx.toISOString().slice(0, 10);
}

export interface AtajosPeriodoDashboard {
  hoy: { desde: string; hasta: string };
  semana: { desde: string; hasta: string };
  mes: { desde: string; hasta: string };
  año: { desde: string; hasta: string };
}

/**
 * Los 4 atajos del selector de periodo, como fechas concretas — se calculan
 * en el servidor (dashboard/page.tsx) y se le pasan ya resueltos a
 * DashboardClient.tsx, para no duplicar ahí la lógica de "semana laboral"
 * (rangoSemanaLaboral depende de Tenant.weekStartDay) ni la de zona horaria
 * de México. Cada botón del selector simplemente navega a
 * ?desde=X&hasta=Y con el valor ya resuelto aquí.
 */
export function atajosPeriodoDashboard(weekStartDay: number): AtajosPeriodoDashboard {
  const hoyRango = dayRange(0);
  const semanaRango = rangoSemanaLaboral(new Date(), weekStartDay);
  const mesRango = monthRange();
  const anioRango = yearRange();
  // `end` de cada rango es EXCLUSIVO (medianoche del día siguiente) — se le
  // resta 1ms antes de formatear para obtener el último día real incluido.
  const finReal = (end: Date) => fechaMxStr(new Date(end.getTime() - 1));
  return {
    hoy: { desde: fechaMxStr(hoyRango.start), hasta: finReal(hoyRango.end) },
    semana: { desde: fechaMxStr(semanaRango.start), hasta: finReal(semanaRango.end) },
    mes: { desde: fechaMxStr(mesRango.start), hasta: finReal(mesRango.end) },
    año: { desde: fechaMxStr(anioRango.start), hasta: finReal(anioRango.end) },
  };
}

const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// "Hoy" se marca comparando fechas reales, no por posición dentro del
// arreglo — desde que la semana es calendario (lib/periodo-laboral.ts) en
// vez de una ventana rodante terminando siempre hoy, el día de hoy puede
// caer en cualquier posición de la semana (ej. el 2° día si la semana
// laboral del negocio abre en martes).
function diaLabel(date: Date, hoyInicio: Date) {
  if (date.getTime() === hoyInicio.getTime()) return "Hoy";
  const mxDate = new Date(date.getTime() - MX_OFFSET_MS);
  return DIAS_SEMANA[mxDate.getUTCDay()];
}

const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const UN_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * "Ventas de la semana" (2026-09-28, a petición de Carlos: "todos los
 * apartados del dashboard deberían mostrar el periodo seleccionado") — esta
 * gráfica dejó de mirar SIEMPRE la semana laboral en curso para seguir el
 * periodo elegido en el selector de arriba (Hoy/Semana/Mes/Año/
 * personalizado). Como el eje X no puede ser siempre "7 días" (un año
 * entero no cabe como 365 barras legibles), la unidad de cada barra se
 * decide por la DURACIÓN real del periodo, no por el nombre del atajo — así
 * "Mes" (≈28-31 días) sale día por día igual que antes, "Año" (365 días)
 * sale mes por mes, y un periodo "personalizado" se comporta como el que
 * más se le parezca en duración, sin necesidad de casos especiales por
 * atajo. Carlos confirmó esta forma de resolverlo (AskUserQuestion,
 * 2026-09-28: "Cambia de forma según el periodo").
 *
 * ≤31 días → un bucket por día (el mismo límite natural que separa "Mes" de
 * "Año"); más de eso → un bucket por mes calendario, desde el mes de
 * `periodo.start` hasta el de `periodo.end` inclusive.
 */
function construirBucketsTendencia(periodo: PeriodoDashboard, hoyInicio: Date): {
  granularidad: "dia" | "mes";
  buckets: { start: Date; end: Date; label: string }[];
} {
  const dias = Math.round((periodo.end.getTime() - periodo.start.getTime()) / UN_DIA_MS);
  if (dias <= 31) {
    // Buckets diarios — misma etiqueta ("Hoy"/día de la semana) que ya usaba
    // "Ventas de la semana" cuando el periodo son 7 días o menos; con "Mes"
    // (hasta 31 buckets) se vuelve el número de día del mes, porque 28-31
    // etiquetas de día de la semana repetidas serían ilegibles/inútiles.
    const usarNumeroDeDia = dias > 7;
    const buckets: { start: Date; end: Date; label: string }[] = [];
    for (let start = periodo.start; start < periodo.end; start = new Date(start.getTime() + UN_DIA_MS)) {
      const end = new Date(start.getTime() + UN_DIA_MS);
      const label = usarNumeroDeDia
        ? String(new Date(start.getTime() - MX_OFFSET_MS).getUTCDate())
        : diaLabel(start, hoyInicio);
      buckets.push({ start, end, label });
    }
    return { granularidad: "dia", buckets };
  }
  // Buckets mensuales — un mes calendario (en horario de México) por barra,
  // desde el mes de periodo.start hasta el de periodo.end inclusive (con el
  // atajo "Año" esto da exactamente los 12 meses del año en curso).
  const inicioMx = new Date(periodo.start.getTime() - MX_OFFSET_MS);
  const finMx = new Date(periodo.end.getTime() - 1 - MX_OFFSET_MS);
  const buckets: { start: Date; end: Date; label: string }[] = [];
  let y = inicioMx.getUTCFullYear();
  let m = inicioMx.getUTCMonth();
  while (y < finMx.getUTCFullYear() || (y === finMx.getUTCFullYear() && m <= finMx.getUTCMonth())) {
    const start = new Date(Date.UTC(y, m, 1, 0, 0, 0).valueOf() + MX_OFFSET_MS);
    const end = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0).valueOf() + MX_OFFSET_MS);
    buckets.push({
      start: start < periodo.start ? periodo.start : start,
      end: end > periodo.end ? periodo.end : end,
      label: MESES_CORTO[m],
    });
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return { granularidad: "mes", buckets };
}

function formatHoraMx(date: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Mexico_City",
  }).format(date);
}

function formatEspera(date: Date, now: Date) {
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return "Justo ahora";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `Hace ${diffHrs} ${diffHrs === 1 ? "hora" : "hrs"}`;
  const diffDias = Math.floor(diffHrs / 24);
  if (diffDias === 1) return "Ayer";
  return `Hace ${diffDias} días`;
}

const METODO_LABEL: Record<string, VentaHoyRow["metodo"]> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  MIXED: "Mixto",
};

const ACTIVE_STATUSES: RepairStatus[] = ["RECEIVED", "DIAGNOSING", "WAITING_PARTS", "IN_REPAIR"];
const READY_STATUSES: RepairStatus[] = ["READY", "WORKSHOP_READY", "SHOP_READY"];
const RETURN_STATUSES: RepairStatus[] = ["WORKSHOP_RETURN", "SHOP_RETURN"];
const CLOSED_STATUSES: RepairStatus[] = ["DELIVERED", "CANCELLED"];

// Id que ningún Repair real puede tener (usado para forzar "sin resultados"
// en las queries de reparaciones cuando el módulo está inactivo — ver el
// comentario junto al Promise.all de getDashboardData).
const REPARACIONES_INACTIVA_ID = "__reparaciones_modulo_inactivo__";

// 2026-09-28: "var(--primary)" NUNCA debe ir aquí (bug real reportado por
// Carlos con capturas del tema "Monochrome Metro" — texto y gráficas
// invisibles). "--primary" es literalmente fondoVentana, el color de
// ventana/ficha del POS que el negocio eligió (ver el comentario largo en
// lib/theme-presets.ts junto a "--primary-text") — pensado SOLO como
// relleno sólido de su propia ficha, emparejado con "--primary-foreground"
// encima. Si el tema activo es oscuro con fondo casi negro (como
// Monochrome Metro, #1A1A1A), fondoVentana y el fondo/card de toda la app
// terminan casi idénticos — cualquier color/texto pintado directo con
// "var(--primary)" sobre una superficie neutra (una gráfica, un punto de
// leyenda) se vuelve invisible. "--primary-text" es el token que YA existe
// para esto exactamente (mismo matiz, luminosidad/saturación fijas
// pensadas para leerse siempre bien sobre una superficie neutra, sin
// importar qué tan oscuro/claro sea el tema) — se usa aquí en su lugar.
const CATEGORY_FALLBACK_COLORS = [
  "var(--primary-text)", "#06B6D4", "#10B981", "#F59E0B",
  "#EF4444", "#8B5CF6", "#EC4899", "#F97316",
];

export async function getDashboardData(
  tenantId: string,
  branches: Pick<Branch, "id" | "name" | "isActive">[],
  weekStartDay: number,
  reparacionesActiva: boolean,
  // Periodo ya resuelto (2026-09-26, ver resolverPeriodoDashboard arriba) —
  // dashboard/page.tsx lo resuelve UNA vez a partir de ?desde=/?hasta= y lo
  // manda ya calculado, tanto aquí como al propio DashboardClient, para que
  // nunca puedan desincronizarse. Reemplaza el "today" fijo que usaban
  // antes "Ventas del día"/"Total de tickets"/"Equipos recibidos" — y
  // "Dispositivos listos"/"Dispositivos devolución" dejan de mirar el
  // estatus ACTUAL del equipo para mirar si tuvo un checkpoint de ese
  // estatus en el historial DENTRO de este periodo (ver más abajo).
  periodo: PeriodoDashboard,
  // "Vista por sucursal" (2026-09-22, a petición de Carlos: "en el
  // dashboard de administrador debe contener una vista global y una por
  // tienda") — cuando viene, TODAS las queries de abajo se acotan a esa
  // sola sucursal, y el Dashboard completo (tarjetas, gráficas, tablas,
  // alertas) queda mostrando solo sus datos, reutilizando exactamente el
  // mismo layout que la vista global (ver DashboardClient.tsx). `undefined`
  // = vista global de siempre, sin filtrar nada — comportamiento idéntico
  // al que ya existía antes de este parámetro.
  branchIdFiltro?: string,
  // Tenant.dashboardCategoriasConfig tal cual (JSON crudo, puede ser
  // null) — dashboard/page.tsx ya trae el Tenant completo, así que no
  // hace falta una query aparte aquí; ver aplicarConfigCategorias arriba.
  categoriasConfigGuardada?: unknown
): Promise<DashboardData> {
  // Sale y Repair tienen tenantId propio, así que getTenantPrisma se
  // encarga de inyectarlo — ya no se escribe a mano en su `where` de
  // primer nivel. Inventory y SaleItem NO tienen tenantId propio (se
  // llega a su tenant vía branch/sale), así que ahí el filtro anidado
  // sigue siendo manual — la extensión no toca condiciones anidadas.
  const db = getTenantPrisma(tenantId);

  const now = new Date();
  const today = dayRange(0);

  // Periodo INMEDIATAMENTE ANTERIOR, de la MISMA duración que el elegido en
  // el selector (2026-09-28, ver el comentario largo junto a
  // SucursalResumen.vsPeriodoAnterior más arriba) — reemplaza el "ayer" fijo
  // que usaba antes el comparativo por sucursal. Con el atajo "Hoy" (un
  // periodo de 1 día) esto da exactamente "ayer", sin necesidad de un caso
  // especial: se calcula igual para los 4 atajos y para "personalizado".
  const duracionPeriodoMs = periodo.end.getTime() - periodo.start.getTime();
  const periodoAnterior = {
    start: new Date(periodo.start.getTime() - duracionPeriodoMs),
    end: periodo.start,
  };

  const [
    ventasHoyRaw,
    ventasAnteriorPorBranch,
    repairsDeliveredPeriodo,
    openRepairsRaw,
    receivedTodayByBranch,
    inventoryRows,
    categorySaleItems,
    historialListosDevolucionRaw,
  ] = await Promise.all([
    db.sale.findMany({
      where: {
        status: "COMPLETED",
        // periodo (2026-09-26) — antes siempre "hoy"; ver el comentario
        // largo del parámetro `periodo` arriba.
        createdAt: { gte: periodo.start, lt: periodo.end },
        ...(branchIdFiltro ? { branchId: branchIdFiltro } : {}),
      },
      // repair — 2026-09-25: un SaleItem ahora puede representar el cobro
      // de una reparación (repairId, product null) en vez de un producto —
      // ver el comentario largo en SaleItem, prisma/schema.prisma. A
      // propósito SÍ aparece aquí (a diferencia de categorySaleItems más
      // abajo): "ventas del periodo" debe reflejar TODO el dinero que
      // entró, reparaciones incluidas — antes (cobrarYEntregarAction) ni
      // siquiera generaba una Sale, así que este número quedaba incompleto.
      // Trae branchId/createdAt (escalares normales de Sale, no hace falta
      // pedirlos con `select`) — 2026-09-28: este mismo arreglo alimenta
      // ahora "Ventas de la semana" (buckets por periodo), "Ventas por
      // sucursal" (ventasDiaBranch) y "Ventas por día y hora" (ventasPorHora)
      // más abajo, así que ya no hace falta una query de sucursal aparte.
      include: { items: { include: { product: true, repair: { select: { folio: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    // Solo para el comparativo "vs periodo anterior" (2026-09-28) — un
    // groupBy con _sum es mucho más barato que traer cada venta del periodo
    // anterior fila por fila, sobre todo con el atajo "Año" (un año entero
    // de más, solo para un porcentaje de cambio).
    db.sale.groupBy({
      by: ["branchId"],
      where: {
        status: "COMPLETED",
        createdAt: { gte: periodoAnterior.start, lt: periodoAnterior.end },
        ...(branchIdFiltro ? { branchId: branchIdFiltro } : {}),
      },
      _sum: { total: true },
    }),
    // Las 3 queries de reparaciones de abajo llevan un filtro `id` extra
    // (2026-09-18, módulo Reparaciones por tenant) que cuando el módulo
    // está inactivo (ej. una barbería) usa un id imposible para forzar un
    // resultado vacío — Prisma ignora una condición en `undefined`, así
    // que con el módulo activo esto no cambia la query original en nada.
    // Se prefiere este filtro sobre "no ejecutar la query" para no
    // depender de tipos genéricos de Prisma en dos ramas distintas —
    // openRepairsRaw en particular alimenta `(typeof openRepairsRaw)[number]`
    // más abajo (toRepairRow), y eso se rompe si su tipo pudiera venir de
    // dos formas de llamada distintas.
    db.repair.findMany({
      where: {
        // periodo (2026-09-28) — antes SIEMPRE la semana laboral en curso,
        // sin importar el selector; ver el comentario largo junto a
        // construirBucketsTendencia más arriba.
        deliveredAt: { gte: periodo.start, lt: periodo.end },
        id: reparacionesActiva ? undefined : REPARACIONES_INACTIVA_ID,
        ...(branchIdFiltro ? { branchId: branchIdFiltro } : {}),
      },
      select: { branchId: true, finalCost: true, deliveredAt: true },
    }),
    db.repair.findMany({
      where: {
        status: { notIn: CLOSED_STATUSES },
        id: reparacionesActiva ? undefined : REPARACIONES_INACTIVA_ID,
        ...(branchIdFiltro ? { branchId: branchIdFiltro } : {}),
      },
      include: { customer: true, user: true },
      orderBy: { receivedAt: "desc" },
    }),
    db.repair.groupBy({
      by: ["branchId"],
      where: {
        // periodo (2026-09-26) — antes siempre "hoy" (ver el comentario
        // largo del parámetro `periodo` arriba); alimenta la columna
        // "Equipos recibidos" del resumen por sucursal.
        receivedAt: { gte: periodo.start, lt: periodo.end },
        id: reparacionesActiva ? undefined : REPARACIONES_INACTIVA_ID,
        ...(branchIdFiltro ? { branchId: branchIdFiltro } : {}),
      },
      _count: { _all: true },
    }),
    db.inventory.findMany({
      where: { branch: { tenantId, ...(branchIdFiltro ? { id: branchIdFiltro } : {}) } },
      include: { product: true, branch: true },
    }),
    db.saleItem.findMany({
      where: {
        sale: {
          tenantId,
          status: "COMPLETED",
          // periodo (2026-09-28) — antes SIEMPRE el mes calendario en
          // curso, sin importar el selector de arriba (comentario original:
          // "Ventas por categoría (mes en curso)"); ver el comentario largo
          // del parámetro `periodo` en la firma de esta función.
          createdAt: { gte: periodo.start, lt: periodo.end },
          ...(branchIdFiltro ? { branchId: branchIdFiltro } : {}),
        },
        // 2026-09-25: excluye el cobro de reparaciones (productId null,
        // repairId sí) — esta gráfica es "ventas por categoría de
        // catálogo" y una reparación no tiene una; su ingreso ya se cuenta
        // aparte (ver reparacionesDia, "Ventas de la semana" más abajo).
        productId: { not: null },
      },
      include: { product: { include: { category: true } } },
    }),
    // "Dispositivos listos"/"Dispositivos devolución" del periodo (2026-09-26,
    // corrección explícita de Carlos: "el contador debe mostrar los equipos
    // según el periodo seleccionado, sin importar que ya se hayan entregado
    // al cliente. Porque fueron listos reales y devoluciones reales" — antes
    // estas 2 fichas se calculaban de openRepairsRaw, es decir del estatus
    // ACTUAL del equipo, así que un equipo ya entregado (DELIVERED) dejaba
    // de contar aunque de verdad hubiera pasado por "listo" o "devolución"
    // ese mismo día). Ahora se busca en RepairHistory un checkpoint con
    // status LISTO/DEVOLUCIÓN dentro del periodo — sin importar el estatus
    // actual del folio — y más abajo se traen los Repair completos de esos
    // ids para armar las filas (toRepairRow). "Regresar a taller (corregir)"
    // no aparece aquí nunca: su nota usa NOTA_CORRECCION_REGRESO_A_TALLER y
    // su status es IN_REPAIR, no uno de READY_STATUSES/RETURN_STATUSES.
    db.repairHistory.findMany({
      where: {
        status: { in: [...READY_STATUSES, ...RETURN_STATUSES] },
        createdAt: { gte: periodo.start, lt: periodo.end },
        repair: {
          id: reparacionesActiva ? undefined : REPARACIONES_INACTIVA_ID,
          ...(branchIdFiltro ? { branchId: branchIdFiltro } : {}),
        },
      },
      select: { repairId: true, status: true },
    }),
  ]);

  // ── Ventas del periodo ──────────────────────────────────
  // (2026-09-26: antes siempre "hoy" — ver el comentario largo del
  // parámetro `periodo` en la firma de esta función.)
  const ventasPeriodoCompleto: VentaHoyRow[] = ventasHoyRaw.map((v) => ({
    id: v.id,
    folio: v.folio,
    hora: formatHoraMx(v.createdAt),
    articulos: v.items.map((it) => it.product?.name ?? (it.repair ? `Reparación ${it.repair.folio}` : "Producto")).join(", ") || "Sin artículos",
    count: v.items.reduce((s, it) => s + it.quantity, 0),
    metodo: METODO_LABEL[v.paymentMethod] ?? "Efectivo",
    total: Number(v.total),
  }));
  // Total/num/ticket promedio SIEMPRE del arreglo completo — el recorte de
  // abajo (mismo tope que equiposListos/equiposDevolucion, ver el
  // comentario largo ahí) es solo para la tabla de detalle, nunca para
  // estos 3 números.
  const totalVentasHoy = ventasPeriodoCompleto.reduce((s, v) => s + v.total, 0);
  const numVentasHoy = ventasPeriodoCompleto.length;
  const ticketPromedio = numVentasHoy > 0 ? Math.round(totalVentasHoy / numVentasHoy) : 0;
  const ventasHoy = ventasPeriodoCompleto.slice(0, 300);

  // ── Reparaciones abiertas, partidas por grupo de estatus ─
  function toRepairRow(r: (typeof openRepairsRaw)[number]): RepairRow {
    return {
      id: r.id,
      folio: r.folio,
      cliente: r.customer.name,
      telefono: r.customer.phone ?? "Sin teléfono",
      equipo: [r.deviceBrand, r.deviceModel].filter(Boolean).join(" "),
      status: r.status,
      tecnico: r.user.name,
      prioridad: r.priority,
      costo: r.finalCost != null ? Number(r.finalCost) : r.estimatedCost != null ? Number(r.estimatedCost) : null,
      falla: r.issueDesc,
      razon: r.notes ?? r.diagnosisDesc,
      espera: formatEspera(r.receivedAt, now),
    };
  }

  // "Reparaciones activas" se queda mirando el estatus ACTUAL (openRepairsRaw,
  // sin importar el periodo) a propósito — a diferencia de "listos"/
  // "devolución" de abajo, "activas" es por naturaleza una foto del momento
  // ("qué sigue en proceso ahorita"), no algo que tenga sentido acotar a un
  // rango de fechas pasado.
  const reparacionesActivas = openRepairsRaw.filter((r) => ACTIVE_STATUSES.includes(r.status)).map(toRepairRow);

  // "Dispositivos listos"/"Dispositivos devolución" del periodo — ver el
  // comentario largo junto a historialListosDevolucionRaw más arriba. Un
  // mismo folio puede tener más de un checkpoint LISTO (o DEVOLUCIÓN)
  // dentro del periodo (ej. WORKSHOP_READY y luego SHOP_READY el mismo
  // día) — se cuenta una sola vez por folio (Set de ids), nunca una fila
  // por checkpoint.
  const idsListosPeriodo = new Set(
    historialListosDevolucionRaw.filter((h) => (READY_STATUSES as string[]).includes(h.status)).map((h) => h.repairId)
  );
  const idsDevolucionPeriodo = new Set(
    historialListosDevolucionRaw.filter((h) => (RETURN_STATUSES as string[]).includes(h.status)).map((h) => h.repairId)
  );
  const idsListosDevolucionPeriodo = Array.from(new Set([...idsListosPeriodo, ...idsDevolucionPeriodo]));
  // Mismo `include` que openRepairsRaw (customer, user) a propósito — así
  // toRepairRow(r) acepta ambas fuentes sin duplicar su firma de tipo. Se
  // buscan por id sin filtrar por status: el punto de esta ficha es que
  // cuenta aunque el folio YA se haya entregado después.
  const repairsListosDevolucionRaw = idsListosDevolucionPeriodo.length
    ? await db.repair.findMany({
        where: { id: { in: idsListosDevolucionPeriodo } },
        include: { customer: true, user: true },
      })
    : [];
  // Tope de filas para las tablas de detalle (2026-09-26) — un periodo largo
  // ("Año") puede acumular cientos de checkpoints; los CONTEOS de las
  // fichas (equiposListosCount/equiposDevolucionCount más abajo) se toman
  // de los Sets completos, sin recortar — solo la tabla de detalle se
  // limita, para que la pantalla no se vuelva impracticable.
  const MAX_FILAS_TABLA_REPARACIONES = 300;
  const equiposListos = repairsListosDevolucionRaw
    .filter((r) => idsListosPeriodo.has(r.id))
    .map(toRepairRow)
    .slice(0, MAX_FILAS_TABLA_REPARACIONES);
  const equiposDevolucion = repairsListosDevolucionRaw
    .filter((r) => idsDevolucionPeriodo.has(r.id))
    .map(toRepairRow)
    .slice(0, MAX_FILAS_TABLA_REPARACIONES);

  // ── Alertas: stock bajo/agotado + reparaciones sin avance ─
  const alertas: AlertaRow[] = [];
  for (const inv of inventoryRows) {
    if (inv.stock <= 0) {
      alertas.push({ id: `stock-${inv.id}`, tipo: "agotado", texto: `${inv.product.name} — Agotado` });
    } else if (inv.stock <= inv.minStock) {
      alertas.push({ id: `stock-${inv.id}`, tipo: "stock_bajo", texto: `${inv.product.name} — Stock bajo (${inv.stock} unidades)` });
    }
  }
  const STALE_DAYS = 3;
  for (const r of openRepairsRaw) {
    const diasSinMovimiento = Math.floor((now.getTime() - r.receivedAt.getTime()) / (24 * 3600 * 1000));
    if (diasSinMovimiento >= STALE_DAYS && !RETURN_STATUSES.includes(r.status) && !READY_STATUSES.includes(r.status)) {
      alertas.push({ id: `stale-${r.id}`, tipo: "repair_stale", texto: `${r.folio} lleva ${diasSinMovimiento} días sin actualización` });
    }
  }
  const alertasFinal = alertas.slice(0, 6);

  // ── Ventas por categoría (mes en curso) ───────────────
  const catTotals = new Map<string, { name: string; color: string | null; total: number }>();
  let totalMes = 0;
  for (const item of categorySaleItems) {
    // Defensivo — el where de arriba ya filtra productId: { not: null },
    // pero product sigue siendo opcional en el tipo (SaleItem.product
    // puede ser null para un renglón de reparación).
    if (!item.product) continue;
    const subtotal = Number(item.subtotal);
    totalMes += subtotal;
    const cat = item.product.category;
    const key = cat?.id ?? "sin-categoria";
    const name = cat?.name ?? "Sin categoría";
    const color = cat?.color ?? null;
    const prev = catTotals.get(key);
    if (prev) prev.total += subtotal;
    else catTotals.set(key, { name, color, total: subtotal });
  }
  const categoriasBase = totalMes > 0
    ? Array.from(catTotals.values())
        .sort((a, b) => b.total - a.total)
        .map((c, i) => ({
          name: c.name,
          value: Math.round((c.total / totalMes) * 100),
          color: c.color ?? CATEGORY_FALLBACK_COLORS[i % CATEGORY_FALLBACK_COLORS.length],
        }))
    : [];
  const categorias: CategoriaVenta[] = aplicarConfigCategorias(categoriasBase, categoriasConfigGuardada);

  // ── Ventas de la semana (tendencia del periodo elegido) ─
  // 2026-09-28: dejó de mirar SIEMPRE la semana laboral en curso — ver el
  // comentario largo junto a construirBucketsTendencia más arriba.
  const { granularidad: tendenciaGranularidad, buckets: bucketsTendencia } = construirBucketsTendencia(periodo, today.start);
  const ventasSemana: VentaSemanaDia[] = bucketsTendencia.map(({ start, end, label }) => {
    const ventasBucket = ventasHoyRaw
      .filter((s) => s.createdAt >= start && s.createdAt < end)
      .reduce((sum, s) => sum + Number(s.total), 0);
    const reparacionesBucket = repairsDeliveredPeriodo
      .filter((r) => r.deliveredAt && r.deliveredAt >= start && r.deliveredAt < end)
      .reduce((sum, r) => sum + Number(r.finalCost ?? 0), 0);
    return {
      dia: label,
      ventas: Math.round(ventasBucket),
      reparaciones: Math.round(reparacionesBucket),
      total: Math.round(ventasBucket + reparacionesBucket),
    };
  });
  const totalSemana = ventasSemana.reduce((s, d) => s + d.total, 0);
  const promedioVentasSemana = ventasSemana.length > 0
    ? Math.round(ventasSemana.reduce((s, d) => s + d.ventas, 0) / ventasSemana.length)
    : 0;

  // ── Ventas por hora, sumadas a lo largo de TODO el periodo elegido ─
  // (2026-09-28, reemplaza el selector de un solo día que tenía antes esta
  // gráfica — ver el comentario largo junto a DashboardData.ventasPorHora
  // más arriba y getVentasPorDia más abajo, ya sin usar desde aquí). Se
  // calcula directo de ventasHoyRaw (ya viene acotado al periodo elegido),
  // sin una query aparte — mismo agrupado por hora de México que usaba
  // getVentasPorDia para un solo día.
  const porHoraMap = new Map<number, { numVentas: number; totalVentas: number }>();
  for (const v of ventasHoyRaw) {
    const horaMx = new Date(v.createdAt.getTime() - MX_OFFSET_MS).getUTCHours();
    const prev = porHoraMap.get(horaMx) ?? { numVentas: 0, totalVentas: 0 };
    prev.numVentas += 1;
    prev.totalVentas += Number(v.total);
    porHoraMap.set(horaMx, prev);
  }
  const ventasPorHora: VentaPorHora[] = Array.from({ length: 24 }, (_, hora) => {
    const d = porHoraMap.get(hora);
    return {
      hora,
      horaLabel: formatHoraCorta(hora),
      numVentas: d?.numVentas ?? 0,
      totalVentas: Math.round(d?.totalVentas ?? 0),
    };
  });
  const horaPico = ventasPorHora.reduce<VentaPorHora | null>(
    (max, h) => (h.numVentas > 0 && (!max || h.numVentas > max.numVentas) ? h : max),
    null
  );

  // ── Resumen por sucursal ───────────────────────────────
  const receivedTodayMap = new Map(receivedTodayByBranch.map((g) => [g.branchId, g._count._all]));
  // "vs periodo anterior" (2026-09-28) — sumas ya resueltas por el groupBy
  // de ventasAnteriorPorBranch (ver el comentario largo junto a su query
  // más arriba), una por sucursal.
  const ventasAnteriorMap = new Map(ventasAnteriorPorBranch.map((g) => [g.branchId, Number(g._sum.total ?? 0)]));

  const repairsByBranch = new Map<string, typeof openRepairsRaw>();
  for (const r of openRepairsRaw) {
    const arr = repairsByBranch.get(r.branchId) ?? [];
    arr.push(r);
    repairsByBranch.set(r.branchId, arr);
  }

  // En vista por sucursal el resumen comparativo no se usa en pantalla
  // (DashboardClient oculta esa sección cuando hay un filtro activo — solo
  // tiene sentido comparar cuando se ve el negocio completo), pero se
  // acota igual por consistencia: sin esto, "sucursales" seguiría listando
  // TODAS las sucursales con datos en cero salvo la filtrada, en vez de
  // solo la que realmente se está viendo.
  const branchesParaResumen = branchIdFiltro ? branches.filter((b) => b.id === branchIdFiltro) : branches;

  const sucursales: SucursalResumen[] = branchesParaResumen.map((b) => {
    // "Ventas del periodo" por sucursal (2026-09-28) — antes SIEMPRE "hoy",
    // sin importar el selector (ver el comentario largo junto a
    // SucursalResumen.vsPeriodoAnterior más arriba). ventasHoyRaw ya viene
    // acotado al periodo elegido (y a branchIdFiltro cuando aplica), así
    // que no hace falta otra query aquí.
    const ventasBranch = ventasHoyRaw
      .filter((s) => s.branchId === b.id)
      .reduce((sum, s) => sum + Number(s.total), 0);
    const ticketsVenta = ventasHoyRaw.filter((s) => s.branchId === b.id).length;
    const ventasAnteriorBranch = ventasAnteriorMap.get(b.id) ?? 0;

    const repairsHere = repairsByBranch.get(b.id) ?? [];
    const repActivas = repairsHere.filter((r) => ACTIVE_STATUSES.includes(r.status)).length;
    const listosEntrega = repairsHere.filter((r) => READY_STATUSES.includes(r.status)).length;
    const devoluciones = repairsHere.filter((r) => RETURN_STATUSES.includes(r.status)).length;
    const equiposRecibidos = receivedTodayMap.get(b.id) ?? 0;

    return {
      id: b.id,
      nombre: b.name,
      estado: b.isActive ? "activa" : "prueba",
      ventasDia: Math.round(ventasBranch),
      ticketsVenta,
      ticketsRep: equiposRecibidos,
      equiposRecibidos,
      repActivas,
      listosEntrega,
      devoluciones,
      vsPeriodoAnterior: ventasAnteriorBranch > 0 ? Math.round(((ventasBranch - ventasAnteriorBranch) / ventasAnteriorBranch) * 100) : null,
    };
  });

  return {
    totalVentasHoy: Math.round(totalVentasHoy),
    numVentasHoy,
    ticketPromedio,
    reparacionesActivasCount: reparacionesActivas.length,
    // El conteo de la ficha usa el Set completo, no el arreglo ya recortado
    // a MAX_FILAS_TABLA_REPARACIONES (ver el comentario largo arriba) — un
    // periodo largo con más de 300 folios debe seguir mostrando el número
    // real en la ficha, aunque la tabla de detalle no liste todos.
    equiposListosCount: idsListosPeriodo.size,
    equiposDevolucionCount: idsDevolucionPeriodo.size,
    ventasHoy,
    reparacionesActivas,
    equiposListos,
    equiposDevolucion,
    alertas: alertasFinal,
    categorias,
    ventasSemana,
    tendenciaGranularidad,
    totalSemana: Math.round(totalSemana),
    promedioVentasSemana,
    ventasPorHora,
    horaPico: horaPico ? { hora: horaPico.hora, horaLabel: horaPico.horaLabel, numVentas: horaPico.numVentas } : null,
    sucursales,
    multiSucursal: branches.length > 1,
    reparacionesActiva,
    periodo,
  };
}

// ============================================
// Ventas por día y hora (2026-09-17, a petición de Carlos: "a mí como dueño
// me gustaría poder checar día por día qué tanto se vendió y en qué horas
// fue el mayor flujo de clientes"). 2026-09-28: esta sección dejó de tener
// su PROPIO selector de un solo día (con flechas día anterior/siguiente,
// vía getVentasPorDia/obtenerVentasPorDiaAction más abajo) — a petición de
// Carlos ("todos los apartados del dashboard deberían mostrar el periodo
// seleccionado"), ahora usa el MISMO selector de periodo que el resto del
// Dashboard, sumando las horas de TODOS los días del rango elegido (ver
// DashboardData.ventasPorHora, calculado dentro de getDashboardData más
// arriba a partir de ventasHoyRaw — ya no hace falta una query aparte).
// getVentasPorDia/redactarMontosVentasPorDia/VentasPorDiaData se quedan
// abajo sin usar desde la UI del Dashboard (no se borran por si hiciera
// falta un reporte de un solo día más adelante), pero
// obtenerVentasPorDiaAction (dashboard-actions.ts) sí se quitó por completo
// junto con su único punto de entrada.
// ============================================

export interface VentaPorHora {
  hora: number; // 0-23, hora civil de México
  horaLabel: string; // "8 a.m.", "5 p.m."...
  numVentas: number;
  totalVentas: number;
}

export interface VentasPorDiaData {
  fecha: string; // "YYYY-MM-DD"
  totalVentas: number;
  numVentas: number;
  ticketPromedio: number;
  porHora: VentaPorHora[]; // siempre 24 posiciones — 0 en las horas sin venta, para que la gráfica tenga el mismo eje todos los días
  horaPico: { hora: number; horaLabel: string; numVentas: number } | null;
}

/** "YYYY-MM-DD" de hoy en México — usado por resolverPeriodoDashboard. */
export function hoyMx(): string {
  const now = new Date();
  const mx = new Date(now.getTime() - MX_OFFSET_MS);
  return mx.toISOString().slice(0, 10);
}

/** Igual que dayRange()/mxDayBoundary() de arriba, pero a partir de una fecha explícita ("YYYY-MM-DD") en vez de "hace N días". */
function diaMxRangeDesdeFecha(fechaStr: string) {
  const [y, m, d] = fechaStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0).valueOf() + MX_OFFSET_MS);
  const end = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0).valueOf() + MX_OFFSET_MS);
  return { start, end };
}

function formatHoraCorta(hora: number): string {
  const d = new Date(Date.UTC(2000, 0, 1, hora, 0, 0));
  return new Intl.DateTimeFormat("es-MX", { hour: "numeric", hour12: true, timeZone: "UTC" }).format(d);
}

export async function getVentasPorDia(tenantId: string, fechaStr: string, branchIdFiltro?: string): Promise<VentasPorDiaData> {
  const db = getTenantPrisma(tenantId);
  const { start, end } = diaMxRangeDesdeFecha(fechaStr);

  // branchIdFiltro (2026-09-22): mismo filtro de "vista por sucursal" que
  // getDashboardData — cuando el Dashboard está viendo una sola sucursal,
  // el selector de "Ventas por día y hora" debe reflejar esa misma
  // sucursal, no el negocio completo.
  const ventas = await db.sale.findMany({
    where: {
      status: "COMPLETED",
      createdAt: { gte: start, lt: end },
      ...(branchIdFiltro ? { branchId: branchIdFiltro } : {}),
    },
    select: { total: true, createdAt: true },
  });

  // Flujo de clientes por hora = número de ventas (tickets), no el monto —
  // un solo ticket grande no debe aparentar "mucho flujo" en su hora.
  const porHoraMap = new Map<number, { numVentas: number; totalVentas: number }>();
  for (const v of ventas) {
    const horaMx = new Date(v.createdAt.getTime() - MX_OFFSET_MS).getUTCHours();
    const prev = porHoraMap.get(horaMx) ?? { numVentas: 0, totalVentas: 0 };
    prev.numVentas += 1;
    prev.totalVentas += Number(v.total);
    porHoraMap.set(horaMx, prev);
  }

  const porHora: VentaPorHora[] = Array.from({ length: 24 }, (_, hora) => {
    const d = porHoraMap.get(hora);
    return {
      hora,
      horaLabel: formatHoraCorta(hora),
      numVentas: d?.numVentas ?? 0,
      totalVentas: Math.round(d?.totalVentas ?? 0),
    };
  });

  const totalVentas = ventas.reduce((s, v) => s + Number(v.total), 0);
  const numVentas = ventas.length;
  const ticketPromedio = numVentas > 0 ? Math.round(totalVentas / numVentas) : 0;

  const horaPico = porHora.reduce<VentaPorHora | null>(
    (max, h) => (h.numVentas > 0 && (!max || h.numVentas > max.numVentas) ? h : max),
    null
  );

  return {
    fecha: fechaStr,
    totalVentas: Math.round(totalVentas),
    numVentas,
    ticketPromedio,
    porHora,
    horaPico: horaPico ? { hora: horaPico.hora, horaLabel: horaPico.horaLabel, numVentas: horaPico.numVentas } : null,
  };
}

/**
 * Redacta los montos de un VentasPorDiaData ya calculado — 2026-09-24,
 * mismo criterio y mismo motivo que redactarMontosDashboard. 2026-09-28: ya
 * no la llama nada del Dashboard (ver el comentario largo junto a
 * getVentasPorDia) — se conserva por si getVentasPorDia se vuelve a usar
 * más adelante para algún reporte de un solo día.
 */
export function redactarMontosVentasPorDia(data: VentasPorDiaData): VentasPorDiaData {
  return {
    ...data,
    totalVentas: 0,
    ticketPromedio: 0,
    porHora: data.porHora.map((h) => ({ ...h, totalVentas: 0 })),
  };
}
