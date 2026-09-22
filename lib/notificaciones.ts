import "server-only";

import { getTenantPrisma } from "@/lib/prisma";
import { NotificacionTipo } from "@prisma/client";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Capa de datos + envío del panel de notificaciones en tiempo real
 * (2026-09-22, a petición de Carlos: "un dueño [debe] recibir
 * notificaciones importantes"). Fase 1: apertura/cierre de caja — ver el
 * comentario largo junto al modelo Notificacion en schema.prisma.
 *
 * Cada aviso se guarda AQUÍ (persistido, sobrevive aunque nadie esté
 * viendo la pantalla en el momento) Y se manda por Supabase Realtime
 * Broadcast al canal `notificaciones:${tenantId}` para que cualquier panel
 * de administrador con ese canal abierto lo reciba al instante como
 * pop-up — ver el listener en components/tenant/TenantShell.tsx. El
 * realtime es un "avísame ahora si estoy viendo el panel", nunca la única
 * copia del aviso.
 */

export interface NotificacionUI {
  id: string;
  tipo: NotificacionTipo;
  mensaje: string;
  branchName: string | null;
  leida: boolean;
  fecha: string; // ISO
}

const LIMITE_NOTIFICACIONES = 30;

export async function getNotificaciones(tenantId: string): Promise<NotificacionUI[]> {
  const db = getTenantPrisma(tenantId);
  const rows = await db.notificacion.findMany({
    orderBy: { createdAt: "desc" },
    take: LIMITE_NOTIFICACIONES,
    include: { branch: { select: { name: true } } },
  });
  return rows.map((r: any) => ({
    id: r.id,
    tipo: r.tipo,
    mensaje: r.mensaje,
    branchName: r.branch?.name ?? null,
    leida: r.leida,
    fecha: r.createdAt.toISOString(),
  }));
}

export async function contarNotificacionesNoLeidas(tenantId: string): Promise<number> {
  const db = getTenantPrisma(tenantId);
  return db.notificacion.count({ where: { leida: false } });
}

/**
 * Se llama al abrir la campanita en TenantShell.tsx — mismo criterio que
 * la mayoría de apps de notificaciones (Gmail, Slack: abrir la lista ya
 * cuenta como "vista"), no hace falta un botón aparte ni marcar una por
 * una para esta primera versión.
 */
export async function marcarNotificacionesLeidas(tenantId: string): Promise<void> {
  const db = getTenantPrisma(tenantId);
  await db.notificacion.updateMany({ where: { leida: false }, data: { leida: true } });
}

/**
 * Crea el aviso de apertura/cierre de caja y lo transmite en vivo.
 *
 * Canal PÚBLICO, sin autenticación por RLS (simplificación consciente para
 * esta primera fase): el nombre del canal incluye el tenantId (un cuid no
 * adivinable) y lo que viaja ahí es información operativa de bajo riesgo
 * que cualquier empleado logueado en ese negocio ya puede ver de todos
 * modos (que se abrió/cerró una caja, en qué sucursal, con qué monto). Si
 * más adelante se quiere blindar con canales privados + políticas RLS
 * sobre realtime.messages, es un cambio aislado a este archivo y al
 * listener del cliente — no toca el resto del sistema.
 *
 * Si el broadcast en vivo falla (Realtime caído, red, etc.) el aviso YA
 * quedó guardado — no se revierte ni se le hace fallar la acción que lo
 * disparó (abrirCajaAction/cerrarCajaAction): quien no lo vea aparecer al
 * instante lo verá igual la próxima vez que abra la campanita.
 */
export async function crearNotificacionCaja(params: {
  tenantId: string;
  branchId: string;
  branchName: string;
  tipo: typeof NotificacionTipo.CAJA_ABIERTA | typeof NotificacionTipo.CAJA_CERRADA;
  mensaje: string;
}): Promise<void> {
  const { tenantId, branchId, branchName, tipo, mensaje } = params;
  const db = getTenantPrisma(tenantId);

  const notificacion = await db.notificacion.create({
    data: { tenantId, branchId, tipo, mensaje },
  });

  try {
    const supabase = createAdminClient();
    await supabase.channel(`notificaciones:${tenantId}`).send({
      type: "broadcast",
      event: tipo === NotificacionTipo.CAJA_ABIERTA ? "caja_abierta" : "caja_cerrada",
      payload: {
        id: notificacion.id,
        mensaje,
        branchName,
        fecha: notificacion.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("No se pudo enviar el broadcast de notificación (el aviso ya quedó guardado):", err);
  }
}
