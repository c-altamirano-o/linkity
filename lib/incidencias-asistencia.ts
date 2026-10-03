import "server-only";

import { getTenantPrisma } from "@/lib/prisma";
import { diaMX, finDeDiaMX, MX_OFFSET_MS } from "@/lib/asistencia";
import { MARGEN_GRACIA_MINUTOS, parseHoraAMinutos } from "@/lib/horarios-sucursal";

/**
 * Cálculo de incidencias de asistencia para nómina real (2026-10-03, a
 * petición de Carlos: "no es justo que [un empleado que llega tarde] reciba
 * el pago completo de ese día, tampoco es justo que un empleado... que no
 * cierre sesión reciba pago extra por horas que no estuvo ahí").
 *
 * Decisiones de diseño confirmadas por Carlos (vía preguntas de opción
 * múltiple antes de construir esto):
 *
 * 1. Automático pero editable: el resultado de este cálculo se usa para
 *    PRE-LLENAR el "Monto base" del modal de Generar pago
 *    (PersonalClient.tsx), nunca para forzarlo — el administrador sigue
 *    pudiendo editarlo a mano antes de confirmar, igual que la comisión
 *    sugerida (calcularComisionSugerida, este mismo archivo más abajo).
 * 2. Fuente de verdad cruzada: la tardanza se calcula con el login REAL por
 *    PIN (StaffLoginSession.checkIn) — no se puede falsear apretando un
 *    botón sin estar ahí. El registro manual (Attendance, el que ya
 *    alimenta horasSemana) NO afecta este cálculo (evita descontar doble
 *    por el mismo hecho), pero si no coincide con el login real por más del
 *    margen de gracia, se marca `discrepanciaManual` — útil para que Carlos
 *    detecte un registro manual maquillado.
 * 3. Horario individual por empleado: Staff.horaEntradaEsperada/
 *    horaSalidaEsperada/diasLaborales (schema.prisma), independientes del
 *    horario de la sucursal (Branch.horaAperturaEsperada/horaCierreEsperada,
 *    que solo alimenta los avisos de caja). Null/vacío en
 *    horaEntradaEsperada = este empleado no tiene horario configurado
 *    todavía → esta función regresa ceros con una advertencia, sin calcular
 *    nada (opt-in por empleado, no rompe a nadie que no se haya configurado).
 * 4. Sesiones sin cerrar (StaffLoginSession cerrada por el cron de
 *    /api/cron/cerrar-sesiones-vencidas o por el camino perezoso de
 *    verificarSesionPersonalVigente, closedBy DATE_ROLLOVER): se topan en el
 *    último movimiento real del empleado ese día — la última venta
 *    (Sale.userId), reparación entregada (Repair.userId/deliveredAt) o
 *    movimiento de caja (CashMovement, vía CashSession.userId) — en vez de
 *    asumir que trabajó hasta la medianoche. Si no se encuentra NINGÚN
 *    movimiento después de su entrada, no se cuentan horas extra ese día y
 *    se marca `sinActividadTrasEntrada` para que el administrador lo revise
 *    (pudo ser un día legítimo sin ventas, o de plano no estuvo).
 *
 * Limitación conocida (documentada para Carlos, no oculta): un Técnico que
 * solo trabaja en Taller cambiando el estatus de una reparación no queda
 * atribuido a NINGÚN movimiento de los tres de arriba — RepairHistory (el
 * registro de esos cambios de estatus) no guarda quién los hizo, solo el
 * folio y la fecha (ver el comentario largo en RepairHistory, schema.prisma).
 * Para ese perfil, `sinActividadTrasEntrada` se va a marcar más seguido de
 * lo real — el administrador decide a mano en esos casos, no se inventa una
 * atribución que no existe en el sistema.
 */

export interface IncidenciaDia {
  /** YYYY-MM-DD, calendario de México. */
  fecha: string;
  minutosTarde: number;
  discrepanciaManual: boolean;
  horasNoContabilizadas: number;
  sinActividadTrasEntrada: boolean;
}

export interface IncidenciasAsistencia {
  diasConIncidencia: IncidenciaDia[];
  totalMinutosTarde: number;
  totalHorasNoContabilizadas: number;
  /** En pesos — 0 si no se pudo calcular (ver `advertencia`). */
  descuentoSugerido: number;
  advertencia: string | null;
}

export interface StaffParaIncidencias {
  id: string;
  userId: string | null;
  horaEntradaEsperada: string | null;
  horaSalidaEsperada: string | null;
  diasLaborales: number[];
  baseSalary: number;
}

const SIN_INCIDENCIAS: Omit<IncidenciasAsistencia, "advertencia"> = {
  diasConIncidencia: [],
  totalMinutosTarde: 0,
  totalHorasNoContabilizadas: 0,
  descuentoSugerido: 0,
};

