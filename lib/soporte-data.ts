import "server-only";

import { getTenantPrisma } from "@/lib/prisma";

/**
 * Capa de datos del módulo Soporte, lado negocio. Cualquier usuario del
 * tenant puede ver todos los tickets de SU negocio (no solo los que él
 * mismo abrió) — igual que Reparaciones/Clientes, es información del
 * negocio, no de una sola persona. SupportTicket sí tiene tenantId propio
 * y ya está en la lista de getTenantPrisma (lib/prisma.ts);
 * SupportTicketMessage no tiene tenantId (se liga vía ticketId), así que
 * su ownership se valida a mano en las Server Actions, no aquí.
 */

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface TicketMensajeUI {
  id: string;
  body: string;
  createdAt: string; // ISO
  autor: string;
  esAdmin: boolean;
}

export interface TicketUI {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  closedAt: string | null;
  abiertoPor: string;
  mensajes: TicketMensajeUI[];
}

export async function getTicketsData(tenantId: string): Promise<TicketUI[]> {
  const db = getTenantPrisma(tenantId);

  const tickets = await db.supportTicket.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
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
    abiertoPor: t.user.name,
    mensajes: t.messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      autor: m.superAdmin ? `${m.superAdmin.name} · Soporte Linkity` : (m.user?.name ?? "Usuario"),
      esAdmin: !!m.superAdminId,
    })),
  }));
}
