"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/maestro-auth";

export type AccionMaestroResult = { ok: true } | { ok: false; error: string };

// Prender/apagar el acceso de UNA cuenta de usuario, sin importar a qué
// negocio pertenece. Efecto real (ver lib/usuarios-data.ts): bloquea el
// login y cierra cualquier sesión ya abierta de esa persona.
export async function alternarUsuarioActivoAction(params: {
  userId: string;
  activo: boolean;
}): Promise<AccionMaestroResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  try {
    await prisma.user.update({
      where: { id: params.userId },
      data: { isActive: params.activo },
    });

    revalidatePath("/maestro/usuarios");
    revalidatePath("/maestro/tenants");
    return { ok: true };
  } catch (err) {
    console.error("Error al actualizar el usuario:", err);
    return { ok: false, error: "No se pudo actualizar el usuario" };
  }
}
