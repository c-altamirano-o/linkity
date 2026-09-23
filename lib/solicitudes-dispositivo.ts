import "server-only";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { crearNotificacionDispositivo } from "@/lib/notificaciones";

/**
 * Crea una SolicitudDispositivo nueva y dispara su aviso (panel + push) —
 * ver el comentario largo en SolicitudDispositivo, schema.prisma. Llamada
 * ÚNICAMENTE desde iniciarSesionPersonalAction (acceso-personal-actions.ts)
 * cuando un PIN correcto llega desde un navegador sin confianza para esa
 * sucursal — nunca directo desde el cliente (por eso vive en lib/, no en
 * app/actions/, donde si sería invocable por RPC).
 *
 * No hay deduplicación entre solicitudes: si el empleado cancela la espera
 * y vuelve a intentar, se crea una segunda fila — la primera simplemente
 * vence sola a los 10 minutos (EXPIRACION_SOLICITUD_MS,
 * lib/dispositivos-confianza.ts) sin que nadie tenga que limpiarla a mano.
 */
export async function crearSolicitudDispositivo(params: {
  tenantId: string;
  tenantSlug: string;
  branchId: string;
  branchName: string;
  userAgent?: string | null;
}): Promise<string> {
  const { tenantId, tenantSlug, branchId, branchName, userAgent } = params;

  const token = randomBytes(24).toString("base64url");
  const solicitud = await prisma.solicitudDispositivo.create({
    data: { tenantId, branchId, token, userAgent: userAgent || undefined },
  });

  await crearNotificacionDispositivo({
    tenantId,
    tenantSlug,
    branchId,
    branchName,
    solicitudDispositivoId: solicitud.id,
  });

  return token;
}
