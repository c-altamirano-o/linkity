"use server";

import { prisma } from "@/lib/prisma";
import { verificarPin, crearSesionPersonal, cerrarSesionPersonal, leerSesionPersonal } from "@/lib/staff-auth";

/**
 * Server Actions de /[tenant]/entrada — la pantalla de "quién eres" que
 * usa el personal para entrar con su PIN en vez de un correo/contraseña de
 * administrador. Ver el comentario largo en lib/staff-auth.ts para el
 * porqué de la sesión aparte de Supabase Auth.
 *
 * Nota de alcance: esta primera versión no lleva un contador de intentos
 * fallidos por empleado (algo como "bloquear 30s después de 5 intentos") —
 * el PIN ya está protegido por 3 capas (scrypt, verificación siempre
 * acotada a un tenant+empleado específico nunca a una búsqueda global, y
 * una sesión resultante que de todos modos nunca alcanza Personal,
 * Configuración ni Facturación) pero un limitador de intentos es un
 * endurecimiento razonable a agregar después si hace falta.
 */

export type AccionAccesoPersonalResult = { ok: true } | { ok: false; error: string };

export async function iniciarSesionPersonalAction(params: {
  tenantSlug: string;
  staffId: string;
  pin: string;
}): Promise<AccionAccesoPersonalResult> {
  const { tenantSlug, staffId, pin } = params;

  if (!/^\d{4}$/.test(pin)) return { ok: false, error: "El PIN debe ser de 4 dígitos" };

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  if (!tenant) return { ok: false, error: "Negocio no encontrado" };

  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: {
      id: true, tenantId: true, branchId: true, name: true, isActive: true,
      pinHash: true, userId: true,
      role: { select: { name: true } },
    },
  });

  if (!staff || staff.tenantId !== tenant.id || !staff.isActive) {
    return { ok: false, error: "Empleado no encontrado" };
  }
  if (!staff.pinHash || !staff.userId || !staff.role) {
    return { ok: false, error: "Este empleado todavía no tiene acceso configurado — pídele al administrador que le asigne un rol y un PIN desde Personal." };
  }
  if (!verificarPin(pin, staff.pinHash)) {
    return { ok: false, error: "PIN incorrecto" };
  }

  // Abre la fila de asistencia por login (lib/asistencia.ts) — separado del
  // registro manual de Personal (modelo Attendance, que no se toca aquí).
  // Su id viaja dentro de la cookie de sesión para poder cerrarla después,
  // ya sea al presionar "Cambiar de usuario" (cerrarSesionPersonalAction,
  // abajo) o solo al cambiar de día (verificarSesionPersonalVigente).
  const loginSession = await prisma.staffLoginSession.create({
    data: { tenantId: tenant.id, staffId: staff.id, branchId: staff.branchId },
    select: { id: true },
  });

  await crearSesionPersonal({
    tenantId: tenant.id,
    staffId: staff.id,
    userId: staff.userId,
    staffName: staff.name,
    roleName: staff.role.name,
    branchId: staff.branchId,
    loginSessionId: loginSession.id,
    loginAt: Date.now(),
  });

  return { ok: true };
}

export async function cerrarSesionPersonalAction(): Promise<AccionAccesoPersonalResult> {
  // Se lee la sesión ANTES de borrar la cookie para poder cerrar su fila de
  // asistencia (checkOut = ahora, closedBy MANUAL) — updateMany + checkOut:
  // null por si ya se había cerrado sola por cambio de día (poco probable
  // en el mismo request, pero evita pisar ese motivo con uno distinto).
  const sesion = await leerSesionPersonal();
  if (sesion?.loginSessionId) {
    await prisma.staffLoginSession.updateMany({
      where: { id: sesion.loginSessionId, checkOut: null },
      data: { checkOut: new Date(), closedBy: "MANUAL" },
    });
  }
  await cerrarSesionPersonal();
  return { ok: true };
}
