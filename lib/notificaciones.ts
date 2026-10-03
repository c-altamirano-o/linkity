import "server-only";

import { getTenantPrisma } from "@/lib/prisma";
import { NotificacionTipo } from "@prisma/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarPushTenant } from "@/lib/push";

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
  // Solo en tipo DISPOSITIVO_PENDIENTE — ver el comentario largo junto a
  // Notificacion.solicitudDispositivoId, schema.prisma.
  solicitudDispositivoId: string | null;
  // 2026-10-03, corrigiendo un bug reportado por Carlos: "le doy aprobar y
  // me dice que ya fue aprobada, pero sigue apareciendo como alerta". La
  // campanita se llena aquí desde los últimos 30 Notificacion de la BD, sin
  // importar si la SolicitudDispositivo detrás de un DISPOSITIVO_PENDIENTE
  // ya se resolvió hace rato (desde otra pestaña, otro día, u otro
  // administrador) — por eso un aviso viejo YA aprobado/rechazado podía
  // seguir mostrando los botones "Aprobar"/"Rechazar" en cada recarga de
  // página. Este campo trae el estado real de la solicitud para que
  // TenantShell.tsx pueda ocultar los botones desde el primer render, no
  // solo después de que alguien intente usarlos y falle. false cuando el
  // tipo de notificación no es DISPOSITIVO_PENDIENTE (no aplica).
  solicitudResuelta: boolean;
  // A dónde navegar al dar clic (ver el comentario largo junto a
  // Notificacion.url, schema.prisma) — null = no es clicable.
  url: string | null;
}

const LIMITE_NOTIFICACIONES = 30;

