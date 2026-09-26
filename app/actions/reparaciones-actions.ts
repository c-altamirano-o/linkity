"use server";

import { prisma, getTenantPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { RepairStatus, Priority, CashSessionStatus, MovementType } from "@prisma/client";
import { resolverActor, puedeOperarSucursal } from "@/lib/actor";
import { PAIS_TELEFONO_DEFAULT } from "@/lib/paises";

/**
 * Server Actions del módulo Reparaciones (M9). Mismo criterio que
 * pos-actions.ts: nunca se confía en lo que manda el cliente más allá de
 * los ids — el estatus actual, la sucursal y el cliente siempre se
 * verifican contra la base de datos antes de escribir nada.
 *
 * El flujo de estatus que expone esta pantalla (recibido → en reparación →
 * listo/devolución en taller → listo/devolución en tienda → entregado) es
 * el mismo que ya traía el mockup — RepairStatus en el schema tiene más
 * valores (DIAGNOSING, WAITING_PARTS, READY, CANCELLED) pensados para un
 * flujo más granular a futuro, pero esta pantalla todavía no los usa, así
 * que TRANSICIONES_VALIDAS de abajo solo permite los saltos que la UI
 * actual ofrece.
 */

const PRIORIDAD_A_ENUM: Record<"LOW" | "NORMAL" | "HIGH" | "URGENT", Priority> = {
  LOW: Priority.LOW,
  NORMAL: Priority.NORMAL,
  HIGH: Priority.HIGH,
  URGENT: Priority.URGENT,
};

export interface CrearReparacionParams {
  tenantSlug: string;
  branchId: string;
  clienteId?: string | null;
  clienteNuevo?: { name: string; phone?: string; phoneCountryCode?: string } | null;
  marca: string;
  modelo: string;
  falla: string;
  // Contraseña/patrón de desbloqueo del equipo (2026-09-24, a petición de
  // Carlos — el Técnico de Reparación necesita verla para poder trabajar:
  // "solo puede ver... modelos y contraseñas de desbloqueo"). Opcional —
  // ver el comentario largo en Repair.deviceUnlockCode, schema.prisma.
  codigoDesbloqueo?: string | null;
  // Fecha estimada de entrega — se captura al recibir el equipo (a petición
  // de Carlos, 2026-09-21: "falta la fecha estimada de reparación, eso se
  // debe capturar al momento de ingresar el equipo, y debe aparecer en el
  // ticket"). El campo Repair.estimatedAt ya existía en el schema pero
  // ninguna acción lo escribía todavía. Llega como fecha simple "YYYY-MM-DD"
  // (input type="date" del formulario) — se guarda a medianoche, no importa
  // la hora exacta para esta fecha estimada.
  fechaEstimada?: string | null;
  prioridad: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  // Piezas/refacciones y/o servicios cotizados desde la recepción — 2026-09-24,
  // corrección explícita de Carlos: "esto debe ser un campo obligatorio, si
  // no existe una pieza cotizada debe ser un servicio, pero una reparación
  // no puede ingresar sin costo estipulado". Antes `costoEstimado` era un
  // número libre que alguien tecleaba, desconectado de las piezas (que a su
  // vez eran opcionales) — una reparación podía quedar sin nada cotizado.
  // Ahora se exige al menos UNA línea (una pieza del catálogo o un servicio,
  // ej. "diagnóstico"/"mano de obra" cuando no hay repuesto físico de por
  // medio — el catálogo de productos ya distingue PRODUCT/PART/SERVICE) y el
  // costo estimado de la reparación se calcula SIEMPRE como la suma de estas
  // líneas (ver más abajo) — nunca un número aparte que alguien capture a
  // mano. Solo se manda productId+quantity — el precio SIEMPRE se toma del
  // catálogo aquí en el servidor, nunca de lo que mande el cliente.
  piezas: { productId: string; quantity: number }[];
}

export type CrearReparacionResult =
  | { ok: true; id: string; folio: string }
  | { ok: false; error: string };

export async function crearReparacionAction(params: CrearReparacionParams): Promise<CrearReparacionResult> {
  const { tenantSlug, branchId, clienteId, clienteNuevo, marca, modelo, falla, codigoDesbloqueo, fechaEstimada, prioridad, piezas } = params;

  if (!branchId) return { ok: false, error: "Selecciona una sucursal" };
  if (!marca.trim() || !modelo.trim()) return { ok: false, error: "Marca y modelo son obligatorios" };
  if (!falla.trim()) return { ok: false, error: "Describe la falla reportada" };
  if (!clienteId && !clienteNuevo?.name.trim()) return { ok: false, error: "Selecciona o registra un cliente" };

  let fechaEstimadaDate: Date | null = null;
  if (fechaEstimada) {
    const parsed = new Date(`${fechaEstimada}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return { ok: false, error: "Fecha estimada inválida" };
    fechaEstimadaDate = parsed;
  }

  const piezasLimpias = (piezas ?? [])
    .filter((p) => p.productId && Number.isFinite(p.quantity) && p.quantity > 0)
    .map((p) => ({ productId: p.productId, quantity: Math.floor(p.quantity) }));

  // 2026-09-24, a petición de Carlos: "una reparación no puede ingresar sin
  // costo estipulado" — ver el comentario largo en CrearReparacionParams.piezas.
  if (piezasLimpias.length === 0) {
    return { ok: false, error: "Agrega al menos una pieza del catálogo o un servicio cotizado (ej. diagnóstico/mano de obra) — una reparación no puede ingresar sin un costo estipulado" };
  }

  // resolverActor (lib/actor.ts) acepta tanto una cuenta real (Supabase
  // Auth) como una sesión de PIN de personal (M11). A propósito SOLO
  // "reparaciones" (nunca "taller", 2026-09-21 a petición de Carlos): recibir
  // un equipo es tarea de Encargado/Recepción, no del técnico.
  const resuelto = await resolverActor(tenantSlug, "reparaciones");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant, dbUser } = resuelto;

  // 2026-09-21, a petición de Carlos: un empleado de PIN solo puede recibir
  // equipos en SU sucursal.
  if (!puedeOperarSucursal(resuelto, branchId)) {
    return { ok: false, error: "No tienes acceso a esa sucursal" };
  }

  const db = getTenantPrisma(tenant.id);

  try {
    const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true, code: true } });
    if (!branch) return { ok: false, error: "Sucursal no encontrada" };

    // Precio de cada pieza SIEMPRE tomado del catálogo en este momento
    // (nunca de lo que mande el cliente) — ver el comentario en
    // CrearReparacionParams.piezas.
    let preciosPiezas = new Map<string, number>();
    if (piezasLimpias.length > 0) {
      const productosDb = await db.product.findMany({
        where: { id: { in: piezasLimpias.map((p) => p.productId) } },
        select: { id: true, price: true },
      });
      preciosPiezas = new Map(productosDb.map((p) => [p.id, Number(p.price)]));
      const faltante = piezasLimpias.find((p) => !preciosPiezas.has(p.productId));
      if (faltante) return { ok: false, error: "Una de las piezas seleccionadas ya no existe en el catálogo" };
    }

    // Costo estimado = suma de lo cotizado (2026-09-24, a petición de Carlos)
    // — ya no es un número que alguien captura aparte, así el costo que ve
    // el cliente SIEMPRE coincide con lo que realmente se le cotizó.
    const costoEstimadoCalculado = piezasLimpias.reduce(
      (total, p) => total + (preciosPiezas.get(p.productId) ?? 0) * p.quantity,
      0,
    );

    let finalCustomerId = clienteId ?? null;
    if (finalCustomerId) {
      const cliente = await db.customer.findUnique({ where: { id: finalCustomerId }, select: { id: true } });
      if (!cliente) return { ok: false, error: "Cliente no encontrado" };
    } else if (clienteNuevo?.name.trim()) {
      const nuevoCliente = await db.customer.create({
        data: {
          tenantId: tenant.id,
          name: clienteNuevo.name.trim(),
          phone: clienteNuevo.phone?.trim() || null,
          phoneCountryCode: clienteNuevo.phoneCountryCode?.trim() || PAIS_TELEFONO_DEFAULT,
        },
      });
      finalCustomerId = nuevoCliente.id;
    }
    if (!finalCustomerId) return { ok: false, error: "Selecciona o registra un cliente" };

    // Folio — secuencial simple REP-0043, REP-0044... si la sucursal no
    // tiene código asignado (compatibilidad: negocio de una sola sucursal,
    // "si es solo una tienda no aplica", Carlos), o REP-{código}-0001,
    // REP-{código}-0002... con secuencia PROPIA por sucursal si el admin sí
    // le asignó un código (2026-09-22, a petición de Carlos, ejemplo "Fix
    // Expres": el folio debe contener un identificador de sucursal para
    // poder rastrear "la fuente del ingreso" en una gestión centralizada
    // multi-sucursal). Misma limitación de concurrencia ya documentada que
    // el folio de ventas en pos-actions.ts — y el mismo criterio se aplicó
    // ahí (ver crearVentaAction) para que un folio de venta y uno de
    // reparación de la misma sucursal compartan el mismo prefijo de origen.
    const prefijo = branch.code ? `REP-${branch.code}-` : "REP-";
    const patron = branch.code ? new RegExp(`^REP-${branch.code}-(\\d+)$`) : /^REP-(\d+)$/;
    // 2026-09-24, corrigiendo un bug real que Carlos encontró probando el
    // sistema como Cajero (la reparación fallaba con "No se pudo crear la
    // reparación" sin ninguna causa visible en pantalla — el log del
    // servidor mostraba "Unique constraint failed on
    // Repair_tenantId_folio_key"): esto tomaba el folio de "el repair más
    // reciente por receivedAt" y le sumaba 1 — pero receivedAt es la fecha
    // en que se recibió el equipo, que el mostrador puede capturar
    // libremente (o que datos de ejemplo/import pueden traer fuera de
    // orden) — "el más reciente por fecha" NO es lo mismo que "el de folio
    // más alto". En el tenant demo, por ejemplo, REP-CEN-0008 quedó con una
    // fecha de recepción ANTERIOR a REP-CEN-0007 — así que esto calculaba
    // "0008" de nuevo (ya existente) en vez de "0009", y Prisma tronaba
    // antes de crear nada. Ahora se revisan TODOS los folios de este mismo
    // prefijo (misma sucursal, o la secuencia global si no tiene código) y
    // se toma el número más alto entre todos, sin importar su fecha.
    const existentes = await db.repair.findMany({
      where: branch.code ? { branchId } : { branch: { code: null } },
      select: { folio: true },
    });
    let siguienteNum = 1;
    for (const { folio: f } of existentes) {
      const m = f.match(patron);
      if (m) siguienteNum = Math.max(siguienteNum, parseInt(m[1], 10) + 1);
    }
    const folio = `${prefijo}${String(siguienteNum).padStart(4, "0")}`;

    const repair = await db.$transaction(async (tx: any) => {
      const nuevo = await tx.repair.create({
        data: {
          tenantId: tenant.id,
          branchId,
          customerId: finalCustomerId,
          userId: dbUser.id,
          folio,
          deviceBrand: marca.trim(),
          deviceModel: modelo.trim(),
          issueDesc: falla.trim(),
          deviceUnlockCode: codigoDesbloqueo?.trim() || null,
          status: RepairStatus.RECEIVED,
          priority: PRIORIDAD_A_ENUM[prioridad] ?? Priority.NORMAL,
          estimatedCost: costoEstimadoCalculado,
          estimatedAt: fechaEstimadaDate,
        },
      });
      // visibleCliente:true — este es el primer checkpoint que verá el
      // cliente en la página pública de seguimiento (ver el comentario
      // largo en RepairHistory.visibleCliente, schema.prisma).
      await tx.repairHistory.create({
        data: { repairId: nuevo.id, status: RepairStatus.RECEIVED, notes: "Equipo recibido en taller", visibleCliente: true },
      });

      await tx.repairItem.createMany({
        data: piezasLimpias.map((p) => ({
          repairId: nuevo.id,
          productId: p.productId,
          quantity: p.quantity,
          price: preciosPiezas.get(p.productId)!,
        })),
      });

      return nuevo;
    });

    revalidatePath(`/${tenantSlug}/reparaciones`);
    revalidatePath(`/${tenantSlug}/taller`);
    revalidatePath(`/${tenantSlug}/dashboard`);

    return { ok: true, id: repair.id, folio: repair.folio };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al crear reparación:", err);
    return { ok: false, error: "No se pudo crear la reparación" };
  }
}

/**
 * Asigna (o reasigna) el técnico responsable de una reparación — exclusivo
 * de "aduana" (Recepción/Aduana del taller central, 2026-09-22, corrección
 * explícita de Carlos con el ejemplo hipotético "Fix Expres": "tampoco
 * puede seleccionar un tecnico, eso tambien se asigna en taller" [ahora vía
 * el rol de Recepción/Aduana, no desde la tienda ni desde el propio
 * técnico] — reemplaza la primera versión de este cambio, que por error lo
 * dejaba en la creación de la reparación desde tienda). No exige que el
 * técnico sea de la misma sucursal que el equipo — el taller centralizado
 * recibe equipos de VARIAS sucursales ("el taller se encuentra en una
 * ubicación diferente" a las tiendas), así que esa validación de
 * crearReparacionAction ya no aplicaba aquí.
 */
export async function asignarTecnicoAction(params: {
  tenantSlug: string;
  repairId: string;
  staffId: string | null;
}): Promise<AccionSimpleResult> {
  const { tenantSlug, repairId, staffId } = params;

  const resuelto = await resolverActor(tenantSlug, "aduana");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const repair = await db.repair.findUnique({ where: { id: repairId }, select: { id: true, status: true, publicToken: true } });
    if (!repair) return { ok: false, error: "Reparación no encontrada" };
    if (repair.status === RepairStatus.DELIVERED || repair.status === RepairStatus.CANCELLED) {
      return { ok: false, error: "No se puede reasignar técnico de una reparación ya cerrada" };
    }

    let staffIdValidado: string | null = null;
    let nombrePuesto: string | null = null;
    if (staffId) {
      // Nunca se confía en que el cliente mandó un id de técnico válido —
      // mismo criterio que el resto del archivo (ver crearReparacionAction).
      const tecnico = await db.staff.findUnique({
        where: { id: staffId },
        select: {
          id: true, isActive: true,
          role: { select: { name: true, permissions: { select: { permission: { select: { module: true } } } } } },
        },
      });
      const tieneTaller = tecnico?.role?.permissions.some((p) => p.permission.module === "taller") ?? false;
      if (!tecnico || !tecnico.isActive || !tieneTaller) {
        return { ok: false, error: "El técnico seleccionado no es válido" };
      }
      staffIdValidado = tecnico.id;
      nombrePuesto = tecnico.role?.name ?? "Técnico";
    }

    await db.$transaction(async (tx: any) => {
      await tx.repair.update({ where: { id: repairId }, data: { assignedToStaffId: staffIdValidado } });

      // Checkpoint visible al cliente (2026-09-24, a petición de Carlos):
      // "que diga 'Asignado a técnico reparador'" — SOLO el puesto (el
      // nombre real del rol asignado), nunca el nombre de la persona. Solo
      // se registra al asignar (no al quitar la asignación) — status queda
      // igual al actual, esta fila no representa un cambio de estatus real.
      if (staffIdValidado) {
        await tx.repairHistory.create({
          data: { repairId, status: repair.status, notes: `Asignado a ${nombrePuesto}`, visibleCliente: true },
        });
      }
    });

    revalidatePath(`/${tenantSlug}/aduana`);
    revalidatePath(`/${tenantSlug}/taller`);
    revalidatePath(`/${tenantSlug}/reparaciones`);
    if (staffIdValidado) revalidatePath(`/rep/${repair.publicToken}`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al asignar técnico:", err);
    return { ok: false, error: "No se pudo asignar el técnico" };
  }
}

/**
 * Piezas asignadas después de creada la reparación — el diagnóstico casi
 * siempre pasa después de la recepción. Esto es lo que activa el modelo
 * RepairItem (schema.prisma), que existía desde M9 pero nunca se usaba —
 * ver el hallazgo completo en la investigación de este cambio. No se
 * descuenta inventario aquí a propósito: esto es una cotización/registro de
 * qué se le va a cobrar al cliente por la reparación, no un punto de venta;
 * si a futuro se quiere reflejar el consumo de inventario al usar una
 * pieza, es una acción aparte para no acoplar ambas cosas.
 *
 * Exclusivo de "aduana" (2026-09-22, corregido a petición de Carlos): antes
 * el técnico (módulo "taller") también podía agregar piezas — Carlos fue
 * tajante en que la edición de costo/piezas cotizadas es solo de recepción
 * ("la edición del costo solo se puede hacer en recepción"), el técnico
 * cuando mucho puede ALERTAR que hace falta una cotización (ver
 * enviarAlertaTallerAction, más abajo).
 */
export type AccionPiezaResult = { ok: true } | { ok: false; error: string };

export async function agregarPiezaReparacionAction(params: {
  tenantSlug: string;
  repairId: string;
  productId: string;
  quantity: number;
}): Promise<AccionPiezaResult> {
  const { tenantSlug, repairId, productId, quantity } = params;
  const cantidad = Math.floor(quantity);
  if (!Number.isFinite(cantidad) || cantidad <= 0) return { ok: false, error: "Cantidad no válida" };

  const resuelto = await resolverActor(tenantSlug, "aduana");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const repair = await db.repair.findUnique({ where: { id: repairId }, select: { id: true, status: true } });
    if (!repair) return { ok: false, error: "Reparación no encontrada" };
    if (repair.status === RepairStatus.DELIVERED || repair.status === RepairStatus.CANCELLED) {
      return { ok: false, error: "No se pueden modificar piezas de una reparación ya cerrada" };
    }
    // A propósito SIN puedeOperarSucursal aquí (2026-09-22) — "aduana" es el
    // taller CENTRAL: recibe equipos de varias sucursales/tiendas, así que
    // no tiene sentido acotar por la sucursal propia del empleado de Aduana
    // (ver el mismo criterio en avanzarEstadoAction/actualizarCostoEstimadoAction).

    const producto = await db.product.findUnique({ where: { id: productId }, select: { id: true, price: true } });
    if (!producto) return { ok: false, error: "Producto no encontrado en el catálogo" };

    await db.repairItem.create({
      data: { repairId, productId, quantity: cantidad, price: producto.price },
    });

    revalidatePath(`/${tenantSlug}/aduana`);
    revalidatePath(`/${tenantSlug}/reparaciones`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al agregar pieza a reparación:", err);
    return { ok: false, error: "No se pudo agregar la pieza" };
  }
}

export async function eliminarPiezaReparacionAction(params: {
  tenantSlug: string;
  repairId: string;
  itemId: string;
}): Promise<AccionPiezaResult> {
  const { tenantSlug, repairId, itemId } = params;

  // Exclusivo de "aduana" (2026-09-22, corregido a petición de Carlos —
  // antes era "reparaciones", cuando ese módulo todavía tenía control total
  // sobre la reparación; ahora "reparaciones" es solo tienda: recibir con
  // folio y cobrar/entregar, nunca tocar piezas/costo/estatus/técnico).
  const resuelto = await resolverActor(tenantSlug, "aduana");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    // RepairItem no trae tenantId propio (no está en tenantModels,
    // lib/prisma.ts) — se llega a su tenant vía Repair, igual que SaleItem
    // en lib/catalogo-data.ts. Se valida a mano que el item sea de ESTE
    // repairId y que ese repair sea de este tenant antes de borrar nada.
    const item = await db.repairItem.findUnique({
      where: { id: itemId },
      select: { id: true, repairId: true, repair: { select: { tenantId: true, status: true } } },
    });
    if (!item || item.repairId !== repairId || item.repair.tenantId !== tenant.id) {
      return { ok: false, error: "Pieza no encontrada" };
    }
    if (item.repair.status === RepairStatus.DELIVERED || item.repair.status === RepairStatus.CANCELLED) {
      return { ok: false, error: "No se pueden modificar piezas de una reparación ya cerrada" };
    }
    // A propósito SIN puedeOperarSucursal — ver el comentario en
    // agregarPiezaReparacionAction (taller centralizado, varias sucursales).

    await db.repairItem.delete({ where: { id: itemId } });

    revalidatePath(`/${tenantSlug}/aduana`);
    revalidatePath(`/${tenantSlug}/reparaciones`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al quitar pieza de reparación:", err);
    return { ok: false, error: "No se pudo quitar la pieza" };
  }
}

/**
 * Permite ajustar el costo estimado después de creada la reparación (ej.
 * tras el diagnóstico, o para sumarle mano de obra al total de las piezas
 * asignadas) — antes de esto, estimatedCost solo se podía fijar una vez, al
 * crear la reparación. Exclusivo de "aduana" (2026-09-22, a petición de
 * Carlos: "la edición del costo solo se puede hacer en recepción"). El
 * registro en RepairHistory de abajo (ya existía desde antes de esta
 * corrección) es justo el "debe quedar guardada la fecha y la hora" que
 * Carlos pidió para cada cambio de costo — no hizo falta ningún campo
 * nuevo, solo mover qué rol puede llegar a esta acción.
 */
export async function actualizarCostoEstimadoAction(params: {
  tenantSlug: string;
  repairId: string;
  costoEstimado: number;
}): Promise<AccionPiezaResult> {
  const { tenantSlug, repairId, costoEstimado } = params;
  if (!Number.isFinite(costoEstimado) || costoEstimado < 0) return { ok: false, error: "Costo no válido" };

  const resuelto = await resolverActor(tenantSlug, "aduana");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const repair = await db.repair.findUnique({ where: { id: repairId }, select: { id: true, status: true } });
    if (!repair) return { ok: false, error: "Reparación no encontrada" };
    // A propósito SIN puedeOperarSucursal — ver el comentario en
    // agregarPiezaReparacionAction (taller centralizado, varias sucursales).

    await db.$transaction(async (tx: any) => {
      await tx.repair.update({ where: { id: repairId }, data: { estimatedCost: costoEstimado } });
      await tx.repairHistory.create({
        data: {
          repairId,
          // Mismo status actual (no un cambio de estatus real) — solo para
          // que el icono del historial no salga inconsistente con la fase
          // en la que de verdad está la reparación.
          status: repair.status,
          notes: `Costo estimado actualizado a ${costoEstimado.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}`,
        },
      });
    });

    revalidatePath(`/${tenantSlug}/aduana`);
    revalidatePath(`/${tenantSlug}/reparaciones`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al actualizar costo estimado:", err);
    return { ok: false, error: "No se pudo actualizar el costo" };
  }
}

export type NuevoEstadoReparacion =
  | "IN_REPAIR" | "WAITING_PARTS" | "WORKSHOP_READY" | "WORKSHOP_RETURN" | "SHOP_READY" | "SHOP_RETURN" | "DELIVERED";

const TRANSICIONES_VALIDAS: Record<string, NuevoEstadoReparacion[]> = {
  RECEIVED: ["IN_REPAIR"],
  // WAITING_PARTS ("en espera de refacción", 2026-09-22, a petición de
  // Carlos, ejemplo "Fix Expres" — antes existía en el enum pero ningún
  // salto de esta tabla lo usaba) se puede entrar y salir desde/hacia
  // IN_REPAIR: se pausa la reparación mientras llega la pieza, y se retoma
  // igual cuando ya está disponible.
  IN_REPAIR: ["WAITING_PARTS", "WORKSHOP_READY", "WORKSHOP_RETURN"],
  WAITING_PARTS: ["IN_REPAIR"],
  WORKSHOP_READY: ["SHOP_READY"],
  WORKSHOP_RETURN: ["SHOP_RETURN"],
  // SHOP_READY -> DELIVERED ya NO pasa por aquí a propósito: ese salto
  // requiere cobrarYEntregarAction (abajo), para que la entrega de un
  // equipo reparado SIEMPRE quede con un cobro y un método de pago
  // registrados. SHOP_RETURN -> DELIVERED se queda en esta tabla genérica
  // (una devolución no tiene cargo por default) PERO avanzarEstadoAction,
  // más abajo, la bloquea en tiempo real si Tenant.cobrarEnDevolucion está
  // activo para este negocio — en ese caso la entrega de una devolución
  // también debe pasar por cobrarYEntregarAction.
  SHOP_RETURN: ["DELIVERED"],
};

const NOTA_POR_ESTADO: Record<NuevoEstadoReparacion, string> = {
  IN_REPAIR: "Reparación iniciada",
  WAITING_PARTS: "En espera de refacción",
  WORKSHOP_READY: "Reparación completada — listo en taller",
  WORKSHOP_RETURN: "No se pudo reparar — marcado para devolución",
  SHOP_READY: "Equipo trasladado a tienda — listo para entrega",
  SHOP_RETURN: "Equipo trasladado a tienda — devolución al cliente",
  DELIVERED: "Equipo entregado al cliente",
};

export type AccionSimpleResult = { ok: true } | { ok: false; error: string };

export async function avanzarEstadoAction(params: {
  tenantSlug: string;
  repairId: string;
  nuevoEstado: NuevoEstadoReparacion;
}): Promise<AccionSimpleResult> {
  const { tenantSlug, repairId, nuevoEstado } = params;

  // Exclusivo de "aduana" (2026-09-22, corregido a petición de Carlos, tras
  // su corrección explícita: "solo la encargada de recepción puede cambiar
  // el estastus de un equipo" — antes "reparaciones" Y "taller" también
  // podían, ninguno de los dos debería). Cobrar y entregar (SHOP_READY ->
  // DELIVERED) sigue sin pasar por aquí, vive en cobrarYEntregarAction.
  const resuelto = await resolverActor(tenantSlug, "aduana");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const repair = await db.repair.findUnique({ where: { id: repairId }, select: { id: true, status: true, publicToken: true } });
    if (!repair) return { ok: false, error: "Reparación no encontrada" };
    // A propósito SIN puedeOperarSucursal — ver el comentario en
    // agregarPiezaReparacionAction (taller centralizado, varias sucursales).

    const permitidos = TRANSICIONES_VALIDAS[repair.status] ?? [];
    if (!permitidos.includes(nuevoEstado)) {
      return { ok: false, error: "Ese cambio de estatus no es válido desde el estatus actual" };
    }

    // Devolución con cargo configurable (2026-09-22, a petición de Carlos:
    // "eso debe ser configurable desde la pantalla del administrador" — una
    // sola regla para todo el negocio, ver Tenant.cobrarEnDevolucion). Si
    // está activo, SHOP_RETURN -> DELIVERED no puede saltarse el cobro.
    if (repair.status === RepairStatus.SHOP_RETURN && nuevoEstado === "DELIVERED") {
      const t = await prisma.tenant.findUnique({ where: { id: tenant.id }, select: { cobrarEnDevolucion: true } });
      if (t?.cobrarEnDevolucion) {
        return { ok: false, error: "Este negocio cobra en devoluciones — usa \"Cobrar y entregar\" en vez de entregar directo" };
      }
    }

    const estadoEnum = RepairStatus[nuevoEstado];

    await db.$transaction(async (tx: any) => {
      await tx.repair.update({
        where: { id: repairId },
        data: {
          status: estadoEnum,
          ...(nuevoEstado === "DELIVERED" ? { deliveredAt: new Date() } : {}),
        },
      });
      // visibleCliente:true — todo cambio de estatus real es un checkpoint
      // que ve el cliente en la página pública (ver RepairHistory.visibleCliente,
      // schema.prisma).
      await tx.repairHistory.create({
        data: { repairId, status: estadoEnum, notes: NOTA_POR_ESTADO[nuevoEstado], visibleCliente: true },
      });
    });

    revalidatePath(`/${tenantSlug}/aduana`);
    revalidatePath(`/${tenantSlug}/reparaciones`);
    revalidatePath(`/${tenantSlug}/dashboard`);
    revalidatePath(`/rep/${repair.publicToken}`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al avanzar estatus de reparación:", err);
    return { ok: false, error: "No se pudo actualizar el estatus" };
  }
}

export type MetodoPagoReparacion = "EFECTIVO" | "TARJETA" | "TRANSFERENCIA";

const METODO_PAGO_TEXTO: Record<MetodoPagoReparacion, string> = {
  EFECTIVO: "efectivo",
  TARJETA: "tarjeta",
  TRANSFERENCIA: "transferencia",
};

export type CobrarYEntregarResult =
  | { ok: true; sinCajaAbierta: boolean }
  | { ok: false; error: string };

/**
 * Cobra una reparación lista en tienda (SHOP_READY) y la marca como
 * entregada en un solo paso — antes esto solo avanzaba el estatus sin dejar
 * ningún registro de cuánto se cobró ni cómo. Repair.finalCost queda
 * guardado siempre; además, si el pago fue en efectivo Y hay una caja
 * abierta en la sucursal de la reparación, se registra un CashMovement de
 * ingreso ahí mismo (mismo criterio que Caja: solo el efectivo físico
 * afecta el conteo de la caja, tarjeta/transferencia no). Si no hay caja
 * abierta, el cobro se guarda igual en la reparación pero se avisa al
 * cliente (sinCajaAbierta) para que la UI lo informe.
 *
 * También acepta SHOP_RETURN (devolución) cuando Tenant.cobrarEnDevolucion
 * está activo (2026-09-22, a petición de Carlos) — mismo flujo de cobro,
 * para que un negocio que sí cobra por diagnosticar/intentar la reparación
 * no reparada deje ese cargo con el mismo registro (monto, método, caja)
 * que cualquier otro cobro, en vez de un camino aparte.
 */
export async function cobrarYEntregarAction(params: {
  tenantSlug: string;
  repairId: string;
  monto: number;
  metodoPago: MetodoPagoReparacion;
}): Promise<CobrarYEntregarResult> {
  const { tenantSlug, repairId, monto, metodoPago } = params;

  if (!Number.isFinite(monto) || monto < 0) {
    return { ok: false, error: "El monto a cobrar no es válido" };
  }

  // 2026-09-21, a petición de Carlos: a propósito SOLO "reparaciones" (nunca
  // "taller" ni "aduana") — cobrar dinero es tarea de tienda/mostrador.
  const resuelto = await resolverActor(tenantSlug, "reparaciones");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const repair = await db.repair.findUnique({
      where: { id: repairId },
      select: { id: true, status: true, branchId: true, folio: true, publicToken: true },
    });
    if (!repair) return { ok: false, error: "Reparación no encontrada" };

    let esDevolucionConCargo = false;
    if (repair.status === RepairStatus.SHOP_RETURN) {
      const t = await prisma.tenant.findUnique({ where: { id: tenant.id }, select: { cobrarEnDevolucion: true } });
      if (!t?.cobrarEnDevolucion) {
        return { ok: false, error: "Este negocio no cobra en devoluciones — usa \"Entregar\" directo" };
      }
      esDevolucionConCargo = true;
    } else if (repair.status !== RepairStatus.SHOP_READY) {
      return { ok: false, error: "Esta reparación no está lista para cobro y entrega" };
    }
    // 2026-09-21, a petición de Carlos: un empleado de PIN solo puede
    // cobrar/entregar reparaciones de SU sucursal.
    if (!puedeOperarSucursal(resuelto, repair.branchId)) {
      return { ok: false, error: "No tienes acceso a esa sucursal" };
    }

    let sinCajaAbierta = false;

    await db.$transaction(async (tx: any) => {
      await tx.repair.update({
        where: { id: repairId },
        data: { finalCost: monto, status: RepairStatus.DELIVERED, deliveredAt: new Date() },
      });
      // visibleCliente:true — es la confirmación de su propio cobro/entrega,
      // no expone nada del negocio que no le corresponda ya conocer.
      await tx.repairHistory.create({
        data: {
          repairId,
          status: RepairStatus.DELIVERED,
          notes: `Cobro${esDevolucionConCargo ? " de devolución" : ""} registrado: ${monto.toLocaleString("es-MX", {
            style: "currency",
            currency: "MXN",
          })} (${METODO_PAGO_TEXTO[metodoPago]}) — equipo entregado al cliente`,
          visibleCliente: true,
        },
      });

      if (metodoPago === "EFECTIVO" && monto > 0) {
        // Filtro por tenantId explícito (no se confía en que la extensión
        // de getTenantPrisma se propague dentro de $transaction).
        const sesion = await tx.cashSession.findFirst({
          where: { tenantId: tenant.id, branchId: repair.branchId, status: CashSessionStatus.OPEN },
          select: { id: true },
        });
        if (sesion) {
          await tx.cashMovement.create({
            data: {
              cashSessionId: sesion.id,
              type: MovementType.INCOME,
              amount: monto,
              concept: `Cobro reparación ${repair.folio}`,
            },
          });
        } else {
          sinCajaAbierta = true;
        }
      }
    });

    revalidatePath(`/${tenantSlug}/reparaciones`);
    revalidatePath(`/${tenantSlug}/caja`);
    revalidatePath(`/${tenantSlug}/dashboard`);
    revalidatePath(`/rep/${repair.publicToken}`);
    return { ok: true, sinCajaAbierta };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al cobrar y entregar reparación:", err);
    return { ok: false, error: "No se pudo registrar el cobro" };
  }
}

export async function marcarWhatsappEnviadoAction(params: {
  tenantSlug: string;
  repairId: string;
}): Promise<AccionSimpleResult> {
  const { tenantSlug, repairId } = params;

  // Mismo hallazgo que en avanzarEstadoAction — sin validación de sesión
  // antes de este cambio. A propósito SOLO "reparaciones" (nunca "taller"):
  // Carlos fue explícito en que ni siquiera es el técnico quien contacta al
  // cliente, es el Encargado o la Recepcionista.
  const resuelto = await resolverActor(tenantSlug, "reparaciones");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const repair = await db.repair.findUnique({ where: { id: repairId }, select: { id: true, branchId: true } });
    if (!repair) return { ok: false, error: "Reparación no encontrada" };
    // 2026-09-21, a petición de Carlos: un empleado de PIN solo puede
    // modificar reparaciones de SU sucursal.
    if (!puedeOperarSucursal(resuelto, repair.branchId)) {
      return { ok: false, error: "No tienes acceso a esa sucursal" };
    }

    await db.repair.update({ where: { id: repairId }, data: { whatsappSent: true } });

    revalidatePath(`/${tenantSlug}/reparaciones`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al marcar WhatsApp enviado:", err);
    return { ok: false, error: "No se pudo actualizar" };
  }
}

/**
 * Alerta del técnico hacia Aduana/Recepción/Tienda (2026-09-22, a petición
 * de Carlos, ejemplo "Fix Expres": "Si puede mandar una alerta a Aduana,
 * Recepción o Tienda en caso de necesitar información extra o realizar una
 * cotización"). Deliberadamente NO se construyó un modelo/tabla nueva para
 * esto — "verifica si ya existe para no duplicarlo" (Carlos) — se reutiliza
 * RepairHistory (mismo mecanismo que el historial de estatus y de cambios
 * de costo, ya con su timestamp automático): una alerta es una nota con el
 * ESTADO ACTUAL de la reparación (no cambia el estatus), prefijada para que
 * se distinga a simple vista de un cambio de estatus real en el timeline
 * que ya ve Aduana (AduanaClient) y tienda (ReparacionesClient).
 * Exclusivo de "taller" — es lo único que un técnico puede seguir
 * "escribiendo" sobre una reparación tras la corrección de este cambio.
 */
export async function enviarAlertaTallerAction(params: {
  tenantSlug: string;
  repairId: string;
  mensaje: string;
  // 2026-09-24, a petición de Carlos: la página pública de seguimiento debe
  // mostrar "un mensaje por parte del personal de taller en caso de que
  // necesite retroalimentación del cliente". En vez de un mecanismo aparte,
  // se reutiliza esta misma alerta — el técnico (o Aduana) puede marcar
  // explícitamente que ESTA nota es para que la vea el cliente (ej. "nos
  // falta tu autorización para cambiar la pantalla, contáctanos"). Default
  // false = comportamiento de siempre (alerta interna, solo Aduana/Tienda).
  paraCliente?: boolean;
}): Promise<AccionSimpleResult> {
  const { tenantSlug, repairId, paraCliente } = params;
  const mensaje = params.mensaje.trim().slice(0, 300);
  if (!mensaje) return { ok: false, error: "Escribe un mensaje para la alerta" };

  const resuelto = await resolverActor(tenantSlug, "taller");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const repair = await db.repair.findUnique({ where: { id: repairId }, select: { id: true, status: true, assignedToStaffId: true, publicToken: true } });
    if (!repair) return { ok: false, error: "Reparación no encontrada" };
    // Un técnico solo puede alertar sobre SU propio folio asignado — mismo
    // criterio de aislamiento que el filtro por miStaffId en TallerClient,
    // pero validado aquí en el servidor (nunca solo confiar en la UI).
    if (resuelto.actor === "staff" && repair.assignedToStaffId !== resuelto.dbUser.id) {
      // dbUser.id es el User "de atribución" del Staff (ver Staff.userId) —
      // no es directamente el Staff.id de assignedToStaffId, así que se
      // resuelve el Staff real de esta sesión antes de comparar.
      const staffPropio = await db.staff.findUnique({ where: { userId: resuelto.dbUser.id }, select: { id: true } });
      if (!staffPropio || repair.assignedToStaffId !== staffPropio.id) {
        return { ok: false, error: "Esta reparación no está asignada a ti" };
      }
    }

    await db.repairHistory.create({
      data: {
        repairId,
        status: repair.status,
        notes: `Alerta del técnico: ${mensaje}`,
        visibleCliente: paraCliente === true,
      },
    });

    revalidatePath(`/${tenantSlug}/aduana`);
    revalidatePath(`/${tenantSlug}/reparaciones`);
    revalidatePath(`/${tenantSlug}/taller`);
    if (paraCliente) revalidatePath(`/rep/${repair.publicToken}`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al enviar alerta de taller:", err);
    return { ok: false, error: "No se pudo enviar la alerta" };
  }
}
