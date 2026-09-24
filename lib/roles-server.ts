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
import { rolesSugeridosRubro } from "@/lib/roles-rubro";

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
    create: {
      tenantId, name: roleName, description: ROLES_DESCRIPCION_BASE[roleName], isSystem: true,
      // 2026-09-24: "Gerente" nace ya pudiendo ver montos de Caja (acceso a
      // todo el negocio, ver su descripción arriba) — Cajero/Técnico nacen
      // sin este permiso, mismo criterio que el resto de negocios ya
      // existentes (ver Role.verMontosCaja, schema.prisma).
      verMontosCaja: roleName === "Gerente",
    },
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

/**
 * Crea (si no existen) los roles sugeridos del catálogo por rubro (lib/
 * roles-rubro.ts) para este tenant, con su matriz de acceso ya cargada —
 * 2026-09-21, a petición de Carlos ("puestos definidos, jerarquías y
 * tareas específicas" por rubro, no el mismo molde para todos los
 * negocios). Idempotente y no destructivo, mismo criterio que
 * asegurarRolBase/backfillPermisosBase:
 *   - Si el rol (por nombre exacto) ya existe para este tenant, NO se
 *     toca — si el admin ya lo personalizó (le quitó/puso módulos, le
 *     cambió la descripción), esa edición se respeta siempre.
 *   - Los permisos solo se siembran la primera vez, cuando el rol se
 *     acaba de crear y todavía tiene 0 filas en RolePermission — así
 *     nunca se sobreescribe una personalización ya guardada.
 * Se marcan isSystem:true (igual que Gerente/Cajero/Técnico) porque son
 * el catálogo "de fábrica" de su rubro: el nombre no se puede editar
 * (evita que un rol renombrado deje de coincidir con este catálogo), pero
 * sus módulos sí, y a diferencia de los 3 roles base, si el negocio no
 * los necesita puede vaciarles los módulos o simplemente no asignarle
 * personal — no se pueden borrar por el mismo motivo que ningún rol base
 * se puede borrar (ver eliminarRolAction en roles-tenant-actions.ts).
 * Se llama desde listarRolesTenant (para que aparezcan la primera vez que
 * el admin abre "Roles y permisos") y desde el alta de un negocio nuevo
 * (app/(auth)/register/actions.ts), para que ya existan desde el día uno.
 */
export async function asegurarRolesRubro(tenantId: string, businessType: string | null | undefined): Promise<void> {
  const sugeridos = rolesSugeridosRubro(businessType);
  if (sugeridos.length === 0) return;

  const mapaPermisos = await asegurarCatalogoPermisos();

  for (const sugerido of sugeridos) {
    const rol = await prisma.role.upsert({
      where: { tenantId_name: { tenantId, name: sugerido.name } },
      update: {},
      create: {
        tenantId, name: sugerido.name, description: sugerido.description, isSystem: true,
        verTodoTaller: sugerido.verTodoTaller ?? false,
        verMontosCaja: sugerido.verMontosCaja ?? false,
        verTodoNegocio: sugerido.verTodoNegocio ?? false,
      },
      select: { id: true, _count: { select: { permissions: true } } },
    });

    if (rol._count.permissions === 0) {
      const data = sugerido.modulos
        .map((m) => mapaPermisos.get(m))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId: rol.id, permissionId }));
      if (data.length > 0) {
        await prisma.rolePermission.createMany({ data, skipDuplicates: true });
      }
    }
  }
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
  // 2026-09-21, a petición de Carlos: única excepción a "todo rol siempre
  // incluye Dashboard" — un rol de tipo "Taller" (el técnico reparador, ver
  // el comentario de "taller" en lib/roles.ts) no debe ver cifras de venta
  // generales del negocio que no le corresponden. Su sesión de PIN aterriza
  // igual en /dashboard (EntradaClient.tsx no distingue rol al redirigir),
  // pero el guard de ruta del layout la rebota de inmediato al primer módulo
  // que sí tiene permitido — normalmente "taller" mismo.
  if (!modulos.has("taller")) modulos.add("dashboard");
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
  // 2026-09-21: si el rubro de este negocio tiene un catálogo propio (lib/
  // roles-rubro.ts — la mayoría de los 19 rubros ya lo tienen), se asegura
  // ESE catálogo en vez de los 3 roles genéricos: jerarquía y permisos
  // reales para su giro, no el molde de un taller de celulares aplicado a
  // una barbería o un consultorio dental (ver el comentario largo junto a
  // asegurarRolesRubro). Solo cuando el rubro no tiene catálogo propio
  // (businessType nulo o un rubro no contemplado) se cae al comportamiento
  // anterior — los 3 roles base como punto de partida genérico.
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { businessType: true } });
  const tieneCatalogoRubro = rolesSugeridosRubro(tenant?.businessType).length > 0;

  if (tieneCatalogoRubro) {
    await asegurarRolesRubro(tenantId, tenant?.businessType);
  } else {
    await Promise.all(ROLES_BASE.map((nombre) => asegurarRolBase(tenantId, nombre)));
  }

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
    verTodoTaller: r.verTodoTaller,
    verMontosCaja: r.verMontosCaja,
    verTodoNegocio: r.verTodoNegocio,
    cantidadEmpleados: r._count.staff,
  }));
}