export async function getNotificaciones(tenantId: string): Promise<NotificacionUI[]> {
  const db = getTenantPrisma(tenantId);
  const rows = await db.notificacion.findMany({
    orderBy: { createdAt: "desc" },
    take: LIMITE_NOTIFICACIONES,
    include: {
      branch: { select: { name: true } },
      // Trae el estado actual de la solicitud (ver el comentario de
      // `solicitudResuelta` en NotificacionUI, arriba) — select mínimo,
      // nunca se necesita el resto de la fila aquí.
      solicitudDispositivo: { select: { status: true } },
    },
  });
  return rows.map((r: any) => ({
    id: r.id,
    tipo: r.tipo,
    mensaje: r.mensaje,
    branchName: r.branch?.name ?? null,
    leida: r.leida,
    fecha: r.createdAt.toISOString(),
    solicitudDispositivoId: r.solicitudDispositivoId ?? null,
    solicitudResuelta: r.solicitudDispositivo ? r.solicitudDispositivo.status !== "PENDIENTE" : false,
    url: r.url ?? null,
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
 * Crea un aviso de caja (apertura/cierre — Fase 1, o incumplimiento de
 * horario — Fase 2, ver lib/horarios-sucursal.ts) y lo transmite en vivo.
 * El nombre del evento de broadcast sale directo del propio tipo en
 * minúsculas ("CAJA_ABIERTA" → "caja_abierta"), así que agregar un nuevo
 * NotificacionTipo no requiere tocar el mapeo de eventos aquí ni en
 * TenantShell.tsx — cada tipo nuevo solo necesita su propio ícono/color en
 * ese archivo.
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
 * quedó guardado — no se revierte ni se le hace fallar quien lo disparó
 * (abrirCajaAction/cerrarCajaAction, o el cron de horarios): quien no lo
 * vea aparecer al instante lo verá igual la próxima vez que abra la
 * campanita.
 */
export async function crearNotificacionCaja(params: {
  tenantId: string;
  branchId: string;
  branchName: string;
  tipo: NotificacionTipo;
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
      event: tipo.toLowerCase(),
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

/**
 * Aviso de "dispositivo pidiendo autorización" (2026-09-23, a petición de
 * Carlos) — a diferencia de crearNotificacionCaja (arriba), este SÍ trae
 * una acción (Aprobar/Rechazar, ver solicitudDispositivoId) y además
 * dispara una notificación push (lib/push.ts) a todos los dispositivos
 * donde algún administrador la haya activado, para que le suene el
 * teléfono aunque no tenga el panel abierto en ese momento — el aviso
 * dentro del panel y el push son dos entregas independientes del MISMO
 * evento, ninguna depende de que la otra funcione.
 */
export async function crearNotificacionDispositivo(params: {
  tenantId: string;
  tenantSlug: string;
  branchId: string;
  branchName: string;
  solicitudDispositivoId: string;
}): Promise<void> {
  const { tenantId, tenantSlug, branchId, branchName, solicitudDispositivoId } = params;
  const db = getTenantPrisma(tenantId);
  const mensaje = `Un dispositivo nuevo pide entrar en ${branchName} — apruébalo si eres tú o tu personal.`;

  const notificacion = await db.notificacion.create({
    data: { tenantId, branchId, tipo: NotificacionTipo.DISPOSITIVO_PENDIENTE, mensaje, solicitudDispositivoId },
  });

  try {
    const supabase = createAdminClient();
    await supabase.channel(`notificaciones:${tenantId}`).send({
      type: "broadcast",
      event: "dispositivo_pendiente",
      payload: {
        id: notificacion.id,
        mensaje,
        branchName,
        fecha: notificacion.createdAt.toISOString(),
        solicitudDispositivoId,
      },
    });
  } catch (err) {
    console.error("No se pudo enviar el broadcast de dispositivo pendiente (el aviso ya quedó guardado):", err);
  }

  await enviarPushTenant(tenantId, {
    title: "Nuevo dispositivo pidiendo entrar",
    body: mensaje,
    url: `/${tenantSlug}/configuracion?dispositivos=1`,
  }).catch((err) => console.error("No se pudo enviar el push de dispositivo pendiente:", err));
}

/**
 * Alerta de taller hacia Aduana/Recepción/Tienda (2026-10-01, "Capa 1" del
 * sistema de alertas — a petición de Carlos, tras notar que la alerta de un
 * técnico (enviarAlertaTallerAction, reparaciones-actions.ts) solo quedaba
 * en el Historial de la reparación sin avisarle a nadie en realidad). Mismo
 * criterio que crearNotificacionDispositivo (arriba): persistida + broadcast
 * en vivo + push al teléfono, para que de verdad no dependa de que alguien
 * esté viendo la pantalla justo en ese momento. A propósito tenant-wide, sin
 * filtrar por rol (mismo criterio ya usado por CAJA_* / DISPOSITIVO_PENDIENTE
 * — este sistema de notificaciones no filtra por rol para ningún tipo
 * todavía; ver el comentario largo en NotificacionTipo.ALERTA_TALLER,
 * schema.prisma, sobre por qué se decidió así para esta primera fase).
 * `url` apunta a Aduana (no a Reparaciones/Tienda) porque es el único rol
 * que puede de verdad ATENDER la alerta — asignar técnico, cambiar estatus,
 * ajustar costo/piezas cotizadas (ver el comentario largo en
 * app/(tenant)/[tenant]/aduana/page.tsx).
 */
export async function crearNotificacionAlertaTaller(params: {
  tenantId: string;
  tenantSlug: string;
  branchId: string;
  branchName: string;
  folio: string;
  mensaje: string;
}): Promise<void> {
  const { tenantId, tenantSlug, branchId, branchName, folio, mensaje } = params;
  const db = getTenantPrisma(tenantId);
  const texto = `Alerta de taller — ${folio}: ${mensaje}`;
  const url = `/${tenantSlug}/aduana?folio=${encodeURIComponent(folio)}`;

  const notificacion = await db.notificacion.create({
    data: { tenantId, branchId, tipo: NotificacionTipo.ALERTA_TALLER, mensaje: texto, url },
  });

  try {
    const supabase = createAdminClient();
    await supabase.channel(`notificaciones:${tenantId}`).send({
      type: "broadcast",
      event: "alerta_taller",
      payload: {
        id: notificacion.id,
        mensaje: texto,
        branchName,
        fecha: notificacion.createdAt.toISOString(),
        url,
      },
    });
  } catch (err) {
    console.error("No se pudo enviar el broadcast de alerta de taller (el aviso ya quedó guardado):", err);
  }

  await enviarPushTenant(tenantId, {
    title: `Alerta de taller — ${folio}`,
    body: mensaje,
    url,
  }).catch((err) => console.error("No se pudo enviar el push de alerta de taller:", err));
}
