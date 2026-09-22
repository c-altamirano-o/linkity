"use server";

import { prisma, getTenantPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { resolverActor, type ActorResult } from "@/lib/actor";
import { horaValida } from "@/lib/horarios-sucursal";

/**
 * Server Actions del módulo Sucursales. Antes de este cambio no existía
 * ningún actions.ts para este módulo — la pantalla era de solo lectura de
 * datos inventados y "Transferir" era un botón decorativo (2 segundos de
 * animación falsa, sin ningún cambio real en Inventory).
 *
 * Mismo criterio que en clientes-actions.ts / compras-actions.ts:
 * resolverTenantYUsuario duplicado localmente (convención del proyecto, no
 * se centraliza), resultado discriminado {ok:true,...}|{ok:false,error}.
 */

type ResolverResult = ActorResult;

// Delega en resolverActor (lib/actor.ts) — Gerente tiene "sucursales" en su
// matriz de acceso (lib/roles.ts), Cajero y Técnico no.
async function resolverTenantYUsuario(tenantSlug: string): Promise<ResolverResult> {
  return resolverActor(tenantSlug, "sucursales");
}

function manejarErrorAcceso(err: any, mensajeGenerico: string): { ok: false; error: string } {
  if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
    return { ok: false, error: "No tienes acceso a este recurso" };
  }
  console.error(mensajeGenerico, err);
  return { ok: false, error: mensajeGenerico };
}

/**
 * Límite de sucursales del esquema asignado a este tenant (Panel Maestro,
 * ver lib/esquemas-data.ts) — null si no tiene esquema asignado (sin
 * límite, criterio deliberado para no romper tenants que ya existían antes
 * de este campo). Tenant no es un modelo de tenantModels (getTenantPrisma
 * no lo inyecta), así que aquí se usa el prisma cross-tenant normal, con el
 * tenant.id ya resuelto/confiable que entrega resolverActor.
 */
async function limiteSucursalesDe(tenantId: string): Promise<{ maxBranches: number; nombre: string } | null> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { esquema: { select: { maxBranches: true, name: true } } },
  });
  if (!t?.esquema) return null;
  return { maxBranches: t.esquema.maxBranches, nombre: t.esquema.name };
}

export interface DatosSucursal {
  name: string;
  address?: string | null;
  phone?: string | null;
  // Sigla/código de sucursal (Branch.code, 2026-09-22, a petición de
  // Carlos: "tú la defines a mano por sucursal") — opcional, el admin la
  // escribe a mano al crear/editar. Alimenta el folio de reparaciones (ver
  // crearReparacionAction, reparaciones-actions.ts).
  code?: string | null;
  // Horario esperado de apertura/cierre de caja — Fase 2 de notificaciones
  // (2026-09-22, ver el comentario largo en Branch, schema.prisma). Ambos
  // "HH:MM" en 24h u null/vacío para no monitorear esta sucursal.
  horaAperturaEsperada?: string | null;
  horaCierreEsperada?: string | null;
  // 0=domingo…6=sábado. undefined al crear = default del schema (los 7
  // días); se manda explícito al editar para poder desmarcar un día.
  diasOperacion?: number[];
}

function validarDatosSucursal(datos: DatosSucursal): string | null {
  if (!datos.name?.trim()) return "El nombre de la sucursal es obligatorio";
  if (datos.code && !/^[A-Za-z0-9]{1,8}$/.test(datos.code.trim())) {
    return "El código de sucursal debe ser solo letras/números, máximo 8 caracteres";
  }
  if (datos.horaAperturaEsperada && !horaValida(datos.horaAperturaEsperada)) {
    return "La hora de apertura esperada no es válida";
  }
  if (datos.horaCierreEsperada && !horaValida(datos.horaCierreEsperada)) {
    return "La hora de cierre esperada no es válida";
  }
  if (datos.diasOperacion && datos.diasOperacion.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    return "Los días de operación no son válidos";
  }
  return null;
}

export type AccionSucursalResult = { ok: true; id: string } | { ok: false; error: string };

export async function crearSucursalAction(
  params: { tenantSlug: string } & DatosSucursal
): Promise<AccionSucursalResult> {
  const { tenantSlug, ...datos } = params;
  const errorValidacion = validarDatosSucursal(datos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const limite = await limiteSucursalesDe(tenant.id);
    if (limite) {
      const sucursalesActivas = await db.branch.count({ where: { isActive: true } });
      if (sucursalesActivas >= limite.maxBranches) {
        return {
          ok: false,
          error: `Tu esquema (${limite.nombre}) permite hasta ${limite.maxBranches} sucursal(es) activa(s). Contacta a soporte para ampliar tu esquema.`,
        };
      }
    }

    const codigoLimpio = datos.code?.trim().toUpperCase() || null;
    if (codigoLimpio) {
      // El código alimenta el folio de reparaciones (REP-{code}-0001) — dos
      // sucursales con el mismo código compartirían secuencia de folios,
      // así que se exige único por tenant.
      const yaExiste = await db.branch.findFirst({ where: { code: codigoLimpio }, select: { id: true } });
      if (yaExiste) return { ok: false, error: `Ya existe una sucursal con el código "${codigoLimpio}"` };
    }

    const nueva = await db.branch.create({
      data: {
        tenantId: tenant.id,
        name: datos.name.trim(),
        code: codigoLimpio,
        address: datos.address?.trim() || null,
        phone: datos.phone?.trim() || null,
        horaAperturaEsperada: datos.horaAperturaEsperada?.trim() || null,
        horaCierreEsperada: datos.horaCierreEsperada?.trim() || null,
        ...(datos.diasOperacion ? { diasOperacion: datos.diasOperacion } : {}),
      },
    });

    revalidatePath(`/${tenantSlug}/sucursales`);
    return { ok: true, id: nueva.id };
  } catch (err: any) {
    return manejarErrorAcceso(err, "No se pudo registrar la sucursal");
  }
}

