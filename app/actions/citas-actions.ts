"use server";

import { getTenantPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { AppointmentStatus } from "@prisma/client";
import { resolverActor, puedeOperarSucursal } from "@/lib/actor";
import { PAIS_TELEFONO_DEFAULT } from "@/lib/paises";

/**
 * Server Actions del módulo Citas (M15 — Fase 1 de "Propuesta: Consultorio
 * Dental para Linkity", 2026-09-18). Mismo criterio que
 * reparaciones-actions.ts: nunca se confía en lo que manda el cliente más
 * allá de los ids — sucursal, doctor y cliente siempre se verifican contra
 * la base de datos antes de escribir nada.
 */

export interface CrearCitaParams {
  tenantSlug: string;
  branchId: string;
  doctorUserId: string;
  clienteId?: string | null;
  clienteNuevo?: { name: string; phone?: string; phoneCountryCode?: string } | null;
  motivo: string;
  inicio: string; // ISO
  fin: string; // ISO
  notas?: string | null;
}

export type CrearCitaResult = { ok: true; id: string } | { ok: false; error: string };

export async function crearCitaAction(params: CrearCitaParams): Promise<CrearCitaResult> {
  const { tenantSlug, branchId, doctorUserId, clienteId, clienteNuevo, motivo, inicio, fin, notas } = params;

  if (!branchId) return { ok: false, error: "Selecciona una sucursal" };
  if (!doctorUserId) return { ok: false, error: "Selecciona quién atiende la cita" };
  if (!motivo.trim()) return { ok: false, error: "Describe el motivo de la cita" };
  if (!clienteId && !clienteNuevo?.name.trim()) return { ok: false, error: "Selecciona o registra un cliente" };

  const inicioFecha = new Date(inicio);
  const finFecha = new Date(fin);
  if (Number.isNaN(inicioFecha.getTime()) || Number.isNaN(finFecha.getTime())) {
    return { ok: false, error: "Fecha u hora no válida" };
  }
  if (finFecha <= inicioFecha) {
    return { ok: false, error: "La hora de fin debe ser después de la hora de inicio" };
  }

  // "citas" ya está en la matriz de acceso de los 3 roles base
  // (lib/roles.ts) — mismo resolverActor que reparaciones-actions.ts.
  const resuelto = await resolverActor(tenantSlug, "citas");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  // 2026-09-21, a petición de Carlos: un empleado de PIN solo puede agendar
  // citas en SU sucursal.
  if (!puedeOperarSucursal(resuelto, branchId)) {
    return { ok: false, error: "No tienes acceso a esa sucursal" };
  }

  const db = getTenantPrisma(tenant.id);

  try {
    const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!branch) return { ok: false, error: "Sucursal no encontrada" };

    // doctorUserId es un User.id (ver DoctorOption, lib/citas-data.ts) — se
    // valida que exista y sea de este tenant antes de usarlo como llave
    // foránea de Appointment.userId.
    const doctorUser = await db.user.findUnique({ where: { id: doctorUserId }, select: { id: true, tenantId: true } });
    if (!doctorUser || doctorUser.tenantId !== tenant.id) {
      return { ok: false, error: "Selecciona quién atiende la cita" };
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

    const cita = await db.appointment.create({
      data: {
        tenantId: tenant.id,
        branchId,
        customerId: finalCustomerId,
        userId: doctorUserId,
        reason: motivo.trim(),
        status: AppointmentStatus.SCHEDULED,
        startsAt: inicioFecha,
        endsAt: finFecha,
        notes: notas?.trim() || null,
      },
    });

    revalidatePath(`/${tenantSlug}/citas`);
    revalidatePath(`/${tenantSlug}/dashboard`);
    return { ok: true, id: cita.id };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al crear cita:", err);
    return { ok: false, error: "No se pudo crear la cita" };
  }
}

export interface EditarCitaParams {
  tenantSlug: string;
  citaId: string;
  branchId: string;
  doctorUserId: string;
  motivo: string;
  inicio: string; // ISO
  fin: string; // ISO
  notas?: string | null;
}

export type AccionCitaResult = { ok: true } | { ok: false; error: string };

// Reprogramar/editar los datos de una cita que todavía no terminó — separado
// de crearCitaAction porque aquí no se toca ni cliente ni estatus, solo
// horario/sucursal/doctor/motivo/notas.
export async function editarCitaAction(params: EditarCitaParams): Promise<AccionCitaResult> {
  const { tenantSlug, citaId, branchId, doctorUserId, motivo, inicio, fin, notas } = params;

  if (!branchId) return { ok: false, error: "Selecciona una sucursal" };
  if (!doctorUserId) return { ok: false, error: "Selecciona quién atiende la cita" };
  if (!motivo.trim()) return { ok: false, error: "Describe el motivo de la cita" };

  const inicioFecha = new Date(inicio);
  const finFecha = new Date(fin);
  if (Number.isNaN(inicioFecha.getTime()) || Number.isNaN(finFecha.getTime())) {
    return { ok: false, error: "Fecha u hora no válida" };
  }
  if (finFecha <= inicioFecha) {
    return { ok: false, error: "La hora de fin debe ser después de la hora de inicio" };
  }

  const resuelto = await resolverActor(tenantSlug, "citas");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const cita = await db.appointment.findUnique({ where: { id: citaId }, select: { id: true, status: true, branchId: true } });
    if (!cita) return { ok: false, error: "Cita no encontrada" };
    if (cita.status === AppointmentStatus.COMPLETED || cita.status === AppointmentStatus.CANCELLED || cita.status === AppointmentStatus.NO_SHOW) {
      return { ok: false, error: "No se puede modificar una cita ya cerrada" };
    }
    // 2026-09-21, a petición de Carlos: un empleado de PIN solo puede editar
    // citas de SU sucursal, y tampoco puede reasignarlas a otra sucursal.
    if (!puedeOperarSucursal(resuelto, cita.branchId) || !puedeOperarSucursal(resuelto, branchId)) {
      return { ok: false, error: "No tienes acceso a esa sucursal" };
    }

    const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!branch) return { ok: false, error: "Sucursal no encontrada" };

    const doctorUser = await db.user.findUnique({ where: { id: doctorUserId }, select: { id: true, tenantId: true } });
    if (!doctorUser || doctorUser.tenantId !== tenant.id) {
      return { ok: false, error: "Selecciona quién atiende la cita" };
    }

    await db.appointment.update({
      where: { id: citaId },
      data: {
        branchId,
        userId: doctorUserId,
        reason: motivo.trim(),
        startsAt: inicioFecha,
        endsAt: finFecha,
        notes: notas?.trim() || null,
      },
    });

    revalidatePath(`/${tenantSlug}/citas`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al editar cita:", err);
    return { ok: false, error: "No se pudo editar la cita" };
  }
}

