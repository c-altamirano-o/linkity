import "server-only";

import { prisma } from "@/lib/prisma";
import { MODULE_CATALOG, ALL_MODULE_CODES } from "@/lib/modules-catalog";
import type { SubscriptionStatus, BillingCycle } from "@prisma/client";

/**
 * Capa de datos de la pantalla "Negocios" de Panel Maestro: el listado de
 * todos los tenants (antes solo vivía embebido dentro del Dashboard, sin
 * pantalla ni ruta propia — /maestro/tenants existía en el sidebar pero
 * apuntaba a nada) y el detalle de UNO en particular (antes no existía
 * ninguna vista de detalle; el único sub-flujo construido era
 * tenants/nuevo/page.tsx para darlos de alta).
 *
 * Mismo patrón cross-tenant que maestro-data.ts / suscripciones-data.ts:
 * prisma directo, nunca getTenantPrisma.
 */

export interface TenantListRow {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  businessType: string | null;
  plan: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  modulosActivos: number;
  modulosTotal: number;
  branchesCount: number;
  usersCount: number;
  esquemaName: string | null;
  esquemaMaxBranches: number | null;
  createdAt: string; // ISO
}

export async function getTenantsListData(): Promise<TenantListRow[]> {
  const totalModulosCatalogo = ALL_MODULE_CODES.length;

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      subscription: true,
      modules: { where: { isActive: true }, select: { moduleId: true } },
      esquema: { select: { name: true, maxBranches: true } },
      _count: { select: { branches: true, users: true } },
    },
  });

  return tenants.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    city: t.city,
    state: t.state,
    phone: t.phone,
    email: t.email,
    businessType: t.businessType,
    plan: t.subscription?.plan ?? null,
    subscriptionStatus: t.subscription?.status ?? null,
    modulosActivos: t.modules.length,
    modulosTotal: totalModulosCatalogo,
    branchesCount: t._count.branches,
    usersCount: t._count.users,
    esquemaName: t.esquema?.name ?? null,
    esquemaMaxBranches: t.esquema?.maxBranches ?? null,
    createdAt: t.createdAt.toISOString(),
  }));
}

export interface TenantModuloRow {
  code: string;
  name: string;
  isCore: boolean;
  activo: boolean;
}

export interface TenantBranchRow {
  id: string;
  name: string;
  address: string | null;
  isActive: boolean;
  staffCount: number;
}

export interface TenantUserRow {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roleName: string | null;
}

export interface TenantDetail {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  rfc: string | null;
  businessType: string | null;
  isActive: boolean;
  createdAt: string; // ISO
  plan: string | null;
  price: number | null;
  currency: string | null;
  billingCycle: BillingCycle | null;
  status: SubscriptionStatus | null;
  endDate: string | null; // ISO
  autoRenew: boolean;
  esquemaId: string | null;
  esquemaName: string | null;
  esquemaMaxBranches: number | null;
  esquemaMaxStaffPerBranch: number | null;
  branchesActivas: number;
  modulos: TenantModuloRow[];
  branches: TenantBranchRow[];
  users: TenantUserRow[];
}

export async function getTenantDetailData(slug: string): Promise<TenantDetail | null> {
  const t = await prisma.tenant.findUnique({
    where: { slug },
    include: {
      subscription: true,
      esquema: { select: { id: true, name: true, maxBranches: true, maxStaffPerBranch: true } },
      modules: { where: { isActive: true }, select: { moduleId: true, module: { select: { code: true } } } },
      branches: {
        orderBy: { createdAt: "asc" },
        include: { staff: { where: { isActive: true }, select: { id: true } } },
      },
      users: {
        orderBy: { createdAt: "asc" },
        include: { role: { include: { role: true } } },
      },
    },
  });

  if (!t) return null;

  const activeCodes = new Set(t.modules.map((m) => m.module.code));
  const modulos: TenantModuloRow[] = ALL_MODULE_CODES.map((code) => ({
    code,
    name: MODULE_CATALOG[code].name,
    isCore: MODULE_CATALOG[code].isCore,
    activo: activeCodes.has(code),
  }));

  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    logo: t.logo,
    phone: t.phone,
    email: t.email,
    address: t.address,
    city: t.city,
    state: t.state,
    rfc: t.rfc,
    businessType: t.businessType,
    isActive: t.isActive,
    createdAt: t.createdAt.toISOString(),
    plan: t.subscription?.plan ?? null,
    price: t.subscription ? Number(t.subscription.price) : null,
    currency: t.subscription?.currency ?? null,
    billingCycle: t.subscription?.billingCycle ?? null,
    status: t.subscription?.status ?? null,
    endDate: t.subscription?.endDate ? t.subscription.endDate.toISOString() : null,
    autoRenew: t.subscription?.autoRenew ?? false,
    esquemaId: t.esquema?.id ?? null,
    esquemaName: t.esquema?.name ?? null,
    esquemaMaxBranches: t.esquema?.maxBranches ?? null,
    esquemaMaxStaffPerBranch: t.esquema?.maxStaffPerBranch ?? null,
    branchesActivas: t.branches.filter((b) => b.isActive).length,
    modulos,
    branches: t.branches.map((b) => ({
      id: b.id,
      name: b.name,
      address: b.address,
      isActive: b.isActive,
      staffCount: b.staff.length,
    })),
    users: t.users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      isActive: u.isActive,
      roleName: u.role?.role.name ?? null,
    })),
  };
}
