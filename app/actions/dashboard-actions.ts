"use server";

import { resolverActor } from "@/lib/actor";
import { verTodoNegocioParaRolPorNombre } from "@/lib/roles-server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

// 2026-09-28: obtenerVentasPorDiaAction (el selector de un solo día de
// "Ventas por día y hora") se quitó de aquí — esa sección ahora usa el
// mismo selector de periodo que el resto del Dashboard (ver el comentario
// largo junto a DashboardData.ventasPorHora, lib/dashboard-data.ts), así
// que ya no necesita su propio Action ni recarga vía AJAX.

export interface CategoriaDashboardConfigInput {
  name: string;
  color: string;
  visible: boolean;
}

/**
 * Guarda la config de "qué categorías se muestran en la gráfica de pastel
 * del Dashboard y de qué color" — 2026-09-22, pendiente registrado: antes
 * el modal de configuración (abrirConfig/guardarConfig en
 * DashboardClient.tsx) solo cambiaba un useState, así que se perdía cada
 * vez que se recargaba la página. Ver el comentario largo en
 * Tenant.dashboardCategoriasConfig (schema.prisma) y aplicarConfigCategorias
 * (lib/dashboard-data.ts) para el porqué del formato y de guardar por
 * NOMBRE en vez de por id de Category.
 *
 * Se guarda en Tenant directo (no getTenantPrisma): Tenant es la entidad
 * raíz, mismo criterio ya documentado en lib/prisma.ts para
 * updateThemePreset/updateBusinessType — no tiene sentido "escoparlo a sí
 * mismo", y resolverActor ya deja tenant.id validado/confiable.
 *
 * 2026-09-24, a petición de Carlos (revisión de permisos): esta config es
 * COMPARTIDA por todo el negocio — un solo Tenant.dashboardCategoriasConfig,
 * no una por empleado — así que aunque no expone dinero, dejar que
 * CUALQUIER empleado con el módulo "dashboard" (que es prácticamente todos,
 * ver modulosPermitidosParaRol en lib/roles-server.ts) la cambiara
 * significaba que un empleado de mostrador podía alterar lo que ve el dueño
 * y el resto del equipo. Ahora exige lo mismo que Reportes/Caja/
 * Inventario/Sucursales para "ver todo el negocio": administrador, o
 * empleado con Role.verTodoNegocio ("Supervisor de Sucursales").
 */
export async function guardarConfigCategoriasDashboardAction(
  tenantSlug: string,
  config: CategoriaDashboardConfigInput[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resuelto = await resolverActor(tenantSlug, "dashboard");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  if (resuelto.actor === "staff") {
    const veTodoElNegocio = await verTodoNegocioParaRolPorNombre(resuelto.tenant.id, resuelto.roleName);
    if (!veTodoElNegocio) {
      return { ok: false, error: "No tienes acceso a esta función" };
    }
  }

  if (!Array.isArray(config) || config.some((c) => typeof c?.name !== "string" || typeof c?.color !== "string" || typeof c?.visible !== "boolean")) {
    return { ok: false, error: "Configuración de categorías inválida" };
  }
  // Mismo límite de 6 visibles que ya impone el modal en DashboardClient.tsx
  // (toggleCategoria) — se revalida aquí también, nunca confiando solo en
  // que el cliente lo haya respetado.
  if (config.filter((c) => c.visible).length > 6) {
    return { ok: false, error: "Solo puedes mostrar hasta 6 categorías" };
  }

  try {
    await prisma.tenant.update({
      where: { id: resuelto.tenant.id },
      // Prisma tipa el input de un campo Json? contra InputJsonValue, y TS no
      // reconoce por estructura que un array de nuestra interfaz
      // (CategoriaDashboardConfigInput[]) cae dentro de ese tipo (falla
      // comparándolo contra InputJsonObject, no contra InputJsonArray) —
      // el cast es solo para el checker; en tiempo de ejecución sigue siendo
      // el mismo array, ya validado arriba campo por campo.
      data: { dashboardCategoriasConfig: config as unknown as Prisma.InputJsonValue },
    });
    revalidatePath(`/${tenantSlug}/dashboard`);
    return { ok: true };
  } catch (err) {
    console.error("guardarConfigCategoriasDashboardAction", err);
    return { ok: false, error: "No se pudo guardar la configuración" };
  }
}
