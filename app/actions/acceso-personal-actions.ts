"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { CashSessionStatus } from "@prisma/client";
import { verificarPin, crearSesionPersonal, cerrarSesionPersonal, leerSesionPersonal } from "@/lib/staff-auth";
import { tieneConfianzaDispositivo } from "@/lib/dispositivos-confianza";
import { crearSolicitudDispositivo } from "@/lib/solicitudes-dispositivo";

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

export type AccionAccesoPersonalResult =
  | { ok: true }
  // 2026-09-23, a petición de Carlos ("que ningún empleado pueda entrar
  // desde otro lugar y fingir que está en la tienda"): el PIN era
  // correcto, pero este navegador nunca se ha autorizado para esta
  // sucursal — ver el comentario largo en lib/dispositivos-confianza.ts.
  // El cliente (AccesoNegocioClient.tsx) muestra "esperando autorización" y
  // hace polling de consultarSolicitudDispositivoAction(token); en cuanto
  // ese poll reporta "aprobado", reintenta este MISMO action con el PIN que
  // ya tenía en memoria — para entonces la cookie de confianza ya está
  // puesta, así que esta vez sí entra directo.
  | { ok: false; error: string; necesitaAutorizacion?: false }
  | { ok: false; necesitaAutorizacion: true; token: string };

export async function iniciarSesionPersonalAction(params: {
  tenantSlug: string;
  staffId: string;
  pin: string;
  branchId: string;
}): Promise<AccionAccesoPersonalResult> {
  const { tenantSlug, staffId, pin, branchId } = params;

  // 2026-09-23, a petición de Carlos: "subir la dificultad de un pin de 4
  // dígitos a 6, para evitar que alguien ingrese por suerte a un usuario" —
  // ver el comentario largo en lib/staff-auth.ts, pinValido.
  if (!/^\d{6}$/.test(pin)) return { ok: false, error: "El PIN debe ser de 6 dígitos" };

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  if (!tenant) return { ok: false, error: "Negocio no encontrado" };

  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: {
      id: true, tenantId: true, branchId: true, name: true, isActive: true,
      pinHash: true, userId: true,
      role: { select: { name: true } },
      branch: { select: { name: true } },
    },
  });

  // 2026-09-21, a petición de Carlos: /entrada/[tenant]/[branch] ya filtra
  // la lista que se muestra a la sucursal correcta, pero esta validación es
  // la que de verdad importa — sin ella, alguien que arme la petición a
  // mano (o un link de entrada viejo, cacheado) podría iniciar sesión como
  // un empleado de OTRA sucursal. Mismo mensaje genérico que el resto de
  // los checks de este bloque, para no revelar en cuál sucursal sí está.
  if (!staff || staff.tenantId !== tenant.id || !staff.isActive || staff.branchId !== branchId) {
    return { ok: false, error: "Empleado no encontrado" };
  }
  if (!staff.pinHash || !staff.userId || !staff.role) {
    return { ok: false, error: "Este empleado todavía no tiene acceso configurado — pídele al administrador que le asigne un rol y un PIN desde Personal." };
  }
  if (!verificarPin(pin, staff.pinHash)) {
    return { ok: false, error: "PIN incorrecto" };
  }

  // 2026-09-23, a petición de Carlos: PIN correcto, pero si este NAVEGADOR
  // nunca se autorizó para esta sucursal, no se deja entrar todavía — se
  // crea (o reutiliza vía token) una solicitud que el administrador debe
  // aprobar (notificación en el panel + push a su celular, o desde
  // "Dispositivos pendientes" en Configuración). Ver
  // lib/dispositivos-confianza.ts para el porqué de que sea por SUCURSAL y
  // no por tenant completo.
  const confiable = await tieneConfianzaDispositivo(tenant.id, branchId);
  if (!confiable) {
    const headerList = await headers();
    const token = await crearSolicitudDispositivo({
      tenantId: tenant.id,
      tenantSlug,
      branchId,
      branchName: staff.branch.name,
      userAgent: headerList.get("user-agent"),
    });
    return { ok: false, necesitaAutorizacion: true, token };
  }

  // 2026-09-29, a petición de Carlos (hueco de seguridad detectado): "un
  // mismo usuario, inclusive un administrador o dueño, solo puede tener un
  // login a la vez" — antes, nada impedía que el mismo PIN abriera sesión
  // en dos dispositivos distintos al mismo tiempo sin que ninguno se
  // enterara del otro. Se cierra aquí cualquier StaffLoginSession que ESTE
  // empleado (mismo staffId) todavía tuviera abierta en otro
  // dispositivo/navegador — updateMany + checkOut:null por si ya se había
  // cerrado sola por otro camino (cambio de día, "Cambiar de usuario",
  // desactivación). El dispositivo viejo no se entera al instante, pero
  // queda invalidado en su SIGUIENTE acción: verificarSesionPersonalVigente()
  // (lib/asistencia.ts) revisa que la fila de su propia sesión siga
  // abierta, y aquí acabamos de cerrarla. Nótese que esto NO afecta a otros
  // empleados de la misma sucursal — varios cajeros distintos siguen
  // pudiendo tener sesión abierta al mismo tiempo, sin problema; el límite
  // es por empleado, no por sucursal.
  await prisma.staffLoginSession.updateMany({
    where: { staffId: staff.id, checkOut: null },
    data: { checkOut: new Date(), closedBy: "NUEVO_LOGIN" },
  });

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

