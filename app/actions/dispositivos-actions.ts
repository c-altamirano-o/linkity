"use server";

import { prisma } from "@/lib/prisma";
import { resolverActor } from "@/lib/actor";
import { crearConfianzaDispositivo, EXPIRACION_SOLICITUD_MS } from "@/lib/dispositivos-confianza";

/**
 * Server Actions del lado cliente para autorizar dispositivos nuevos por
 * sucursal — ver el comentario largo en SolicitudDispositivo,
 * schema.prisma, y en lib/solicitudes-dispositivo.ts (que crea la
 * solicitud; este archivo solo la consulta/resuelve/lista).
 */

export type EstadoSolicitud = "pendiente" | "aprobado" | "rechazado" | "expirado";
export type ConsultaSolicitudResult = { ok: true; estado: EstadoSolicitud } | { ok: false; error: string };

/**
 * Llamada en polling por el navegador que está esperando (el que no tiene
 * confianza todavía) — nunca requiere sesión, solo el token opaco que
 * únicamente ese navegador conoce (ver el comentario de "token" en
 * SolicitudDispositivo, schema.prisma: separado del id a propósito).
 * Cuando el estado es "aprobado", esta misma llamada deja ya la cookie de
 * confianza puesta en ESTE navegador (crearConfianzaDispositivo) — el
 * cliente, al ver "aprobado", solo necesita reintentar el login con el PIN
 * que ya tenía en memoria.
 */
export async function consultarSolicitudDispositivoAction(token: string): Promise<ConsultaSolicitudResult> {
  if (!token) return { ok: false, error: "Falta el token" };

  const solicitud = await prisma.solicitudDispositivo.findUnique({ where: { token } });
  if (!solicitud) return { ok: false, error: "Solicitud no encontrada" };

  if (solicitud.status === "PENDIENTE" && Date.now() - solicitud.createdAt.getTime() > EXPIRACION_SOLICITUD_MS) {
    await prisma.solicitudDispositivo.update({
      where: { id: solicitud.id },
      data: { status: "EXPIRADO", resueltoEn: new Date() },
    });
    return { ok: true, estado: "expirado" };
  }

  if (solicitud.status === "APROBADO") {
    await crearConfianzaDispositivo(solicitud.tenantId, solicitud.branchId);
    return { ok: true, estado: "aprobado" };
  }
  if (solicitud.status === "RECHAZADO") return { ok: true, estado: "rechazado" };
  if (solicitud.status === "EXPIRADO") return { ok: true, estado: "expirado" };
  return { ok: true, estado: "pendiente" };
}

/**
 * Aprobar/rechazar — desde el botón de la notificación en tiempo real
 * (TenantShell.tsx) o desde el listado de "Dispositivos pendientes" en
 * Configuración. Admin-only (resolverActor con "configuracion"): un
 * empleado con PIN nunca puede autorizar un dispositivo, ni el suyo
 * propio.
 */
export async function resolverSolicitudDispositivoAction(params: {
  tenantSlug: string;
  solicitudId: string;
  aprobar: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { tenantSlug, solicitudId, aprobar } = params;

  const resuelto = await resolverActor(tenantSlug, "configuracion");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  const solicitud = await prisma.solicitudDispositivo.findUnique({ where: { id: solicitudId } });
  if (!solicitud || solicitud.tenantId !== resuelto.tenant.id) {
    return { ok: false, error: "Solicitud no encontrada" };
  }
  if (solicitud.status !== "PENDIENTE") {
    return { ok: false, error: "Esta solicitud ya fue resuelta" };
  }

  await prisma.solicitudDispositivo.update({
    where: { id: solicitudId },
    data: {
      status: aprobar ? "APROBADO" : "RECHAZADO",
      resueltoEn: new Date(),
      resueltoPorId: resuelto.dbUser.id,
    },
  });

  return { ok: true };
}

export interface SolicitudPendienteUI {
  id: string;
  branchName: string;
  userAgent: string | null;
  fecha: string; // ISO
}

/**
 * Respaldo dentro de Configuración (2026-09-23, a petición de Carlos: para
 * cuando WhatsApp/push tarda o el administrador no trae el teléfono a la
 * mano) — mismo criterio de aprobar/rechazar que el botón de la
 * notificación, solo que consultado a demanda en vez de en vivo.
 */
export async function listarSolicitudesPendientesAction(
  tenantSlug: string
): Promise<{ ok: true; solicitudes: SolicitudPendienteUI[] } | { ok: false; error: string }> {
  const resuelto = await resolverActor(tenantSlug, "configuracion");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  const filas = await prisma.solicitudDispositivo.findMany({
    where: { tenantId: resuelto.tenant.id, status: "PENDIENTE" },
    include: { branch: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const vigentes = filas.filter((f) => Date.now() - f.createdAt.getTime() <= EXPIRACION_SOLICITUD_MS);

  return {
    ok: true,
    solicitudes: vigentes.map((f) => ({
      id: f.id,
      branchName: f.branch.name,
      userAgent: f.userAgent,
      fecha: f.createdAt.toISOString(),
    })),
  };
}
