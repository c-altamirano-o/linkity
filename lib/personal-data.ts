import "server-only";

import { getTenantPrisma } from "@/lib/prisma";

/**
 * Capa de datos reales del módulo Personal (M11). A diferencia de los demás
 * módulos, Personal nunca tuvo una UI de mockup completa — solo quedó una
 * página de resumen con 4 tarjetas (ver personal/page.tsx antes de este
 * cambio) — así que esta capa y la UI que la consume se construyeron juntas,
 * no se "migró" un mockup existente.
 *
 * Nota de arquitectura importante: Staff (el registro de personal) siempre
 * tiene un Staff.userId que apunta a su cuenta de atribución (User) — desde
 * M11 (PIN de personal) esa cuenta se crea automáticamente al dar de alta
 * al empleado (ver personal-actions.ts), ya no es un vínculo opcional que
 * Carlos elige a mano. Sale.userId y Repair.userId apuntan a User, no a
 * Staff, así que la comisión individual (comisionBase VENTAS/REPARACIONES/
 * UTILIDAD) se calcula sobre las ventas/reparaciones atribuidas a esa
 * cuenta oculta. Esto requirió un cambio de schema (ver schema.prisma) que
 * Carlos todavía necesita aplicar con `npx prisma db push` + `npx prisma
 * generate` antes de que este módulo compile y funcione contra la BD real.
 *
 * Cambio M11: se quita usuariosDisponibles/UsuarioOption (el selector de
 * "vincular cuenta existente" ya no existe — ver personal-actions.ts) y
 * EmpleadoUI gana roleName/roleDescripcion/tienePin, para mostrar el rol
 * asignado y si el empleado ya tiene un PIN configurado.
 */

export type EsquemaPago = "FIJO" | "COMISION" | "MIXTO" | "DESTAJO";
export type BaseComision = "VENTAS" | "REPARACIONES" | "UTILIDAD";
export type Frecuencia = "SEMANAL" | "CATORCENAL" | "QUINCENAL" | "MENSUAL";
export type MetodoPago = "EFECTIVO" | "TRANSFERENCIA" | "CHEQUE" | "TARJETA_NOMINA" | "OTRO";
export type EstadoPago = "PENDING" | "PAID" | "CANCELLED";

export interface AsistenciaHoy {
  checkIn: string | null; // ISO
  checkOut: string | null; // ISO
}

export interface PagoUI {
  id: string;
  periodoInicio: string; // ISO (fecha)
  periodoFin: string; // ISO (fecha)
  montoBase: number;
  montoComision: number;
  total: number;
  estado: EstadoPago;
  pagadoEn: string | null; // ISO
  notas: string | null;
}

export interface EmpleadoUI {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  phone: string | null;
  phoneCountryCode: string;
  position: string | null;
  roleId: string | null;
  roleName: string | null;
  roleDescripcion: string | null;
  tienePin: boolean;
  esquemaPago: EsquemaPago;
  sueldoBase: number;
  comisionRate: number;
  comisionBase: BaseComision;
  frecuencia: Frecuencia;
  // Frecuencia propia de la comisión (separada del sueldo — ver el
  // comentario en Staff.commissionFrequency, schema.prisma).
  frecuenciaComision: Frecuencia;
  montoDestajo: number;
  comisionEquipoRate: number;
  comisionEquipoBase: BaseComision | null;
  metodoPago: MetodoPago;
  clabe: string | null;
  hiredAt: string; // ISO
  isActive: boolean;
  asistenciaHoy: AsistenciaHoy | null;
  horasSemana: number;
  pagos: PagoUI[];
}

export interface PersonalData {
  empleados: EmpleadoUI[];
}

