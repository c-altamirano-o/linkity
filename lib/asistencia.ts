import "server-only";

import { prisma } from "@/lib/prisma";
import { leerSesionPersonal, cerrarSesionPersonal, type SesionPersonal } from "@/lib/staff-auth";

/**
 * Registro de asistencia por login real (2026-09-16, a petición de Carlos:
 * "podemos usar su información de login para llevar un registro de
 * asistencia"). Este archivo tiene dos responsabilidades:
 *
 * 1. Hacer cumplir el cierre automático de una sesión de PIN al cambiar de
 *    día calendario — la salvaguarda que Carlos pidió explícitamente para
 *    "evitar que se quede abierto siempre y engañen esta opción". Eligió
 *    el corte por fecha (en vez de un timeout por inactividad) porque un
 *    mismo empleado puede tener varios login/logout el mismo día y un
 *    timeout de inactividad sería más tedioso (lo desconectaría a media
 *    jornada si se distrae un rato).
 * 2. Cerrar/reflejar en StaffLoginSession (schema.prisma) cada vez que esto
 *    ocurre, para que el panel de asistencia (/[tenant]/asistencia,
 *    lib/asistencia-data.ts) tenga un registro completo de a qué hora entró
 *    y salió cada empleado de cada sucursal.
 *
 * Importante: esto es un sistema APARTE del registro manual de asistencia
 * que ya existía en Personal (modelo Attendance, botones "Registrar
 * entrada/salida" que alimentan horasSemana/nómina) — Carlos decidió
 * explícitamente dejar ese tal cual, sin conectarlo con este panel nuevo,
 * que es puramente informativo para el administrador.
 *
 * `verificarSesionPersonalVigente` reemplaza a `leerSesionPersonal` (que
 * sigue existiendo en lib/staff-auth.ts, sin cambios en su propia lógica de
 * firma/expiración) en los dos lugares que validan una sesión de PIN en
 * cada request: el layout del tenant y resolverActor (lib/actor.ts). Como
 * su forma de retorno es idéntica (`SesionPersonal | null`), cambiar la
 * llamada en esos dos archivos no obliga a tocar nada más ahí.
 *
 * 2026-10-03, a petición de Carlos (tras notar que Asistencia podía seguir
 * mostrando "Sigue dentro" de días anteriores): el cierre de arriba es
 * PEREZOSO — solo ocurre la próxima vez que ESA MISMA sesión (ese
 * dispositivo/cookie) intenta usarse de nuevo. Si el empleado nunca vuelve
 * a usar ese dispositivo (cambió de equipo, dejó de trabajar ahí, etc.), la
 * fila se queda abierta en la BD indefinidamente — no afecta nada fuera del
 * panel de Asistencia (ver el comentario de StaffLoginSession, arriba),
 * pero sí se ve mal ahí. `inicioDeHoyMX` (abajo) es lo que usa el cron
 * /api/cron/cerrar-sesiones-vencidas para encontrar y cerrar esas filas
 * PROACTIVAMENTE, una vez al día, sin esperar a que el dispositivo vuelva —
 * mismo cálculo de cierre (`finDeDiaMX` sobre el checkIn original) que el
 * camino perezoso de arriba, solo que disparado por un cron en vez de por
 * un request real.
 */

// Mismo offset fijo (UTC-6, sin ajuste de horario de verano) que ya usan
// mxParts()/matchesPeriodo() en CatalogoClient.tsx y DashboardClient.tsx —
// se replica aquí en vez de importarlo porque esos son Client Components y
// este archivo es server-only.
// Exportado (2026-10-03, ver lib/incidencias-asistencia.ts) — antes era de
// uso interno únicamente; el cálculo de incidencias de asistencia para
// nómina necesita el mismo offset para ubicar un StaffLoginSession.checkIn
// en su minuto-del-día en México, sin duplicar la constante.
export const MX_OFFSET_MS = 6 * 60 * 60 * 1000;

/** "YYYY-MM-DD" del día calendario en México al que pertenece ese instante. */
export function diaMX(epochMs: number): string {
  const mx = new Date(epochMs - MX_OFFSET_MS);
  return `${mx.getUTCFullYear()}-${String(mx.getUTCMonth() + 1).padStart(2, "0")}-${String(mx.getUTCDate()).padStart(2, "0")}`;
}

/** Instante exacto (1ms antes de medianoche) que cierra el día calendario en México que contiene `epochMs`. */
export function finDeDiaMX(epochMs: number): Date {
  const mx = new Date(epochMs - MX_OFFSET_MS);
  const medianocheSiguienteMX = Date.UTC(mx.getUTCFullYear(), mx.getUTCMonth(), mx.getUTCDate() + 1, 0, 0, 0, 0);
  return new Date(medianocheSiguienteMX + MX_OFFSET_MS - 1);
}

