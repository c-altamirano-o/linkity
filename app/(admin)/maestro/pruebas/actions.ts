"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/maestro-auth";

export type AccionPruebasResult = { ok: true } | { ok: false; error: string };

/**
 * Quita un correo del registro de pruebas usadas: esa persona podrá
 * registrarse de nuevo con otra prueba gratis. Decisión manual de Carlos
 * (política: una prueba por persona, salvo excepción que él autorice).
 */
export async function permitirOtraPruebaAction(id: string): Promise<AccionPruebasResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  if (!id) return { ok: false, error: "Registro no válido" };

  try {
    const r = await prisma.pruebaGratisUsada.deleteMany({ where: { id } });
    if (r.count === 0) return { ok: false, error: "El registro ya no existe" };
    revalidatePath("/maestro/pruebas");
    return { ok: true };
  } catch (err) {
    console.error("Error al quitar el registro de prueba usada:", err);
    return { ok: false, error: "No se pudo quitar el registro" };
  }
}
