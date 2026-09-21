import "server-only";

import { getTenantPrisma } from "@/lib/prisma";

/**
 * Capa de datos reales del módulo Citas (M15 — Fase 1 de "Propuesta:
 * Consultorio Dental para Linkity", 2026-09-18). Sigue la misma convención
 * que lib/reparaciones-data.ts: los estados se dejan como el valor crudo
 * del enum de Prisma (AppointmentStatus) — el texto que ve el usuario sale
 * de lib/labels.ts (appointment.status.*).
 *
 * "Doctor" en los tipos de abajo es el nombre genérico que usa esta capa
 * para "el profesional que atiende la cita" (User.id vía Appointment.userId,
 * mismo criterio que Repair.userId) — el texto real que ve el usuario para
 * esa persona es simplemente su nombre; no hay necesidad de una key de
 * label distinta por rubro (un dentista, un veterinario y un estilista
 * todos "son" simplemente la persona que atiende).
 */

export type EstadoCita =
  | "SCHEDULED" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "NO_SHOW" | "CANCELLED";

export interface CitaUI {
  id: string;
  clienteId: string;
  cliente: string;
  telefono: string | null;
  iniciales: string;
  branchId: string;
  branchName: string;
  doctorUserId: string;
  doctor: string;
  motivo: string;
  estado: EstadoCita;
  inicio: string; // ISO
  fin: string; // ISO
  notas: string | null;
  telefonoPais: string;
}

export interface ClienteOption {
  id: string;
  name: string;
  phone: string | null;
}

// Solo el personal que SÍ tiene cuenta interna de atribución (Staff.userId
// no nulo — ver el comentario largo en Staff.userId, schema.prisma) puede
// asignarse como responsable de una cita, porque Appointment.userId es una
// llave foránea a User. En la práctica esto es "todo el personal dado de
// alta desde M11 en adelante"; un Staff sembrado antes de esa fecha y sin
// cuenta de atribución simplemente no aparece en este selector hasta que se
// le asigne una (Personal > editar empleado).
export interface DoctorOption {
  userId: string;
  name: string;
  puesto: string | null;
}

export interface CitasData {
  citas: CitaUI[];
  clientes: ClienteOption[];
  doctores: DoctorOption[];
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const ini = (partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "");
  return ini.toUpperCase() || "?";
}

export async function getCitasData(tenantId: string, branchIdFiltro?: string): Promise<CitasData> {
  // Appointment y Customer tienen tenantId propio → getTenantPrisma lo
  // inyecta solo. Staff también, pero se consulta con el prisma base
  // (import directo) porque aquí no se está filtrando información sensible
  // por tenant más allá del where explícito de abajo — mismo criterio que
  // reparaciones-data.ts usa para su selector de productos.
  const db = getTenantPrisma(tenantId);

  // branchIdFiltro (2026-09-21, a petición de Carlos): cuando quien pide
  // los datos es un empleado de PIN, citas/page.tsx manda aquí su propia
  // sucursal para que solo vea SUS citas — un administrador (sin sesión de
  // personal) no manda nada y sigue viendo todas, igual que siempre.
  // Clientes y doctores se quedan tenant-wide a propósito: un cliente
  // puede tener citas en más de una sucursal, y el selector de "quién
  // atiende" ya se acota por sucursal en el propio formulario del cliente.
  const [appointmentsRaw, customersRaw, staffRaw] = await Promise.all([
    db.appointment.findMany({
      where: branchIdFiltro ? { branchId: branchIdFiltro } : undefined,
      include: {
        customer: { select: { id: true, name: true, phone: true, phoneCountryCode: true } },
        user: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { startsAt: "asc" },
    }),
    db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } }),
    db.staff.findMany({
      where: { isActive: true, userId: { not: null } },
      orderBy: { name: "asc" },
      select: { userId: true, name: true, position: true },
    }),
  ]);

  const citas: CitaUI[] = appointmentsRaw.map((a) => ({
    id: a.id,
    clienteId: a.customerId,
    cliente: a.customer.name,
    telefono: a.customer.phone,
    iniciales: iniciales(a.customer.name),
    branchId: a.branchId,
    branchName: a.branch.name,
    doctorUserId: a.userId,
    doctor: a.user.name,
    motivo: a.reason,
    estado: a.status as EstadoCita,
    inicio: a.startsAt.toISOString(),
    fin: a.endsAt.toISOString(),
    notas: a.notes,
    telefonoPais: a.customer.phoneCountryCode,
  }));

  const clientes: ClienteOption[] = customersRaw.map((c) => ({ id: c.id, name: c.name, phone: c.phone }));

  const doctores: DoctorOption[] = staffRaw
    .filter((s): s is typeof s & { userId: string } => s.userId != null)
    .map((s) => ({ userId: s.userId, name: s.name, puesto: s.position }));

  return { citas, clientes, doctores };
}
