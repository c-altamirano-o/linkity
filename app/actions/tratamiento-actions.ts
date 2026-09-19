"use server";

import { getTenantPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PaymentMethod, CashSessionStatus, MovementType } from "@prisma/client";
import { resolverActor } from "@/lib/actor";
import { DIENTES_FDI_VALIDOS } from "@/lib/odontograma-fdi";

/**
 * Server Actions de Plan de Tratamiento por fases (M17 — Fase 2 de
 * "Propuesta: Consultorio Dental para Linkity", 2026-09-19). Mismo criterio
 * que expediente-actions.ts/citas-actions.ts: se valida y se verifica
 * ownership del tenant antes de tocar la base de datos.
 *
 * TreatmentPlanItem no tiene tenantId propio (ver el comentario largo en
 * schema.prisma y en tenantModels, lib/prisma.ts) — cada acción sobre un
 * item verifica a mano que `item.treatmentPlan.tenantId === tenant.id`
 * antes de mutar nada, mismo criterio que ya usa
 * eliminarPiezaReparacionAction para RepairItem.
 */

export type AccionTratamientoResult = { ok: true } | { ok: false; error: string };

export interface NuevoItemPlan {
  descripcion: string;
  diente?: number | null;
  costo: number;
}

export async function crearPlanTratamientoAction(params: {
  tenantSlug: string;
  customerId: string;
  branchId: string;
  doctorUserId: string;
  titulo: string;
  notas?: string | null;
  items: NuevoItemPlan[];
}): Promise<AccionTratamientoResult> {
  const { tenantSlug, customerId, branchId, doctorUserId, titulo, notas, items } = params;

  if (!titulo?.trim()) return { ok: false, error: "Dale un título al plan de tratamiento" };
  if (!branchId) return { ok: false, error: "Selecciona una sucursal" };
  if (!doctorUserId) return { ok: false, error: "Selecciona un doctor" };
  if (!items || items.length === 0) return { ok: false, error: "Agrega al menos una fase al plan" };
  for (const it of items) {
    if (!it.descripcion?.trim()) return { ok: false, error: "Cada fase necesita una descripción" };
    if (!Number.isFinite(it.costo) || it.costo < 0) return { ok: false, error: "Hay un costo no válido en el plan" };
    if (it.diente != null && !DIENTES_FDI_VALIDOS.has(it.diente)) {
      return { ok: false, error: "Hay un número de diente no válido en el plan" };
    }
  }

  const resuelto = await resolverActor(tenantSlug, "expediente-clinico");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant, dbUser } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const [cliente, sucursal] = await Promise.all([
      db.customer.findUnique({ where: { id: customerId }, select: { id: true } }),
      db.branch.findUnique({ where: { id: branchId }, select: { id: true } }),
    ]);
    if (!cliente) return { ok: false, error: "Cliente no encontrado" };
    if (!sucursal) return { ok: false, error: "Sucursal no encontrada" };

    await db.treatmentPlan.create({
      data: {
        tenantId: tenant.id,
        customerId,
        branchId,
        userId: doctorUserId,
        title: titulo.trim(),
        notes: notas?.trim() || null,
        items: {
          create: items.map((it, i) => ({
            description: it.descripcion.trim(),
            toothNumber: it.diente ?? null,
            cost: it.costo,
            order: i,
          })),
        },
      },
    });

    revalidatePath(`/${tenantSlug}/clientes`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al crear plan de tratamiento:", err);
    return { ok: false, error: "No se pudo crear el plan de tratamiento" };
  }
}

// Verifica que itemId sea de este tenant y regresa el item con lo necesario
// para las dos acciones de abajo — evita repetir el mismo findUnique+chequeo
// dos veces.
async function verificarItemDelTenant(
  db: ReturnType<typeof getTenantPrisma>,
  tenantId: string,
  itemId: string
) {
  const item = await db.treatmentPlanItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      status: true,
      treatmentPlan: { select: { tenantId: true, branchId: true } },
    },
  });
  if (!item || item.treatmentPlan.tenantId !== tenantId) return null;
  return item;
}

export async function actualizarEstadoItemAction(params: {
  tenantSlug: string;
  itemId: string;
  estado: "ACEPTADO" | "RECHAZADO";
}): Promise<AccionTratamientoResult> {
  const { tenantSlug, itemId, estado } = params;

  const resuelto = await resolverActor(tenantSlug, "expediente-clinico");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const item = await verificarItemDelTenant(db, tenant.id, itemId);
    if (!item) return { ok: false, error: "Fase no encontrada" };
    if (item.status === "PAGADO") {
      return { ok: false, error: "Esta fase ya está pagada, no se puede cambiar" };
    }

    await db.treatmentPlanItem.update({ where: { id: itemId }, data: { status: estado } });

    revalidatePath(`/${tenantSlug}/clientes`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al actualizar estado de fase:", err);
    return { ok: false, error: "No se pudo actualizar la fase" };
  }
}

export type MetodoPagoPlanInput = "CASH" | "CARD" | "TRANSFER";

export type CobrarItemPlanResult =
  | { ok: true; sinCajaAbierta: boolean }
  | { ok: false; error: string };

export async function cobrarItemPlanAction(params: {
  tenantSlug: string;
  itemId: string;
  metodoPago: MetodoPagoPlanInput;
}): Promise<CobrarItemPlanResult> {
  const { tenantSlug, itemId, metodoPago } = params;

  const resuelto = await resolverActor(tenantSlug, "expediente-clinico");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const item = await db.treatmentPlanItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        status: true,
        description: true,
        cost: true,
        treatmentPlan: { select: { tenantId: true, branchId: true, title: true } },
      },
    });
    if (!item || item.treatmentPlan.tenantId !== tenant.id) return { ok: false, error: "Fase no encontrada" };
    if (item.status !== "ACEPTADO") {
      return { ok: false, error: "Esta fase debe estar aceptada por el paciente antes de cobrarse" };
    }

    let sinCajaAbierta = false;

    // Mismo criterio que cobrarYEntregarAction (reparaciones-actions.ts):
    // solo un pago en EFECTIVO mueve la caja física (CashMovement); tarjeta
    // y transferencia se registran en el item pero no tocan CashSession.
    await db.$transaction(async (tx: any) => {
      await tx.treatmentPlanItem.update({
        where: { id: itemId },
        data: { status: "PAGADO", paidAt: new Date(), paymentMethod: PaymentMethod[metodoPago] },
      });

      if (metodoPago === "CASH") {
        const sesion = await tx.cashSession.findFirst({
          where: { tenantId: tenant.id, branchId: item.treatmentPlan.branchId, status: CashSessionStatus.OPEN },
          select: { id: true },
        });
        if (sesion) {
          await tx.cashMovement.create({
            data: {
              cashSessionId: sesion.id,
              type: MovementType.INCOME,
              amount: item.cost,
              concept: `Plan de tratamiento "${item.treatmentPlan.title}" — ${item.description}`,
            },
          });
        } else {
          sinCajaAbierta = true;
        }
      }
    });

    revalidatePath(`/${tenantSlug}/clientes`);
    revalidatePath(`/${tenantSlug}/caja`);
    revalidatePath(`/${tenantSlug}/dashboard`);
    return { ok: true, sinCajaAbierta };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al cobrar fase de tratamiento:", err);
    return { ok: false, error: "No se pudo registrar el cobro" };
  }
}
