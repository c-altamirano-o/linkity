import "server-only";

import { prisma, getTenantPrisma } from "@/lib/prisma";

/**
 * Capa de datos reales del módulo Reparaciones (M9). Sigue la misma
 * convención que lib/pos-data.ts / lib/catalogo-data.ts: se importa solo
 * desde Server Components (page.tsx), y deja los tipos de estado/prioridad
 * como los valores crudos del enum de Prisma (en vez de reinventar strings
 * en español como hacía el mockup) para no tener que traducir en dos
 * direcciones — el texto que ve el usuario sale de lib/labels.ts
 * (repair.status.*), que ya lo personaliza por rubro.
 */

export type EstadoReparacion =
  | "RECEIVED" | "DIAGNOSING" | "WAITING_PARTS" | "IN_REPAIR" | "READY"
  | "DELIVERED" | "CANCELLED" | "WORKSHOP_READY" | "WORKSHOP_RETURN"
  | "SHOP_READY" | "SHOP_RETURN";

export type PrioridadReparacion = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface HistorialItem {
  estado: EstadoReparacion;
  nota: string | null;
  fecha: string; // ISO
}

// Una pieza/refacción (o producto/servicio) asignado a la reparación —
// activa el modelo RepairItem del schema, que existía desde M9 pero nunca
// se leía ni escribía desde ninguna acción/UI (ver el comentario largo en
// agregarPiezaReparacionAction, app/actions/reparaciones-actions.ts). El
// precio queda "congelado" al momento de asignar la pieza (no es un
// lookup en vivo al producto), para que si el precio del catálogo cambia
// después no se altere retroactivamente lo que ya se le cotizó al cliente.
export interface PiezaReparacion {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
}

export interface ReparacionUI {
  id: string;
  folio: string;
  clienteId: string;
  cliente: string;
  telefono: string | null;
  iniciales: string;
  branchId: string;
  marca: string;
  modelo: string;
  falla: string;
  estado: EstadoReparacion;
  prioridad: PrioridadReparacion;
  costoEstimado: number | null;
  costoFinal: number | null;
  fechaRecibido: string; // ISO
  fechaEstimada: string | null; // ISO
  fechaEntregado: string | null; // ISO
  tecnico: string;
  // Técnico ASIGNADO para trabajar esta reparación — distinto de `tecnico`
  // (arriba), que en realidad es quien la REGISTRÓ (Repair.userId), casi
  // siempre el encargado de sucursal/recepcionista, nunca el técnico mismo
  // (ver el comentario largo de Repair.assignedToStaffId). Null = todavía
  // sin asignar, así que no aparece en la vista de ningún técnico en
  // /taller (2026-09-21, a petición de Carlos).
  tecnicoAsignadoId: string | null;
  tecnicoAsignadoNombre: string | null;
  // Nombre (y código/sigla si el admin ya lo definió) de la sucursal donde
  // se recibió el equipo — 2026-09-22, a petición de Carlos: el técnico
  // debe poder ver "sucursal" (folio de dónde viene el equipo) aunque
  // trabaje en el taller central, y tienda debe ver la sucursal en el
  // detalle igual que ve la fecha prometida. Ver Branch.code (schema.prisma).
  sucursalNombre: string;
  sucursalCodigo: string | null;
  whatsappSent: boolean;
  publicToken: string;
  historial: HistorialItem[];
  piezas: PiezaReparacion[];
}

export interface ClienteOption {
  id: string;
  name: string;
  phone: string | null;
}

// Técnicos disponibles para asignar en la recepción de una reparación
// (2026-09-21, a petición de Carlos) — cualquier Staff activo cuyo rol
// incluya el módulo "taller" (ver lib/roles.ts), sin importar el nombre que
// el negocio le haya puesto a ese rol ("Técnico", "Mecánico", etc.). Se
// manda con su branchId para que el selector de la UI solo ofrezca los
// técnicos de la sucursal que se está eligiendo en el formulario — "el
// taller se concentra en un solo lugar" (Carlos).
export interface TecnicoOption {
  id: string;
  name: string;
  branchId: string;
}

// Catálogo simplificado para el selector de "agregar pieza" — se manda
// completo (PRODUCT/PART/SERVICE) en vez de filtrar solo PART porque en la
// práctica también se cotiza mano de obra como servicio o, a veces, un
// producto completo de reemplazo (ej. una pantalla ya armada catalogada
// como PRODUCT). El filtro/orden lo decide el usuario en el selector.
export interface ProductoParaReparacion {
  id: string;
  name: string;
  sku: string | null;
  type: "PRODUCT" | "PART" | "SERVICE";
  price: number;
}

