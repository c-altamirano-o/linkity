import "server-only";
import { prisma } from "@/lib/prisma";
import {
  MODULOS,
  ROL_ADMINISTRADOR,
  ROLES_BASE,
  ROLES_DESCRIPCION_BASE,
  MATRIZ_ACCESO_BASE,
  esRolBase,
  type ModuloKey,
  type RolBase,
  type RolTenantUI,
} from "@/lib/roles";

/**
 * Motor server-only de roles personalizables (2026-09-17). Contraparte de
 * lib/roles.ts (que se queda universal/sin Prisma — ver el comentario ahí).
 *
 * Diseño (a petición de Carlos: "que el administrador... elija cuáles
 * módulos usará cada puesto"): en vez de una matriz de acceso fija en
 * código, cada tenant tiene su propio catálogo de Role, y el conjunto de
 * módulos que un Role puede ver se guarda en RolePermission — una fila por
 * módulo permitido, apuntando a una Permission global (una por módulo, con
 * action="acceso" fija: ver la decisión de alcance documentada en
 * lib/roles.ts sobre por qué no hay permisos granulares por acción dentro
 * de un módulo).
 *
 * Backfill automático (pieza crítica para no romper tenants ya en
 * producción): Permission/RolePermission nunca se habían poblado antes de
 * este cambio, así que los roles "Gerente"/"Cajero"/"Técnico" que ya existen
 * como fila Role (creados por asegurarRolBase, antes asegurarRolAsignable)
 * en cualquier tenant que ya dio de alta personal, tienen HOY 0 filas en
 * RolePermission. Si se calculara el acceso puramente desde la BD sin más,
 * todo el personal de un negocio real (ej. "Difussion Barbería") perdería
 * acceso a TODO de un día para otro. Por eso modulosPermitidosParaRol,
 * cuando encuentra un rol con 0 permisos Y su nombre coincide con uno de los
 * 3 roles base reconocidos, siembra sus filas de RolePermission a partir de
 * MATRIZ_ACCESO_BASE (lib/roles.ts) antes de responder — el negocio se
 * "autorrepara" solo, sin ninguna migración ni paso manual. Un rol
 * PERSONALIZADO de verdad (creado desde cero por un admin, ej. "Barbero")
 * simplemente arranca con 0 permisos hasta que el admin marque casillas
 * para él — no aplica ningún backfill porque su nombre no coincide con
 * ninguno de los 3 base.
 *
 * "dashboard" siempre se une al resultado final (aquí y al guardar permisos
 * en roles-tenant-actions.ts) para que un rol mal configurado (ej. el admin
 * destilda todo) nunca pueda quedar con 0 módulos permitidos — sin esto,
 * el guard de ruta (lib/actor.ts / layout.tsx) redirigiría a "el primer
 * módulo permitido", que si también fuera 0 provocaría un loop de redirect
 * infinito.
 */

const ACCION_UNICA = "acceso";

/** Garantiza una fila Permission por cada módulo del catálogo (upsert idempotente, se puede llamar tantas veces como haga falta). */
async function asegurarCatalogoPermisos(): Promise<Map<ModuloKey, string>> {
  const permisos = await Promise.all(
    MODULOS.map((modulo) =>
      prisma.permission.upsert({
        where: { module_action: { module: modulo, action: ACCION_UNICA } },
        update: {},
        create: { module: modulo, action: ACCION_UNICA },
        select: { id: true, module: true },
      })
    )
  );
  return new Map(permisos.map((p) => [p.module as ModuloKey, p.id]));
}

/** Idempotente — si el rol base ya existe (por nombre) lo reutiliza, si no lo crea. Reemplaza a la antigua asegurarRolAsignable. */
export async function asegurarRolBase(tenantId: string, roleName: RolBase): Promise<{ id: string }> {
  return prisma.role.upsert({
    where: { tenantId_name: { tenantId, name: roleName } },
    update: {},
    create: { tenantId, name: roleName, description: ROLES_DESCRIPCION_BASE[roleName], isSystem: true },
    select: { id: true },
  });
}

