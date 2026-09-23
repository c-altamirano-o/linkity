// Service worker de Linkity — 2026-09-23.
//
// Dos trabajos, y nada más (deliberadamente mínimo): recibir las
// notificaciones push que manda lib/push.ts (enviarPushTenant) y abrir/enfocar
// la pestaña correcta cuando el administrador toca la notificación. NO cachea
// nada todavía — no es un service worker "offline-first". Si más adelante se
// empaqueta como app de escritorio/Store (ver el comentario en manifest.json),
// ese cacheo se puede agregar aquí sin tocar el resto de este archivo.
//
// Se registra desde el cliente en app/actions o en el componente de
// "Activar notificaciones en este dispositivo" (Configuración) — ver
// components/tenant/ActivarNotificacionesPush.tsx.

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let datos;
  try {
    datos = event.data.json();
  } catch {
    datos = { title: "Linkity", body: event.data.text() };
  }

  const titulo = datos.title || "Linkity";
  const opciones = {
    body: datos.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: datos.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      // Si ya hay una pestaña de Linkity abierta, la reutiliza (y navega ahí
      // dentro) en vez de abrir una pestaña nueva — evita que se acumulen
      // pestañas duplicadas cada vez que llega un push.
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      }

      await self.clients.openWindow(url);
    })()
  );
});
