"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/maestro-auth";

export type AccionHotmartResult = { ok: true } | { ok: false; error: string };

/** Marca un evento de Hotmart como atendido (deja de contar como pendiente). */
export async function marcarEventoAtendidoAction(eventoId: string): Promise<AccionHotmartResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  if (!eventoId) return { ok: false, error: "Evento no válido" };

  try {
    const r = await prisma.hotmartEvent.updateMany({
      where: { id: eventoId, attendedAt: null },
      data: { attendedAt: new Date(), attendedBy: resuelto.admin.email },
    });
    if (r.count === 0) return { ok: false, error: "El evento no existe o ya estaba atendido" };
    revalidatePath("/maestro/hotmart");
    revalidatePath("/maestro", "layout");
    return { ok: true };
  } catch (err) {
    console.error("Error al marcar evento de Hotmart:", err);
    return { ok: false, error: "No se pudo actualizar el evento" };
  }
}
