"use server";

import { prisma, getTenantPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PaymentScheme, CommissionBase, PaymentFrequency, StaffPaymentMethod, StaffPaymentStatus } from "@prisma/client";
import { calcularComisionSugerida, calcularComisionEquipoSugerida } from "@/lib/personal-data";
import { calcularIncidenciasAsistencia, type IncidenciasAsistencia } from "@/lib/incidencias-asistencia";
import { resolverActor, type ActorResult } from "@/lib/actor";
import { validarTelefono, PAIS_TELEFONO_DEFAULT } from "@/lib/paises";
import { horaValida, parseHoraAMinutos } from "@/lib/horarios-sucursal";
import { hashPin, pinValido } from "@/lib/staff-auth";
import { randomUUID } from "crypto";
import { obtenerCapacidades, puedeAgregarUno, LIMITE_EMPLEADOS_POR_SUCURSAL } from "@/lib/capacidades-comerciales";

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
  // Horario esperado individual (2026-10-03, ver el comentario largo en
  // Staff.horaEntradaEsperada, schema.prisma) — "HH:MM" en 24h u
  // null/undefined para no calcular incidencias de asistencia a este
  // empleado. 0=domingo…6=sábado en diasLaborales, mismo índice que
  // Branch.diasOperacion.
  horaEntradaEsperada?: string | null;
  horaSalidaEsperada?: string | null;
  diasLaborales?: number[];
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
  if (d.horaEntradaEsperada && !horaValida(d.horaEntradaEsperada)) {
    return "La hora de entrada esperada no es válida";
  }
  if (d.horaSalidaEsperada && !horaValida(d.horaSalidaEsperada)) {
    return "La hora de salida esperada no es válida";
  }
  if (d.diasLaborales && d.diasLaborales.some((dia) => !Number.isInteger(dia) || dia < 0 || dia > 6)) {
    return "Los días laborales no son válidos";
  }
  return null;
}

/** Confirma que roleId sea de verdad un Role de ESTE tenant — Role no trae tenantId inyectado por getTenantPrisma (no está en la lista de tenantModels, ver lib/prisma.ts), así que aquí se valida a mano, mismo criterio que ya usaba asegurarRolAsignable/asegurarRolBase. */
async function validarRolDeTenant(tenantId: string, roleId: string): Promise<string | null> {
  const rol = await prisma.role.findUnique({ where: { id: roleId }, select: { tenantId: true } });
  if (!rol || rol.tenantId !== tenantId) return "El rol seleccionado no existe o no pertenece a este negocio";
  return null;
}

/**
 * Límite COMERCIAL de empleados activos por sucursal (plan contratado, ver
 * lib/capacidades-comerciales.ts). Devuelve el mensaje de error a mostrar, o
 * null si todavía cabe un empleado activo más en esa sucursal. Solo cuentan
 * los Staff activos: el administrador (cuenta real) y la cuenta técnica oculta
 * de cada empleado no cuentan. Se usa en TODA vía que deje a un empleado
 * activo en una sucursal: crear, reactivar y mover de sucursal. `tenantId`
 * debe venir ya resuelto/confiable, nunca del cliente.
 */
