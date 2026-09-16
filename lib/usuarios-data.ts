import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Capa de datos de la pantalla "Usuarios" de Panel Maestro: directorio
 * cross-tenant de TODAS las cuentas de acceso de TODOS los negocios (antes
 * no existía ninguna vista — solo se podía ver "cuántos usuarios tiene un
 * negocio" desde Negocios, nunca la lista real de personas).
 *
 * Sirve para soporte/seguridad: desactivar el acceso de alguien sin pedirle
 * al dueño del negocio que entre a su propio panel a hacerlo (útil si aún
 * no le hemos dado de alta esa función, o si el negocio reporta un celular
 * robado y quiere el acceso cortado ya). El toggle de aquí SÍ tiene efecto
 * real: bloquea el login (app/(auth)/login/actions.ts,
 * getTenantAccesoBySupabaseId) y cierra cualquier sesión ya abierta
 * (app/(tenant)/[tenant]/layout.tsx).
 */

export interface UsuarioRow {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string; // ISO
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  branchName: string | null;
  roleName: string | null;
}

export async function getUsuariosListData(): Promise<UsuarioRow[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      tenant: { select: { name: true, slug: true } },
      branch: { select: { name: true } },
      role: { include: { role: { select: { name: true } } } },
    },
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    tenantId: u.tenantId,
    tenantName: u.tenant.name,
    tenantSlug: u.tenant.slug,
    branchName: u.branch?.name ?? null,
    roleName: u.role?.role.name ?? null,
  }));
}