/**
 * Instante (UTC) de la medianoche de HOY en México — usado por el cron de
 * /api/cron/cerrar-sesiones-vencidas (2026-10-03, a petición de Carlos) para
 * acotar la consulta a solo las StaffLoginSession que de plano empezaron
 * antes de hoy, sin tener que traer TODAS las filas abiertas de todos los
 * negocios en cada corrida.
 */
export function inicioDeHoyMX(ahoraMs: number = Date.now()): Date {
  const mx = new Date(ahoraMs - MX_OFFSET_MS);
  return new Date(Date.UTC(mx.getUTCFullYear(), mx.getUTCMonth(), mx.getUTCDate(), 0, 0, 0, 0) + MX_OFFSET_MS);
}

/**
 * Igual que leerSesionPersonal(), pero además hace cumplir el corte por
 * cambio de día: si la sesión se abrió un día calendario (México) distinto
 * al de hoy, se trata como inválida — se cierra su StaffLoginSession (si
 * seguía abierta) con closedBy DATE_ROLLOVER y checkOut al final de aquel
 * día, se borra la cookie, y se regresa null (obliga a un PIN nuevo). Esto
 * corre en cada request que pasa por el layout del tenant o por
 * resolverActor, así que el corte se aplica sin importar si el empleado
 * dejó la pestaña abierta toda la noche o nunca presionó "Cambiar de
 * usuario": la PRÓXIMA vez que esa sesión intente usarse, para lo que sea,
 * se cierra sola antes de dejarlo pasar.
 */
export async function verificarSesionPersonalVigente(): Promise<SesionPersonal | null> {
  const sesion = await leerSesionPersonal();
  if (!sesion) return null;

  // Cookie firmada antes de que existieran loginSessionId/loginAt (sesión
  // abierta justo antes de este cambio) — no hay forma de reconstruir esos
  // datos, así que se trata como inválida y se obliga un solo re-login.
  if (typeof sesion.loginAt !== "number" || typeof sesion.loginSessionId !== "string") {
    await cerrarSesionPersonal();
    return null;
  }

  if (diaMX(sesion.loginAt) !== diaMX(Date.now())) {
    // updateMany + checkOut:null (en vez de update a secas) para no pisar
    // un cierre que ya haya ocurrido por otro camino — ej. el administrador
    // ya la había cerrado a mano desde el panel de asistencia antes de que
    // cambiara el día.
    await prisma.staffLoginSession.updateMany({
      where: { id: sesion.loginSessionId, checkOut: null },
      data: { checkOut: finDeDiaMX(sesion.loginAt), closedBy: "DATE_ROLLOVER" },
    });
    await cerrarSesionPersonal();
    return null;
  }

  // 2026-09-21, a petición de Carlos: si el administrador desactiva a un
  // empleado mientras ese empleado ya tenía la sesión de PIN abierta (a
  // media jornada), esa sesión no debe seguir viva hasta que cambie el día
  // — se corta en la SIGUIENTE acción que intente, aquí mismo. Antes de
  // este cambio, "Desactivar" en Personal solo bloqueaba abrir una sesión
  // NUEVA (ver iniciarSesionPersonalAction en acceso-personal-actions.ts);
  // una sesión ya abierta seguía funcionando sin límite hasta medianoche.
  //
  // 2026-09-29, a petición de Carlos (hueco de seguridad detectado): un
  // mismo empleado no debe poder tener más de una sesión de PIN abierta a
  // la vez. iniciarSesionPersonalAction cierra (closedBy NUEVO_LOGIN) la
  // fila de StaffLoginSession del dispositivo VIEJO en cuanto ese empleado
  // abre una sesión nueva desde OTRO dispositivo — así que si la fila que
  // corresponde a ESTA cookie ya no está abierta (checkOut != null), es
  // porque un login más nuevo la reemplazó en otro lado, y este dispositivo
  // debe quedar fuera aquí mismo, sin esperar a que expire su cookie de 12h.
  const [staff, loginSession] = await Promise.all([
    prisma.staff.findUnique({ where: { id: sesion.staffId }, select: { isActive: true, branch: { select: { isActive: true } } } }),
    prisma.staffLoginSession.findUnique({ where: { id: sesion.loginSessionId }, select: { checkOut: true } }),
  ]);

  if (!loginSession || loginSession.checkOut !== null) {
    await cerrarSesionPersonal();
    return null;
  }

  // Paso 5 (2026-10-08): una sucursal desactivada (por ejemplo al ajustar el
  // negocio a un plan menor) no puede seguir operando, aunque la ficha del
  // empleado siga activa — se trata igual que un empleado desactivado.
  if (!staff || !staff.isActive || !staff.branch.isActive) {
    await prisma.staffLoginSession.updateMany({
      where: { id: sesion.loginSessionId, checkOut: null },
      data: { checkOut: new Date(), closedBy: "STAFF_INACTIVO" },
    });
    await cerrarSesionPersonal();
    return null;
  }

  return sesion;
}
