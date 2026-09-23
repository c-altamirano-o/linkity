"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2, Smartphone, CheckCircle2 } from "lucide-react";
import { guardarSuscripcionPushAction, eliminarSuscripcionPushAction } from "@/app/actions/push-actions";

/**
 * "Activar notificaciones en este dispositivo" — Configuración, 2026-09-23.
 *
 * Fase 3 del flujo de autorización de dispositivos (ver el comentario largo
 * en SolicitudDispositivo, schema.prisma): esto es lo que le permite al
 * administrador recibir el aviso de "un empleado quiere entrar desde un
 * dispositivo nuevo" aunque el panel NO esté abierto en ese momento — la
 * notificación en vivo (TenantShell.tsx, Supabase Realtime) solo llega si la
 * pestaña ya está abierta.
 *
 * Deliberadamente sin cuenta externa ni aprobación de terceros (a diferencia
 * de la ruta de WhatsApp/Meta que se descartó): usa el Web Push estándar del
 * navegador (VAPID, ver lib/push.ts) — un solo par de llaves que Carlos
 * genera él mismo con `npx web-push generate-vapid-keys`.
 *
 * Cada botón "Activar" de este componente registra el service worker
 * (public/sw.js) y crea una suscripción NUEVA — por eso puede haber varias
 * PushSubscription para un mismo User (su celular, su compu — ver el
 * comentario en Tenant.pushSubscriptions, schema.prisma): cada dispositivo
 * se activa por separado, aquí mismo, desde ese dispositivo.
 */

// Conversión estándar de la llave pública VAPID (base64url) al formato
// Uint8Array que pide pushManager.subscribe — no hay atajo de la API del
// navegador para esto, así que es el mismo snippet que aparece en cualquier
// implementación de Web Push.
function llavePublicaComoUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Normalizado = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64Normalizado);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

type Estado =
  | "cargando"
  | "no-soportado"
  | "ios-necesita-instalar"
  | "sin-activar"
  | "activando"
  | "activo"
  | "desactivando"
  | "error";

