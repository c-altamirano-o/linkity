"use server";

import { marcarNotificacionesLeidas } from "@/lib/notificaciones";
import { resolverActor } from "@/lib/actor";

/**
 * Se llama desde TenantShell.tsx al abrir la campanita — "dashboard" está
 * en el acceso de todo rol de PIN (ver roles-server.ts), así que se usa
 * como módulo de referencia para resolverActor aquí: no hay una acción de
 * negocio real detrás de esto que necesite un módulo más específico, solo
 * confirmar que hay una sesión válida de este tenant.
 */
export async function marcarNotificacionesLeidasAction(tenantSlug: string): Promise<void> {
  const resuelto = await resolverActor(tenantSlug, "dashboard");
  if (!resuelto.ok) return;
  await marcarNotificacionesLeidas(resuelto.tenant.id);
}
