"use server";

import { getTenantPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { resolverActor } from "@/lib/actor";

/**
 * Server Action de Recetas digitales (M17 — Fase 2 de "Propuesta:
 * Consultorio Dental para Linkity", 2026-09-21). Mismo criterio que
 * consentimiento-actions.ts: se valida y se verifica ownership del tenant
 * antes de tocar la base de datos.
 *
 * A diferencia de Consentimiento Informado (donde userId es quien registró
 * la acción, dbUser.id), aquí userId es el DOCTOR QUE PRESCRIBE
 * (doctorUserId, elegido de un selector) — mismo criterio que
 * TreatmentPlan.userId en tratamiento-actions.ts, porque quien captura la
 * receta en pantalla (ej. una asistente) no siempre es el mismo doctor que
 * la firma.
 */

export type AccionRecetaResult = { ok: true } | { ok: false; error: string };

export async function crearRecetaAction(params: {
  tenantSlug: string;
  customerId: string;
  doctorUserId: string;
  medications: string;
  indications?: string | null;
  firmaImagen: string; // base64 PNG del canvas, firma del doctor
}): Promise<AccionRecetaResult> {
  const { tenantSlug, customerId, doctorUserId, medications, indications, firmaImagen } = params;

  if (!doctorUserId) return { ok: false, error: "Selecciona un doctor" };
  if (!medications?.trim()) return { ok: false, error: "Especifica al menos un medicamento" };
  if (!firmaImagen?.startsWith("data:image/")) return { ok: false, error: "Falta capturar la firma del doctor" };

  const resuelto = await resolverActor(tenantSlug, "expediente-clinico");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const cliente = await db.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!cliente) return { ok: false, error: "Cliente no encontrado" };

    await db.prescription.create({
      data: {
        tenantId: tenant.id,
        customerId,
        userId: doctorUserId,
        medications: medications.trim(),
        indications: indications?.trim() || null,
        doctorSignature: firmaImagen,
      },
    });

    revalidatePath(`/${tenantSlug}/clientes`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al crear receta:", err);
    return { ok: false, error: "No se pudo guardar la receta" };
  }
}
