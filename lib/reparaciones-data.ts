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
  // Contraseña/patrón de desbloqueo del equipo (2026-09-24, a petición de
  // Carlos: el Técnico de Reparación la necesita para trabajar el equipo).
  // Deliberadamente NO existe en ReparacionPublicaUI (más abajo) — ver el
  // comentario largo en Repair.deviceUnlockCode, schema.prisma.
  codigoDesbloqueo: string | null;
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
    codigoDesbloqueo: r.deviceUnlockCode,
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

// ============================================
// Página pública de seguimiento (/rep/[token])
// ============================================
//
// 2026-09-24, a petición de Carlos: "la página pública sí debe existir...
// cada cambio de estatus debe desencadenar un mensaje al cliente" — el envío
// de WhatsApp queda pendiente (ver el hilo de esa conversación), pero la
// página en sí se construye ahora y es el destino al que apuntará ese
// mensaje el día que se conecte. Sin autenticación — Repair.publicToken (un
// cuid, prácticamente imposible de adivinar) es la única "contraseña": quien
// tiene el link, ve el seguimiento de ESE equipo y ningún otro.
//
// Deliberadamente NO se usa getTenantPrisma aquí — a esta altura todavía no
// se sabe de qué tenant es el equipo (por eso existe el token, para no
// necesitar tenantSlug en la URL) — se usa el cliente base `prisma`, igual
// que app/(auth)/[tenant]/page.tsx resuelve el tenant antes de tener
// contexto. RepairHistory/RepairItem no están en tenantModels (no tienen
// tenantId propio, se llega a ellos vía Repair) así que no aplica de
// cualquier forma.
//
// Solo información "relevante" para el cliente (a petición explícita de
// Carlos, sin ejemplos de más): folio, primer nombre, estatus actual, costo
// estimado/final, fecha estimada, la línea de tiempo de checkpoints ya
// marcados visibleCliente:true (ver el comentario largo en
// RepairHistory.visibleCliente, schema.prisma) y el mensaje más reciente que
// el taller haya marcado explícitamente "para el cliente". NUNCA nombre del
// técnico, NUNCA piezas/costos por separado, NUNCA datos de otras
// sucursales/negocio.

export const ESTADO_CLIENTE_TEXTO: Record<EstadoReparacion, string> = {
  RECEIVED: "Recibimos tu equipo",
  DIAGNOSING: "Tu equipo está en diagnóstico",
  IN_REPAIR: "Tu equipo está en reparación",
  WAITING_PARTS: "En espera de una refacción",
  READY: "Tu equipo está listo",
  WORKSHOP_READY: "¡Tu equipo ya quedó listo!",
  WORKSHOP_RETURN: "Se acordó la devolución de tu equipo",
  SHOP_READY: "Tu equipo está en tienda, listo para que lo recojas",
  SHOP_RETURN: "Tu equipo está en tienda para devolución",
  DELIVERED: "Equipo entregado",
  CANCELLED: "Reparación cancelada",
};

// Paso (0-4) de la barra de progreso simple — colapsa los estatus "gemelos"
// (taller/tienda, listo/devolución) en el mismo escalón visual.
export const PASO_PROGRESO: Record<EstadoReparacion, number> = {
  RECEIVED: 0,
  DIAGNOSING: 1,
  IN_REPAIR: 1,
  WAITING_PARTS: 1,
  READY: 2,
  WORKSHOP_READY: 2,
  WORKSHOP_RETURN: 2,
  SHOP_READY: 3,
  SHOP_RETURN: 3,
  DELIVERED: 4,
  CANCELLED: -1,
};

export const PASOS_PROGRESO_TEXTO = ["Recibido", "En reparación", "Listo", "En tienda", "Entregado"];

export interface CheckpointPublico {
  texto: string;
  fecha: string; // ISO
}

export interface MensajeTallerPublico {
  texto: string;
  fecha: string; // ISO
}

export interface ReparacionPublicaUI {
  folio: string;
  negocio: string;
  clientePrimerNombre: string;
  marca: string;
  modelo: string;
  estado: EstadoReparacion;
  estadoTexto: string;
  paso: number;
  costoEstimado: number | null;
  costoFinal: number | null;
  fechaEstimada: string | null;
  fechaEntregado: string | null;
  checkpoints: CheckpointPublico[];
  mensajeTaller: MensajeTallerPublico | null;
}

const PREFIJO_ALERTA_CLIENTE = "Alerta del técnico: ";

