import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Estado real de los 5 pasos del checklist de "primeros pasos"
 * (BienvenidaClient.tsx / app/(tenant)/[tenant]/bienvenida) — un solo
 * lugar que calcula qué tan armado está un negocio, para que
 * bienvenida/page.tsx (el checklist completo) y TenantLayout.tsx/
 * TenantShell.tsx (el atajo "Primeros pasos" visible desde cualquier
 * módulo, 2026-09-29 a petición de Carlos: "si das de alta artículos, ya
 * no tienes como regresar a la checklist de primeros pasos") usen
 * exactamente el mismo criterio. Antes de esto, cada uno calculaba su
 * propia versión — así fue como pasó el bug real que Carlos encontró el
 * mismo día (Paso 1 comparaba contra NEUTRAL_TECH, que nunca fue el
 * default real de Tenant.themePreset).
 *
 * Nota: si Tenant.themePreset (schema.prisma) cambia de default otra vez
 * en el futuro, este es el ÚNICO lugar que hay que actualizar.
 */
export interface EstadoPasosBienvenida {
  personalizado: boolean;
  tieneCatalogo: boolean;
  tieneEquipo: boolean;
  tieneCaja: boolean;
  tieneVenta: boolean;
  completados: number;
  total: number;
}

export async function obtenerEstadoPasosBienvenida(
  tenantId: string,
  themePreset: string
): Promise<EstadoPasosBienvenida> {
  const [productCount, staffCount, cashSessionCount, saleCount] = await Promise.all([
    prisma.product.count({ where: { tenantId } }),
    prisma.staff.count({ where: { tenantId } }),
    prisma.cashSession.count({ where: { tenantId } }),
    prisma.sale.count({ where: { tenantId } }),
  ]);

  const personalizado = themePreset !== "MATERIAL_INDIGO";
  const tieneCatalogo = productCount > 0;
  const tieneEquipo = staffCount > 0;
  const tieneCaja = cashSessionCount > 0;
  const tieneVenta = saleCount > 0;

  const pasos = [personalizado, tieneCatalogo, tieneEquipo, tieneCaja, tieneVenta];

  return {
    personalizado,
    tieneCatalogo,
    tieneEquipo,
    tieneCaja,
    tieneVenta,
    completados: pasos.filter(Boolean).length,
    total: pasos.length,
  };
}
