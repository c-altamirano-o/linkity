"use server";

import { getTenantPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { ToothCondition } from "@prisma/client";
import { resolverActor } from "@/lib/actor";
import { DIENTES_FDI_VALIDOS } from "@/lib/expediente-data";

/**
 * Server Actions del módulo Expediente Clínico + Odontograma (M16 — Fase 1
 * de "Propuesta: Consultorio Dental para Linkity", 2026-09-18). Mismo
 * criterio que citas-actions.ts/clientes-actions.ts: el cliente del
 * navegador solo manda los campos capturados, y aquí se valida y se
 * verifica que el `customerId` recibido pertenezca de verdad a este tenant
 * antes de tocar la base de datos — no basta con que getTenantPrisma inyecte
 * tenantId en el create/upsert, porque un customerId ajeno pasado a mano
 * igual fallaría solo hasta el intento de escritura, no antes.
 */

async function verificarClienteDelTenant(db: ReturnType<typeof getTenantPrisma>, customerId: string) {
  const cliente = await db.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  return !!cliente;
}

export type AccionExpedienteResult = { ok: true } | { ok: false; error: string };

export interface DatosAntecedentes {
  tipoSangre?: string | null;
  alergias?: string | null;
  enfermedadesCronicas?: string | null;
  medicamentosActuales?: string | null;
  cirugiasPrevias?: string | null;
  antecedentesFamiliares?: string | null;
  notasGenerales?: string | null;
}

export async function guardarAntecedentesAction(
  params: { tenantSlug: string; customerId: string } & DatosAntecedentes
): Promise<AccionExpedienteResult> {
  const { tenantSlug, customerId, ...datos } = params;

  const resuelto = await resolverActor(tenantSlug, "expediente-clinico");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    if (!(await verificarClienteDelTenant(db, customerId))) {
      return { ok: false, error: "Cliente no encontrado" };
    }

    await db.patientRecord.upsert({
      where: { customerId },
      create: {
        tenantId: tenant.id,
        customerId,
        bloodType: datos.tipoSangre?.trim() || null,
        allergies: datos.alergias?.trim() || null,
        chronicConditions: datos.enfermedadesCronicas?.trim() || null,
        currentMedications: datos.medicamentosActuales?.trim() || null,
        previousSurgeries: datos.cirugiasPrevias?.trim() || null,
        familyHistory: datos.antecedentesFamiliares?.trim() || null,
        generalNotes: datos.notasGenerales?.trim() || null,
      },
      update: {
        bloodType: datos.tipoSangre?.trim() || null,
        allergies: datos.alergias?.trim() || null,
        chronicConditions: datos.enfermedadesCronicas?.trim() || null,
        currentMedications: datos.medicamentosActuales?.trim() || null,
        previousSurgeries: datos.cirugiasPrevias?.trim() || null,
        familyHistory: datos.antecedentesFamiliares?.trim() || null,
        generalNotes: datos.notasGenerales?.trim() || null,
      },
    });

    revalidatePath(`/${tenantSlug}/clientes`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al guardar antecedentes:", err);
    return { ok: false, error: "No se pudieron guardar los antecedentes" };
  }
}

export interface DatosNotaEvolucion {
  motivo: string;
  diagnostico?: string | null;
  tratamiento?: string | null;
  notas?: string | null;
}

export async function crearNotaEvolucionAction(
  params: { tenantSlug: string; customerId: string } & DatosNotaEvolucion
): Promise<AccionExpedienteResult> {
  const { tenantSlug, customerId, motivo, diagnostico, tratamiento, notas } = params;

  if (!motivo?.trim()) return { ok: false, error: "Describe el motivo de la consulta" };

  const resuelto = await resolverActor(tenantSlug, "expediente-clinico");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant, dbUser } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    if (!(await verificarClienteDelTenant(db, customerId))) {
      return { ok: false, error: "Cliente no encontrado" };
    }

    await db.clinicalNote.create({
      data: {
        tenantId: tenant.id,
        customerId,
        userId: dbUser.id,
        reason: motivo.trim(),
        diagnosis: diagnostico?.trim() || null,
        treatment: tratamiento?.trim() || null,
        notes: notas?.trim() || null,
      },
    });

    revalidatePath(`/${tenantSlug}/clientes`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al crear nota de evolución:", err);
    return { ok: false, error: "No se pudo guardar la nota" };
  }
}

export async function actualizarDienteAction(params: {
  tenantSlug: string;
  customerId: string;
  numero: number;
  condicion: keyof typeof ToothCondition;
  notas?: string | null;
}): Promise<AccionExpedienteResult> {
  const { tenantSlug, customerId, numero, condicion, notas } = params;

  if (!DIENTES_FDI_VALIDOS.has(numero)) {
    return { ok: false, error: "Número de diente no válido" };
  }
  if (!(condicion in ToothCondition)) {
    return { ok: false, error: "Condición no válida" };
  }

  const resuelto = await resolverActor(tenantSlug, "expediente-clinico");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant, dbUser } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    if (!(await verificarClienteDelTenant(db, customerId))) {
      return { ok: false, error: "Cliente no encontrado" };
    }

    await db.odontogramaTooth.upsert({
      where: { customerId_toothNumber: { customerId, toothNumber: numero } },
      create: {
        tenantId: tenant.id,
        customerId,
        toothNumber: numero,
        condition: ToothCondition[condicion],
        notes: notas?.trim() || null,
        updatedByUserId: dbUser.id,
      },
      update: {
        condition: ToothCondition[condicion],
        notes: notas?.trim() || null,
        updatedByUserId: dbUser.id,
      },
    });

    revalidatePath(`/${tenantSlug}/clientes`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al actualizar diente:", err);
    return { ok: false, error: "No se pudo actualizar el diente" };
  }
}