function hoyString(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getPersonalData(tenantId: string): Promise<PersonalData> {
  // Staff y User tienen tenantId propio → getTenantPrisma lo inyecta solo.
  const db = getTenantPrisma(tenantId);

  const hace8Dias = new Date();
  hace8Dias.setDate(hace8Dias.getDate() - 8);

  const staffRaw = await db.staff.findMany({
    orderBy: { name: "asc" },
    include: {
      branch: { select: { name: true } },
      role: { select: { id: true, name: true, description: true } },
      attendances: { where: { date: { gte: hace8Dias } }, orderBy: { date: "desc" } },
      payments: { orderBy: { periodStart: "desc" }, take: 6 },
    },
  });

  const hoy = hoyString();

  const empleados: EmpleadoUI[] = staffRaw.map((s) => {
    const asistHoy = s.attendances.find((a) => a.date.toISOString().slice(0, 10) === hoy) ?? null;
    const horasSemana = s.attendances.reduce((sum, a) => {
      if (a.checkIn && a.checkOut) {
        return sum + (a.checkOut.getTime() - a.checkIn.getTime()) / 3_600_000;
      }
      return sum;
    }, 0);

    return {
      id: s.id,
      branchId: s.branchId,
      branchName: s.branch.name,
      name: s.name,
      phone: s.phone,
      phoneCountryCode: s.phoneCountryCode,
      position: s.position,
      roleId: s.role?.id ?? null,
      roleName: s.role?.name ?? null,
      roleDescripcion: s.role?.description ?? null,
      tienePin: Boolean(s.pinHash),
      esquemaPago: s.paymentScheme as EsquemaPago,
      sueldoBase: Number(s.baseSalary),
      comisionRate: Number(s.commissionRate),
      comisionBase: s.commissionBase as BaseComision,
      frecuencia: s.paymentFrequency as Frecuencia,
      frecuenciaComision: s.commissionFrequency as Frecuencia,
      montoDestajo: Number(s.pieceRate),
      comisionEquipoRate: Number(s.teamCommissionRate),
      comisionEquipoBase: (s.teamCommissionBase as BaseComision | null) ?? null,
      metodoPago: s.staffPaymentMethod as MetodoPago,
      clabe: s.clabe,
      hiredAt: s.hiredAt.toISOString(),
      isActive: s.isActive,
      asistenciaHoy: asistHoy
        ? { checkIn: asistHoy.checkIn ? asistHoy.checkIn.toISOString() : null, checkOut: asistHoy.checkOut ? asistHoy.checkOut.toISOString() : null }
        : null,
      horasSemana: Math.round(horasSemana * 10) / 10,
      pagos: s.payments.map((p) => ({
        id: p.id,
        periodoInicio: p.periodStart.toISOString(),
        periodoFin: p.periodEnd.toISOString(),
        montoBase: Number(p.baseAmount),
        montoComision: Number(p.commissionAmount),
        total: Number(p.total),
        estado: p.status as EstadoPago,
        pagadoEn: p.paidAt ? p.paidAt.toISOString() : null,
        notas: p.notes,
      })),
    };
  });

  return { empleados };
}

export interface SugerenciaComision {
  monto: number;
  advertencia: string | null;
}

interface StaffParaComision {
  userId: string | null;
  commissionBase: BaseComision;
  commissionRate: number;
}

/**
 * Sugerencia de comisión para el período dado — se ofrece como valor inicial
 * editable en el modal de "Generar pago", nunca se fuerza: quien genera la
 * nómina es un administrador, no un cliente en una transacción, así que aquí
 * SÍ tiene sentido que pueda ajustar el monto final a mano (ver
 * generarPagoAction en personal-actions.ts).
 */
export async function calcularComisionSugerida(
  tenantId: string,
  staff: StaffParaComision,
  periodoInicio: Date,
  periodoFin: Date
): Promise<SugerenciaComision> {
  if (!staff.userId) {
    return {
      monto: 0,
      advertencia: "Este empleado no tiene una cuenta de usuario vinculada, así que no se puede calcular su comisión automáticamente — vincúlalo desde el directorio o captura el monto a mano.",
    };
  }

  const db = getTenantPrisma(tenantId);
  const rate = staff.commissionRate / 100;
  const rango = { gte: periodoInicio, lte: periodoFin };

  if (staff.commissionBase === "VENTAS") {
    const ventas = await db.sale.findMany({
      where: { userId: staff.userId, createdAt: rango },
      select: { total: true },
    });
    const base = ventas.reduce((s, v) => s + Number(v.total), 0);
    return { monto: Math.round(base * rate * 100) / 100, advertencia: null };
  }

  if (staff.commissionBase === "REPARACIONES") {
    const reparaciones = await db.repair.findMany({
      where: { userId: staff.userId, deliveredAt: rango, finalCost: { not: null } },
      select: { finalCost: true },
    });
    const base = reparaciones.reduce((s, r) => s + Number(r.finalCost ?? 0), 0);
    return { monto: Math.round(base * rate * 100) / 100, advertencia: null };
  }

  // UTILIDAD: subtotal de cada renglón vendido menos el costo del producto.
  // SaleItem no tiene tenantId propio, así que el filtro por tenant se hace
  // a mano vía la relación con Sale (mismo criterio documentado en
  // lib/prisma.ts para modelos sin tenantId directo).
  const items = await db.sale
    .findMany({
      where: { userId: staff.userId, createdAt: rango },
      select: { items: { select: { subtotal: true, quantity: true, product: { select: { cost: true } } } } },
    })
    .then((sales) => sales.flatMap((s) => s.items));

  const base = items.reduce((s, it) => {
    const costoUnitario = it.product.cost != null ? Number(it.product.cost) : 0;
    return s + (Number(it.subtotal) - costoUnitario * it.quantity);
  }, 0);
  const advertencia = items.some((it) => it.product.cost == null)
    ? "Algunos productos vendidos en este período no tienen costo capturado en el catálogo — se contaron como utilidad completa, lo que puede sobreestimar la comisión."
    : null;

  return { monto: Math.max(0, Math.round(base * rate * 100) / 100), advertencia };
}

/**
 * Sugerencia de la comisión de EQUIPO (2026-09-17) — la segunda comisión que
 * puede tener un empleado por liderar a los demás (ej. Jefe de Barberos,
 * Staff.teamCommissionRate/teamCommissionBase). A diferencia de
 * calcularComisionSugerida (que filtra por la cuenta oculta de UN
 * empleado), esta se calcula sobre TODA la producción de la sucursal en el
 * período — simplificación deliberada documentada en el schema: el sistema
 * no modela un organigrama de "quién le reporta a quién", así que la
 * comisión de equipo es, hoy, una comisión de sucursal.
 */
export async function calcularComisionEquipoSugerida(
  tenantId: string,
  branchId: string,
  teamCommissionBase: BaseComision,
  teamCommissionRate: number,
  periodoInicio: Date,
  periodoFin: Date
): Promise<SugerenciaComision> {
  const db = getTenantPrisma(tenantId);
  const rate = teamCommissionRate / 100;
  const rango = { gte: periodoInicio, lte: periodoFin };

  if (teamCommissionBase === "VENTAS") {
    const ventas = await db.sale.findMany({ where: { branchId, createdAt: rango }, select: { total: true } });
    const base = ventas.reduce((s, v) => s + Number(v.total), 0);
    return { monto: Math.round(base * rate * 100) / 100, advertencia: null };
  }

  if (teamCommissionBase === "REPARACIONES") {
    const reparaciones = await db.repair.findMany({
      where: { branchId, deliveredAt: rango, finalCost: { not: null } },
      select: { finalCost: true },
    });
    const base = reparaciones.reduce((s, r) => s + Number(r.finalCost ?? 0), 0);
    return { monto: Math.round(base * rate * 100) / 100, advertencia: null };
  }

  const items = await db.sale
    .findMany({
      where: { branchId, createdAt: rango },
      select: { items: { select: { subtotal: true, quantity: true, product: { select: { cost: true } } } } },
    })
    .then((sales) => sales.flatMap((s) => s.items));

  const base = items.reduce((s, it) => {
    const costoUnitario = it.product.cost != null ? Number(it.product.cost) : 0;
    return s + (Number(it.subtotal) - costoUnitario * it.quantity);
  }, 0);
  const advertencia = items.some((it) => it.product.cost == null)
    ? "Algunos productos vendidos en este período no tienen costo capturado en el catálogo — se contaron como utilidad completa, lo que puede sobreestimar la comisión."
    : null;

  return { monto: Math.max(0, Math.round(base * rate * 100) / 100), advertencia };
}
