import "server-only";

import { getTenantPrisma } from "@/lib/prisma";
import { type CondicionDiente, DIENTES_SUPERIOR, DIENTES_INFERIOR, DIENTES_FDI_VALIDOS } from "@/lib/odontograma-fdi";

/**
 * Capa de datos reales del módulo Expediente Clínico + Odontograma (M16 —
 * Fase 1 de "Propuesta: Consultorio Dental para Linkity", 2026-09-18).
 * Vive embebido en la ficha del cliente (Clientes/M7), así que a diferencia
 * de citas-data.ts (que arma su propia pantalla) esta capa regresa un mapa
 * `customerId -> ExpedienteCliente` para TODOS los clientes del tenant de
 * una sola vez — el mismo patrón que ya usa clientes-data.ts (todo el
 * historial de ventas/reparaciones se carga junto en clientes/page.tsx en
 * vez de pedirlo bajo demanda al seleccionar un cliente), para no tener que
 * introducir un mecanismo de carga diferida solo para este módulo.
 *
 * CondicionDiente y las constantes FDI (DIENTES_SUPERIOR/INFERIOR/VALIDOS)
 * viven en lib/odontograma-fdi.ts, no aquí — ver el comentario largo en ese
 * archivo (fix de build 2026-09-18: ClientesClient.tsx necesita esos
 * arreglos como VALORES en tiempo de ejecución, y este archivo trae
 * "server-only"). Se re-exportan abajo para no romper a quien ya los
 * importaba desde aquí (getExpedientesData, expediente-actions.ts).
 */

export type { CondicionDiente };
export { DIENTES_SUPERIOR, DIENTES_INFERIOR, DIENTES_FDI_VALIDOS };

export interface AntecedentesUI {
  tipoSangre: string | null;
  alergias: string | null;
  enfermedadesCronicas: string | null;
  medicamentosActuales: string | null;
  cirugiasPrevias: string | null;
  antecedentesFamiliares: string | null;
  notasGenerales: string | null;
  actualizadoEn: string; // ISO
}

export interface NotaEvolucionUI {
  id: string;
  motivo: string;
  diagnostico: string | null;
  tratamiento: string | null;
  notas: string | null;
  doctor: string;
  fecha: string; // ISO
}

// Un diente sin fila en la BD se asume "SANO" — nunca se pre-crean las 32
// filas por cliente, mismo criterio "sin fila = default" que ya usa
// TenantModule en este proyecto (ver el comentario largo en
// OdontogramaTooth, schema.prisma). Por eso este arreglo solo trae los
// dientes que SÍ tienen una fila (condición distinta de sano, o con notas).
export interface DienteUI {
  numero: number; // FDI, dos dígitos
  condicion: CondicionDiente;
  notas: string | null;
  actualizadoEn: string; // ISO
}

export interface ExpedienteCliente {
  antecedentes: AntecedentesUI | null;
  notas: NotaEvolucionUI[];
  dientes: DienteUI[];
}

export async function getExpedientesData(tenantId: string): Promise<Record<string, ExpedienteCliente>> {
  // PatientRecord, ClinicalNote y OdontogramaTooth tienen tenantId propio →
  // getTenantPrisma lo inyecta solo en cada findMany.
  const db = getTenantPrisma(tenantId);

  const [registrosRaw, notasRaw, dientesRaw] = await Promise.all([
    db.patientRecord.findMany(),
    db.clinicalNote.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
    }),
    db.odontogramaTooth.findMany(),
  ]);

  const resultado: Record<string, ExpedienteCliente> = {};

  function bucket(customerId: string): ExpedienteCliente {
    if (!resultado[customerId]) {
      resultado[customerId] = { antecedentes: null, notas: [], dientes: [] };
    }
    return resultado[customerId];
  }

  for (const r of registrosRaw) {
    bucket(r.customerId).antecedentes = {
      tipoSangre: r.bloodType,
      alergias: r.allergies,
      enfermedadesCronicas: r.chronicConditions,
      medicamentosActuales: r.currentMedications,
      cirugiasPrevias: r.previousSurgeries,
      antecedentesFamiliares: r.familyHistory,
      notasGenerales: r.generalNotes,
      actualizadoEn: r.updatedAt.toISOString(),
    };
  }

  for (const n of notasRaw) {
    bucket(n.customerId).notas.push({
      id: n.id,
      motivo: n.reason,
      diagnostico: n.diagnosis,
      tratamiento: n.treatment,
      notas: n.notes,
      doctor: n.user.name,
      fecha: n.createdAt.toISOString(),
    });
  }

  for (const d of dientesRaw) {
    bucket(d.customerId).dientes.push({
      numero: d.toothNumber,
      condicion: d.condition as CondicionDiente,
      notas: d.notes,
      actualizadoEn: d.updatedAt.toISOString(),
    });
  }

  return resultado;
}
