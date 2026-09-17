// Catálogo de roles + matriz de acceso por módulo (M4 — Roles y Permisos).
//
// Historia: Role/Permission/RolePermission/UserRole ya existían en el
// schema desde hace tiempo y sí se poblaban (seed.ts y register/actions.ts
// crean una fila Role "Administrador" por tenant), pero NADA en el resto
// del código los leía para restringir acceso — Reparaciones tenía un
// "simulador de rol" puramente de UI, con un aviso textual de que
// desaparecería "con roles reales (M4)". Este archivo es ese M4.
//
// Decisión de alcance: en vez de un editor de permisos completamente
// personalizable (una matriz módulo × acción editable por Carlos, que es
// un proyecto en sí mismo), se arranca con un catálogo FIJO de 4 roles y
// una matriz de acceso a nivel de módulo completo (no por acción dentro del
// módulo). Es deliberadamente más simple que Role/Permission/RolePermission
// (que sí soportan permisos granulares) porque hoy nada necesita esa
// granularidad — el siguiente paso natural, si Carlos lo pide, es una
// pantalla que edite esta matriz en vez de tenerla fija en código.
//
// No es universal por accidente: TenantShell.tsx (Client Component) filtra
// la barra de navegación con moduloPermitido() sin volver a pedirle nada al
// servidor, así que este módulo no puede traer "server-only" ni tocar
// Prisma — el catálogo de nombres/labels es texto plano, sin datos
// sensibles. lib/actor.ts (server-only) es quien realmente hace cumplir
// esto en cada Server Action; el filtro de nav es solo para que la UI no
// ofrezca botones que el servidor de todos modos va a rechazar.

export const ROL_ADMINISTRADOR = "Administrador";

// Roles que SÍ se pueden asignar a un empleado de PIN (M11). Administrador
// queda fuera a propósito: ese nivel de acceso solo existe con una cuenta
// real (Supabase Auth), nunca con un PIN de 4 dígitos — así Carlos puede
// prometerle a cualquier empleado "tú entras con tu PIN, nunca con mi
// contraseña" sin excepciones.
export const ROLES_ASIGNABLES = ["Gerente", "Cajero", "Técnico"] as const;
export type RolAsignable = (typeof ROLES_ASIGNABLES)[number];

export const ROLES_DESCRIPCION: Record<RolAsignable, string> = {
  Gerente: "Acceso a todo el negocio excepto Personal, Facturación y Configuración.",
  Cajero: "Punto de Venta, Caja, Clientes y cobro/entrega de Reparaciones.",
  Técnico: "Reparaciones y Clientes.",
};

// Claves de módulo — coinciden 1:1 con el segmento de ruta bajo /[tenant]/
// que usa TenantShell.tsx (item.href) y con el nombre que cada archivo de
// Server Actions le pasa a resolverActor() en lib/actor.ts.
export const MODULOS = [
  "dashboard", "pos", "reparaciones", "clientes", "catalogo", "inventario",
  "compras", "caja", "personal", "sucursales", "reportes", "facturacion",
  "soporte", "configuracion", "asistencia",
] as const;
export type ModuloKey = (typeof MODULOS)[number];

// dashboard siempre incluido para los 3 roles asignables — es la pantalla
// de aterrizaje, no tiene sentido dejar a nadie sin ella.
//
// "asistencia" (panel de asistencia por login, 2026-09-16) a propósito NO
// aparece en ninguno de los 3 arreglos de abajo — es exclusivo del
// administrador/dueño (cuenta real, modo "admin" en resolverActor/
// TenantShell), nunca de un empleado con PIN, aunque sea Gerente. No es un
// olvido: moduloPermitido() devolviendo false para los 3 roles es lo que
// bloquea el acceso real del lado del servidor si alguien con PIN escribe
// /asistencia a mano en la URL.
const MATRIZ_ACCESO: Record<RolAsignable, ModuloKey[]> = {
  Gerente: [
    "dashboard", "pos", "reparaciones", "clientes", "catalogo", "inventario",
    "compras", "caja", "sucursales", "reportes", "soporte",
  ],
  Cajero: ["dashboard", "pos", "caja", "clientes", "reparaciones"],
  Técnico: ["dashboard", "reparaciones", "clientes"],
};

/**
 * true si el rol dado puede entrar al módulo dado. `roleName` null/no
 * reconocido = sin acceso a nada (falla cerrado, nunca abierto) — un
 * empleado de PIN sin rol asignado todavía (dato viejo/incompleto) no
 * hereda acceso por accidente.
 */
export function moduloPermitido(roleName: string | null | undefined, modulo: ModuloKey): boolean {
  if (!roleName) return false;
  const permitidos = MATRIZ_ACCESO[roleName as RolAsignable];
  return permitidos ? permitidos.includes(modulo) : false;
}

/** Primer módulo accesible para ese rol — a dónde mandar a alguien que cae en una ruta que su rol no puede ver. */
export function primerModuloPermitido(roleName: string | null | undefined): ModuloKey {
  if (!roleName) return "dashboard";
  return MATRIZ_ACCESO[roleName as RolAsignable]?.[0] ?? "dashboard";
}

export function esRolAsignable(valor: string): valor is RolAsignable {
  return (ROLES_ASIGNABLES as readonly string[]).includes(valor);
}
