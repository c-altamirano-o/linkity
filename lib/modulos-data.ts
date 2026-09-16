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
  const [tenants, tenantModules] = await Promise.all([
    prisma.tenant.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
    prisma.tenantModule.findMany({
      where: { isActive: true },
      select: { tenantId: true, module: { select: { code: true } } },
    }),
  ]);

  const activosPorCodigo = new Map<string, Set<string>>();
  for (const tm of tenantModules) {
    const set = activosPorCodigo.get(tm.module.code) ?? new Set<string>();
    set.add(tm.tenantId);
    activosPorCodigo.set(tm.module.code, set);
  }

  return ALL_MODULE_CODES.map((code) => {
    const info = MODULE_CATALOG[code];
    const activosSet = activosPorCodigo.get(code) ?? new Set<string>();
    const tenantsActivos = tenants.filter((t) => activosSet.has(t.id));
    const tenantsInactivos = tenants.filter((t) => !activosSet.has(t.id));

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
