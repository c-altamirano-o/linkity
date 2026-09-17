"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/maestro-auth";

/**
 * Server Actions de "Esquemas" (Panel Maestro). Mismo patrón que
 * app/(admin)/maestro/tenants/actions.ts: cada acción vuelve a validar
 * requireSuperAdmin() aquí (una Server Action es invocable por POST directo,
 * sin pasar por el layout de /maestro), y regresa {ok:true,...}|{ok:false,error}.
 */

export type AccionEsquemaResult = { ok: true; id: string } | { ok: false; error: string };

export interface DatosEsquema {
  name: string;
  maxBranches: number;
  maxStaffPerBranch: number;
}

function validarDatosEsquema(d: DatosEsquema): string | null {
  if (!d.name?.trim()) return "El nombre del esquema es obligatorio";
  if (!Number.isInteger(d.maxBranches) || d.maxBranches < 1) {
    return "El máximo de sucursales debe ser un entero de al menos 1";
  }
  if (!Number.isInteger(d.maxStaffPerBranch) || d.maxStaffPerBranch < 1) {
    return "El máximo de personal por sucursal debe ser un entero de al menos 1";
  }
  return null;
}

export async function crearEsquemaAction(datos: DatosEsquema): Promise<AccionEsquemaResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  const errorValidacion = validarDatosEsquema(datos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  try {
    // El primer esquema que se crea nace como default automáticamente —
    // así un negocio recién auto-registrado siempre tiene a quién asignarle
    // el límite, incluso antes de que Carlos haya definido varios esquemas.
    const existeAlguno = await prisma.planEsquema.count();

    const nuevo = await prisma.planEsquema.create({
      data: {
        name: datos.name.trim(),
        maxBranches: datos.maxBranches,
        maxStaffPerBranch: datos.maxStaffPerBranch,
        isDefault: existeAlguno === 0,
      },
    });

    revalidatePath("/maestro/esquemas");
    return { ok: true, id: nuevo.id };
  } catch (err) {
    console.error("Error al crear esquema:", err);
    return { ok: false, error: "No se pudo crear el esquema" };
  }
}

export async function editarEsquemaAction(
  params: { id: string } & DatosEsquema
): Promise<AccionEsquemaResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  const { id, ...datos } = params;
  const errorValidacion = validarDatosEsquema(datos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  try {
    const existente = await prisma.planEsquema.findUnique({ where: { id }, select: { id: true } });
    if (!existente) return { ok: false, error: "Esquema no encontrado" };

    await prisma.planEsquema.update({
      where: { id },
      data: {
        name: datos.name.trim(),
        maxBranches: datos.maxBranches,
        maxStaffPerBranch: datos.maxStaffPerBranch,
      },
    });

    // Los tenants que ya tienen este esquema asignado quedan bajo el nuevo
    // límite de inmediato (no se les "congela" el valor viejo) — es
    // justamente lo que Carlos pidió: poder ajustar un esquema y que
    // aplique a quien lo tenga, sin tener que reasignar tenant por tenant.
    revalidatePath("/maestro/esquemas");
    revalidatePath("/maestro/tenants");
    return { ok: true, id };
  } catch (err) {
    console.error("Error al editar esquema:", err);
    return { ok: false, error: "No se pudo actualizar el esquema" };
  }
}

export async function alternarEsquemaActivoAction(params: {
  id: string;
  isActive: boolean;
}): Promise<AccionEsquemaResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  try {
    const existente = await prisma.planEsquema.findUnique({
      where: { id: params.id },
      select: { id: true, isDefault: true },
    });
    if (!existente) return { ok: false, error: "Esquema no encontrado" };
    if (existente.isDefault && !params.isActive) {
      return {
        ok: false,
        error: "Este esquema es el predeterminado para negocios nuevos — marca otro como predeterminado antes de desactivarlo",
      };
    }

    await prisma.planEsquema.update({ where: { id: params.id }, data: { isActive: params.isActive } });

    revalidatePath("/maestro/esquemas");
    return { ok: true, id: params.id };
  } catch (err) {
    console.error("Error al activar/desactivar esquema:", err);
    return { ok: false, error: "No se pudo actualizar el esquema" };
  }
}

export async function marcarEsquemaDefaultAction(id: string): Promise<AccionEsquemaResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  try {
    const existente = await prisma.planEsquema.findUnique({ where: { id }, select: { id: true, isActive: true } });
    if (!existente) return { ok: false, error: "Esquema no encontrado" };
    if (!existente.isActive) return { ok: false, error: "No puedes marcar como predeterminado un esquema desactivado" };

    // Solo puede haber un esquema default a la vez — se desmarca cualquier
    // otro en la misma transacción antes de marcar el nuevo.
    await prisma.$transaction([
      prisma.planEsquema.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
      prisma.planEsquema.update({ where: { id }, data: { isDefault: true } }),
    ]);

    revalidatePath("/maestro/esquemas");
    return { ok: true, id };
  } catch (err) {
    console.error("Error al marcar esquema predeterminado:", err);
    return { ok: false, error: "No se pudo marcar como predeterminado" };
  }
}