export type NuevoEstadoCita = "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "NO_SHOW" | "CANCELLED";

// A diferencia de Reparaciones (un flujo lineal largo), una cita tiene un
// ciclo de vida corto — se deja relativamente permisivo (ej. de SCHEDULED
// se puede saltar directo a IN_PROGRESS si el cliente llegó sin confirmar
// antes) en vez de forzar un único camino.
const TRANSICIONES_VALIDAS: Record<string, NuevoEstadoCita[]> = {
  SCHEDULED: ["CONFIRMED", "IN_PROGRESS", "NO_SHOW", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "NO_SHOW", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
};

export async function cambiarEstadoCitaAction(params: {
  tenantSlug: string;
  citaId: string;
  nuevoEstado: NuevoEstadoCita;
}): Promise<AccionCitaResult> {
  const { tenantSlug, citaId, nuevoEstado } = params;

  const resuelto = await resolverActor(tenantSlug, "citas");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const cita = await db.appointment.findUnique({ where: { id: citaId }, select: { id: true, status: true, branchId: true } });
    if (!cita) return { ok: false, error: "Cita no encontrada" };
    // 2026-09-21, a petición de Carlos: un empleado de PIN solo puede
    // cambiar el estatus de una cita de SU sucursal.
    if (!puedeOperarSucursal(resuelto, cita.branchId)) {
      return { ok: false, error: "No tienes acceso a esa sucursal" };
    }

    const permitidos = TRANSICIONES_VALIDAS[cita.status] ?? [];
    if (!permitidos.includes(nuevoEstado)) {
      return { ok: false, error: "Ese cambio de estatus no es válido desde el estatus actual" };
    }

    await db.appointment.update({
      where: { id: citaId },
      data: { status: AppointmentStatus[nuevoEstado] },
    });

    revalidatePath(`/${tenantSlug}/citas`);
    revalidatePath(`/${tenantSlug}/dashboard`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al actualizar estatus de la cita:", err);
    return { ok: false, error: "No se pudo actualizar el estatus" };
  }
}