async function backfillPermisosBase(roleId: string, roleName: string): Promise<void> {
  if (!esRolBase(roleName)) return; // rol personalizado de verdad — sin autorreparación, arranca en 0
  const modulosBase = MATRIZ_ACCESO_BASE[roleName];
  const mapaPermisos = await asegurarCatalogoPermisos();
  const data = modulosBase
    .map((m) => mapaPermisos.get(m))
    .filter((id): id is string => Boolean(id))
    .map((permissionId) => ({ roleId, permissionId }));
  if (data.length === 0) return;
  await prisma.rolePermission.createMany({ data, skipDuplicates: true });
}

/** Módulos permitidos para un Role por id — autorreparando roles base con 0 permisos (ver comentario del archivo). Siempre incluye "dashboard". */
export async function modulosPermitidosParaRol(roleId: string): Promise<ModuloKey[]> {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { name: true, permissions: { select: { permission: { select: { module: true } } } } },
  });
  if (!role) return [];

  let filas = role.permissions;
  if (filas.length === 0) {
    await backfillPermisosBase(roleId, role.name);
    const rolTrasBackfill = await prisma.role.findUnique({
      where: { id: roleId },
      select: { permissions: { select: { permission: { select: { module: true } } } } },
    });
    filas = rolTrasBackfill?.permissions ?? [];
  }

  const modulos = new Set(filas.map((p) => p.permission.module as ModuloKey));
  modulos.add("dashboard");
  return Array.from(modulos);
}

/** Igual que modulosPermitidosParaRol, pero resolviendo el rol por (tenantId, nombre) — usado por lib/actor.ts para una sesión de PIN, que solo guarda roleName en su cookie (ver lib/staff-auth.ts). */
export async function modulosPermitidosParaRolPorNombre(tenantId: string, roleName: string | null | undefined): Promise<ModuloKey[]> {
  if (!roleName) return [];
  const role = await prisma.role.findUnique({ where: { tenantId_name: { tenantId, name: roleName } }, select: { id: true } });
  if (!role) return [];
  return modulosPermitidosParaRol(role.id);
}

/** Catálogo completo de roles asignables (base + personalizados) de un tenant, con sus módulos ya resueltos (con autorreparación incluida). "Administrador" se excluye a propósito — ver ROL_ADMINISTRADOR en lib/roles.ts: ese nivel de acceso nunca se ofrece a un empleado de PIN. */
export async function listarRolesTenant(tenantId: string): Promise<RolTenantUI[]> {
  // Asegura que los 3 roles base existan como fila desde el primer momento
  // (aunque el tenant nunca haya asignado alguno), para que el admin los
  // vea y pueda personalizarlos desde el día uno en "Roles y permisos".
  await Promise.all(ROLES_BASE.map((nombre) => asegurarRolBase(tenantId, nombre)));

  const roles = await prisma.role.findMany({
    where: { tenantId, name: { not: ROL_ADMINISTRADOR } },
    orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { staff: true } } },
  });

  const modulosPorRol = await Promise.all(roles.map((r) => modulosPermitidosParaRol(r.id)));

  return roles.map((r, i) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    modulosPermitidos: modulosPorRol[i],
    cantidadEmpleados: r._count.staff,
  }));
}

/** Reemplaza por completo el conjunto de módulos permitidos de un rol (borra y vuelve a insertar) — siempre une "dashboard" para evitar un rol sin ningún módulo permitido (ver comentario del archivo). */
export async function guardarPermisosDeRol(roleId: string, modulos: ModuloKey[]): Promise<void> {
  const mapaPermisos = await asegurarCatalogoPermisos();
  const conDashboard = new Set<ModuloKey>(modulos);
  conDashboard.add("dashboard");

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({
      data: Array.from(conDashboard)
        .map((m) => mapaPermisos.get(m))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId, permissionId })),
      skipDuplicates: true,
    }),
  ]);
}
