"use server";

import { prisma } from "@/lib/prisma";
import { resolverActor } from "@/lib/actor";

/**
 * Suscripción de notificaciones push del navegador del administrador — ver
 * el comentario largo en PushSubscription, schema.prisma, y en lib/push.ts.
 * Mismo criterio de validación que el resto de Configuración: solo el
 * administrador dueño de la cuenta (resolverActor con "configuracion" —
 * ningún rol de empleado con PIN tiene ese módulo en su matriz de acceso),
 * porque quien recibe estas notificaciones es quien AUTORIZA dispositivos
 * nuevos, nunca un empleado.
 */

export type AccionPushResult = { ok: true } | { ok: false; error: string };

export async function guardarSuscripcionPushAction(params: {
  tenantSlug: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<AccionPushResult> {
  const { tenantSlug, endpoint, p256dh, auth, userAgent } = params;
  if (!endpoint || !p256dh || !auth) return { ok: false, error: "Suscripción incompleta" };

  const resuelto = await resolverActor(tenantSlug, "configuracion");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  try {
    // upsert por endpoint (único): si el navegador ya estaba suscrito
    // (ej. volvió a activar el permiso), se actualizan sus llaves en vez de
    // duplicar la fila.
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { tenantId: resuelto.tenant.id, userId: resuelto.dbUser.id, endpoint, p256dh, auth, userAgent },
      update: { tenantId: resuelto.tenant.id, userId: resuelto.dbUser.id, p256dh, auth, userAgent },
    });
    return { ok: true };
  } catch (error) {
    console.error("Error al guardar la suscripción push:", error);
    return { ok: false, error: "No se pudo activar las notificaciones" };
  }
}

export async function eliminarSuscripcionPushAction(params: {
  tenantSlug: string;
  endpoint: string;
}): Promise<AccionPushResult> {
  const { tenantSlug, endpoint } = params;
  const resuelto = await resolverActor(tenantSlug, "configuracion");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  try {
    await prisma.pushSubscription.deleteMany({ where: { tenantId: resuelto.tenant.id, endpoint } });
    return { ok: true };
  } catch (error) {
    console.error("Error al desactivar la suscripción push:", error);
    return { ok: false, error: "No se pudo desactivar las notificaciones" };
  }
}
