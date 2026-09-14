"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/maestro-auth";

/**
 * Server Actions del Dashboard de Panel Maestro. El botón "Gestionar" del
 * mockup no hacía nada — aquí se conecta a la única acción de gestión que
 * tiene sentido sin construir una pantalla de detalle completa por negocio
 * (eso quedó fuera de esta pasada, ver nota en lib/maestro-data.ts):
 * suspender o reactivar la suscripción de un negocio.
 *
 * El hueco de seguridad que se documentó aquí (esta acción no verificaba
 * que quien la llamara fuera realmente un administrador) ya se cerró con
 * el modelo SuperAdmin + lib/maestro-auth.ts + scripts/set-superadmin.ts.
 */

export type AccionMaestroResult = { ok: true } | { ok: false; error: string };

export async function alternarSuscripcionAction(params: {
  tenantId: string;
  nuevoEstado: "ACTIVE" | "SUSPENDED";
}): Promise<AccionMaestroResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  const { tenantId, nuevoEstado } = params;

  try {
    const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
    if (!subscription) return { ok: false, error: "Este negocio no tiene una suscripción registrada" };

    await prisma.subscription.update({
      where: { tenantId },
      data: { status: nuevoEstado },
    });

    revalidatePath("/maestro/dashboard");
    return { ok: true };
  } catch (err) {
    console.error("Error al actualizar la suscripción:", err);
    return { ok: false, error: "No se pudo actualizar la suscripción" };
  }
}
