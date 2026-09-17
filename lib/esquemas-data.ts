import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Capa de datos de "Esquemas" (Panel Maestro): los paquetes de capacidad
 * (cuántas sucursales, cuánto personal por sucursal) que Carlos define y
 * asigna a cada negocio, ahora que el cobro y los paquetes/usuarios
 * adicionales los gestiona Hotmart fuera de la plataforma. Ver el comentario
 * largo sobre el modelo PlanEsquema en prisma/schema.prisma para el porqué.
 *
 * Mismo criterio cross-tenant que tenants-data.ts / suscripciones-data.ts:
 * prisma directo, nunca getTenantPrisma (PlanEsquema no es un modelo de
 * tenant, es un catálogo compartido que administra Carlos).
 */

export interface EsquemaUI {
  id: string;
  name: string;
  maxBranches: number;
  maxStaffPerBranch: number;
  isDefault: boolean;
  isActive: boolean;
  tenantsCount: number;
  createdAt: string; // ISO
}

export async function getEsquemasData(): Promise<EsquemaUI[]> {
  const esquemas = await prisma.planEsquema.findMany({
    orderBy: [{ isActive: "desc" }, { maxBranches: "asc" }],
    include: { _count: { select: { tenants: true } } },
  });

  return esquemas.map((e) => ({
    id: e.id,
    name: e.name,
    maxBranches: e.maxBranches,
    maxStaffPerBranch: e.maxStaffPerBranch,
    isDefault: e.isDefault,
    isActive: e.isActive,
    tenantsCount: e._count.tenants,
    createdAt: e.createdAt.toISOString(),
  }));
}

export interface EsquemaOption {
  id: string;
  name: string;
  maxBranches: number;
  maxStaffPerBranch: number;
  isActive: boolean;
}

/**
 * Lista ligera para selects (asignar esquema a un tenant, o al darlo de
 * alta). Incluye esquemas inactivos también: si un tenant ya tiene
 * asignado uno que después se desactivó, el select debe poder seguir
 * mostrando cuál tiene sin que desaparezca de las opciones — solo se
 * excluyen de la lista los NUEVOS negocios que se auto-registran (esos
 * usan getEsquemaDefault(), que sí filtra por isActive).
 */
export async function getEsquemasOptions(): Promise<EsquemaOption[]> {
  const esquemas = await prisma.planEsquema.findMany({
    orderBy: [{ isActive: "desc" }, { maxBranches: "asc" }],
    select: { id: true, name: true, maxBranches: true, maxStaffPerBranch: true, isActive: true },
  });
  return esquemas;
}

/** El esquema que se asigna automáticamente a un negocio que se auto-registra. */
export async function getEsquemaDefault(): Promise<EsquemaOption | null> {
  const esquema = await prisma.planEsquema.findFirst({
    where: { isDefault: true, isActive: true },
    select: { id: true, name: true, maxBranches: true, maxStaffPerBranch: true, isActive: true },
  });
  return esquema;
}
