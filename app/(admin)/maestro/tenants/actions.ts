"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/maestro-auth";
import { MODULE_CATALOG } from "@/lib/modules-catalog";
import { eliminarTenantPorCompleto } from "@/lib/eliminar-tenant";

export type AccionMaestroResult = { ok: true } | { ok: false; error: string };

// Prender/apagar un módulo para UN negocio en particular, desde su pantalla
// de detalle (antes esto solo se decidía una vez, al darlo de alta, en
// tenants/nuevo/actions.ts — no había forma de cambiarlo después sin entrar
// directo a la base de datos).
export async function alternarModuloTenantAction(params: {
  tenantId: string;
  slug: string;
  moduleCode: string;
  activar: boolean;
}): Promise<AccionMaestroResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  const info = MODULE_CATALOG[params.moduleCode];
  if (!info) return { ok: false, error: "Módulo desconocido" };
  if (info.isCore && !params.activar) {
    return { ok: false, error: "Este módulo es parte del núcleo y no se puede desactivar" };
  }

  try {
    const mod = await prisma.module.upsert({
      where: { code: params.moduleCode },
      update: {},
      create: { code: params.moduleCode, name: info.name, isCore: info.isCore },
    });

    await prisma.tenantModule.upsert({
      where: { tenantId_moduleId: { tenantId: params.tenantId, moduleId: mod.id } },
      update: { isActive: params.activar },
      create: { tenantId: params.tenantId, moduleId: mod.id, isActive: params.activar },
    });

    revalidatePath(`/maestro/tenants/${params.slug}`);
    revalidatePath("/maestro/tenants");
    revalidatePath("/maestro/dashboard");
    return { ok: true };
  } catch (err) {
    console.error("Error al actualizar el módulo del negocio:", err);
    return { ok: false, error: "No se pudo actualizar el módulo" };
  }
}

// Reasignar el esquema (límite de sucursales/personal) de un negocio desde
// su pantalla de detalle — así Carlos "migra" a un cliente de esquema según
// el volumen que vea, sin tocar la base de datos a mano. esquemaId=null
// quita el límite (el tenant queda sin esquema asignado, sin restricción).
export async function asignarEsquemaAction(params: {
  tenantId: string;
  slug: string;
  esquemaId: string | null;
}): Promise<AccionMaestroResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  try {
    if (params.esquemaId) {
      const esquema = await prisma.planEsquema.findUnique({
        where: { id: params.esquemaId },
        select: { id: true },
      });
      if (!esquema) return { ok: false, error: "Esquema no encontrado" };
    }

    await prisma.tenant.update({
      where: { id: params.tenantId },
      data: { esquemaId: params.esquemaId },
    });

    revalidatePath(`/maestro/tenants/${params.slug}`);
    revalidatePath("/maestro/tenants");
    return { ok: true };
  } catch (err) {
    console.error("Error al asignar esquema al negocio:", err);
    return { ok: false, error: "No se pudo asignar el esquema" };
  }
}

// Renovar manualmente una suscripción desde el detalle del negocio
// (2026-09-22, a petición de Carlos — parte del ciclo de vida de
// suscripción, ver lib/ciclo-suscripcion.ts): reactiva la cuenta (por si
// estaba bloqueada por vencimiento, suspendida o cancelada), mueve
// `endDate` a la fecha que Carlos elija, y LIMPIA los 4 campos de aviso ya
// enviado (expiredNoticeSentAt y hermanos) — así, si esta suscripción
// vuelve a vencer más adelante, el ciclo de avisos arranca desde cero en
// vez de creer que ya se avisó todo.
export async function renovarSuscripcionAction(params: {
  tenantId: string;
  slug: string;
  nuevaFechaFin: string; // YYYY-MM-DD
}): Promise<AccionMaestroResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.nuevaFechaFin)) {
    return { ok: false, error: "Fecha inválida" };
  }
  const nuevaFecha = new Date(`${params.nuevaFechaFin}T23:59:59-06:00`);
  if (Number.isNaN(nuevaFecha.getTime())) return { ok: false, error: "Fecha inválida" };

  try {
    const subscription = await prisma.subscription.findUnique({ where: { tenantId: params.tenantId } });
    if (!subscription) return { ok: false, error: "Este negocio no tiene una suscripción registrada" };

    await prisma.subscription.update({
      where: { tenantId: params.tenantId },
      data: {
        status: "ACTIVE",
        endDate: nuevaFecha,
        expiredNoticeSentAt: null,
        blockNoticeSentAt: null,
        renewalReminderSentAt: null,
        deletionNoticeSentAt: null,
      },
    });

    revalidatePath(`/maestro/tenants/${params.slug}`);
    revalidatePath("/maestro/tenants");
    revalidatePath("/maestro/suscripciones");
    revalidatePath("/maestro/dashboard");
    return { ok: true };
  } catch (err) {
    console.error("Error al renovar la suscripción:", err);
    return { ok: false, error: "No se pudo renovar la suscripción" };
  }
}

// Borrado REAL y definitivo de un negocio (2026-09-22, a petición de
// Carlos — el paso final del ciclo de vida de suscripción: "en mi panel
// de administrador me debe aparecer una alerta... y lo puedo borrar. La
// decisión la tomaré yo en base a criterios de almacenamiento"). A
// propósito NO exige que el negocio haya llegado a los 90 días de
// bloqueo — Panel Maestro se lo recomienda/alerta ahí (ver
// lib/ciclo-suscripcion.ts y SuscripcionesClient.tsx), pero la decisión
// final queda en manos de Carlos como dijo explícitamente, incluyendo
// borrar antes de tiempo un negocio de prueba/spam si hiciera falta.
//
// `confirmarNombre` se valida aquí en el servidor (no solo en el botón del
// cliente) contra el nombre real del tenant — es un borrado irreversible
// de TODOS los datos del negocio, así que un solo clic de más no debe
// poder disparlo por accidente.
export async function eliminarTenantAction(params: {
  tenantId: string;
  slug: string;
  confirmarNombre: string;
}): Promise<AccionMaestroResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: params.tenantId }, select: { id: true, name: true } });
    if (!tenant) return { ok: false, error: "Negocio no encontrado" };
    if (params.confirmarNombre.trim() !== tenant.name) {
      return { ok: false, error: "El nombre no coincide — no se borró nada" };
    }

    await eliminarTenantPorCompleto(tenant.id);

    revalidatePath("/maestro/tenants");
    revalidatePath("/maestro/suscripciones");
    revalidatePath("/maestro/dashboard");
  } catch (err) {
    console.error("Error al eliminar el negocio:", err);
    return { ok: false, error: "No se pudo eliminar el negocio" };
  }

  // Fuera del try/catch: redirect() de Next lanza internamente una
  // excepción especial para hacer la navegación — atraparla en el catch de
  // arriba la convertiría (por error) en "No se pudo eliminar el negocio"
  // justo cuando SÍ se pudo.
  redirect("/maestro/tenants");
}
