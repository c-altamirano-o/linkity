"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/maestro-auth";

export type AccionSoporteAdminResult = { ok: true } | { ok: false; error: string };

export async function responderTicketAdminAction(params: {
  ticketId: string;
  body: string;
}): Promise<AccionSoporteAdminResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  if (!params.body.trim()) return { ok: false, error: "Escribe un mensaje" };

  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.ticketId },
      select: { id: true, status: true },
    });
    if (!ticket) return { ok: false, error: "Ticket no encontrado" };

    await prisma.supportTicketMessage.create({
      data: { ticketId: params.ticketId, superAdminId: resuelto.admin.id, body: params.body.trim() },
    });

    // Responder un ticket recién abierto lo pasa a "en progreso" automático
    // — así el estado siempre refleja si alguien ya lo está atendiendo, sin
    // que el admin tenga que acordarse de cambiarlo a mano cada vez.
    await prisma.supportTicket.update({
      where: { id: params.ticketId },
      data: { status: ticket.status === "OPEN" ? "IN_PROGRESS" : ticket.status },
    });

    revalidatePath("/maestro/soporte");
    return { ok: true };
  } catch (err) {
    console.error("Error al responder ticket (admin):", err);
    return { ok: false, error: "No se pudo enviar la respuesta" };
  }
}

export async function cambiarEstadoTicketAction(params: {
  ticketId: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
}): Promise<AccionSoporteAdminResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  try {
    await prisma.supportTicket.update({
      where: { id: params.ticketId },
      data: {
        status: params.status,
        closedAt: params.status === "CLOSED" ? new Date() : null,
      },
    });
    revalidatePath("/maestro/soporte");
    return { ok: true };
  } catch (err) {
    console.error("Error al cambiar estado del ticket:", err);
    return { ok: false, error: "No se pudo actualizar el estado" };
  }
}
