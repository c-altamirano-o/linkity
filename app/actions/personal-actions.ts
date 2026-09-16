"use server";

import { prisma, getTenantPrisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { PaymentScheme, CommissionBase, PaymentFrequency, StaffPaymentStatus } from "@prisma/client";
import { calcularComisionSugerida } from "@/lib/personal-data";

/**
 * Server Actions del módulo Personal (M11). Mismo criterio de siempre:
 * tenantSlug se resuelve a tenant.id en el servidor, y toda escritura pasa
 * por getTenantPrisma para no operar nunca sobre un registro de otro tenant.
 *
 * Excepción deliberada: generarPagoAction SÍ confía en los montos
 * (montoBase/montoComision) que manda el cliente, a diferencia de
 * crearVentaAction o cobrarYEntregarAction. La diferencia es quién está del
 * otro lado: ahí es un cliente pagando en una transacción (nunca se le debe
 * dejar decidir el precio), aquí es un administrador generando la nómina de
 * su propio negocio — la sugerencia de comisión (calcularComisionSugerida en
 * lib/personal-data.ts) es solo un punto de partida editable, porque en la
 * práctica la nómina necesita ajustes humanos (bonos, descuentos, acuerdos).
 */

type ResolverResult =
  | { ok: true; tenant: { id: string }; dbUser: { id: string; tenantId: string } }
  | { ok: false; error: string };

// Tipo de retorno anotado explícitamente + discriminante `ok` en todas las
// ramas (no la presencia/ausencia de una key) — mismo fix que ya se aplicó
// en caja-actions.ts tras los errores TS2322 que reportó Carlos ahí.
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

export type AccionPersonalResult = { ok: true } | { ok: false; error: string };

export interface DatosEmpleado {
  branchId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  position?: string | null;
  paymentScheme: PaymentScheme;
  baseSalary: number;
  commissionRate: number;
  commissionBase: CommissionBase;
  paymentFrequency: PaymentFrequency;
  clabe?: string | null;
  userId?: string | null;
}

function validarDatosEmpleado(d: DatosEmpleado): string | null {
  if (!d.branchId) return "Selecciona una sucursal";
  if (!d.name.trim()) return "El nombre es obligatorio";
  if (!Number.isFinite(d.baseSalary) || d.baseSalary < 0) return "El sueldo base no es válido";
  if (!Number.isFinite(d.commissionRate) || d.commissionRate < 0 || d.commissionRate > 100) {
    return "El porcentaje de comisión debe estar entre 0 y 100";
  }
  return null;
}

export async function crearEmpleadoAction(
  params: { tenantSlug: string } & DatosEmpleado
): Promise<AccionPersonalResult> {
  const { tenantSlug, ...datos } = params;
  const errorValidacion = validarDatosEmpleado(datos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const branch = await db.branch.findUnique({ where: { id: datos.branchId }, select: { id: true } });
    if (!branch) return { ok: false, error: "Sucursal no encontrada" };

    if (datos.userId) {
      const cuenta = await db.user.findUnique({ where: { id: datos.userId }, select: { id: true, staff: { select: { id: true } } } });
      if (!cuenta) return { ok: false, error: "Cuenta de usuario no encontrada" };
      if (cuenta.staff) return { ok: false, error: "Esa cuenta ya está vinculada a otro empleado" };
    }

    await db.staff.create({
      data: {
        tenantId: tenant.id,
        branchId: datos.branchId,
        userId: datos.userId || null,
        name: datos.name.trim(),
        phone: datos.phone?.trim() || null,
        email: datos.email?.trim() || null,
        position: datos.position?.trim() || null,
        paymentScheme: datos.paymentScheme,
        baseSalary: datos.baseSalary,
        commissionRate: datos.commissionRate,
        commissionBase: datos.commissionBase,
        paymentFrequency: datos.paymentFrequency,
        clabe: datos.clabe?.trim() || null,
      },
    });

    revalidatePath(`/${tenantSlug}/personal`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al crear empleado:", err);
    return { ok: false, error: "No se pudo registrar el empleado" };
  }
}

export async function editarEmpleadoAction(
  params: { tenantSlug: string; staffId: string } & DatosEmpleado
): Promise<AccionPersonalResult> {
  const { tenantSlug, staffId, ...datos } = params;
  const errorValidacion = validarDatosEmpleado(datos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const existente = await db.staff.findUnique({ where: { id: staffId }, select: { id: true, userId: true } });
    if (!existente) return { ok: false, error: "Empleado no encontrado" };

    const branch = await db.branch.findUnique({ where: { id: datos.branchId }, select: { id: true } });
    if (!branch) return { ok: false, error: "Sucursal no encontrada" };

    if (datos.userId && datos.userId !== existente.userId) {
      const cuenta = await db.user.findUnique({ where: { id: datos.userId }, select: { id: true, staff: { select: { id: true } } } });
      if (!cuenta) return { ok: false, error: "Cuenta de usuario no encontrada" };
      if (cuenta.staff) return { ok: false, error: "Esa cuenta ya está vinculada a otro empleado" };
    }

    await db.staff.update({
      where: { id: staffId },
      data: {
        branchId: datos.branchId,
        userId: datos.userId || null,
        name: datos.name.trim(),
        phone: datos.phone?.trim() || null,
        email: datos.email?.trim() || null,
        position: datos.position?.trim() || null,
        paymentScheme: datos.paymentScheme,
        baseSalary: datos.baseSalary,
        commissionRate: datos.commissionRate,
        commissionBase: datos.commissionBase,
        paymentFrequency: datos.paymentFrequency,
        clabe: datos.clabe?.trim() || null,
      },
    });

    revalidatePath(`/${tenantSlug}/personal`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al editar empleado:", err);
    return { ok: false, error: "No se pudo actualizar el empleado" };
  }
}

export async function cambiarEstadoEmpleadoAction(params: {
  tenantSlug: string;
  staffId: string;
  activo: boolean;
}): Promise<AccionPersonalResult> {
  const { tenantSlug, staffId, activo } = params;

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const existente = await db.staff.findUnique({ where: { id: staffId }, select: { id: true } });
    if (!existente) return { ok: false, error: "Empleado no encontrado" };

    await db.staff.update({ where: { id: staffId }, data: { isActive: activo } });

    revalidatePath(`/${tenantSlug}/personal`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al cambiar estado de empleado:", err);
    return { ok: false, error: "No se pudo actualizar el empleado" };
  }
}

export async function registrarAsistenciaAction(params: {
  tenantSlug: string;
  staffId: string;
  accion: "entrada" | "salida";
}): Promise<AccionPersonalResult> {
  const { tenantSlug, staffId, accion } = params;

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const staff = await db.staff.findUnique({ where: { id: staffId }, select: { id: true } });
    if (!staff) return { ok: false, error: "Empleado no encontrado" };

    const hoy = new Date();
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

    // Attendance no tiene tenantId propio — su pertenencia al tenant se
    // garantiza indirectamente porque staffId ya se validó arriba contra un
    // Staff de este tenant.
    const existente = await prisma.attendance.findUnique({
      where: { staffId_date: { staffId, date: inicioHoy } },
    });

    if (accion === "entrada") {
      if (existente?.checkIn) return { ok: false, error: "Ya se registró la entrada de hoy" };
      await prisma.attendance.upsert({
        where: { staffId_date: { staffId, date: inicioHoy } },
        create: { staffId, date: inicioHoy, checkIn: hoy },
        update: { checkIn: hoy },
      });
    } else {
      if (!existente?.checkIn) return { ok: false, error: "Primero registra la entrada de hoy" };
      if (existente.checkOut) return { ok: false, error: "Ya se registró la salida de hoy" };
      await prisma.attendance.update({
        where: { staffId_date: { staffId, date: inicioHoy } },
        data: { checkOut: hoy },
      });
    }

    revalidatePath(`/${tenantSlug}/personal`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al registrar asistencia:", err);
    return { ok: false, error: "No se pudo registrar la asistencia" };
  }
}

export async function generarPagoAction(params: {
  tenantSlug: string;
  staffId: string;
  periodoInicio: string; // ISO (fecha)
  periodoFin: string; // ISO (fecha)
  montoBase: number;
  montoComision: number;
  notas?: string | null;
}): Promise<AccionPersonalResult> {
  const { tenantSlug, staffId, periodoInicio, periodoFin, montoBase, montoComision, notas } = params;

  if (!Number.isFinite(montoBase) || montoBase < 0) return { ok: false, error: "El monto base no es válido" };
  if (!Number.isFinite(montoComision) || montoComision < 0) return { ok: false, error: "El monto de comisión no es válido" };
  const inicio = new Date(periodoInicio);
  const fin = new Date(periodoFin);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || inicio > fin) {
    return { ok: false, error: "El período no es válido" };
  }

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const staff = await db.staff.findUnique({ where: { id: staffId }, select: { id: true } });
    if (!staff) return { ok: false, error: "Empleado no encontrado" };

    await prisma.staffPayment.create({
      data: {
        staffId,
        periodStart: inicio,
        periodEnd: fin,
        baseAmount: montoBase,
        commissionAmount: montoComision,
        total: montoBase + montoComision,
        status: StaffPaymentStatus.PENDING,
        notes: notas?.trim() || null,
      },
    });

    revalidatePath(`/${tenantSlug}/personal`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al generar pago de nómina:", err);
    return { ok: false, error: "No se pudo generar el pago" };
  }
}

export async function actualizarEstadoPagoAction(params: {
  tenantSlug: string;
  paymentId: string;
  estado: "PAID" | "CANCELLED";
}): Promise<AccionPersonalResult> {
  const { tenantSlug, paymentId, estado } = params;

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    // StaffPayment no tiene tenantId propio — se valida indirectamente vía
    // Staff, que sí lo tiene.
    const pago = await prisma.staffPayment.findUnique({
      where: { id: paymentId },
      select: { id: true, status: true, staff: { select: { tenantId: true } } },
    });
    if (!pago || pago.staff.tenantId !== tenant.id) return { ok: false, error: "Pago no encontrado" };
    if (pago.status !== StaffPaymentStatus.PENDING) return { ok: false, error: "Ese pago ya no está pendiente" };

    await prisma.staffPayment.update({
      where: { id: paymentId },
      data: {
        status: estado === "PAID" ? StaffPaymentStatus.PAID : StaffPaymentStatus.CANCELLED,
        paidAt: estado === "PAID" ? new Date() : null,
      },
    });

    // Nota de alcance: marcar un pago como PAID no genera ningún
    // CashMovement en Caja a propósito — StaffPayment no tiene un campo de
    // método de pago, y Staff.clabe sugiere que la nómina normalmente se
    // paga por transferencia, no en efectivo. Si en la práctica Carlos paga
    // nómina en efectivo desde la caja de alguna sucursal, el siguiente paso
    // sería agregar ese campo y, solo cuando sea efectivo, registrar el
    // egreso correspondiente (mismo patrón que cobrarYEntregarAction).
    revalidatePath(`/${tenantSlug}/personal`);
    return { ok: true };
  } catch (err: any) {
    console.error("Error al actualizar estado de pago:", err);
    return { ok: false, error: "No se pudo actualizar el pago" };
  }
}

export type SugerenciaComisionResult =
  | { ok: true; monto: number; advertencia: string | null }
  | { ok: false; error: string };

/**
 * Envoltura de calcularComisionSugerida (lib/personal-data.ts, server-only)
 * como Server Action, para que el modal de "Generar pago" en el cliente
 * pueda pedir la sugerencia al cambiar de empleado o de período. El monto
 * que regresa es solo un punto de partida editable — ver la nota al inicio
 * de este archivo sobre por qué generarPagoAction no lo fuerza.
 */
export async function obtenerSugerenciaComisionAction(params: {
  tenantSlug: string;
  staffId: string;
  periodoInicio: string;
  periodoFin: string;
}): Promise<SugerenciaComisionResult> {
  const { tenantSlug, staffId, periodoInicio, periodoFin } = params;

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const staff = await db.staff.findUnique({
      where: { id: staffId },
      select: { userId: true, commissionBase: true, commissionRate: true },
    });
    if (!staff) return { ok: false, error: "Empleado no encontrado" };

    const inicio = new Date(periodoInicio);
    const fin = new Date(periodoFin);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
      return { ok: false, error: "El período no es válido" };
    }

    const sugerencia = await calcularComisionSugerida(
      tenant.id,
      { userId: staff.userId, commissionBase: staff.commissionBase as any, commissionRate: Number(staff.commissionRate) },
      inicio,
      fin
    );
    return { ok: true, monto: sugerencia.monto, advertencia: sugerencia.advertencia };
  } catch (err: any) {
    console.error("Error al calcular sugerencia de comisión:", err);
    return { ok: false, error: "No se pudo calcular la comisión sugerida" };
  }
}

