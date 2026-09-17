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