/**
 * true si el ROL (por tenant+nombre) tiene marcado "ver todas las
 * reparaciones asignadas del taller" (Role.verTodoTaller — "Jefe de
 * técnicos", 2026-09-22 a petición de Carlos). Mismo criterio de resolución
 * por nombre que modulosPermitidosParaRolPorNombre, porque la sesión de PIN
 * (lib/staff-auth.ts) solo guarda roleName en su cookie, nunca el roleId.
 */
export async function verTodoTallerParaRolPorNombre(tenantId: string, roleName: string | null | undefined): Promise<boolean> {
  if (!roleName) return false;
  const role = await prisma.role.findUnique({ where: { tenantId_name: { tenantId, name: roleName } }, select: { verTodoTaller: true } });
  return role?.verTodoTaller ?? false;
}

/**
 * true si el ROL (por tenant+nombre) tiene marcado "puede ver montos y
 * totales de Caja" (Role.verMontosCaja — 2026-09-24, a petición de Carlos,
 * ver el comentario largo en schema.prisma). Mismo criterio de resolución
 * por nombre que verTodoTallerParaRolPorNombre — usado por
 * app/(tenant)/[tenant]/caja/page.tsx para decidir si redacta o no los
 * montos que le manda a CajaClient.tsx para una sesión de PIN. Un
 * administrador con cuenta real NUNCA pasa por aquí — ve montos siempre,
 * sin excepción (ver caja/page.tsx).
 */
export async function verMontosCajaParaRolPorNombre(tenantId: string, roleName: string | null | undefined): Promise<boolean> {
  if (!roleName) return false;
  const role = await prisma.role.findUnique({ where: { tenantId_name: { tenantId, name: roleName } }, select: { verMontosCaja: true } });
  return role?.verMontosCaja ?? false;
}

/**
 * true si el ROL (por tenant+nombre) tiene marcado "ve todas las
 * sucursales, no solo la suya" (Role.verTodoNegocio — "Supervisor de
 * Sucursales", 2026-09-24, ver el comentario largo en schema.prisma).
 * Mismo criterio de resolución por nombre que verMontosCajaParaRolPorNombre
 * — usado por reportes/page.tsx, inventario/page.tsx y caja/page.tsx para
 * decidir si recortan o no sus datos a la sucursal de este empleado.
 */
export async function verTodoNegocioParaRolPorNombre(tenantId: string, roleName: string | null | undefined): Promise<boolean> {
  if (!roleName) return false;
  const role = await prisma.role.findUnique({ where: { tenantId_name: { tenantId, name: roleName } }, select: { verTodoNegocio: true } });
  return role?.verTodoNegocio ?? false;
}

/**
 * Reemplaza por completo el conjunto de módulos permitidos de un rol (borra
 * y vuelve a insertar) — siempre une "dashboard" para evitar un rol sin
 * ningún módulo permitido (ver comentario del archivo). `verTodoTaller`
 * (2026-09-22, opcional — undefined = no tocar el valor actual) actualiza
 * Role.verTodoTaller ("Jefe de técnicos" ve todo el taller sin editar, ver
 * el comentario largo en schema.prisma); si el rol ya no tiene "taller"
 * entre sus módulos, se fuerza a false — no tiene sentido dejarlo prendido
 * para un rol que ni siquiera entra a esa pantalla. `verMontosCaja`
 * (2026-09-24, mismo criterio, opcional) actualiza Role.verMontosCaja
 * ("supervisor+": ve montos y totales de Caja); igual se fuerza a false si
 * el rol ya no tiene "caja" entre sus módulos. `verTodoNegocio` (2026-09-24,
 * mismo criterio, opcional) actualiza Role.verTodoNegocio ("Supervisor de
 * Sucursales": ve todas las sucursales, no solo la suya); se fuerza a false
 * si el rol no tiene NINGUNO de los tres módulos con datos por sucursal
 * (reportes/inventario/caja) — no tiene sentido dejarlo prendido para un
 * rol que no entra a ninguna de esas tres pantallas.
 */
