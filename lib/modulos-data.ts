import "server-only";

import { prisma } from "@/lib/prisma";
import { MODULE_CATALOG, ALL_MODULE_CODES } from "@/lib/modules-catalog";

/**
 * Capa de datos de la pantalla "Módulos" de Panel Maestro: por cada uno de
 * los 14 módulos del catálogo, cuántos negocios lo tienen activo y cuáles.
 * Es la vista inversa de la sección "Módulos" que ya existe dentro del
 * detalle de un negocio (Negocios → [negocio] → switches por módulo): ahí
 * ves los módulos de UN negocio; aquí ves la adopción de UN módulo entre
 * TODOS los negocios — útil para detectar oportunidades de venta (ej.
 * "8 de 12 negocios no tienen Facturación CFDI activada").
 *
 * A propósito no hay ninguna acción de escritura aquí — prender/apagar un
 * módulo siempre se hace desde la ficha de ESE negocio en particular
 * (app/(admin)/maestro/tenants/[slug]/actions.ts), para no duplicar esa
 * lógica en dos lugares. Esta pantalla solo enlaza hacia allá.
 */

export interface ModuloTenantRef {
  id: string;
  name: string;
  slug: string;
}

export interface ModuloAdopcionRow {
  code: string;
  name: string;
  isCore: boolean;
  activosCount: number;
  totalTenants: number;
  tenantsActivos: ModuloTenantRef[];
  tenantsInactivos: ModuloTenantRef[];
}

export async function getModulosData(): Promise<ModuloAdopcionRow[]> {
  // Enforcement real de módulos (2026-09-17) = "default abierto": un tenant
  // tiene un módulo activo salvo que exista una fila EXPLÍCITA
  // isActive:false para él (ver app/actions/modulos-tenant-actions.ts para
  // el detalle). Por eso esta pantalla ya no cuenta filas isActive:true —
  // cuenta las isActive:false y resta, para que la adopción mostrada aquí
  // coincida con lo que el negocio de verdad ve en su menú.
  const [tenants, tenantModulesInactivos] = await Promise.all([
    prisma.tenant.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
    prisma.tenantModule.findMany({
      where: { isActive: false },
      select: { tenantId: true, module: { select: { code: true } } },
    }),
  ]);

  const inactivosPorCodigo = new Map<string, Set<string>>();
  for (const tm of tenantModulesInactivos) {
    const set = inactivosPorCodigo.get(tm.module.code) ?? new Set<string>();
    set.add(tm.tenantId);
    inactivosPorCodigo.set(tm.module.code, set);
  }

  return ALL_MODULE_CODES.map((code) => {
    const info = MODULE_CATALOG[code];
    const inactivosSet = inactivosPorCodigo.get(code) ?? new Set<string>();
    const tenantsActivos = tenants.filter((t) => !inactivosSet.has(t.id));
    const tenantsInactivos = tenants.filter((t) => inactivosSet.has(t.id));

    return {
      code,
      name: info.name,
      isCore: info.isCore,
      activosCount: tenantsActivos.length,
      totalTenants: tenants.length,
      tenantsActivos,
      tenantsInactivos,
    };
  });
}