export default function ActivarNotificacionesPush({ tenantSlug }: { tenantSlug: string }) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [mensajeError, setMensajeError] = useState("");

  useEffect(() => {
    let cancelado = false;

    (async () => {
      if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelado) setEstado("no-soportado");
        return;
      }

      // iOS exige que el sitio esté "agregado a la pantalla de inicio" antes
      // de que las notificaciones push funcionen en segundo plano (Safari
      // 16.4+) — sin eso, ni vale la pena ofrecer el botón de activar.
      const esIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
      const instalada =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;

      if (esIOS && !instalada) {
        if (!cancelado) setEstado("ios-necesita-instalar");
        return;
      }

      try {
        const registro = await navigator.serviceWorker.register("/sw.js");
        const suscripcionExistente = await registro.pushManager.getSubscription();
        if (!cancelado) setEstado(suscripcionExistente ? "activo" : "sin-activar");
      } catch {
        if (!cancelado) setEstado("sin-activar");
      }
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  const activar = async () => {
    setMensajeError("");
    setEstado("activando");
    try {
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        setMensajeError("Las notificaciones push todavía no están configuradas en el servidor.");
        setEstado("sin-activar");
        return;
      }

      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setMensajeError("No se concedió el permiso de notificaciones — puedes activarlo después desde los ajustes del navegador.");
        setEstado("sin-activar");
        return;
      }

      const registro = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const suscripcion = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: llavePublicaComoUint8Array(vapidPublicKey),
      });

      const json = suscripcion.toJSON();
      const resultado = await guardarSuscripcionPushAction({
        tenantSlug,
        endpoint: suscripcion.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        userAgent: navigator.userAgent,
      });

      if (!resultado.ok) {
        setMensajeError(resultado.error);
        setEstado("sin-activar");
        return;
      }

      setEstado("activo");
    } catch {
      setMensajeError("No se pudieron activar las notificaciones en este dispositivo.");
      setEstado("sin-activar");
    }
  };

  const desactivar = async () => {
    setMensajeError("");
    setEstado("desactivando");
    try {
      const registro = await navigator.serviceWorker.getRegistration("/sw.js");
      const suscripcion = await registro?.pushManager.getSubscription();
      if (suscripcion) {
        await eliminarSuscripcionPushAction({ tenantSlug, endpoint: suscripcion.endpoint });
        await suscripcion.unsubscribe();
      }
      setEstado("sin-activar");
    } catch {
      setMensajeError("No se pudieron desactivar las notificaciones en este dispositivo.");
      setEstado("activo");
    }
  };

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-5">
        Cuando un empleado intenta entrar desde un dispositivo que todavía no está autorizado en su sucursal, te
        avisamos aquí mismo en el panel — y, si activas esto, también con una notificación push directo en este
        dispositivo, aunque no tengas el panel abierto en ese momento.
      </p>

      <div className="rounded-lg border border-border bg-muted/40 p-3.5 mb-5">
        {estado === "cargando" && (
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Comprobando este dispositivo…
          </p>
        )}

        {estado === "no-soportado" && (
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <BellOff className="w-3.5 h-3.5 flex-shrink-0" />
            Este navegador no soporta notificaciones push. Puedes seguir aprobando dispositivos desde
            &quot;Dispositivos pendientes&quot; más abajo.
          </p>
        )}

        {estado === "ios-necesita-instalar" && (
          <div className="flex items-start gap-2">
            <Smartphone className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-xs text-foreground">
              En iPhone/iPad, antes de activar las notificaciones necesitas agregar Linkity a tu pantalla de inicio:
              toca el botón de <strong>compartir</strong> en Safari y elige <strong>&quot;Agregar a pantalla de inicio&quot;</strong>.
              Después abre Linkity desde ese ícono (no desde Safari) y vuelve aquí para activarlas.
            </p>
          </div>
        )}

        {(estado === "sin-activar" || estado === "activando") && (
          <button
            onClick={activar}
            disabled={estado === "activando"}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:opacity-90 text-primary-foreground text-xs font-medium rounded-lg transition-all disabled:opacity-50"
          >
            {estado === "activando" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
            {estado === "activando" ? "Activando…" : "Activar notificaciones en este dispositivo"}
          </button>
        )}

        {(estado === "activo" || estado === "desactivando") && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs font-medium text-emerald-600 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Notificaciones activas en este dispositivo
            </p>
            <button
              onClick={desactivar}
              disabled={estado === "desactivando"}
              className="text-xs font-medium text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
            >
              {estado === "desactivando" ? "Desactivando…" : "Desactivar aquí"}
            </button>
          </div>
        )}

        {mensajeError && <p className="text-xs font-medium text-red-600 mt-2">{mensajeError}</p>}
      </div>

      {/* Instrucciones para ambos sistemas, siempre visibles (2026-09-23, a
          petición explícita de Carlos: "hay que dejar las instrucciones
          para ambos sistemas, no podemos ser exclusivos de un OS") — el
          administrador puede repetir esta activación desde su celular
          (Android o iPhone) además de la compu del negocio. */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-border p-3.5">
          <p className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
            <BellRing className="w-3.5 h-3.5 text-primary" /> En Android
          </p>
          <p className="text-[11.5px] text-muted-foreground leading-relaxed">
            Abre este panel desde Chrome o Edge y toca &quot;Activar notificaciones en este dispositivo&quot; —
            no necesitas instalar nada primero.
          </p>
        </div>
        <div className="rounded-lg border border-border p-3.5">
          <p className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-primary" /> En iPhone / iPad
          </p>
          <p className="text-[11.5px] text-muted-foreground leading-relaxed">
            Primero agrega Linkity a tu pantalla de inicio desde Safari (botón compartir →
            &quot;Agregar a pantalla de inicio&quot;), ábrelo desde ese ícono, y ahí sí activa las notificaciones.
          </p>
        </div>
      </div>
    </div>
  );
}