function generarPasswordTemporal(): string {
  return "Temp" + Math.random().toString(36).slice(-8) + "!1";
}

/**
 * Invitación rápida de empleado desde la pantalla de Bienvenida (onboarding).
 * A diferencia de crearEmpleadoAction (que solo VINCULA un userId ya
 * existente a un Staff nuevo), esta acción SÍ crea la cuenta desde cero:
 * usuario de Supabase Auth con contraseña temporal + User + Staff, en una
 * sola transacción — mismo patrón que registrarNegocioAction en
 * app/(auth)/register/actions.ts (temp password generada en servidor,
 * user_metadata.must_change_password=true, el negocio nunca ve ni escribe
 * la contraseña real del empleado).
 *
 * Simplificaciones deliberadas, válidas porque esto solo se usa desde
 * Bienvenida (justo después del alta, cuando el negocio todavía tiene una
 * sola sucursal y un solo rol):
 * - La sucursal se resuelve sola (la primera/única que exista) en vez de
 *   pedirla en el formulario — el selector completo de sucursal ya existe
 *   en Personal para cuando haga falta.
 * - El empleado queda con el mismo rol "Administrador" que el dueño,
 *   porque hoy no existe una pantalla de permisos por rol (ver el aviso en
 *   BienvenidaClient.tsx) — es el mismo nivel de acceso que ya tiene
 *   cualquier cuenta del tenant, no un privilegio nuevo que se esté
 *   otorgando de más.
 * - Los 5 campos de esquema de pago (baseSalary, commissionRate, etc.)
 *   quedan en sus valores por defecto (sueldo base $0, sin comisión) — se
 *   terminan de configurar después en Personal, igual que cualquier otro
 *   empleado.
 */
