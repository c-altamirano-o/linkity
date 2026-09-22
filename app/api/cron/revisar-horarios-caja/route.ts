import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CashSessionStatus, NotificacionTipo } from "@prisma/client";
import {
  ahoraEnZonaNegocio,
  debeRevisarAperturaTardia,
  debeRevisarCierreTardio,
  inicioDeHoyEnZonaNegocio,
} from "@/lib/horarios-sucursal";
import { crearNotificacionCaja } from "@/lib/notificaciones";

/**
 * Cron cada 15 minutos (ver .github/workflows/revisar-horarios-caja.yml —
 * NO vercel.json: el cron de Vercel en el plan gratuito solo permite
 * correr 1 vez al día, sin granularidad suficiente para esto) que revisa
 * TODAS las sucursales con horario configurado y avisa si, con el margen
 * de gracia de MARGEN_GRACIA_MINUTOS, no se ha reportado apertura o cierre
 * de caja a la hora que su dueño configuró.
 *
 * Fase 2 de notificaciones en tiempo real, 2026-09-22, a petición de
 * Carlos ("cuando se llegue determinada hora y una sucursal no haya
 * reportado apertura de caja o que a la hora del cierre no hayan cerrado
 * caja"). Fase 1 (aviso instantáneo AL abrir/cerrar caja) vive en
 * abrirCajaAction/cerrarCajaAction — ver lib/notificaciones.ts. Mismo
 * patrón de protección con CRON_SECRET que /api/cron/revisar-suscripciones.
 *
 * Por qué corre sobre TODAS las sucursales configuradas en cada corrida
 * (en vez de intentar calcular "a cuáles les toca revisar en este momento
 * exacto"): más simple y más tolerante a que el cron se salte una corrida
 * — la siguiente corrida vuelve a revisar todo de cero. Lo que evita el
 * spam de un aviso cada 15 minutos es el chequeo de "¿ya existe un aviso
 * de este tipo para esta sucursal desde la medianoche de HOY?" antes de
 * crear uno nuevo, no el cron en sí.
 *
 * Por qué usa `prisma` directo y no getTenantPrisma: este cron recorre
 * sucursales de TODOS los tenants a la vez (igual que
 * revisar-suscripciones.ts con Subscription) — no hay un tenantId único al
 * que escopar la consulta inicial. crearNotificacionCaja sí usa
 * getTenantPrisma internamente, con el tenantId de cada sucursal ya
 * resuelto individualmente.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secreto) {
    return NextResponse.json({ error: "CRON_SECRET no está configurado en las variables de entorno." }, { status: 500 });
  }
  if (auth !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const ahora = ahoraEnZonaNegocio();
  const inicioHoy = inicioDeHoyEnZonaNegocio(ahora.fechaStr);

  const sucursales = await prisma.branch.findMany({
    where: {
      isActive: true,
      OR: [{ horaAperturaEsperada: { not: null } }, { horaCierreEsperada: { not: null } }],
    },
    select: {
      id: true, tenantId: true, name: true,
      horaAperturaEsperada: true, horaCierreEsperada: true, diasOperacion: true,
    },
  });

  const avisadas: { sucursal: string; tipo: string }[] = [];
  const omitidas: string[] = [];

  for (const branch of sucursales) {
    try {
      const revisarApertura = debeRevisarAperturaTardia(branch, ahora);
      const revisarCierre = debeRevisarCierreTardio(branch, ahora);
      if (!revisarApertura && !revisarCierre) continue;

      // Cuenta como "sí abrió hoy" con que haya existido AL MENOS una
      // apertura desde la medianoche de hoy — aunque ya se haya vuelto a
      // cerrar (cambio de turno, ver caja-actions.ts), eso no es "no
      // reportó apertura".
      const huboAperturaHoy = revisarApertura
        ? (await prisma.cashSession.count({ where: { branchId: branch.id, openedAt: { gte: inicioHoy } } })) > 0
        : true;

      // Para el cierre lo que importa es si a ESTA hora sigue habiendo una
      // sesión abierta ahora mismo — si nunca abrió hoy, no hay nada que
      // cerrar (ese caso ya lo cubre, por separado, el aviso de apertura).
      const sigueAbiertaAhora = revisarCierre
        ? (await prisma.cashSession.count({ where: { branchId: branch.id, status: CashSessionStatus.OPEN } })) > 0
        : false;

      if (revisarApertura && !huboAperturaHoy) {
        const yaAvisadoHoy = await prisma.notificacion.count({
          where: { branchId: branch.id, tipo: NotificacionTipo.CAJA_NO_ABIERTA, createdAt: { gte: inicioHoy } },
        });
        if (yaAvisadoHoy === 0) {
          await crearNotificacionCaja({
            tenantId: branch.tenantId,
            branchId: branch.id,
            branchName: branch.name,
            tipo: NotificacionTipo.CAJA_NO_ABIERTA,
            mensaje: `${branch.name} no ha reportado apertura de caja (hora esperada: ${branch.horaAperturaEsperada}).`,
          });
          avisadas.push({ sucursal: branch.name, tipo: "CAJA_NO_ABIERTA" });
        }
      }

      if (revisarCierre && sigueAbiertaAhora) {
        const yaAvisadoHoy = await prisma.notificacion.count({
          where: { branchId: branch.id, tipo: NotificacionTipo.CAJA_NO_CERRADA, createdAt: { gte: inicioHoy } },
        });
        if (yaAvisadoHoy === 0) {
          await crearNotificacionCaja({
            tenantId: branch.tenantId,
            branchId: branch.id,
            branchName: branch.name,
            tipo: NotificacionTipo.CAJA_NO_CERRADA,
            mensaje: `${branch.name} no ha cerrado caja (hora esperada: ${branch.horaCierreEsperada}).`,
          });
          avisadas.push({ sucursal: branch.name, tipo: "CAJA_NO_CERRADA" });
        }
      }
    } catch (err) {
      console.error(`❌ Error revisando el horario de la sucursal ${branch.name}:`, err);
      omitidas.push(branch.name);
    }
  }

  return NextResponse.json({ ok: true, revisadas: sucursales.length, avisadas, omitidas });
}
