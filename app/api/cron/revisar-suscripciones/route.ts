import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcularEstadoCiclo, DIAS_GRACIA, DIAS_RECORDATORIO, DIAS_AVISO_ELIMINACION } from "@/lib/ciclo-suscripcion";
import { enviarAvisoSuscripcion } from "@/lib/notificaciones-suscripcion";

/**
 * Cron diario (ver vercel.json) que revisa TODAS las suscripciones
 * vencidas y dispara el aviso que le toque a cada una — 2026-09-22, a
 * petición de Carlos (ver el comentario largo en Subscription,
 * schema.prisma, y lib/ciclo-suscripcion.ts). Mismo patrón de protección
 * con CRON_SECRET que /api/cron/reseed-demo.
 *
 * Por qué revisa TODAS cada día en vez de calcular "a quién le toca hoy":
 * usa umbrales absolutos (diasVencida >= 7/30/90) en vez de "es exactamente
 * el día 7", así que si el cron se cae un día o el negocio ya llevaba
 * vencido desde antes de que existiera esta función, en la SIGUIENTE
 * corrida se pone al día solo (manda de un jalón los avisos que le falten,
 * nunca se salta ninguno ni lo repite — cada aviso se guarda con su propio
 * `...SentAt`, ver el schema).
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

  const candidatos = await prisma.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "TRIAL"] },
      endDate: { not: null, lt: new Date() },
    },
    include: { tenant: { select: { id: true, slug: true, name: true, email: true, phone: true } } },
  });

  const avisados: { slug: string; tipo: string }[] = [];
  const omitidos: string[] = [];

  for (const sub of candidatos) {
    try {
      const estado = calcularEstadoCiclo({ status: sub.status, endDate: sub.endDate });
      if (estado.diasVencida === null) continue;

      const datosTenant = { name: sub.tenant.name, slug: sub.tenant.slug, email: sub.tenant.email, phone: sub.tenant.phone };
      const data: Record<string, Date> = {};

      if (estado.diasVencida >= 0 && !sub.expiredNoticeSentAt) {
        await enviarAvisoSuscripcion(datosTenant, "expirada");
        data.expiredNoticeSentAt = new Date();
        avisados.push({ slug: sub.tenant.slug, tipo: "expirada" });
      }
      if (estado.diasVencida >= DIAS_GRACIA && !sub.blockNoticeSentAt) {
        await enviarAvisoSuscripcion(datosTenant, "bloqueada");
        data.blockNoticeSentAt = new Date();
        avisados.push({ slug: sub.tenant.slug, tipo: "bloqueada" });
      }
      if (estado.diasVencida >= DIAS_RECORDATORIO && !sub.renewalReminderSentAt) {
        await enviarAvisoSuscripcion(datosTenant, "recordatorio");
        data.renewalReminderSentAt = new Date();
        avisados.push({ slug: sub.tenant.slug, tipo: "recordatorio" });
      }
      if (estado.diasVencida >= DIAS_AVISO_ELIMINACION && !sub.deletionNoticeSentAt) {
        await enviarAvisoSuscripcion(datosTenant, "eliminacion");
        data.deletionNoticeSentAt = new Date();
        avisados.push({ slug: sub.tenant.slug, tipo: "eliminacion" });
      }

      if (Object.keys(data).length > 0) {
        await prisma.subscription.update({ where: { id: sub.id }, data });
      }
    } catch (err) {
      console.error(`❌ Error revisando la suscripción de ${sub.tenant.slug}:`, err);
      omitidos.push(sub.tenant.slug);
    }
  }

  return NextResponse.json({ ok: true, revisadas: candidatos.length, avisados, omitidos });
}