export type AccionInvitarEmpleadoResult =
  | { ok: true; email: string; tempPassword: string }
  | { ok: false; error: string };

export async function invitarEmpleadoAction(params: {
  tenantSlug: string;
  name: string;
  email: string;
  position?: string | null;
}): Promise<AccionInvitarEmpleadoResult> {
  const { tenantSlug, name, position } = params;
  const email = params.email.trim().toLowerCase();

  if (!name.trim()) return { ok: false, error: "El nombre es obligatorio" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "El correo no es válido" };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const existente = await prisma.user.findFirst({ where: { email }, select: { id: true } });
    if (existente) return { ok: false, error: "Ya existe una cuenta con ese correo" };

    const branch = await db.branch.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!branch) return { ok: false, error: "Tu negocio todavía no tiene ninguna sucursal" };

    const rol = await db.role.findFirst({ where: { isSystem: true }, orderBy: { createdAt: "asc" }, select: { id: true } });

    const supabaseAdmin = createAdminClient();
    const tempPassword = generarPasswordTemporal();

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { must_change_password: true },
    });

    if (authError || !authData.user) {
      return { ok: false, error: `No se pudo crear la cuenta: ${authError?.message ?? "error desconocido"}` };
    }

    try {
      await prisma.$transaction(async (tx) => {
        const nuevoUsuario = await tx.user.create({
          data: {
            tenantId: tenant.id,
            branchId: branch.id,
            email,
            name: name.trim(),
            supabaseId: authData.user!.id,
          },
        });

        if (rol) {
          await tx.userRole.create({ data: { userId: nuevoUsuario.id, roleId: rol.id } });
        }

        await tx.staff.create({
          data: {
            tenantId: tenant.id,
            branchId: branch.id,
            userId: nuevoUsuario.id,
            name: name.trim(),
            email,
            position: position?.trim() || null,
            paymentScheme: PaymentScheme.FIJO,
            baseSalary: 0,
            commissionRate: 0,
            commissionBase: CommissionBase.VENTAS,
            paymentFrequency: PaymentFrequency.QUINCENAL,
          },
        });
      });
    } catch (txErr) {
      // La cuenta de Supabase ya se creó pero la escritura en BD falló —
      // se limpia para no dejar una cuenta huérfana que nadie puede usar
      // ni volver a intentar registrar (el email quedaría "tomado" en Auth).
      await supabaseAdmin.auth.admin.deleteUser(authData.user!.id).catch(() => {});
      throw txErr;
    }

    revalidatePath(`/${tenantSlug}/personal`);
    revalidatePath(`/${tenantSlug}/bienvenida`);
    return { ok: true, email, tempPassword };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al invitar empleado:", err);
    return { ok: false, error: "No se pudo invitar al empleado" };
  }
}
