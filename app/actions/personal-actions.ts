"use server";

import { prisma, getTenantPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PaymentScheme, CommissionBase, PaymentFrequency, StaffPaymentMethod, StaffPaymentStatus } from "@prisma/client";
import { calcularComisionSugerida, calcularComisionEquipoSugerida } from "@/lib/personal-data";
import { resolverActor, type ActorResult } from "@/lib/actor";
import { validarTelefono, PAIS_TELEFONO_DEFAULT } from "@/lib/paises";
import { hashPin, pinValido } from "@/lib/staff-auth";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

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
 *
 * Cambio de esta pasada (feedback de Carlos: "no veo necesario tener un
 * correo... solo debo asignar un Nombre, Puesto y un PIN de inicio"):
 * crearEmpleadoAction/editarEmpleadoAction ya no piden correo ni ofrecen
 * "vincular una cuenta existente" — todo empleado nuevo recibe
 * automáticamente una cuenta de atribución oculta (ver el comentario largo
 * en Staff.userId, schema.prisma) más un PIN de 6 dígitos y un Rol del
 * catálogo de ESTE tenant (base o personalizado — "Administrador" nunca se
 * ofrece aquí, ver ROL_ADMINISTRADOR en lib/roles.ts). Personal se queda
 * 100% admin-only vía resolverActor(tenantSlug, "personal") — ningún rol
 * asignable incluye "personal" en su matriz de acceso, así que una sesión
 * de PIN de personal nunca puede llegar a estas acciones ni aunque conozca
 * su URL/nombre exacto.
 *
 * Cambio 2026-09-17 (roles y esquemas de pago personalizables, a petición
 * de Carlos): DatosEmpleado.roleName (un valor fijo) se volvió roleId (el
 * id de cualquier Role del tenant, ver RolesManager.tsx) y se agregaron los
 * campos de teléfono con código de país, método de pago, frecuencia de
 * comisión separada de la del sueldo, destajo y comisión de equipo — ver el
 * comentario largo en Staff (schema.prisma) para el detalle de cada uno.
 */

type ResolverResult = ActorResult;

async function resolverTenantYUsuario(tenantSlug: string): Promise<ResolverResult> {
  return resolverActor(tenantSlug, "personal");
}

/** Correo/uid sintéticos para la cuenta de atribución de un empleado de PIN — ver Staff.userId en schema.prisma. Nunca se muestran ni sirven para iniciar sesión por /login. */
function credencialesInternas(tenantSlug: string) {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  return {
    email: `staff-${sufijo}@${tenantSlug}.personal.linkity.internal`,
    supabaseId: `staff-placeholder-${randomUUID()}`,
  };
}

export type AccionPersonalResult = { ok: true } | { ok: false; error: string };

export interface DatosEmpleado {
  branchId: string;
  name: string;
  phone?: string | null;
  phoneCountryCode?: string;
  position?: string | null;
  // Rol personalizable del tenant (2026-09-17) — antes era un valor fijo
  // ("Gerente"|"Cajero"|"Técnico"); ahora es el id de cualquier Role del
  // catálogo de este negocio (base o personalizado, ver RolesManager.tsx /
  // roles-server.ts). La pertenencia al tenant se valida en el servidor
  // (validarRolDeTenant, abajo) — nunca se confía en el id que manda el
  // cliente sin más.
  roleId: string;
  paymentScheme: PaymentScheme;
  baseSalary: number;
  commissionRate: number;
  commissionBase: CommissionBase;
  paymentFrequency: PaymentFrequency;
  // Frecuencia propia de la comisión, separada de paymentFrequency (que
  // ahora significa específicamente "frecuencia del sueldo base") — caso
  // real reportado por Carlos: sueldo fijo semanal + comisión mensual.
  commissionFrequency: PaymentFrequency;
  // Monto fijo por unidad (venta o reparación, según commissionBase) — solo
  // relevante cuando paymentScheme = DESTAJO.
  pieceRate: number;
  // Segunda comisión, propia de quien lidera un equipo (ej. Jefe de
  // Barberos) — se calcula sobre la producción de TODA la sucursal del
  // empleado (simplificación deliberada, ver el comentario en
  // Staff.teamCommissionBase, schema.prisma). null/0 = no lidera equipo.
  teamCommissionRate: number;
  teamCommissionBase: CommissionBase | null;
  staffPaymentMethod: StaffPaymentMethod;
  clabe?: string | null;
}

function validarDatosEmpleado(d: DatosEmpleado): string | null {
  if (!d.branchId) return "Selecciona una sucursal";
  if (!d.name.trim()) return "El nombre es obligatorio";
  if (!d.roleId) return "Selecciona un rol — determina a qué módulos tendrá acceso";
  if (!Number.isFinite(d.baseSalary) || d.baseSalary < 0) return "El sueldo base no es válido";
  if (!Number.isFinite(d.commissionRate) || d.commissionRate < 0 || d.commissionRate > 100) {
    return "El porcentaje de comisión debe estar entre 0 y 100";
  }
  if (!Number.isFinite(d.pieceRate) || d.pieceRate < 0) return "El monto por destajo no es válido";
  if (!Number.isFinite(d.teamCommissionRate) || d.teamCommissionRate < 0 || d.teamCommissionRate > 100) {
    return "El porcentaje de comisión de equipo debe estar entre 0 y 100";
  }
  const errorTelefono = validarTelefono(d.phone, d.phoneCountryCode || PAIS_TELEFONO_DEFAULT);
  if (errorTelefono) return errorTelefono;
  if (d.staffPaymentMethod === StaffPaymentMethod.TRANSFERENCIA) {
    const clabeDigitos = (d.clabe ?? "").replace(/\D/g, "");
    if (clabeDigitos.length !== 18) return "La CLABE debe tener exactamente 18 dígitos";
  }
  return null;
}

/** Confirma que roleId sea de verdad un Role de ESTE tenant — Role no trae tenantId inyectado por getTenantPrisma (no está en la lista de tenantModels, ver lib/prisma.ts), así que aquí se valida a mano, mismo criterio que ya usaba asegurarRolAsignable/asegurarRolBase. */
async function validarRolDeTenant(tenantId: string, roleId: string): Promise<string | null> {
  const rol = await prisma.role.findUnique({ where: { id: roleId }, select: { tenantId: true } });
  if (!rol || rol.tenantId !== tenantId) return "El rol seleccionado no existe o no pertenece a este negocio";
  return null;
}

export async function crearEmpleadoAction(
  params: { tenantSlug: string; pin: string } & DatosEmpleado
): Promise<AccionPersonalResult> {
  const { tenantSlug, pin, ...datos } = params;
  const errorValidacion = validarDatosEmpleado(datos);
  if (errorValidacion) return { ok: false, error: errorValidacion };
  if (!pinValido(pin)) return { ok: false, error: "El PIN de inicio debe ser de 6 dígitos" };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const branch = await db.branch.findUnique({ where: { id: datos.branchId }, select: { id: true } });
    if (!branch) return { ok: false, error: "Sucursal no encontrada" };

    // Límite de personal por sucursal del esquema asignado a este tenant
    // (Panel Maestro, ver lib/esquemas-data.ts) — null si no tiene esquema
    // asignado (sin límite). Se revisa ANTES de crear la cuenta de
    // atribución oculta para no dejar un User huérfano si el límite bloquea
    // el alta.
    const tenantConEsquema = await prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: { esquema: { select: { maxStaffPerBranch: true, name: true } } },
    });
    if (tenantConEsquema?.esquema) {
      const staffActivos = await db.staff.count({ where: { branchId: datos.branchId, isActive: true } });
      if (staffActivos >= tenantConEsquema.esquema.maxStaffPerBranch) {
        return {
          ok: false,
          error: `Tu esquema (${tenantConEsquema.esquema.name}) permite hasta ${tenantConEsquema.esquema.maxStaffPerBranch} empleado(s) por sucursal. Contacta a soporte para ampliar tu esquema.`,
        };
      }
    }

    const errorRol = await validarRolDeTenant(tenant.id, datos.roleId);
    if (errorRol) return { ok: false, error: errorRol };

    const { email, supabaseId } = credencialesInternas(tenantSlug);
    const pinHash = hashPin(pin);

    // Cuenta de atribución oculta (User) + registro de Staff, juntos en una
    // transacción — ver el comentario largo al inicio de este archivo y en
    // Staff.userId (schema.prisma).
    await prisma.$transaction(async (tx) => {
      const usuarioOculto = await tx.user.create({
        data: {
          tenantId: tenant.id,
          branchId: datos.branchId,
          email,
          name: datos.name.trim(),
          supabaseId,
        },
      });

      await tx.staff.create({
        data: {
          tenantId: tenant.id,
          branchId: datos.branchId,
          userId: usuarioOculto.id,
          name: datos.name.trim(),
          phone: datos.phone?.trim() || null,
          phoneCountryCode: datos.phoneCountryCode || PAIS_TELEFONO_DEFAULT,
          position: datos.position?.trim() || null,
          roleId: datos.roleId,
          pinHash,
          paymentScheme: datos.paymentScheme,
          baseSalary: datos.baseSalary,
          commissionRate: datos.commissionRate,
          commissionBase: datos.commissionBase,
          paymentFrequency: datos.paymentFrequency,
          commissionFrequency: datos.commissionFrequency,
          pieceRate: datos.pieceRate,
          teamCommissionRate: datos.teamCommissionRate,
          teamCommissionBase: datos.teamCommissionBase,
          staffPaymentMethod: datos.staffPaymentMethod,
          clabe: datos.staffPaymentMethod === StaffPaymentMethod.TRANSFERENCIA ? (datos.clabe ?? "").replace(/\D/g, "") : datos.clabe?.trim() || null,
        },
      });
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

    const errorRol = await validarRolDeTenant(tenant.id, datos.roleId);
    if (errorRol) return { ok: false, error: errorRol };

    const datosStaff = {
      branchId: datos.branchId,
      name: datos.name.trim(),
      phone: datos.phone?.trim() || null,
      phoneCountryCode: datos.phoneCountryCode || PAIS_TELEFONO_DEFAULT,
      position: datos.position?.trim() || null,
      roleId: datos.roleId,
      paymentScheme: datos.paymentScheme,
      baseSalary: datos.baseSalary,
      commissionRate: datos.commissionRate,
      commissionBase: datos.commissionBase,
      paymentFrequency: datos.paymentFrequency,
      commissionFrequency: datos.commissionFrequency,
      pieceRate: datos.pieceRate,
      teamCommissionRate: datos.teamCommissionRate,
      teamCommissionBase: datos.teamCommissionBase,
      staffPaymentMethod: datos.staffPaymentMethod,
      clabe: datos.staffPaymentMethod === StaffPaymentMethod.TRANSFERENCIA ? (datos.clabe ?? "").replace(/\D/g, "") : datos.clabe?.trim() || null,
    };

    if (existente.userId) {
      await db.staff.update({ where: { id: staffId }, data: datosStaff });

      // Mantiene el nombre de la cuenta de atribución oculta sincronizado —
      // no se muestra en ningún lado, pero evita que quede con un nombre
      // viejo si algún reporte futuro llega a exponerlo.
      await db.user.update({ where: { id: existente.userId }, data: { name: datos.name.trim() } }).catch(() => {});
    } else {
      // Empleado creado ANTES de que existieran los módulos de Roles (M4) y
      // PIN (M11) — nunca tuvo cuenta de atribución oculta (Staff.userId).
      // Carlos preguntó (2026-09-24, tenant "movilmart", empleado "juan
      // perez"): "el usuario se creó antes de la creación del módulo, cómo
      // puedo actualizar para que usuarios viejos tengan acceso a todas las
      // funciones añadidas". La respuesta es que esta misma pantalla los
      // pone al día: la creamos aquí, la primera vez que alguien edita su
      // ficha y le asigna un rol, para que "Editar" (rol) + "Restablecer
      // PIN" (ya idempotente sobre pinHash null, ver restablecerPinAction)
      // basten para dejar a CUALQUIER empleado viejo con acceso completo,
      // sin necesitar ningún script aparte por negocio.
      const { email, supabaseId } = credencialesInternas(tenantSlug);
      await prisma.$transaction(async (tx) => {
        const usuarioOculto = await tx.user.create({
          data: { tenantId: tenant.id, branchId: datos.branchId, email, name: datos.name.trim(), supabaseId },
        });
        await tx.staff.update({ where: { id: staffId }, data: { ...datosStaff, userId: usuarioOculto.id } });
      });
    }

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

export async function restablecerPinAction(params: {
  tenantSlug: string;
  staffId: string;
  pin: string;
}): Promise<AccionPersonalResult> {
  const { tenantSlug, staffId, pin } = params;
  if (!pinValido(pin)) return { ok: false, error: "El PIN debe ser de 6 dígitos" };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const existente = await db.staff.findUnique({ where: { id: staffId }, select: { id: true } });
    if (!existente) return { ok: false, error: "Empleado no encontrado" };

    await db.staff.update({ where: { id: staffId }, data: { pinHash: hashPin(pin) } });

    revalidatePath(`/${tenantSlug}/personal`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al restablecer PIN:", err);
    return { ok: false, error: "No se pudo restablecer el PIN" };
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
  | { ok: true; monto: number; advertencia: string | null; montoEquipo: number; advertenciaEquipo: string | null }
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
      select: { userId: true, branchId: true, commissionBase: true, commissionRate: true, teamCommissionBase: true, teamCommissionRate: true },
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

    // Comisión de equipo (2026-09-17) — solo aplica si el empleado lidera un
    // equipo (teamCommissionBase != null); se calcula sobre la producción de
    // toda su sucursal, no solo la suya (ver el comentario en
    // calcularComisionEquipoSugerida, lib/personal-data.ts).
    let montoEquipo = 0;
    let advertenciaEquipo: string | null = null;
    if (staff.teamCommissionBase && Number(staff.teamCommissionRate) > 0) {
      const sugerenciaEquipo = await calcularComisionEquipoSugerida(
        tenant.id,
        staff.branchId,
        staff.teamCommissionBase as any,
        Number(staff.teamCommissionRate),
        inicio,
        fin
      );
      montoEquipo = sugerenciaEquipo.monto;
      advertenciaEquipo = sugerenciaEquipo.advertencia;
    }

    return { ok: true, monto: sugerencia.monto, advertencia: sugerencia.advertencia, montoEquipo, advertenciaEquipo };
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