export async function editarSucursalAction(
  params: { tenantSlug: string; branchId: string; isActive: boolean } & DatosSucursal
): Promise<AccionSucursalResult> {
  const { tenantSlug, branchId, isActive, ...datos } = params;
  const errorValidacion = validarDatosSucursal(datos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const existente = await db.branch.findUnique({ where: { id: branchId }, select: { id: true, isActive: true } });
    if (!existente) return { ok: false, error: "Sucursal no encontrada" };

    // Reactivar una sucursal inactiva es, en la práctica, lo mismo que
    // crear una nueva desde el punto de vista del límite del esquema — sin
    // este chequeo, desactivar y reactivar sería una forma de saltarse el
    // límite que sí se aplica en crearSucursalAction.
    if (isActive && !existente.isActive) {
      const limite = await limiteSucursalesDe(tenant.id);
      if (limite) {
        const sucursalesActivas = await db.branch.count({ where: { isActive: true } });
        if (sucursalesActivas >= limite.maxBranches) {
          return {
            ok: false,
            error: `Tu esquema (${limite.nombre}) permite hasta ${limite.maxBranches} sucursal(es) activa(s). Contacta a soporte para ampliar tu esquema.`,
          };
        }
      }
    }

    const codigoLimpio = datos.code?.trim().toUpperCase() || null;
    if (codigoLimpio) {
      const yaExiste = await db.branch.findFirst({
        where: { code: codigoLimpio, id: { not: branchId } },
        select: { id: true },
      });
      if (yaExiste) return { ok: false, error: `Ya existe una sucursal con el código "${codigoLimpio}"` };
    }

    await db.branch.update({
      where: { id: branchId },
      data: {
        name: datos.name.trim(),
        code: codigoLimpio,
        address: datos.address?.trim() || null,
        phone: datos.phone?.trim() || null,
        horaAperturaEsperada: datos.horaAperturaEsperada?.trim() || null,
        horaCierreEsperada: datos.horaCierreEsperada?.trim() || null,
        ...(datos.diasOperacion ? { diasOperacion: datos.diasOperacion } : {}),
        isActive,
      },
    });

    revalidatePath(`/${tenantSlug}/sucursales`);
    return { ok: true, id: branchId };
  } catch (err: any) {
    return manejarErrorAcceso(err, "No se pudo actualizar la sucursal");
  }
}

export type AccionTransferirResult = { ok: true } | { ok: false; error: string };

export async function transferirInventarioAction(params: {
  tenantSlug: string;
  productId: string;
  origenBranchId: string;
  destinoBranchId: string;
  cantidad: number;
}): Promise<AccionTransferirResult> {
  const { tenantSlug, productId, origenBranchId, destinoBranchId, cantidad } = params;

  if (!productId) return { ok: false, error: "Selecciona un producto" };
  if (!origenBranchId || !destinoBranchId) return { ok: false, error: "Selecciona sucursal de origen y destino" };
  if (origenBranchId === destinoBranchId) {
    return { ok: false, error: "La sucursal de origen y destino no pueden ser la misma" };
  }
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    return { ok: false, error: "La cantidad a transferir debe ser un entero mayor a cero" };
  }

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    // Product y Branch tienen tenantId propio → getTenantPrisma ya verifica
    // que las dos sucursales y el producto pertenezcan a este tenant antes
    // de dejar seguir. Inventory no tiene tenantId propio, así que su
    // ownership se hereda de que branchId/productId ya vinieron validados.
    const [producto, origen, destino] = await Promise.all([
      db.product.findUnique({ where: { id: productId }, select: { id: true, type: true } }),
      db.branch.findUnique({ where: { id: origenBranchId }, select: { id: true } }),
      db.branch.findUnique({ where: { id: destinoBranchId }, select: { id: true } }),
    ]);
    if (!producto) return { ok: false, error: "Producto no encontrado" };
    if (producto.type === "SERVICE") return { ok: false, error: "Un servicio no se puede transferir entre sucursales" };
    if (!origen || !destino) return { ok: false, error: "Sucursal no encontrada" };

    await db.$transaction(async (tx: any) => {
      const stockOrigen = await tx.inventory.findUnique({
        where: { productId_branchId: { productId, branchId: origenBranchId } },
        select: { stock: true },
      });
      const disponible = stockOrigen?.stock ?? 0;
      if (disponible < cantidad) {
        throw new Error(`Stock insuficiente en la sucursal de origen (disponible: ${disponible})`);
      }

      await tx.inventory.update({
        where: { productId_branchId: { productId, branchId: origenBranchId } },
        data: { stock: { decrement: cantidad } },
      });

      await tx.inventory.upsert({
        where: { productId_branchId: { productId, branchId: destinoBranchId } },
        update: { stock: { increment: cantidad } },
        create: { productId, branchId: destinoBranchId, stock: cantidad },
      });
    });

    revalidatePath(`/${tenantSlug}/sucursales`);
    revalidatePath(`/${tenantSlug}/inventario`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Stock insuficiente")) {
      return { ok: false, error: err.message };
    }
    return manejarErrorAcceso(err, "No se pudo completar la transferencia");
  }
}
