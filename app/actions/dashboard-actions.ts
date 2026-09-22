"use server";

import { getVentasPorDia, hoyMx, type VentasPorDiaData } from "@/lib/dashboard-data";
import { resolverActor } from "@/lib/actor";
import { getTenantPrisma, prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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
    let branchIdValidado: string | undefined;
    if (branchId) {
      const db = getTenantPrisma(resuelto.tenant.id);
      const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true } });
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
 */
export async function guardarConfigCategoriasDashboardAction(
  tenantSlug: string,
  config: CategoriaDashboardConfigInput[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resuelto = await resolverActor(tenantSlug, "dashboard");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

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
      data: { dashboardCategoriasConfig: config },
    });
    revalidatePath(`/${tenantSlug}/dashboard`);
    return { ok: true };
  } catch (err) {
    console.error("guardarConfigCategoriasDashboardAction", err);
    return { ok: false, error: "No se pudo guardar la configuración" };
  }
}
