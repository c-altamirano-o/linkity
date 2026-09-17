import "server-only";
import { prisma } from "@/lib/prisma";
import { ROLES_DESCRIPCION, type RolAsignable } from "@/lib/roles";

/**
 * Contraparte server-only de lib/roles.ts (que se queda universal/sin
 * Prisma a propósito — ver el comentario ahí — porque TenantShell.tsx lo
 * importa del lado del cliente). Mismo patrón que labels.ts/labels-server.ts
 * en este proyecto.
 *
 * Idempotente por diseño: cada tenant nuevo ya recibe su Role
 * "Administrador" al registrarse (register/actions.ts, maestro/tenants/
 * nuevo/actions.ts), pero Gerente/Cajero/Técnico no existían como filas
 * hasta este cambio — en vez de una migración de backfill para tenants ya
 * creados, esta función los crea (upsert) la primera vez que alguien
 * asigna ese rol a un empleado, así que un tenant viejo como "Difussion
 * Barberia" se "auto-repara" en el momento en que Carlos da de alta a su
 * primer Cajero, sin ningún paso manual de por medio.
 */
export async function asegurarRolAsignable(tenantId: string, roleName: RolAsignable): Promise<{ id: string }> {
  return prisma.role.upsert({
    where: { tenantId_name: { tenantId, name: roleName } },
    update: {},
    create: { tenantId, name: roleName, description: ROLES_DESCRIPCION[roleName], isSystem: true },
    select: { id: true },
  });
}
