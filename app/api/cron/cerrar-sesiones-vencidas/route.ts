import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { finDeDiaMX, inicioDeHoyMX } from "@/lib/asistencia";

/**
 * Cron diario (ver vercel.json) que cierra proactivamente cualquier
 * StaffLoginSession abierta cuyo día calendario (México) ya pasó —
 * 2026-10-03, a petición de Carlos, tras notar en el panel de Asistencia
 * filas marcadas "Sigue dentro" de días anteriores.
 *
 * Por qué hace falta esto además del cierre que ya existe en
 * verificarSesionPersonalVigente (lib/asistencia.ts): ese cierre es
 * PEREZOSO — solo corre cuando ESA MISMA sesión (ese dispositivo/cookie)
 * intenta usarse de nuevo. Si el empleado nunca vuelve a usar ese
 * dispositivo, la fila se queda abierta en la BD para siempre, aunque ya
 * haya pasado el día. Este cron recorre TODOS los negocios (igual que
 * revisar-suscripciones.ts, sin un tenantId único al que escopar la
 * consulta) y cierra cualquier sesión cuyo checkIn sea de antes de hoy,
 * con el mismo cálculo (finDeDiaMX sobre su checkIn original) que usa el
 * camino perezoso — el resultado es idéntico sin importar cuál de los dos
 * caminos la cierre primero.
 *
 * No toca nómina/horasSemana (modelo Attendance, aparte) — StaffLoginSession
 * es puramente informativo para el panel de Asistencia, ver el comentario
 * largo junto a ese modelo en schema.prisma.
 *
 * Mismo patrón de protección con CRON_SECRET que los demás crons de
 * app/api/cron/.
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

  // Cualquier sesión que siga abierta y haya empezado antes de la
  // medianoche de hoy (México) es, por definición, de un día calendario ya
  // pasado — no hace falta repetir aquí el cálculo diaMX() por fila.
  const candidatas = await prisma.staffLoginSession.findMany({
    where: { checkOut: null, checkIn: { lt: inicioDeHoyMX() } },
    select: { id: true, tenantId: true, checkIn: true },
  });

  let cerradas = 0;
  const omitidas: string[] = [];

  for (const sesion of candidatas) {
    try {
      // updateMany + checkOut:null (en vez de update a secas) para no pisar
      // un cierre que ya haya ocurrido por otro camino — ej. el camino
      // perezoso de verificarSesionPersonalVigente, o el administrador
      // cerrándola a mano ("Cerrar ahora") — entre la consulta de arriba y
      // este update.
      const res = await prisma.staffLoginSession.updateMany({
        where: { id: sesion.id, checkOut: null },
        data: { checkOut: finDeDiaMX(sesion.checkIn.getTime()), closedBy: "DATE_ROLLOVER" },
      });
      cerradas += res.count;
    } catch (err) {
      console.error(`❌ Error cerrando StaffLoginSession ${sesion.id} (tenant ${sesion.tenantId}):`, err);
      omitidas.push(sesion.id);
    }
  }

  return NextResponse.json({ ok: true, revisadas: candidatas.length, cerradas, omitidas });
}
