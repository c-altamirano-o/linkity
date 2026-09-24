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
//
// "taller" (2026-09-21, a petición de Carlos, tras encontrar el hueco en el
// demo de reparación de celulares; RECORTADO aún más el 2026-09-22, a otra
// corrección explícita de Carlos con el ejemplo hipotético "Fix Expres") es
// la vista de solo lectura del técnico reparador: ve el folio que tiene
// asignado (cliente, sucursal, falla, pieza cotizada, fecha prometida) SIN
// datos de contacto (para evitar fraude/rivalidad entre técnicos, ver el
// comentario de TallerClient.tsx), y puede mandar una alerta a
// Aduana/Recepción/Tienda si necesita información o una cotización — pero
// YA NO puede agregar piezas, cambiar el costo NI avanzar el estatus (antes
// sí podía; Carlos fue tajante: "solo la encargada de recepción puede
// cambiar el estastus de un equipo"). Esas tres cosas, más asignar el
// técnico, son ahora exclusivas de "aduana" (ver abajo). Vive en su propia
// ruta (/[tenant]/taller, ver ese page.tsx) en vez de ser un permiso fino
// DENTRO de "reparaciones" porque el guard de ruta del layout
// (app/(tenant)/[tenant]/layout.tsx) gatea acceso por el SEGMENTO de la URL,
// no por acción. No es un módulo que el negocio prenda/apague desde
// Configuración (no aparece en lib/modules-catalog.ts a propósito) — es
// puramente un permiso de rol.
//
// "aduana" (2026-09-22, a petición de Carlos, mismo ejemplo "Fix Expres")
// es el puesto de "Recepción/Aduana" del taller CENTRAL: asigna el técnico
// a cada equipo, cambia su estatus (recibido → en reparación → en espera de
// refacción → listo/devolución en taller...) y ajusta el costo/piezas
// cotizadas — todo lo que Carlos fue explícito en que "eso no lo hacen
// desde tienda". Deliberadamente DISTINTO de "reparaciones" (que ahora
// solo alcanza para recibir el equipo con folio, cobrar/entregar cuando ya
// está listo en tienda, y avisar por WhatsApp — nunca tocar costo, piezas,
// estatus ni técnico) y de "taller" (el técnico, solo lectura + alerta) —
// las tres son la respuesta a que antes "reparaciones" tenía control total
// y cualquier encargado de sucursal podía hacer lo que en un negocio real
// con taller centralizado le corresponde solo a recepción. No aparece en
// lib/modules-catalog.ts por el mismo motivo que "taller": es un permiso de
// rol, no una capacidad de negocio que se prenda/apague.
export const MODULOS = [
  "dashboard", "pos", "reparaciones", "taller", "aduana", "citas", "expediente-clinico", "clientes", "catalogo", "inventario",
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
  // (NOM-004), no le corresponden a quien solo cobra. 2026-09-21: "reparaciones"
  // (control total: piezas, costo, cobro) cambió por "taller" (angosto: sin
  // eliminar piezas, sin costo, sin cobro) — ver el comentario de "taller" en
  // MODULOS de arriba.
  // 2026-09-22: "Taller" para el rol base es ahora de solo lectura + alerta
  // (ver el comentario de "taller" arriba) — quien asigna técnico, cambia
  // estatus y costo es "Recepción/Aduana" (permiso "aduana"), que no forma
  // parte de los 3 roles base genéricos (Gerente ya cubre ese control desde
  // "reparaciones" en un negocio de una sola sucursal sin taller separado;
  // el catálogo POR RUBRO en lib/roles-rubro.ts es quien sí ofrece un
  // puesto de Recepción/Aduana dedicado para los rubros de taller).
  Técnico: "Taller (solo ve sus reparaciones asignadas y puede alertar), Citas, Clientes y Expediente Clínico.",
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
  // "aduana" agregado 2026-09-24, a petición explícita de Carlos: "cualquier
  // movimiento o cambio de estatus del equipo en Taller lo debe hacer
  // alguien con rol de aduana, recepcionista o superior (gerente,
  // supervisor, dueño)". El Dueño (cuenta real, Supabase Auth) ya tenía
  // acceso sin restricción de módulo (ver resolverActor); lo que faltaba era
  // que el rol semilla "Gerente" (empleado de PIN) también pudiera entrar a
  // Aduana sin que cada negocio tuviera que ir a marcarlo a mano. Ver
  // prisma/migrar-aduana-gerente.ts para el backfill de los roles "Gerente"
  // que ya existían en negocios reales antes de este cambio.
  Gerente: [
    "dashboard", "pos", "reparaciones", "aduana", "citas", "expediente-clinico", "clientes", "catalogo", "inventario",
    "compras", "caja", "sucursales", "reportes", "soporte",
  ],
  Cajero: ["dashboard", "pos", "caja", "clientes", "reparaciones", "citas"],
  Técnico: ["taller", "citas", "expediente-clinico", "clientes"],
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
  // Ver el comentario largo junto a Role.verTodoTaller (schema.prisma) —
  // solo tiene efecto real cuando modulosPermitidos incluye "taller"; para
  // cualquier otro rol es un valor inerte.
  verTodoTaller: boolean;
  // Ver el comentario largo junto a Role.verMontosCaja (schema.prisma) —
  // solo tiene efecto real cuando modulosPermitidos incluye "caja"; para
  // cualquier otro rol es un valor inerte.
  verMontosCaja: boolean;
  // Ver el comentario largo junto a Role.verTodoNegocio (schema.prisma) —
  // "Supervisor de Sucursales": deja de recortar por sucursal en Reportes/
  // Inventario/Caja para este rol, sin importar qué módulos tenga.
  verTodoNegocio: boolean;
  cantidadEmpleados: number;
}