export async function guardarPermisosDeRol(roleId: string, modulos: ModuloKey[], verTodoTaller?: boolean, verMontosCaja?: boolean, verTodoNegocio?: boolean): Promise<void> {
  const mapaPermisos = await asegurarCatalogoPermisos();
  const conDashboard = new Set<ModuloKey>(modulos);
  // 2026-09-21: misma excepción que modulosPermitidosParaRol (ver ese
  // comentario) — un rol "Taller" no recibe Dashboard forzado.
  if (!conDashboard.has("taller")) conDashboard.add("dashboard");

  const tieneModuloPorSucursal = conDashboard.has("reportes") || conDashboard.has("inventario") || conDashboard.has("caja");

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({
      data: Array.from(conDashboard)
        .map((m) => mapaPermisos.get(m))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId, permissionId })),
      skipDuplicates: true,
    }),
    prisma.role.update({
      where: { id: roleId },
      data: {
        verTodoTaller: conDashboard.has("taller") ? (verTodoTaller ?? undefined) : false,
        verMontosCaja: conDashboard.has("caja") ? (verMontosCaja ?? undefined) : false,
        verTodoNegocio: tieneModuloPorSucursal ? (verTodoNegocio ?? undefined) : false,
      },
    }),
  ]);
}

/** Un rol con su módulo clave (aduana/taller) y si ya tiene al menos un empleado asignado. */
export interface RolTallerEstado {
  nombre: string;
  tieneStaff: boolean;
}

export interface EstadoTallerChecklist {
  /**
   * false para rubros sin taller propio (ej. barbería, consultorio dental,
   * spa) — ahí la tarjeta ni se muestra. Un tenant sin rubro elegido
   * (businessType null) cae al catálogo genérico de 3 roles (Gerente/
   * Cajero/Técnico, MATRIZ_ACCESO_BASE en lib/roles.ts) que sí incluye
   * "aduana"/"taller" (pensado desde siempre para reparación de
   * celulares) — ahí "aplica" es true.
   */
  aplica: boolean;
  rolesAduana: RolTallerEstado[];
  rolesTaller: RolTallerEstado[];
}

const CHECKLIST_TALLER_VACIO: EstadoTallerChecklist = { aplica: false, rolesAduana: [], rolesTaller: [] };

/**
 * Checklist de "¿tu taller ya está listo para operar?" (2026-09-24, a
 * petición de Carlos: el ícono de escudo genérico de Taller no le decía
 * nada al dueño — "quiero algo más visible y específico... que sea fácil
 * de identificar para el dueño que ahí es donde debe crear un taller y
 * configurarlo... a modo de checklist para guiarlo").
 *
 * El rol de Recepción/Aduana y el de Técnico/Taller YA se crean solos
 * (asegurarRolesRubro/asegurarRolBase — la primera vez que se abre "Roles
 * y permisos", o desde el alta del negocio) — el dueño nunca tiene que
 * "crear un taller" a mano, ese paso ya no existe. Lo único que de verdad
 * puede faltar, y lo único que bloquea operar el taller en la práctica, es
 * que tenga PERSONAL asignado a esos roles: sin nadie con "aduana" nadie
 * puede recibir un equipo/asignar técnico, y sin nadie con "taller" nadie
 * puede marcarlo en reparación. Por eso este checklist mide dotación de
 * personal, no existencia de rol — y por lo mismo vive en Configuración
 * (más visible, "aquí es donde el dueño llega a configurar su negocio")
 * pero apunta a Personal, que es donde en realidad se resuelve.
 */
export async function getEstadoTallerChecklist(tenantId: string, businessType: string | null | undefined): Promise<EstadoTallerChecklist> {
  const sugeridos = rolesSugeridosRubro(businessType);
  const catalogoPropio = sugeridos.length > 0;
  const aplica = catalogoPropio ? sugeridos.some((r) => r.modulos.includes("aduana") || r.modulos.includes("taller")) : true;
  if (!aplica) return CHECKLIST_TALLER_VACIO;

  if (catalogoPropio) {
    await asegurarRolesRubro(tenantId, businessType);
  } else {
    await Promise.all(ROLES_BASE.map((nombre) => asegurarRolBase(tenantId, nombre)));
  }

  const roles = await prisma.role.findMany({
    where: { tenantId, name: { not: ROL_ADMINISTRADOR } },
    select: { id: true, name: true, _count: { select: { staff: true } } },
  });

  const rolesAduana: RolTallerEstado[] = [];
  const rolesTaller: RolTallerEstado[] = [];

  for (const r of roles) {
    const modulos = await modulosPermitidosParaRol(r.id);
    const tieneStaff = r._count.staff > 0;
    if (modulos.includes("aduana")) rolesAduana.push({ nombre: r.name, tieneStaff });
    if (modulos.includes("taller")) rolesTaller.push({ nombre: r.name, tieneStaff });
  }

  return { aplica: true, rolesAduana, rolesTaller };
}
