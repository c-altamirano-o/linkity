import "server-only";

import { getTenantPrisma } from "@/lib/prisma";

/**
 * Capa de datos de Recetas digitales (M17 — Fase 2, 2026-09-21). Mismo
 * patrón que consentimiento-data.ts: un mapa `customerId -> RecetaUI[]`
 * para todos los clientes del tenant de una sola vez — puede haber varias
 * recetas por paciente a lo largo del tiempo.
 *
 * A diferencia de InformedConsent (que firma el PACIENTE), aquí quien firma
 * es el DOCTOR que prescribe — mismo criterio que TreatmentPlan.userId
 * ("doctor que propone"), por eso `doctor` sale de Prescription.userId, no
 * de quien registró la acción.
 */

export interface RecetaUI {
  id: string;
  medications: string;
  indications: string | null;
  doctor: string;
  firmaImagen: string | null; // base64 PNG, firma del doctor
  creadoEn: string; // ISO
}

export async function getRecetasData(tenantId: string): Promise<Record<string, RecetaUI[]>> {
  const db = getTenantPrisma(tenantId);

  const recetasRaw = await db.prescription.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true } } },
  });

  const recetas: Record<string, RecetaUI[]> = {};

  for (const r of recetasRaw) {
    if (!recetas[r.customerId]) recetas[r.customerId] = [];
    recetas[r.customerId].push({
      id: r.id,
      medications: r.medications,
      indications: r.indications,
      doctor: r.user.name,
      firmaImagen: r.doctorSignature,
      creadoEn: r.createdAt.toISOString(),
    });
  }

  return recetas;
}
