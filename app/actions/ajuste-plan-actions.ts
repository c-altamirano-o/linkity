"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { calcularExcesos, LIMITE_EMPLEADOS_POR_SUCURSAL } from "@/lib/capacidades-comerciales";
import { resolverAdminNegocio, sincronizarExceso } from "@/lib/exceso-plan";

/**
 * Server Action de la pantalla "Ajustar plan" (Paso 5, 2026-10-08). Ver el
 * comentario largo en lib/exceso-plan.ts para las reglas de negocio.
 *
 * El administrador manda QUÉ CONSERVAR; el servidor recalcula el exceso por su
 * cuenta (nunca confía en lo que diga el cliente sobre cuántas sucursales o
 * empleados hay ni sobre el límite del plan), valida cada id contra la base y
 * desactiva todo lo demás. Nada se borra: solo isActive = false, así el
 * negocio puede reactivarlo si sube de plan.
 *
 * No se bloquea desactivar una sucursal con la caja abierta (la pantalla lo
 * advierte): bloquearlo dejaría al negocio sin salida, porque mientras el
 * exceso esté vencido el resto del sistema ni siquiera abre.
 */

export type ResolverExcesoResult = { ok: true } | { ok: false; error: string };

const esListaDeIds = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string" && x.length > 0 && x.length < 100);

export async function resolverExcesoAction(params: {
  tenantSlug: string;
  sucursalesConservar: string[];
  empleadosConservar: Record<string, string[]>;
}): Promise<ResolverExcesoResult> {
  const { tenantSlug, sucursalesConservar, empleadosConservar } = params;

  if (!esListaDeIds(sucursalesConservar)) return { ok: false, error: "Selección de sucursales no válida" };
  if (typeof empleadosConservar !== "object" || empleadosConservar === null || Array.isArray(empleadosConservar)) {
    return { ok: false, error: "Selección de empleados no válida" };
  }
  for (const lista of Object.values(empleadosConservar)) {
    if (!esListaDeIds(lista)) return { ok: false, error: "Selección de empleados no válida" };
  }

  const admin = await resolverAdminNegocio(tenantSlug);
  if (!admin.ok) return { ok: false, error: admin.error };
  const { tenantId } = admin;

  try {
    const ex = await calcularExcesos(tenantId);

    // Ya no hay nada que ajustar (por ejemplo subió de plan mientras tenía la
    // pantalla abierta): solo se limpia la marca.
    if (!ex.hayExceso) {
      await sincronizarExceso(tenantId, { status: admin.status, excesoDetectadoAt: admin.excesoDetectadoAt });
      revalidatePath(`/${tenantSlug}`, "layout");
      return { ok: true };
    }

    const [sucursalesActivas, staffActivo] = await Promise.all([
      prisma.branch.findMany({ where: { tenantId, isActive: true }, select: { id: true } }),
      prisma.staff.findMany({ where: { tenantId, isActive: true }, select: { id: true, branchId: true } }),
    ]);
    const idsSucursalesActivas = new Set(sucursalesActivas.map((s) => s.id));

    // --- 1. Sucursales ---------------------------------------------------
    const conservarSuc = new Set(sucursalesConservar);
    if (conservarSuc.size !== sucursalesConservar.length) return { ok: false, error: "Hay sucursales repetidas en la selección" };

    let sucursalesFinales: Set<string>;
    if (ex.sucursales.excede) {
      const tope = ex.sucursales.limite.valor ?? 0;
      for (const id of conservarSuc) {
        if (!idsSucursalesActivas.has(id)) return { ok: false, error: "Una de las sucursales seleccionadas no es válida" };
      }
      if (conservarSuc.size < 1) return { ok: false, error: "Debes conservar al menos una sucursal activa" };
      if (conservarSuc.size > tope) {
        return { ok: false, error: `Tu plan permite ${tope} sucursal(es) activa(s); seleccionaste ${conservarSuc.size}` };
      }
      sucursalesFinales = conservarSuc;
    } else {
      // Las sucursales ya caben: no se toca ninguna.
      sucursalesFinales = idsSucursalesActivas;
    }

    // --- 2. Empleados de las sucursales que se quedan --------------------
    const limEmp = ex.capacidades.limite(LIMITE_EMPLEADOS_POR_SUCURSAL);
    const desactivarEmpleados: string[] = [];
    if (!limEmp.ilimitado) {
      const tope = limEmp.valor ?? 0;
      for (const branchId of sucursalesFinales) {
        const delaSucursal = staffActivo.filter((e) => e.branchId === branchId);
        if (delaSucursal.length <= tope) continue;

        const elegidos = empleadosConservar[branchId];
        if (!elegidos) return { ok: false, error: "Falta elegir qué empleados conservar en una de las sucursales" };
        const setElegidos = new Set(elegidos);
        if (setElegidos.size !== elegidos.length) return { ok: false, error: "Hay empleados repetidos en la selección" };
        const idsDeLaSucursal = new Set(delaSucursal.map((e) => e.id));
        for (const id of setElegidos) {
          if (!idsDeLaSucursal.has(id)) return { ok: false, error: "Uno de los empleados seleccionados no es válido" };
        }
        if (setElegidos.size > tope) {
          return { ok: false, error: `Tu plan permite ${tope} empleado(s) activo(s) por sucursal; seleccionaste ${setElegidos.size} en una de ellas` };
        }
        for (const e of delaSucursal) if (!setElegidos.has(e.id)) desactivarEmpleados.push(e.id);
      }
    }

    const desactivarSucursales = [...idsSucursalesActivas].filter((id) => !sucursalesFinales.has(id));

    await prisma.$transaction(async (tx) => {
      if (desactivarSucursales.length > 0) {
        await tx.branch.updateMany({
          where: { tenantId, id: { in: desactivarSucursales }, isActive: true },
          data: { isActive: false },
        });
      }
      if (desactivarEmpleados.length > 0) {
        await tx.staff.updateMany({
          where: { tenantId, id: { in: desactivarEmpleados }, isActive: true },
          data: { isActive: false },
        });
      }
    });

    console.info(
      `ℹ️  Ajuste de plan en ${tenantSlug}: ${desactivarSucursales.length} sucursal(es) y ${desactivarEmpleados.length} empleado(s) desactivados por exceso del plan.`
    );

    // Verifica contra la base que de verdad quedó dentro del plan y limpia la marca.
    const sub = await prisma.subscription.findUnique({ where: { tenantId }, select: { status: true, excesoDetectadoAt: true } });
    const estado = await sincronizarExceso(tenantId, {
      status: sub?.status ?? admin.status,
      excesoDetectadoAt: sub?.excesoDetectadoAt ?? null,
    });
    if (estado.activo) {
      return { ok: false, error: "Todavía queda un exceso por ajustar. Revisa la selección e inténtalo de nuevo." };
    }

    revalidatePath(`/${tenantSlug}`, "layout");
    return { ok: true };
  } catch (err) {
    console.error("Error al ajustar el plan:", err);
    return { ok: false, error: "No se pudo guardar el ajuste. Inténtalo de nuevo." };
  }
}
