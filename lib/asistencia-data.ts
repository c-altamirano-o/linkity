import "server-only";

import { getTenantPrisma } from "@/lib/prisma";

/**
 * Capa de datos del panel de Asistencia por login (2026-09-16). Lee
 * StaffLoginSession (schema.prisma) — la bitácora que abre/cierra
 * lib/asistencia.ts y app/actions/acceso-personal-actions.ts cada vez que
 * un empleado entra/sale con su PIN. Aparte del registro manual de
 * Personal (modelo Attendance, que sigue alimentando horasSemana/nómina sin
 * cambios — ver el comentario largo en StaffLoginSession, schema.prisma).
 */

export type MotivoCierreAsistencia = "MANUAL" | "DATE_ROLLOVER";

export interface RegistroAsistencia {
  id: string;
  staffId: string;
  staffName: string;
  branchId: string;
  branchName: string;
  checkIn: string; // ISO
  checkOut: string | null; // ISO — null mientras la sesión sigue abierta
  closedBy: MotivoCierreAsistencia | null;
  abierta: boolean;
}

export interface AsistenciaData {
  registros: RegistroAsistencia[];
  branches: { id: string; name: string }[];
}

// Ventana de lectura: suficiente para cubrir el filtro de período más
// amplio que ofrece la UI ("Mes") con margen, sin traer años de historial
// de un negocio con mucha antigüedad — mismo criterio que
// VENTANA_VENTAS_DIAS en lib/catalogo-data.ts.
const VENTANA_ASISTENCIA_DIAS = 90;

export async function getAsistenciaData(tenantId: string): Promise<AsistenciaData> {
  // StaffLoginSession tiene tenantId propio → getTenantPrisma lo inyecta solo.
  const db = getTenantPrisma(tenantId);

  const desde = new Date();
  desde.setDate(desde.getDate() - VENTANA_ASISTENCIA_DIAS);

  const [registrosRaw, branchesRaw] = await Promise.all([
    db.staffLoginSession.findMany({
      where: { checkIn: { gte: desde } },
      orderBy: { checkIn: "desc" },
      include: {
        staff: { select: { name: true } },
        branch: { select: { name: true } },
      },
    }),
    db.branch.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const registros: RegistroAsistencia[] = registrosRaw.map((r) => ({
    id: r.id,
    staffId: r.staffId,
    staffName: r.staff.name,
    branchId: r.branchId,
    branchName: r.branch.name,
    checkIn: r.checkIn.toISOString(),
    checkOut: r.checkOut ? r.checkOut.toISOString() : null,
    closedBy: r.closedBy as MotivoCierreAsistencia | null,
    abierta: r.checkOut === null,
  }));

  return { registros, branches: branchesRaw };
}