// Tipo aparte de AccionAccesoPersonalResult (2026-09-23): cerrar sesión
// nunca puede toparse con "dispositivo sin autorizar" — esa validación es
// solo al ENTRAR (iniciarSesionPersonalAction). Reusar el tipo de arriba
// obligaba a TenantShell.tsx a manejar una rama de autorización que aquí
// nunca ocurre; con esto, `res.error` narrowa directo sin el `in` extra.
//
// cajaAbiertaEnSucursal (2026-09-29, ver el comentario largo en la función
// de abajo): ya NO bloquea el cierre de sesión, solo lo informa para que
// TenantShell muestre un aviso no bloqueante.
export type AccionCerrarSesionResult = { ok: true; cajaAbiertaEnSucursal?: boolean } | { ok: false; error: string };

export async function cerrarSesionPersonalAction(): Promise<AccionCerrarSesionResult> {
  // Se lee la sesión ANTES de borrar la cookie para poder cerrar su fila de
  // asistencia (checkOut = ahora, closedBy MANUAL) — updateMany + checkOut:
  // null por si ya se había cerrado sola por cambio de día (poco probable
  // en el mismo request, pero evita pisar ese motivo con uno distinto).
  const sesion = await leerSesionPersonal();

  // 2026-09-23, a petición de Carlos: "al cerrar una sesión que tenga
  // punto de venta, no debe permitir cerrarla hasta hacer corte de caja" —
  // se bloqueaba el cierre de sesión/cambio de usuario si la sucursal tenía
  // una caja ABIERTA (TenantShell mandaba al empleado a /caja en vez de
  // dejarlo salir).
  //
  // 2026-09-29, corregido a petición de Carlos, tras un caso real: un
  // empleado con el puesto "Asesor de Ventas" (sin permiso sobre el módulo
  // Caja) se quedaba SIN NINGUNA SALIDA — no podía hacer el corte él mismo
  // (no tiene acceso a Caja) y tampoco podía cambiar de usuario para que
  // alguien más lo hiciera (este mismo bloqueo se lo impedía). Su petición
  // textual: "que no se cierre caja, pero que puedan cambiar de usuario
  // para hacerlo".
  //
  // Ya NO se bloquea — la caja es por SUCURSAL, no por quién la abrió (ver
  // el comentario de "cambio de turno" en CashSession, schema.prisma), así
  // que sigue abierta y disponible para que CUALQUIER empleado con permiso
  // sobre Caja la cierre en cuanto entre con su PIN; solo se informa
  // (cajaAbiertaEnSucursal) para que TenantShell muestre un recordatorio no
  // bloqueante en vez de trabar la salida. La red de seguridad real para
  // que nadie la olvide sigue siendo el aviso periódico de
  // /api/cron/revisar-horarios-caja (notifica a quien sí puede cerrarla si
  // se pasa de la hora configurada), no este check al momento de salir.
  let cajaAbiertaEnSucursal = false;
  if (sesion) {
    const cajaAbierta = await prisma.cashSession.findFirst({
      where: { tenantId: sesion.tenantId, branchId: sesion.branchId, status: CashSessionStatus.OPEN },
      select: { id: true },
    });
    cajaAbiertaEnSucursal = cajaAbierta != null;
  }

  if (sesion?.loginSessionId) {
    await prisma.staffLoginSession.updateMany({
      where: { id: sesion.loginSessionId, checkOut: null },
      data: { checkOut: new Date(), closedBy: "MANUAL" },
    });
  }
  await cerrarSesionPersonal();
  return { ok: true, cajaAbiertaEnSucursal };
}
