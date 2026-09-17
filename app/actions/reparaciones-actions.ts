"use server";

import { getTenantPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { RepairStatus, Priority, CashSessionStatus, MovementType } from "@prisma/client";
import { resolverActor } from "@/lib/actor";
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
  costoEstimado?: number | null;
  prioridad: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  // Piezas/refacciones que ya se saben necesarias desde la recepción (ej.
  // "se ve que necesita pantalla nueva"). Solo se manda productId+quantity
  // — el precio SIEMPRE se toma del catálogo aquí en el servidor, nunca de
  // lo que mande el cliente, para que nadie pueda cotizar una pieza más
  // barata manipulando la petición.
  piezas?: { productId: string; quantity: number }[];
}

export type CrearReparacionResult =
  | { ok: true; id: string; folio: string }
  | { ok: false; error: string };

export async function crearReparacionAction(params: CrearReparacionParams): Promise<CrearReparacionResult> {
  const { tenantSlug, branchId, clienteId, clienteNuevo, marca, modelo, falla, costoEstimado, prioridad, piezas } = params;

  if (!branchId) return { ok: false, error: "Selecciona una sucursal" };
  if (!marca.trim() || !modelo.trim()) return { ok: false, error: "Marca y modelo son obligatorios" };
  if (!falla.trim()) return { ok: false, error: "Describe la falla reportada" };
  if (!clienteId && !clienteNuevo?.name.trim()) return { ok: false, error: "Selecciona o registra un cliente" };

  const piezasLimpias = (piezas ?? [])
    .filter((p) => p.productId && Number.isFinite(p.quantity) && p.quantity > 0)
    .map((p) => ({ productId: p.productId, quantity: Math.floor(p.quantity) }));

  // resolverActor (lib/actor.ts) acepta tanto una cuenta real (Supabase
  // Auth) como una sesión de PIN de personal (M11) — Técnico, Cajero y
  // Gerente tienen "reparaciones" en su matriz de acceso (lib/roles.ts).
  const resuelto = await resolverActor(tenantSlug, "reparaciones");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant, dbUser } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true } });
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

    // Folio secuencial simple REP-0043, REP-0044, ... — mismo patrón (y
    // misma limitación de concurrencia, ya documentada) que el folio de
    // ventas en pos-actions.ts.
    const ultima = await db.repair.findFirst({
      orderBy: { receivedAt: "desc" },
      select: { folio: true },
    });
    let siguienteNum = 1;
    const m = ultima?.folio.match(/^REP-(\d+)$/);
    if (m) siguienteNum = parseInt(m[1], 10) + 1;
    const folio = `REP-${String(siguienteNum).padStart(4, "0")}`;

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
          status: RepairStatus.RECEIVED,
          priority: PRIORIDAD_A_ENUM[prioridad] ?? Priority.NORMAL,
          estimatedCost: costoEstimado ?? null,
        },
      });
      await tx.repairHistory.create({
        data: { repairId: nuevo.id, status: RepairStatus.RECEIVED, notes: "Equipo recibido en taller" },
      });

      if (piezasLimpias.length > 0) {
        await tx.repairItem.createMany({
          data: piezasLimpias.map((p) => ({
            repairId: nuevo.id,
            productId: p.productId,
            quantity: p.quantity,
            price: preciosPiezas.get(p.productId)!,
          })),
        });
      }

      return nuevo;
    });

    revalidatePath(`/${tenantSlug}/reparaciones`);
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
 * Piezas asignadas después de creada la reparación — el diagnóstico casi
 * siempre pasa después de la recepción, así que el técnico necesita poder
 * agregar (o quitar) piezas mientras la reparación sigue en curso, no solo
 * al momento de capturarla. Esto es lo que activa por fin el modelo
 * RepairItem (schema.prisma), que existía desde M9 pero nunca se usaba —
 * ver el hallazgo completo en la investigación de este cambio. No se
 * descuenta inventario aquí a propósito: esto es una cotización/registro de
 * qué se le va a cobrar al cliente por la reparación, no un punto de venta;
 * si a futuro se quiere reflejar el consumo de inventario al usar una
 * pieza, es una acción aparte para no acoplar ambas cosas.
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

  const resuelto = await resolverActor(tenantSlug, "reparaciones");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const repair = await db.repair.findUnique({ where: { id: repairId }, select: { id: true, status: true } });
    if (!repair) return { ok: false, error: "Reparación no encontrada" };
    if (repair.status === RepairStatus.DELIVERED || repair.status === RepairStatus.CANCELLED) {
      return { ok: false, error: "No se pueden modificar piezas de una reparación ya cerrada" };
    }

    const producto = await db.product.findUnique({ where: { id: productId }, select: { id: true, price: true } });
    if (!producto) return { ok: false, error: "Producto no encontrado en el catálogo" };

    await db.repairItem.create({
      data: { repairId, productId, quantity: cantidad, price: producto.price },
    });

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

  const resuelto = await resolverActor(tenantSlug, "reparaciones");
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

    await db.repairItem.delete({ where: { id: itemId } });

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
 * crear la reparación.
 */
