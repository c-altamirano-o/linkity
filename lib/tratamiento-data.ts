import "server-only";

import { getTenantPrisma } from "@/lib/prisma";
import type { DoctorOption } from "@/lib/citas-data";

/**
 * Capa de datos de Plan de Tratamiento por fases (M17 — Fase 2 de
 * "Propuesta: Consultorio Dental para Linkity", 2026-09-19). Mismo patrón
 * que expediente-data.ts: un mapa `customerId -> PlanTratamientoUI[]` para
 * TODOS los clientes del tenant de una sola vez. A diferencia de
 * PatientRecord (un solo registro acumulado por paciente), aquí SÍ puede
 * haber varios planes por paciente a lo largo del tiempo — de ahí el
 * arreglo en vez de un solo objeto.
 */

export type EstadoItemPlan = "PROPUESTO" | "ACEPTADO" | "RECHAZADO" | "PAGADO";
export type MetodoPagoPlan = "CASH" | "CARD" | "TRANSFER" | "MIXED";

export interface ItemPlanUI {
  id: string;
  descripcion: string;
  diente: number | null; // FDI, opcional
  costo: number;
  estado: EstadoItemPlan;
  orden: number;
  pagadoEn: string | null; // ISO
  metodoPago: MetodoPagoPlan | null;
}

export interface PlanTratamientoUI {
  id: string;
  titulo: string;
  notas: string | null;
  doctor: string;
  creadoEn: string; // ISO
  items: ItemPlanUI[];
}

export interface PlanesTratamientoData {
  planes: Record<string, PlanTratamientoUI[]>;
  doctores: DoctorOption[];
}

export async function getPlanesTratamientoData(tenantId: string): Promise<PlanesTratamientoData> {
  const db = getTenantPrisma(tenantId);

  const [planesRaw, staffRaw] = await Promise.all([
    db.treatmentPlan.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true } },
        items: { orderBy: { order: "asc" } },
      },
    }),
    // Mismo query que doctores en lib/citas-data.ts — se repite en vez de
    // importar getCitasData completo porque esta capa no necesita nada más
    // de ese archivo (solo el tipo DoctorOption, ya importado arriba).
    db.staff.findMany({
      where: { isActive: true, userId: { not: null } },
      orderBy: { name: "asc" },
      select: { userId: true, name: true, position: true },
    }),
  ]);

  const planes: Record<string, PlanTratamientoUI[]> = {};

  for (const p of planesRaw) {
    if (!planes[p.customerId]) planes[p.customerId] = [];
    planes[p.customerId].push({
      id: p.id,
      titulo: p.title,
      notas: p.notes,
      doctor: p.user.name,
      creadoEn: p.createdAt.toISOString(),
      items: p.items.map((it) => ({
        id: it.id,
        descripcion: it.description,
        diente: it.toothNumber,
        costo: Number(it.cost),
        estado: it.status as EstadoItemPlan,
        orden: it.order,
        pagadoEn: it.paidAt ? it.paidAt.toISOString() : null,
        metodoPago: it.paymentMethod as MetodoPagoPlan | null,
      })),
    });
  }

  const doctores: DoctorOption[] = staffRaw
    .filter((s): s is typeof s & { userId: string } => s.userId != null)
    .map((s) => ({ userId: s.userId, name: s.name, puesto: s.position }));

  return { planes, doctores };
}
