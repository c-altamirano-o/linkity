"use server";

import { prisma, getTenantPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { resolverActor } from "@/lib/actor";
import { obtenerPlantilla, NOTA_FIRMA_SIMULADA } from "@/lib/consentimiento-templates";

/**
 * Server Actions de Consentimiento Informado (M17 — Fase 2 de "Propuesta:
 * Consultorio Dental para Linkity", 2026-09-21). Mismo criterio que
 * tratamiento-actions.ts: se valida y se verifica ownership del tenant
 * antes de tocar la base de datos.
 *
 * A propósito una sola acción crea Y firma el consentimiento en el mismo
 * paso — en la práctica real, el personal genera el documento y se lo pasa
 * al paciente para que firme ahí mismo en pantalla, no hay un estado
 * intermedio "creado sin firmar" que valga la pena modelar para esta fase.
 */

export type AccionConsentimientoResult = { ok: true } | { ok: false; error: string };

export async function crearConsentimientoAction(params: {
  tenantSlug: string;
  customerId: string;
  procedureType: string;
  treatmentPlanItemId?: string | null;
  firmaImagen: string; // base64 PNG del canvas
  firmadoPor: string;
}): Promise<AccionConsentimientoResult> {
  const { tenantSlug, customerId, procedureType, treatmentPlanItemId, firmaImagen, firmadoPor } = params;

  if (!firmadoPor?.trim()) return { ok: false, error: "Falta el nombre de quien firma" };
  if (!firmaImagen?.startsWith("data:image/")) return { ok: false, error: "Falta capturar la firma" };

  const resuelto = await resolverActor(tenantSlug, "expediente-clinico");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant, dbUser } = resuelto;

  // resolverActor solo selecciona tenant.id — el rubro (para elegir la
  // plantilla correcta) se consulta aparte, mismo criterio que
  // clientes/page.tsx. businessType es String? en schema.prisma (puede ser
  // null en un tenant sin rubro configurado) — "" nunca matchea ninguna
  // plantilla, así que obtenerPlantilla regresa null igual que un rubro
  // desconocido.
  const tenantInfo = await prisma.tenant.findUnique({ where: { id: tenant.id }, select: { businessType: true } });
  const plantilla = tenantInfo ? obtenerPlantilla(tenantInfo.businessType ?? "", procedureType) : null;
  if (!plantilla) return { ok: false, error: "Tipo de procedimiento no válido" };

  const db = getTenantPrisma(tenant.id);

  try {
    const cliente = await db.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!cliente) return { ok: false, error: "Cliente no encontrado" };

    if (treatmentPlanItemId) {
      // TreatmentPlanItem no tiene tenantId propio (ver el comentario largo
      // en schema.prisma) — se verifica a mano que sea del mismo tenant Y
      // del mismo paciente antes de ligarlo, mismo criterio que
      // tratamiento-actions.ts.
      const item = await db.treatmentPlanItem.findUnique({
        where: { id: treatmentPlanItemId },
        select: { treatmentPlan: { select: { tenantId: true, customerId: true } } },
      });
      if (!item || item.treatmentPlan.tenantId !== tenant.id || item.treatmentPlan.customerId !== customerId) {
        return { ok: false, error: "La fase del plan de tratamiento no es válida para este cliente" };
      }
    }

    await db.informedConsent.create({
      data: {
        tenantId: tenant.id,
        customerId,
        userId: dbUser.id,
        procedureType,
        content: `${plantilla.cuerpo}\n\n${NOTA_FIRMA_SIMULADA}`,
        treatmentPlanItemId: treatmentPlanItemId || null,
        patientSignature: firmaImagen,
        signedByName: firmadoPor.trim(),
        signedAt: new Date(),
      },
    });

    revalidatePath(`/${tenantSlug}/clientes`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al crear consentimiento informado:", err);
    return { ok: false, error: "No se pudo guardar el consentimiento" };
  }
}