function minutosDesdeMedianocheMX(epochMs: number): number {
  const mx = new Date(epochMs - MX_OFFSET_MS);
  return mx.getUTCHours() * 60 + mx.getUTCMinutes();
}

/** 0=domingo…6=sábado de una fecha "YYYY-MM-DD" — mediodía UTC para no
 * toparse con corrimientos de huso horario al leer el día calendario de
 * vuelta, sin importar en qué zona horaria corra el proceso que llama esto. */
function diaSemanaDeFechaStr(fechaStr: string): number {
  return new Date(`${fechaStr}T12:00:00Z`).getUTCDay();
}

/** Itera "YYYY-MM-DD" desde `inicio` hasta `fin` (ambos inclusive) — por
 * string, no por aritmética de Date, para no toparse con corrimientos de
 * huso horario al sumar 24h con setDate en un entorno que no sea UTC. */
function* fechasDelPeriodo(inicio: Date, fin: Date): Generator<string> {
  let cursor = inicio.toISOString().slice(0, 10);
  const limite = fin.toISOString().slice(0, 10);
  while (cursor <= limite) {
    yield cursor;
    const [y, m, d] = cursor.split("-").map(Number);
    cursor = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  }
}

export async function calcularIncidenciasAsistencia(
  tenantId: string,
  staff: StaffParaIncidencias,
  periodoInicio: Date,
  periodoFin: Date
): Promise<IncidenciasAsistencia> {
  if (!staff.horaEntradaEsperada) {
    return {
      ...SIN_INCIDENCIAS,
      advertencia:
        "Este empleado no tiene un horario esperado configurado — no se calculan tardanzas ni horas sin confirmar. Configúralo en su ficha, en Personal, si quieres activar este cálculo.",
    };
  }
  const minutoEntradaEsperada = parseHoraAMinutos(staff.horaEntradaEsperada);
  if (minutoEntradaEsperada === null) {
    return { ...SIN_INCIDENCIAS, advertencia: "La hora de entrada esperada de este empleado no es válida." };
  }

  const db = getTenantPrisma(tenantId);
  const desde = periodoInicio;
  const hasta = finDeDiaMX(periodoFin.getTime());

  const [sesiones, asistenciasManual, ventas, reparacionesEntregadas, movimientosCaja] = await Promise.all([
    db.staffLoginSession.findMany({
      where: { staffId: staff.id, checkIn: { gte: desde, lte: hasta } },
      select: { checkIn: true, checkOut: true, closedBy: true },
      orderBy: { checkIn: "asc" },
    }),
    db.attendance.findMany({
      where: { staffId: staff.id, date: { gte: desde, lte: periodoFin } },
      select: { date: true, checkIn: true },
    }),
    staff.userId
      ? db.sale.findMany({ where: { userId: staff.userId, createdAt: { gte: desde, lte: hasta } }, select: { createdAt: true } })
      : Promise.resolve([] as { createdAt: Date }[]),
    staff.userId
      ? db.repair.findMany({
          where: { userId: staff.userId, deliveredAt: { gte: desde, lte: hasta } },
          select: { deliveredAt: true },
        })
      : Promise.resolve([] as { deliveredAt: Date | null }[]),
    staff.userId
      ? db.cashMovement.findMany({
          where: { cashSession: { userId: staff.userId }, createdAt: { gte: desde, lte: hasta } },
          select: { createdAt: true },
        })
      : Promise.resolve([] as { createdAt: Date }[]),
  ]);

  // Agrupa cada sesión de login por día calendario (México) al que
  // pertenece su `checkIn` — un mismo día puede tener varias (turno
  // partido, o volver a entrar tras cerrar sesión).
  const sesionesPorDia = new Map<string, typeof sesiones>();
  for (const s of sesiones) {
    const dia = diaMX(s.checkIn.getTime());
    const lista = sesionesPorDia.get(dia) ?? [];
    lista.push(s);
    sesionesPorDia.set(dia, lista);
  }

  // Todo movimiento real atribuible a este empleado (venta, entrega de
  // reparación, movimiento de caja), agrupado por día — es lo que se usa
  // para topar las horas de una sesión que se cerró sola por DATE_ROLLOVER.
  const actividadPorDia = new Map<string, number[]>();
  function agregarActividad(fecha: Date | null) {
    if (!fecha) return;
    const dia = diaMX(fecha.getTime());
    const lista = actividadPorDia.get(dia) ?? [];
    lista.push(fecha.getTime());
    actividadPorDia.set(dia, lista);
  }
  for (const v of ventas) agregarActividad(v.createdAt);
  for (const r of reparacionesEntregadas) agregarActividad(r.deliveredAt);
  for (const m of movimientosCaja) agregarActividad(m.createdAt);

  const asistenciaManualPorDia = new Map<string, Date>();
  for (const a of asistenciasManual) {
    if (a.checkIn) asistenciaManualPorDia.set(diaMX(a.checkIn.getTime()), a.checkIn);
  }

  const diasConIncidencia: IncidenciaDia[] = [];
  let totalMinutosTarde = 0;
  let totalHorasNoContabilizadas = 0;

  for (const fecha of fechasDelPeriodo(periodoInicio, periodoFin)) {
    if (!staff.diasLaborales.includes(diaSemanaDeFechaStr(fecha))) continue;

    const sesionesDia = sesionesPorDia.get(fecha);
    // Sin ningún login ese día — puede ser una falta legítima o un empleado
    // que solo usa el registro manual de Asistencia (sin PIN); ninguno de
    // los dos es el alcance de este cálculo (lo sigue manejando Personal tal
    // cual, como antes de este cambio).
    if (!sesionesDia || sesionesDia.length === 0) continue;

    const primeraSesion = sesionesDia[0];
    const ultimaSesion = sesionesDia[sesionesDia.length - 1];

    const minutoEntradaReal = minutosDesdeMedianocheMX(primeraSesion.checkIn.getTime());
    const minutosTarde = Math.max(0, minutoEntradaReal - minutoEntradaEsperada - MARGEN_GRACIA_MINUTOS);

    let discrepanciaManual = false;
    const manualCheckIn = asistenciaManualPorDia.get(fecha);
    if (manualCheckIn) {
      const minutoManual = minutosDesdeMedianocheMX(manualCheckIn.getTime());
      if (Math.abs(minutoManual - minutoEntradaReal) > MARGEN_GRACIA_MINUTOS) discrepanciaManual = true;
    }

    let horasNoContabilizadas = 0;
    let sinActividadTrasEntrada = false;
    if (ultimaSesion.closedBy === "DATE_ROLLOVER" && ultimaSesion.checkOut) {
      const actividadDia = (actividadPorDia.get(fecha) ?? []).filter((ms) => ms >= ultimaSesion.checkIn.getTime());
      if (actividadDia.length === 0) {
        horasNoContabilizadas = (ultimaSesion.checkOut.getTime() - ultimaSesion.checkIn.getTime()) / 3_600_000;
        sinActividadTrasEntrada = true;
      } else {
        const ultimaActividadMs = Math.max(...actividadDia);
        horasNoContabilizadas = Math.max(0, (ultimaSesion.checkOut.getTime() - ultimaActividadMs) / 3_600_000);
      }
    }

    if (minutosTarde > 0 || discrepanciaManual || horasNoContabilizadas > 0) {
      diasConIncidencia.push({
        fecha,
        minutosTarde,
        discrepanciaManual,
        horasNoContabilizadas: Math.round(horasNoContabilizadas * 10) / 10,
        sinActividadTrasEntrada,
      });
      totalMinutosTarde += minutosTarde;
      totalHorasNoContabilizadas += horasNoContabilizadas;
    }
  }

  // Conversión a pesos — necesita también la hora de salida esperada (para
  // saber cuántas horas dura un turno) que horaEntradaEsperada por sí sola
  // no da. Si no está configurada, se siguen mostrando las incidencias en
  // minutos/horas (arriba), pero el descuento en pesos se queda en 0 con una
  // advertencia en vez de inventar una tarifa por hora.
  let descuentoSugerido = 0;
  let advertencia: string | null = null;

  if (totalMinutosTarde > 0 || totalHorasNoContabilizadas > 0) {
    const minutoSalidaEsperada = staff.horaSalidaEsperada ? parseHoraAMinutos(staff.horaSalidaEsperada) : null;

    if (minutoSalidaEsperada !== null && minutoSalidaEsperada > minutoEntradaEsperada) {
      const horasPorDia = (minutoSalidaEsperada - minutoEntradaEsperada) / 60;
      let diasLaboralesEnPeriodo = 0;
      for (const fecha of fechasDelPeriodo(periodoInicio, periodoFin)) {
        if (staff.diasLaborales.includes(diaSemanaDeFechaStr(fecha))) diasLaboralesEnPeriodo++;
      }
      const horasEsperadasPeriodo = horasPorDia * diasLaboralesEnPeriodo;

      if (horasEsperadasPeriodo > 0) {
        const valorHora = staff.baseSalary / horasEsperadasPeriodo;
        const horasADescontar = totalMinutosTarde / 60 + totalHorasNoContabilizadas;
        descuentoSugerido = Math.min(staff.baseSalary, Math.round(valorHora * horasADescontar * 100) / 100);
      }
    } else {
      advertencia =
        "Define también la hora de salida esperada en la ficha del empleado para que el sistema sugiera un descuento en pesos — por ahora solo se muestran los minutos/horas de incidencia.";
    }
  }

  return {
    diasConIncidencia,
    totalMinutosTarde,
    totalHorasNoContabilizadas: Math.round(totalHorasNoContabilizadas * 10) / 10,
    descuentoSugerido,
    advertencia,
  };
}
