import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";

/**
 * Notificaciones push del navegador (Web Push estándar — VAPID), 2026-09-23
 * a petición de Carlos: "que le suene el teléfono aunque no tenga nada
 * abierto", sin depender de WhatsApp/Meta ni de ninguna cuenta de terceros.
 * Web Push es una función nativa de los navegadores modernos — funciona
 * directo en Chrome/Edge/Firefox de escritorio y en Android; en iPhone,
 * Apple exige que la página esté agregada a la pantalla de inicio antes de
 * que el permiso de notificaciones funcione en segundo plano (ver el botón
 * "Activar notificaciones" en Configuración, donde se explica el paso a
 * paso de cada sistema operativo).
 *
 * Las llaves VAPID (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY) las genera Carlos
 * una sola vez, él mismo, con `npx web-push generate-vapid-keys` — no hace
 * falta ninguna cuenta externa ni aprobación de nadie (a diferencia de
 * WhatsApp Business, esto es 100% de Linkity). La pública también se
 * expone al navegador vía NEXT_PUBLIC_VAPID_PUBLIC_KEY (mismo valor que
 * VAPID_PUBLIC_KEY) para que el propio navegador pueda suscribirse.
 *
 * Sin las llaves configuradas, este módulo no truena: enviarPush() se
 * vuelve un no-op silencioso (igual que los canales de
 * lib/notificaciones-suscripcion.ts cuando faltan sus variables) — así el
 * resto del sistema (la solicitud de dispositivo en sí, el aviso dentro del
 * panel) sigue funcionando aunque Carlos todavía no haya configurado esto.
 */

let vapidConfigurado = false;

function asegurarVapid(): boolean {
  if (vapidConfigurado) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:soporte@linkitysoluciones.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigurado = true;
  return true;
}

export interface PayloadPush {
  title: string;
  body: string;
  url?: string; // a dónde navegar si tocan la notificación — ver public/sw.js
}

/**
 * Manda un push a TODAS las suscripciones guardadas de un tenant (todos
 * los dispositivos donde algún administrador activó notificaciones).
 * Nunca lanza: cada suscripción se intenta por separado, y una que ya no
 * sirve (el navegador la revocó, el usuario desinstaló, etc. — status 404
 * o 410 de vuelta) se borra sola de la base para no seguir intentando
 * mandarle algo a un endpoint muerto en cada aviso futuro.
 */
export async function enviarPushTenant(tenantId: string, payload: PayloadPush): Promise<void> {
  if (!asegurarVapid()) {
    console.warn("⚠️  VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY no configurados — no se manda push (el aviso dentro del panel sigue funcionando).");
    return;
  }

  const suscripciones = await prisma.pushSubscription.findMany({ where: { tenantId } });
  if (suscripciones.length === 0) return;

  const cuerpo = JSON.stringify(payload);

  await Promise.all(
    suscripciones.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          cuerpo
        );
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          // Suscripción muerta (el navegador la revocó) — se borra para no
          // reintentar para siempre contra un endpoint que ya no existe.
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error(`❌ Error mandando push (suscripción ${sub.id}):`, err);
        }
      }
    })
  );
}
