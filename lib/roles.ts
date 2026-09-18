// Catálogo de módulos + roles "base" del sistema (M4 — Roles y Permisos).
//
// Historia: Role/Permission/RolePermission/UserRole ya existían en el
// schema desde hace tiempo y sí se poblaban (seed.ts y register/actions.ts
// crean una fila Role "Administrador" por tenant), pero NADA en el resto
// del código los leía para restringir acceso — Reparaciones tenía un
// "simulador de rol" puramente de UI, con un aviso textual de que
// desaparecería "con roles reales (M4)". Este archivo empezó siendo ese M4.
//
// Cambio 2026-09-17 (roles y esquemas de pago personalizables por negocio,
// a petición de Carlos): la primera versión de M4 arrancó con un catálogo
// FIJO de 3 roles asignables (Gerente/Cajero/Técnico) y una matriz de
// acceso también fija en código — pensado solo para un taller de celulares.
// Carlos reportó un caso real (una barbería con Recepcionista/Jefe de
// Barberos/Barbero, cada uno con acceso y esquema de pago distintos) que
// esa matriz fija no podía representar. Ahora el catálogo de roles y sus
// permisos por módulo son 100% editables por cada negocio desde Personal
// ("Roles y permisos" — ver RolesManager.tsx / roles-tenant-actions.ts /
// roles-server.ts), usando las tablas Role/Permission/RolePermission que ya
// existían pero seguían dormidas.
//
// Este archivo se queda universal/sin Prisma a propósito — TenantShell.tsx
// (Client Component) lo importa del lado del cliente, así que no puede
// traer "server-only" ni tocar la BD; el catálogo de nombres/claves de
// módulo es texto plano, sin datos sensibles. lib/roles-server.ts
// (server-only) es quien de verdad calcula los módulos permitidos de un rol
// consultando RolePermission — este archivo solo define el vocabulario
// compartido (ModuloKey) y los 3 roles "base"/semilla que se usan para
// autorreparar tenants que ya tenían Gerente/Cajero/Técnico asignados antes
// de este cambio (ver el comentario largo en roles-server.ts).

export const ROL_ADMINISTRADOR = "Administrador";

// Claves de módulo — coinciden 1:1 con el segmento de ruta bajo /[tenant]/
// que usa TenantShell.tsx (item.href), con el código de Permission.module y
// con el nombre que cada archivo de Server Actions le pasa a
// resolverActor() en lib/actor.ts.
export const MODULOS = [
  "dashboard", "pos", "reparaciones", "citas", "expediente-clinico", "clientes", "catalogo", "inventario",
  "compras", "caja", "personal", "sucursales", "reportes", "facturacion",
  "soporte", "configuracion", "asistencia",
] as const;
export type ModuloKey = (typeof MODULOS)[number];

// Los 3 roles "base"/semilla — ya no son el único catálogo posible (un
// negocio puede crear cuantos roles personalizados quiera, ej. "Barbero" o
// "Jefe de Barberos"), pero se conservan con estos 3 nombres exactos porque
// son los que YA existen como fila Role (isSystem:true) en cualquier tenant
// que alguna vez dio de alta un empleado antes de este cambio — se siguen
// ofreciendo como punto de partida al crear un negocio nuevo, y sirven de
// "semilla" para autorreparar sus permisos (ver backfillPermisosBase en
// roles-server.ts): esos roles hoy tienen 0 filas en RolePermission (esa
// tabla nunca se pobló), así que sin este respaldo un negocio existente
// perdería de golpe el acceso de todo su personal en cuanto los permisos
// pasaran a calcularse desde la BD.
export const ROLES_BASE = ["Gerente", "Cajero", "Técnico"] as const;
export type RolBase = (typeof ROLES_BASE)[number];

export const ROLES_DESCRIPCION_BASE: Record<RolBase, string> = {
  Gerente: "Acceso a todo el negocio excepto Personal, Facturación y Configuración.",
  Cajero: "Punto de Venta, Caja, Clientes y cobro/entrega de Reparaciones.",
  // "expediente-clinico" (2026-09-18) se agregó a Técnico —piensa "doctor/
  // dentista con PIN"— y NO a Cajero: son datos clínicos del paciente
  // (NOM-004), no le corresponden a quien solo cobra.
  Técnico: "Reparaciones, Citas, Clientes y Expediente Clínico.",
};

// dashboard siempre incluido — es la pantalla de aterrizaje, no tiene
// sentido dejar a nadie sin ella (roles-server.ts además la agrega siempre
// a cualquier rol personalizado, por si un admin la destilda por error).
//
// "asistencia"/"personal"/"facturacion"/"configuracion" a propósito NO
// aparecen en ninguno de los 3 arreglos de abajo — igual que antes de este
// cambio, son de acceso exclusivo del administrador/dueño (cuenta real),
// nunca de un empleado con PIN, aunque el negocio decida más adelante darle
// esos módulos a un rol personalizado.
export const MATRIZ_ACCESO_BASE: Record<RolBase, ModuloKey[]> = {
  Gerente: [
    "dashboard", "pos", "reparaciones", "citas", "expediente-clinico", "clientes", "catalogo", "inventario",
    "compras", "caja", "sucursales", "reportes", "soporte",
  ],
  Cajero: ["dashboard", "pos", "caja", "clientes", "reparaciones", "citas"],
  Técnico: ["dashboard", "reparaciones", "citas", "expediente-clinico", "clientes"],
};

export function esRolBase(valor: string): valor is RolBase {
  return (ROLES_BASE as readonly string[]).includes(valor);
}

// Forma "para UI" de un Role de tenant (base o personalizado) con sus
// módulos ya resueltos — lib/roles-server.ts es quien la calcula
// (listarRolesTenant), pero el tipo vive aquí (sin "server-only") para que
// Client Components como PersonalClient.tsx/RolesManager.tsx lo puedan
// importar sin arrastrar nada de Prisma al bundle del navegador.
export interface RolTenantUI {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  modulosPermitidos: ModuloKey[];
  cantidadEmpleados: number;
}
