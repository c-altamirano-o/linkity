"use client";

import { useEffect, useRef } from "react";

/**
 * Casilla de Cloudflare Turnstile para el registro (2026-10-08). Carga el
 * script de Cloudflare una sola vez y dibuja el widget; cuando la persona
 * pasa la verificación llama a `onToken` con el token (de un solo uso), y con
 * null si expira o falla. Sin NEXT_PUBLIC_TURNSTILE_SITE_KEY no dibuja nada
 * (el registro sigue protegido por el límite de intentos del servidor).
 * Para pedir un token nuevo (los tokens no se reutilizan) el padre cambia la
 * `key` del componente, que lo vuelve a montar.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
    __turnstileCargando?: Promise<void>;
  }
}

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

function cargarScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (window.__turnstileCargando) return window.__turnstileCargando;
  window.__turnstileCargando = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      window.__turnstileCargando = undefined;
      reject(new Error("No se pudo cargar Turnstile"));
    };
    document.head.appendChild(s);
  });
  return window.__turnstileCargando;
}

export default function TurnstileWidget({ onToken }: { onToken: (token: string | null) => void }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !contenedor.current) return;
    let widgetId: string | null = null;
    let cancelado = false;

    cargarScript()
      .then(() => {
        if (cancelado || !contenedor.current || !window.turnstile) return;
        widgetId = window.turnstile.render(contenedor.current, {
          sitekey: TURNSTILE_SITE_KEY,
          language: "es",
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));

    return () => {
      cancelado = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, []);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={contenedor} className="flex justify-center" />;
}