export interface ReparacionesData {
  reparaciones: ReparacionUI[];
  clientes: ClienteOption[];
  productos: ProductoParaReparacion[];
  tecnicos: TecnicoOption[];
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const ini = (partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "");
  return ini.toUpperCase() || "?";
}

export async function getReparacionesData(tenantId: string, branchIdFiltro?: string): Promise<ReparacionesData> {
  // Repair y Customer tienen tenantId propio → getTenantPrisma lo inyecta solo.
  const db = getTenantPrisma(tenantId);

  // branchIdFiltro (2026-09-21, a petición de Carlos): mismo criterio que
  // getCitasData — un empleado de PIN solo ve las reparaciones de SU
  // sucursal; clientes y catálogo de productos se quedan tenant-wide.
  // Técnicos asignables (2026-09-21): cualquier Staff activo cuyo Role
  // incluya el permiso "taller" — se resuelve UNA vez aquí (no por cada
  // reparación) vía RolePermission, mismo criterio que
  // modulosPermitidosParaRol (lib/roles-server.ts) pero a la inversa
  // (¿qué roles tienen este módulo?, no ¿qué módulos tiene este rol?).
  const permisoTaller = await prisma.permission.findUnique({
    where: { module_action: { module: "taller", action: "acceso" } },
    select: { id: true },
  });
  const roleIdsConTaller = permisoTaller
    ? (await prisma.rolePermission.findMany({ where: { permissionId: permisoTaller.id }, select: { roleId: true } })).map((r) => r.roleId)
    : [];

  const [repairsRaw, customersRaw, productsRaw, tecnicosRaw] = await Promise.all([
    db.repair.findMany({
      where: branchIdFiltro ? { branchId: branchIdFiltro } : undefined,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        user: { select: { name: true } },
        assignedTo: { select: { id: true, name: true } },
        branch: { select: { name: true, code: true } },
        history: { orderBy: { createdAt: "desc" } },
        items: { include: { product: { select: { name: true } } } },
      },
      orderBy: { receivedAt: "desc" },
    }),
    db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } }),
    // Solo productos activos, para el selector de "agregar pieza" — igual
    // criterio que el resto del proyecto (ej. POS) de no ofrecer algo que
    // el negocio ya dio de baja.
    db.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, type: true, price: true },
    }),
    roleIdsConTaller.length > 0
      ? db.staff.findMany({
          where: { roleId: { in: roleIdsConTaller }, isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, branchId: true },
        })
      : Promise.resolve([]),
  ]);

  const reparaciones: ReparacionUI[] = repairsRaw.map((r) => ({
    id: r.id,
    folio: r.folio,
    clienteId: r.customerId,
    cliente: r.customer.name,
    telefono: r.customer.phone,
    iniciales: iniciales(r.customer.name),
    branchId: r.branchId,
    marca: r.deviceBrand,
    modelo: r.deviceModel,
    falla: r.issueDesc,
    estado: r.status as EstadoReparacion,
    prioridad: r.priority as PrioridadReparacion,
    costoEstimado: r.estimatedCost != null ? Number(r.estimatedCost) : null,
    costoFinal: r.finalCost != null ? Number(r.finalCost) : null,
    fechaRecibido: r.receivedAt.toISOString(),
    fechaEstimada: r.estimatedAt ? r.estimatedAt.toISOString() : null,
    fechaEntregado: r.deliveredAt ? r.deliveredAt.toISOString() : null,
    tecnico: r.user.name,
    tecnicoAsignadoId: r.assignedToStaffId,
    tecnicoAsignadoNombre: r.assignedTo?.name ?? null,
    sucursalNombre: r.branch.name,
    sucursalCodigo: r.branch.code,
    whatsappSent: r.whatsappSent,
    publicToken: r.publicToken,
    historial: r.history.map((h) => ({
      estado: h.status as EstadoReparacion,
      nota: h.notes,
      fecha: h.createdAt.toISOString(),
    })),
    piezas: r.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: it.product.name,
      quantity: it.quantity,
      price: Number(it.price),
    })),
  }));

  const clientes: ClienteOption[] = customersRaw.map((c) => ({ id: c.id, name: c.name, phone: c.phone }));

  const productos: ProductoParaReparacion[] = productsRaw.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    type: p.type as ProductoParaReparacion["type"],
    price: Number(p.price),
  }));

  const tecnicos: TecnicoOption[] = tecnicosRaw.map((s) => ({ id: s.id, name: s.name, branchId: s.branchId }));

  return { reparaciones, clientes, productos, tecnicos };
}