export async function actualizarCostoEstimadoAction(params: {
  tenantSlug: string;
  repairId: string;
  costoEstimado: number;
}): Promise<AccionPiezaResult> {
  const { tenantSlug, repairId, costoEstimado } = params;
  if (!Number.isFinite(costoEstimado) || costoEstimado < 0) return { ok: false, error: "Costo no válido" };

  const resuelto = await resolverActor(tenantSlug, "reparaciones");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const repair = await db.repair.findUnique({ where: { id: repairId }, select: { id: true, status: true } });
    if (!repair) return { ok: false, error: "Reparación no encontrada" };

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
  | "IN_REPAIR" | "WORKSHOP_READY" | "WORKSHOP_RETURN" | "SHOP_READY" | "SHOP_RETURN" | "DELIVERED";

const TRANSICIONES_VALIDAS: Record<string, NuevoEstadoReparacion[]> = {
  RECEIVED: ["IN_REPAIR"],
  IN_REPAIR: ["WORKSHOP_READY", "WORKSHOP_RETURN"],
  WORKSHOP_READY: ["SHOP_READY"],
  WORKSHOP_RETURN: ["SHOP_RETURN"],
  // SHOP_READY -> DELIVERED ya NO pasa por aquí a propósito: ahora ese
  // salto requiere cobrarYEntregarAction (abajo), para que la entrega de
  // un equipo reparado SIEMPRE quede con un cobro y un método de pago
  // registrados. SHOP_RETURN -> DELIVERED se queda en esta tabla genérica
  // porque una devolución (no se pudo reparar) no tiene cargo.
  SHOP_RETURN: ["DELIVERED"],
};

const NOTA_POR_ESTADO: Record<NuevoEstadoReparacion, string> = {
  IN_REPAIR: "Reparación iniciada",
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

  // Hallazgo al conectar este archivo a las sesiones de PIN de personal
  // (M11): esta acción no validaba ninguna sesión — cualquiera que
  // adivinara tenantSlug+repairId podía avanzar el estatus de una
  // reparación. Se cierra aquí de paso, con el mismo resolverActor que ya
  // usa el resto del archivo.
  const resuelto = await resolverActor(tenantSlug, "reparaciones");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const repair = await db.repair.findUnique({ where: { id: repairId }, select: { id: true, status: true } });
    if (!repair) return { ok: false, error: "Reparación no encontrada" };

    const permitidos = TRANSICIONES_VALIDAS[repair.status] ?? [];
    if (!permitidos.includes(nuevoEstado)) {
      return { ok: false, error: "Ese cambio de estatus no es válido desde el estatus actual" };
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
      await tx.repairHistory.create({
        data: { repairId, status: estadoEnum, notes: NOTA_POR_ESTADO[nuevoEstado] },
      });
    });

    revalidatePath(`/${tenantSlug}/reparaciones`);
    revalidatePath(`/${tenantSlug}/dashboard`);
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

  const resuelto = await resolverActor(tenantSlug, "reparaciones");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const repair = await db.repair.findUnique({
      where: { id: repairId },
      select: { id: true, status: true, branchId: true, folio: true },
    });
    if (!repair) return { ok: false, error: "Reparación no encontrada" };
    if (repair.status !== RepairStatus.SHOP_READY) {
      return { ok: false, error: "Esta reparación no está lista para cobro y entrega" };
    }

    let sinCajaAbierta = false;

    await db.$transaction(async (tx: any) => {
      await tx.repair.update({
        where: { id: repairId },
        data: { finalCost: monto, status: RepairStatus.DELIVERED, deliveredAt: new Date() },
      });
      await tx.repairHistory.create({
        data: {
          repairId,
          status: RepairStatus.DELIVERED,
          notes: `Cobro registrado: ${monto.toLocaleString("es-MX", {
            style: "currency",
            currency: "MXN",
          })} (${METODO_PAGO_TEXTO[metodoPago]}) — equipo entregado al cliente`,
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
  // antes de este cambio.
  const resuelto = await resolverActor(tenantSlug, "reparaciones");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const repair = await db.repair.findUnique({ where: { id: repairId }, select: { id: true } });
    if (!repair) return { ok: false, error: "Reparación no encontrada" };

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
