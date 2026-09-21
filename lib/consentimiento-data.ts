import "server-only";

import { getTenantPrisma } from "@/lib/prisma";

/**
 * Capa de datos de Consentimiento Informado (M17 — Fase 2, 2026-09-21).
 * Mismo patrón que tratamiento-data.ts: un mapa `customerId -> ConsentimientoUI[]`
 * para todos los clientes del tenant de una sola vez — puede haber varios
 * consentimientos por paciente a lo largo del tiempo.
 */

export interface ConsentimientoUI {
  id: string;
  procedureType: string; // id de la plantilla (ver lib/consentimiento-templates.ts)
  content: string;
  doctor: string;
  firmado: boolean;
  firmaImagen: string | null; // base64 PNG, solo si ya está firmado
  firmadoPor: string | null;
  firmadoEn: string | null; // ISO
  creadoEn: string; // ISO
  // Descripción de la fase del plan de tratamiento a la que está ligado,
  // si aplica (ej. "Endodoncia · Diente 13") — solo para mostrarlo, no se
  // usa para nada más aquí.
  itemPlanDescripcion: string | null;
}

export async function getConsentimientosData(tenantId: string): Promise<Record<string, ConsentimientoUI[]>> {
  const db = getTenantPrisma(tenantId);

  const consentimientosRaw = await db.informedConsent.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true } },
      treatmentPlanItem: { select: { description: true, toothNumber: true } },
    },
  });

  const consentimientos: Record<string, ConsentimientoUI[]> = {};

  for (const c of consentimientosRaw) {
    if (!consentimientos[c.customerId]) consentimientos[c.customerId] = [];
    consentimientos[c.customerId].push({
      id: c.id,
      procedureType: c.procedureType,
      content: c.content,
      doctor: c.user.name,
      firmado: !!c.signedAt,
      firmaImagen: c.patientSignature,
      firmadoPor: c.signedByName,
      firmadoEn: c.signedAt ? c.signedAt.toISOString() : null,
      creadoEn: c.createdAt.toISOString(),
      itemPlanDescripcion: c.treatmentPlanItem
        ? c.treatmentPlanItem.toothNumber
          ? `${c.treatmentPlanItem.description} · Diente ${c.treatmentPlanItem.toothNumber}`
          : c.treatmentPlanItem.description
        : null,
    });
  }

  return consentimientos;
}
