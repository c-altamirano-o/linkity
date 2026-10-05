"use server";

import { getTenantPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { resolverActor, type ActorResult } from "@/lib/actor";

/**
 * Server Actions del panel de Asistencia por login (2026-09-16). Ver el
 * comentario largo en StaffLoginSession (schema.prisma) y en
 * lib/asistencia.ts para el contexto completo — este archivo solo agrega
 * la única acción que necesita el panel: que el administrador pueda cerrar
 * a mano un registro que sigue "abierto" (checkOut null) antes de que el
 * cierre automático por cambio de día lo haga solo.
 *
 * Nota importante: esto cierra la FILA de asistencia (para que el reporte
 * no muestre a alguien "adentro" indefinidamente), pero NO puede forzar el
 * cierre de la sesión real del empleado en su dispositivo — la cookie de
 * PIN (lib/staff-auth.ts) vive solo en el navegador de esa persona, este
 * servidor no tiene forma de invalidarla a distancia. Si el empleado sigue
 * usando el sistema después de esto, la próxima acción que haga (cualquier
 * módulo) simplemente abre solo un registro nuevo de asistencia — no se
 * queda "sin sesión".
 */

async function resolverTenantYUsuario(tenantSlug: string): Promise<ActorResult> {
  return resolverActor(tenantSlug, "asistencia");
}

export type AccionAsistenciaResult = { ok: true } | { ok: false; error: string };

export async function cerrarAsistenciaManualAction(
  params: { tenantSlug: string; registroId: string }
): Promise<AccionAsistenciaResult> {
  const { tenantSlug, registroId } = params;

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const registro = await db.staffLoginSession.findUnique({
      where: { id: registroId },
      select: { id: true, checkOut: true },
    });
    if (!registro) return { ok: false, error: "Registro no encontrado" };
    if (registro.checkOut) return { ok: false, error: "Este registro ya estaba cerrado" };

    await db.staffLoginSession.update({
      where: { id: registroId },
      data: { checkOut: new Date(), closedBy: "MANUAL" },
    });

    revalidatePath(`/${tenantSlug}/asistencia`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al cerrar asistencia manualmente:", err);
    return { ok: false, error: "No se pudo cerrar el registro" };
  }
}

/**
 * Corrige a mano la hora de entrada/salida de un registro de
 * StaffLoginSession (2026-10-05, a petición de Carlos tras la auditoría):
 * antes, la única acción disponible era "Cerrar ahora" (forzar checkOut al
 * momento actual) — no había forma de arreglar una hora capturada mal (ej.
 * el empleado tecleó su PIN a una hora distinta de la real, o un
 * "Cerrar ahora" previo dejó una salida incorrecta). Mismo guard de acceso
 * que el resto de este archivo (resolverActor con "asistencia" —
 * admin-only). checkOut en null vuelve a dejar la sesión "abierta" (mismo
 * estado que antes de cualquier cierre) — uso deliberado para cuando el
 * cierre anterior (manual o automático) también estaba equivocado.
 */
export async function editarAsistenciaLoginAction(params: {
  tenantSlug: string;
  registroId: string;
  checkIn: string; // ISO — StaffLoginSession.checkIn nunca es null.
  checkOut: string | null; // ISO, o null para dejarla "sigue dentro".
}): Promise<AccionAsistenciaResult> {
  const { tenantSlug, registroId, checkIn, checkOut } = params;

  const fechaCheckIn = new Date(checkIn);
  if (Number.isNaN(fechaCheckIn.getTime())) return { ok: false, error: "La hora de entrada no es válida" };

  let fechaCheckOut: Date | null = null;
  if (checkOut) {
    fechaCheckOut = new Date(checkOut);
    if (Number.isNaN(fechaCheckOut.getTime())) return { ok: false, error: "La hora de salida no es válida" };
    if (fechaCheckOut < fechaCheckIn) return { ok: false, error: "La hora de salida no puede ser antes que la de entrada" };
  }

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const registro = await db.staffLoginSession.findUnique({ where: { id: registroId }, select: { id: true } });
    if (!registro) return { ok: false, error: "Registro no encontrado" };

    await db.staffLoginSession.update({
      where: { id: registroId },
      data: {
        checkIn: fechaCheckIn,
        checkOut: fechaCheckOut,
        closedBy: fechaCheckOut ? "MANUAL" : null,
      },
    });

    revalidatePath(`/${tenantSlug}/asistencia`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al corregir el registro de asistencia por PIN:", err);
    return { ok: false, error: "No se pudo corregir el registro" };
  }
}
