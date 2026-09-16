"use server";

import { prisma, getTenantPrisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Server Actions del módulo Soporte, lado negocio. Mismo patrón
 * resolverTenantYUsuario que clientes-actions.ts.
 *
 * SupportTicketMessage no tiene tenantId propio (no está en la lista de
 * getTenantPrisma), así que su ownership se valida a mano: primero se
 * busca el ticket vía getTenantPrisma (eso SÍ está protegido — un ticketId
 * de otro negocio simplemente no aparece), y solo si existe se crea el
 * mensaje con `prisma` directo, ya con la garantía de que ese ticket es de
 * este tenant.
 */

type ResolverResult =
  | { ok: true; tenant: { id: string }; dbUser: { id: string; tenantId: string } }
  | { ok: false; error: string };

async function resolverTenantYUsuario(tenantSlug: string): Promise<ResolverResult> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  if (!tenant) return { ok: false, error: "Negocio no encontrado" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión no válida, vuelve a iniciar sesión" };

  const dbUser = await prisma.user.findUnique({
    where: { supabaseId: user.id },
    select: { id: true, tenantId: true },
  });
  if (!dbUser || dbUser.tenantId !== tenant.id) {
    return { ok: false, error: "No tienes acceso a este negocio" };
  }

  return { ok: true, tenant, dbUser };
}

export type AccionSoporteResult = { ok: true; id?: string } | { ok: false; error: string };

const PRIORIDADES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export async function crearTicketAction(params: {
  tenantSlug: string;
  subject: string;
  body: string;
  priority: (typeof PRIORIDADES)[number];
}): Promise<AccionSoporteResult> {
  const { tenantSlug, subject, body, priority } = params;
  if (!subject.trim()) return { ok: false, error: "El asunto es obligatorio" };
  if (!body.trim()) return { ok: false, error: "Escribe tu mensaje" };
  if (!PRIORIDADES.includes(priority)) return { ok: false, error: "Prioridad no válida" };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant, dbUser } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const ticket = await db.supportTicket.create({
      data: {
        tenantId: tenant.id,
        userId: dbUser.id,
        subject: subject.trim(),
        priority,
        messages: {
          create: { userId: dbUser.id, body: body.trim() },
        },
      },
    });

    revalidatePath(`/${tenantSlug}/soporte`);
    return { ok: true, id: ticket.id };
  } catch (err) {
    console.error("Error al crear ticket de soporte:", err);
    return { ok: false, error: "No se pudo crear el ticket" };
  }
}

export async function responderTicketAction(params: {
  tenantSlug: string;
  ticketId: string;
  body: string;
}): Promise<AccionSoporteResult> {
  const { tenantSlug, ticketId, body } = params;
  if (!body.trim()) return { ok: false, error: "Escribe un mensaje" };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant, dbUser } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    // Ownership real de este ticket (escopado por tenant vía getTenantPrisma):
    // si el ticketId fuera de otro negocio, esto regresa null.
    const ticket = await db.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, status: true },
    });
    if (!ticket) return { ok: false, error: "Ticket no encontrado" };
    if (ticket.status === "CLOSED") return { ok: false, error: "Este ticket ya está cerrado" };

    await prisma.supportTicketMessage.create({
      data: { ticketId, userId: dbUser.id, body: body.trim() },
    });

    // Si un admin ya lo había marcado como resuelto y el negocio vuelve a
    // escribir, se reabre automáticamente — no se queda "resuelto" con un
    // mensaje nuevo sin leer.
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: ticket.status === "RESOLVED" ? "OPEN" : ticket.status },
    });

    revalidatePath(`/${tenantSlug}/soporte`);
    return { ok: true };
  } catch (err) {
    console.error("Error al responder ticket de soporte:", err);
    return { ok: false, error: "No se pudo enviar tu mensaje" };
  }
}
