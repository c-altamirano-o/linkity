import "server-only";

import { getTenantPrisma } from "@/lib/prisma";

/**
 * Capa de datos reales del módulo Reparaciones (M9). Sigue la misma
 * convención que lib/pos-data.ts / lib/catalogo-data.ts: se importa solo
 * desde Server Components (page.tsx), y deja los tipos de estado/prioridad
 * como los valores crudos del enum de Prisma (en vez de reinventar strings
 * en español como hacía el mockup) para no tener que traducir en dos
 * direcciones — el texto que ve el usuario sale de lib/labels.ts
 * (repair.status.*), que ya lo personaliza por rubro.
 */

export type EstadoReparacion =
  | "RECEIVED" | "DIAGNOSING" | "WAITING_PARTS" | "IN_REPAIR" | "READY"
  | "DELIVERED" | "CANCELLED" | "WORKSHOP_READY" | "WORKSHOP_RETURN"
  | "SHOP_READY" | "SHOP_RETURN";

export type PrioridadReparacion = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface HistorialItem {
  estado: EstadoReparacion;
  nota: string | null;
  fecha: string; // ISO
}

export interface ReparacionUI {
  id: string;
  folio: string;
  clienteId: string;
  cliente: string;
  telefono: string | null;
  iniciales: string;
  branchId: string;
  marca: string;
  modelo: string;
  falla: string;
  estado: EstadoReparacion;
  prioridad: PrioridadReparacion;
  costoEstimado: number | null;
  costoFinal: number | null;
  fechaRecibido: string; // ISO
  fechaEstimada: string | null; // ISO
  fechaEntregado: string | null; // ISO
  tecnico: string;
  whatsappSent: boolean;
  publicToken: string;
  historial: HistorialItem[];
}

export interface ClienteOption {
  id: string;
  name: string;
  phone: string | null;
}

export interface ReparacionesData {
  reparaciones: ReparacionUI[];
  clientes: ClienteOption[];
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const ini = (partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "");
  return ini.toUpperCase() || "?";
}

export async function getReparacionesData(tenantId: string): Promise<ReparacionesData> {
  // Repair y Customer tienen tenantId propio → getTenantPrisma lo inyecta solo.
  const db = getTenantPrisma(tenantId);

  const [repairsRaw, customersRaw] = await Promise.all([
    db.repair.findMany({
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        user: { select: { name: true } },
        history: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { receivedAt: "desc" },
    }),
    db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } }),
  ]);

  const reparaciones: ReparacionUI[] = repairsRaw.map((r) => ({
    id: r.id,
    folio: r.folio,
    clienteId: r.customerId,
    cliente: r.customer.name,
    telefono: r.customer.phone,
    iniciales: iniciales(r.customer.name),
    branchId: r.branchId,
    marca: r.deviceBrand,
    modelo: r.deviceModel,
    falla: r.issueDesc,
    estado: r.status as EstadoReparacion,
    prioridad: r.priority as PrioridadReparacion,
    costoEstimado: r.estimatedCost != null ? Number(r.estimatedCost) : null,
    costoFinal: r.finalCost != null ? Number(r.finalCost) : null,
    fechaRecibido: r.receivedAt.toISOString(),
    fechaEstimada: r.estimatedAt ? r.estimatedAt.toISOString() : null,
    fechaEntregado: r.deliveredAt ? r.deliveredAt.toISOString() : null,
    tecnico: r.user.name,
    whatsappSent: r.whatsappSent,
    publicToken: r.publicToken,
    historial: r.history.map((h) => ({
      estado: h.status as EstadoReparacion,
      nota: h.notes,
      fecha: h.createdAt.toISOString(),
    })),
  }));

  const clientes: ClienteOption[] = customersRaw.map((c) => ({ id: c.id, name: c.name, phone: c.phone }));

  return { reparaciones, clientes };
}