async function errorLimiteEmpleados(tenantId: string, branchId: string): Promise<string | null> {
  const cap = await obtenerCapacidades(tenantId);
  const limite = cap.limite(LIMITE_EMPLEADOS_POR_SUCURSAL);
  if (limite.ilimitado) return null;
  const activos = await getTenantPrisma(tenantId).staff.count({ where: { branchId, isActive: true } });
  if (puedeAgregarUno(limite, activos)) return null;
  return `Tu plan (${cap.planNombre}) permite hasta ${limite.valor} empleado(s) activo(s) por sucursal. Para agregar más, cambia a un plan superior.`;
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

    // Límite del plan (ver errorLimiteEmpleados). Se revisa ANTES de crear la
    // cuenta de atribución oculta para no dejar un User huérfano si el límite
    // bloquea el alta.
    const errorLimite = await errorLimiteEmpleados(tenant.id, datos.branchId);
    if (errorLimite) return { ok: false, error: errorLimite };

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
          horaEntradaEsperada: datos.horaEntradaEsperada?.trim() || null,
          horaSalidaEsperada: datos.horaSalidaEsperada?.trim() || null,
          ...(datos.diasLaborales ? { diasLaborales: datos.diasLaborales } : {}),
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
    const existente = await db.staff.findUnique({ where: { id: staffId }, select: { id: true, userId: true, branchId: true, isActive: true } });
    if (!existente) return { ok: false, error: "Empleado no encontrado" };

    const branch = await db.branch.findUnique({ where: { id: datos.branchId }, select: { id: true } });
    if (!branch) return { ok: false, error: "Sucursal no encontrada" };

    // Mover a un empleado ACTIVO a otra sucursal lo suma a esa sucursal: sin
    // este chequeo se podía saltar el límite por sucursal cambiándolo de lugar.
    // Un empleado inactivo no cuenta, su límite se revisa al reactivarlo.
    if (existente.isActive && existente.branchId !== datos.branchId) {
      const errorLimite = await errorLimiteEmpleados(tenant.id, datos.branchId);
      if (errorLimite) return { ok: false, error: errorLimite };
    }

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
      horaEntradaEsperada: datos.horaEntradaEsperada?.trim() || null,
      horaSalidaEsperada: datos.horaSalidaEsperada?.trim() || null,
      ...(datos.diasLaborales ? { diasLaborales: datos.diasLaborales } : {}),
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
    const existente = await db.staff.findUnique({ where: { id: staffId }, select: { id: true, branchId: true, isActive: true } });
    if (!existente) return { ok: false, error: "Empleado no encontrado" };

    // Reactivar cuenta igual que dar de alta: sin este chequeo, desactivar y
    // reactivar era una forma de saltarse el límite del plan.
    if (activo && !existente.isActive) {
      const errorLimite = await errorLimiteEmpleados(tenant.id, existente.branchId);
      if (errorLimite) return { ok: false, error: errorLimite };
    }

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

/**
 * Corrige a mano el registro MANUAL de asistencia de HOY (modelo Attendance
 * — el que alimenta horasSemana/nómina, distinto de StaffLoginSession que
 * se corrige desde asistencia-actions.ts). 2026-10-05, a petición de Carlos
 * tras la auditoría: antes, una vez capturada la entrada/salida de hoy, no
 * había forma de corregir un error de captura (persona o botón equivocado)
 * — registrarAsistenciaAction rechaza un segundo check-in/check-out del
 * mismo día a propósito (ver su comentario), así que la única salida era
 * esta edición aparte. Solo opera sobre el registro de HOY (mismo criterio
 * de "un solo día a la vez" que ya regía en registrarAsistenciaAction) — no
 * existe un selector de fecha en el cliente para no abrir la puerta a
 * reescribir el historial de días pasados desde aquí.
 */
export async function editarAsistenciaManualAction(params: {
  tenantSlug: string;
  staffId: string;
  // "HH:MM" (24h) o null para dejar ese campo sin capturar.
  checkIn: string | null;
  checkOut: string | null;
}): Promise<AccionPersonalResult> {
  const { tenantSlug, staffId, checkIn, checkOut } = params;

  if (checkIn && !horaValida(checkIn)) return { ok: false, error: "La hora de entrada no es válida" };
  if (checkOut && !horaValida(checkOut)) return { ok: false, error: "La hora de salida no es válida" };
  if (checkOut && !checkIn) return { ok: false, error: "No puede haber una hora de salida sin una hora de entrada" };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const staff = await db.staff.findUnique({ where: { id: staffId }, select: { id: true } });
    if (!staff) return { ok: false, error: "Empleado no encontrado" };

    const hoy = new Date();
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

    // Attendance no tiene tenantId propio (ver el comentario en
    // registrarAsistenciaAction) — su pertenencia al tenant ya quedó
    // garantizada arriba, con staffId validado contra un Staff de este
    // tenant.
    const existente = await prisma.attendance.findUnique({ where: { staffId_date: { staffId, date: inicioHoy } } });
    if (!existente) return { ok: false, error: "No hay ningún registro de asistencia de hoy para corregir" };

    function horaDeHoyADate(hhmm: string): Date {
      const minutos = parseHoraAMinutos(hhmm)!;
      const d = new Date(inicioHoy);
      d.setHours(Math.floor(minutos / 60), minutos % 60, 0, 0);
      return d;
    }

    const nuevoCheckIn = checkIn ? horaDeHoyADate(checkIn) : null;
    const nuevoCheckOut = checkOut ? horaDeHoyADate(checkOut) : null;

    if (nuevoCheckIn && nuevoCheckOut && nuevoCheckOut < nuevoCheckIn) {
      return { ok: false, error: "La hora de salida no puede ser antes que la de entrada" };
    }

    await prisma.attendance.update({
      where: { staffId_date: { staffId, date: inicioHoy } },
      data: { checkIn: nuevoCheckIn, checkOut: nuevoCheckOut },
    });

    revalidatePath(`/${tenantSlug}/personal`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al corregir la asistencia manual:", err);
    return { ok: false, error: "No se pudo corregir el registro de asistencia" };
  }
}

/**
 * Borra por completo el registro MANUAL de asistencia de HOY (ver el
 * comentario largo en editarAsistenciaManualAction, arriba) — para cuando
 * el error de captura fue registrar a la persona equivocada y no basta con
 * corregir la hora. Mismo alcance de "solo hoy", mismo motivo.
 */
export async function borrarAsistenciaManualAction(params: {
  tenantSlug: string;
  staffId: string;
}): Promise<AccionPersonalResult> {
  const { tenantSlug, staffId } = params;

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const staff = await db.staff.findUnique({ where: { id: staffId }, select: { id: true } });
    if (!staff) return { ok: false, error: "Empleado no encontrado" };

    const hoy = new Date();
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

    const existente = await prisma.attendance.findUnique({ where: { staffId_date: { staffId, date: inicioHoy } } });
    if (!existente) return { ok: false, error: "No hay ningún registro de asistencia de hoy para borrar" };

    await prisma.attendance.delete({ where: { staffId_date: { staffId, date: inicioHoy } } });

    revalidatePath(`/${tenantSlug}/personal`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al borrar la asistencia manual:", err);
    return { ok: false, error: "No se pudo borrar el registro de asistencia" };
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

export type IncidenciasAsistenciaResult =
  | { ok: true; incidencias: IncidenciasAsistencia }
  | { ok: false; error: string };

/**
 * Envoltura de calcularIncidenciasAsistencia (lib/incidencias-asistencia.ts,
 * server-only) como Server Action — mismo criterio que
 * obtenerSugerenciaComisionAction (arriba): el modal de "Generar pago" en el
 * cliente la llama al abrir y al cambiar de período, y usa el resultado solo
 * para PRE-LLENAR el "Monto base" (nunca para forzarlo).
 */
export async function obtenerIncidenciasAsistenciaAction(params: {
  tenantSlug: string;
  staffId: string;
  periodoInicio: string;
  periodoFin: string;
}): Promise<IncidenciasAsistenciaResult> {
  const { tenantSlug, staffId, periodoInicio, periodoFin } = params;

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const staff = await db.staff.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        userId: true,
        horaEntradaEsperada: true,
        horaSalidaEsperada: true,
        diasLaborales: true,
        baseSalary: true,
      },
    });
    if (!staff) return { ok: false, error: "Empleado no encontrado" };

    const inicio = new Date(periodoInicio);
    const fin = new Date(periodoFin);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
      return { ok: false, error: "El período no es válido" };
    }

    const incidencias = await calcularIncidenciasAsistencia(
      tenant.id,
      {
        id: staff.id,
        userId: staff.userId,
        horaEntradaEsperada: staff.horaEntradaEsperada,
        horaSalidaEsperada: staff.horaSalidaEsperada,
        diasLaborales: staff.diasLaborales,
        baseSalary: Number(staff.baseSalary),
      },
      inicio,
      fin
    );

    return { ok: true, incidencias };
  } catch (err: any) {
    console.error("Error al calcular incidencias de asistencia:", err);
    return { ok: false, error: "No se pudieron calcular las incidencias de asistencia" };
  }
}
