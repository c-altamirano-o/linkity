"use server";

import { getVentasPorDia, hoyMx, type VentasPorDiaData } from "@/lib/dashboard-data";
import { resolverActor } from "@/lib/actor";
import { verTodoNegocioParaRolPorNombre } from "@/lib/roles-server";
import { getTenantPrisma, prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

/**
 * Server Action del selector de fecha del Dashboard ("Ventas por día y
 * hora" — 2026-09-17, a petición de Carlos: ver el comentario largo en
 * lib/dashboard-data.ts). dashboard/page.tsx ya llama a getVentasPorDia
 * server-side para la carga inicial (fecha = hoy); este Action es para
 * cuando el dueño cambia la fecha desde DashboardClient.tsx después de esa
 * carga inicial, así que necesita su propio punto de entrada con
 * autenticación — igual que cualquier otro *-actions.ts del proyecto,
 * resuelto vía resolverActor (lib/actor.ts) en vez de confiar en un
 * tenantId que mandara el cliente.
 */
export async function obtenerVentasPorDiaAction(
  tenantSlug: string,
  fecha: string,
  // "Vista por sucursal" del Dashboard (2026-09-22) — cuando DashboardClient
  // está filtrado a una sucursal, el selector de fecha debe seguir
  // reflejando esa misma sucursal al cambiar de día, no el negocio
  // completo. Se revalida contra la BD (nunca se confía en que el branchId
  // que manda el cliente de verdad pertenezca a este tenant), mismo
  // criterio que puedeOperarSucursal en el resto del proyecto.
  branchId?: string
): Promise<{ ok: true; data: VentasPorDiaData } | { ok: false; error: string }> {
  const resuelto = await resolverActor(tenantSlug, "dashboard");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ok: false, error: "Fecha inválida" };
  }

  // No se aceptan fechas futuras — se recorta a hoy (México) en vez de
  // rechazar con error, para que un reloj de cliente ligeramente adelantado
  // no le muestre un error al dueño sin necesidad.
  const hoy = hoyMx();
  const fechaFinal = fecha > hoy ? hoy : fecha;

  try {
    // 2026-09-24, corrigiendo el mismo hueco que dashboard/page.tsx (ver el
    // comentario largo ahí): este Action confiaba en el branchId que
    // mandara el cliente sin verificar que de verdad fuera el suyo — un
    // empleado de PIN sin Role.verTodoNegocio podía, en teoría, pedir los
    // datos de OTRA sucursal con solo cambiar este parámetro (la pantalla
    // ya no se lo ofrece, pero el Action en sí no lo impedía). Mismo
    // criterio que caja/page.tsx: para él, el servidor IGNORA el branchId
    // que mande y siempre usa el suyo propio.
    let branchIdPedido = branchId;
    if (resuelto.actor === "staff") {
      const veTodoElNegocio = await verTodoNegocioParaRolPorNombre(resuelto.tenant.id, resuelto.roleName);
      branchIdPedido = veTodoElNegocio ? branchId : (resuelto.branchId ?? undefined);
    }

    let branchIdValidado: string | undefined;
    if (branchIdPedido) {
      const db = getTenantPrisma(resuelto.tenant.id);
      const branch = await db.branch.findUnique({ where: { id: branchIdPedido }, select: { id: true } });
      branchIdValidado = branch?.id;
    }

    const data = await getVentasPorDia(resuelto.tenant.id, fechaFinal, branchIdValidado);
    return { ok: true, data };
  } catch (err) {
    console.error("obtenerVentasPorDiaAction", err);
    return { ok: false, error: "No se pudo obtener la información de ese día" };
  }
}

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