export async function getReparacionPublica(publicToken: string): Promise<ReparacionPublicaUI | null> {
  const repair = await prisma.repair.findUnique({
    where: { publicToken },
    select: {
      folio: true,
      deviceBrand: true,
      deviceModel: true,
      status: true,
      estimatedCost: true,
      finalCost: true,
      estimatedAt: true,
      deliveredAt: true,
      customer: { select: { name: true } },
      tenant: { select: { name: true } },
      history: {
        where: { visibleCliente: true },
        orderBy: { createdAt: "asc" },
        select: { notes: true, createdAt: true },
      },
    },
  });
  if (!repair) return null;

  const primerNombre = repair.customer.name.trim().split(/\s+/)[0] ?? repair.customer.name;

  // El mensaje del taller (alerta marcada "para el cliente") se muestra
  // aparte, destacado — no como un checkpoint más de la línea de tiempo.
  // Se toma el más reciente; se le quita el prefijo interno al mostrarlo.
  const alertasCliente = repair.history.filter((h) => h.notes?.startsWith(PREFIJO_ALERTA_CLIENTE));
  const ultimaAlerta = alertasCliente[alertasCliente.length - 1] ?? null;

  const checkpoints: CheckpointPublico[] = repair.history
    .filter((h) => !h.notes?.startsWith(PREFIJO_ALERTA_CLIENTE))
    .map((h) => ({ texto: h.notes ?? "", fecha: h.createdAt.toISOString() }));

  return {
    folio: repair.folio,
    negocio: repair.tenant.name,
    clientePrimerNombre: primerNombre,
    marca: repair.deviceBrand,
    modelo: repair.deviceModel,
    estado: repair.status as EstadoReparacion,
    estadoTexto: ESTADO_CLIENTE_TEXTO[repair.status as EstadoReparacion] ?? "En proceso",
    paso: PASO_PROGRESO[repair.status as EstadoReparacion] ?? 0,
    costoEstimado: repair.estimatedCost != null ? Number(repair.estimatedCost) : null,
    costoFinal: repair.finalCost != null ? Number(repair.finalCost) : null,
    fechaEstimada: repair.estimatedAt ? repair.estimatedAt.toISOString() : null,
    fechaEntregado: repair.deliveredAt ? repair.deliveredAt.toISOString() : null,
    checkpoints,
    mensajeTaller: ultimaAlerta
      ? { texto: (ultimaAlerta.notes ?? "").slice(PREFIJO_ALERTA_CLIENTE.length), fecha: ultimaAlerta.createdAt.toISOString() }
      : null,
  };
}

export type RepairParaCobro =
  | {
      ok: true;
      id: string;
      folio: string;
      deviceBrand: string;
      deviceModel: string;
      branchId: string;
      customerId: string | null;
      customerName: string;
      // Punto de partida para el monto en POS — el cajero puede ajustarlo
      // ahí antes de cobrar, igual que ya podía en el modal que este flujo
      // reemplaza (ver el comentario largo en pos-actions.ts). Para una
      // reparación lista es finalCost/estimatedCost (lo cotizado); para una
      // devolución con cobro es Tenant.montoDevolucion (2026-09-26, ver el
      // comentario largo en ese campo, schema.prisma) — el costo cotizado de
      // la reparación no aplica aquí, nunca se reparó.
      montoSugerido: number;
      esDevolucion: boolean;
      // 2026-09-26, para el QR del ticket de esta venta (POS) — misma página
      // pública de seguimiento de siempre (/rep/[token]), ver el comentario
      // largo en lib/recibo-imprimible.ts.
      publicToken: string;
    }
  | { ok: false; error: string };

/**
 * Datos mínimos para precargar el carrito de POS con el cobro de una
 * reparación (2026-09-25, "Cobrar y entregar" ahora manda a POS — ver el
 * comentario largo en app/actions/pos-actions.ts). Vuelve a validar el mismo
 * estatus que crearVentaAction exige al cobrar de verdad (SHOP_READY, o
 * SHOP_RETURN si Tenant.cobrarEnDevolucion está activo) — si no, POSClient no
 * agrega nada al carrito y muestra el motivo, en vez de dejar que el cajero
 * llegue hasta el botón "Cobrar" para enterarse hasta el final.
 */
export async function getRepairParaCobro(tenantId: string, repairId: string): Promise<RepairParaCobro> {
  const db = getTenantPrisma(tenantId);

  const repair = await db.repair.findUnique({
    where: { id: repairId },
    select: {
      id: true,
      folio: true,
      status: true,
      branchId: true,
      customerId: true,
      deviceBrand: true,
      deviceModel: true,
      estimatedCost: true,
      finalCost: true,
      publicToken: true,
      customer: { select: { name: true } },
    },
  });
  if (!repair) return { ok: false, error: "Reparación no encontrada" };

  let esDevolucion = false;
  // Tenant.montoDevolucion (2026-09-26) — solo se necesita consultar cuando
  // la reparación SÍ es una devolución; se reutiliza esta misma consulta
  // para las dos cosas (si cobra, y con qué monto sugerido) en vez de dos
  // idas a la BD.
  let montoDevolucionTenant = 0;
  if (repair.status === "SHOP_RETURN") {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { cobrarEnDevolucion: true, montoDevolucion: true } });
    if (!tenant?.cobrarEnDevolucion) {
      return { ok: false, error: "Este negocio no cobra en devoluciones — entrégala directo desde Reparaciones" };
    }
    esDevolucion = true;
    montoDevolucionTenant = Number(tenant.montoDevolucion);
  } else if (repair.status !== "SHOP_READY") {
    return { ok: false, error: "Esta reparación ya fue cobrada o no está lista para cobro" };
  }

  return {
    ok: true,
    id: repair.id,
    folio: repair.folio,
    deviceBrand: repair.deviceBrand,
    deviceModel: repair.deviceModel,
    branchId: repair.branchId,
    customerId: repair.customerId,
    customerName: repair.customer.name,
    publicToken: repair.publicToken,
    montoSugerido: esDevolucion
      ? montoDevolucionTenant
      : repair.finalCost != null ? Number(repair.finalCost) : repair.estimatedCost != null ? Number(repair.estimatedCost) : 0,
    esDevolucion,
  };
}
