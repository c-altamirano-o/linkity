import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Capa de datos del módulo Soporte, lado Panel Maestro: vista cruzada de
 * TODOS los tickets de TODOS los negocios — por eso usa `prisma` directo,
 * no getTenantPrisma (no hay un tenant único al que escopar).
 */

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface TicketMensajeAdminUI {
  id: string;
  body: string;
  createdAt: string; // ISO
  autor: string;
  esAdmin: boolean;
}

export interface TicketAdminUI {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  closedAt: string | null;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  abiertoPor: string;
  mensajes: TicketMensajeAdminUI[];
}

export async function getMaestroTicketsData(): Promise<TicketAdminUI[]> {
  const tickets = await prisma.supportTicket.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      tenant: { select: { name: true, slug: true } },
      user: { select: { name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { name: true } },
          superAdmin: { select: { name: true } },
        },
      },
    },
  });

  return tickets.map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    closedAt: t.closedAt ? t.closedAt.toISOString() : null,
    tenantId: t.tenantId,
    tenantName: t.tenant.name,
    tenantSlug: t.tenant.slug,
    abiertoPor: t.user.name,
    mensajes: t.messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      autor: m.superAdmin ? m.superAdmin.name : (m.user?.name ?? "Usuario"),
      esAdmin: !!m.superAdminId,
    })),
  }));
}

// Usado por maestro/layout.tsx para el badge del sidebar — no trae los
// mensajes de cada ticket, solo el conteo, para no cargar todo el hilo en
// cada navegación de Panel Maestro.
export async function getTicketsAbiertosCount(): Promise<number> {
  return prisma.supportTicket.count({
    where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
  });
}
