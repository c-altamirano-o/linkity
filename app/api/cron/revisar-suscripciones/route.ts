import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcularEstadoCiclo, DIAS_GRACIA, DIAS_RECORDATORIO, DIAS_AVISO_ELIMINACION, DIAS_AVISOS_PRUEBA } from "@/lib/ciclo-suscripcion";
import { enviarAvisoSuscripcion } from "@/lib/notificaciones-suscripcion";
import { sincronizarExceso } from "@/lib/exceso-plan";
import { calcularEstadoExceso } from "@/lib/exceso-plan-estado";

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
 *
 * Prueba gratis (2026-10-06): además de las suscripciones ya vencidas, el
 * cron mira las pruebas (status TRIAL) que vencen en los próximos 7 días
 * para mandar los avisos de 7/3/1 días antes (solo correo — ver
 * lib/notificaciones-suscripcion.ts). Si el cron falló varios días y una
 * prueba ya está a 2 días de terminar sin haber recibido el aviso de 7 ni el
 * de 3, solo se manda el más urgente que corresponda (el de 3) y los
 * anteriores se marcan como enviados — nunca llegan 3 correos de golpe. Las
 * pruebas que ya terminaron reciben "prueba_terminada" (en vez de
 * "expirada"/"bloqueada", que hablan de 7 días de gracia que la prueba no
 * tiene).
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

  const ahora = new Date();
  const limiteAvisoPrueba = new Date(ahora.getTime() + Math.max(...DIAS_AVISOS_PRUEBA) * 24 * 60 * 60 * 1000);

  const candidatos = await prisma.subscription.findMany({
    where: {
      OR: [
        // Ya vencidas (de paga o prueba) — flujo de siempre.
        { status: { in: ["ACTIVE", "TRIAL"] }, endDate: { not: null, lt: ahora } },
        // Pruebas que vencen en los próximos 7 días — avisos previos.
        { status: "TRIAL", endDate: { gte: ahora, lte: limiteAvisoPrueba } },
      ],
    },
    include: { tenant: { select: { id: true, slug: true, name: true, email: true, phone: true } } },
  });

  const avisados: { slug: string; tipo: string }[] = [];
  const omitidos: string[] = [];

  for (const sub of candidatos) {
    try {
      const estado = calcularEstadoCiclo({ status: sub.status, endDate: sub.endDate });
      const datosTenant = { name: sub.tenant.name, slug: sub.tenant.slug, email: sub.tenant.email, phone: sub.tenant.phone };
      const data: Record<string, Date> = {};

      // --- Prueba gratis, todavía vigente: avisos de 7 / 3 / 1 día(s) antes ---
      if (estado.etapa === "en_prueba" && estado.diasRestantes !== null) {
        const dr = estado.diasRestantes;
        const yaEnviado: Record<number, Date | null> = {
          7: sub.trialNotice7SentAt,
          3: sub.trialNotice3SentAt,
          1: sub.trialNotice1SentAt,
        };
        // El umbral más urgente que ya se cruzó (1 < 3 < 7).
        const umbral = [...DIAS_AVISOS_PRUEBA].sort((a, b) => a - b).find((u) => dr <= u);
        if (umbral !== undefined && !yaEnviado[umbral]) {
          const tipo = (`prueba_${umbral}` as "prueba_7" | "prueba_3" | "prueba_1");
          await enviarAvisoSuscripcion(datosTenant, tipo);
          const ahoraEnvio = new Date();
          // Marca este umbral y los menos urgentes (7 y 3 si estamos en 1,
          // etc.) para no mandarlos después de golpe.
          if (umbral <= 7 && !sub.trialNotice7SentAt) data.trialNotice7SentAt = ahoraEnvio;
          if (umbral <= 3 && !sub.trialNotice3SentAt) data.trialNotice3SentAt = ahoraEnvio;
          if (umbral <= 1 && !sub.trialNotice1SentAt) data.trialNotice1SentAt = ahoraEnvio;
          avisados.push({ slug: sub.tenant.slug, tipo });
        }
        if (Object.keys(data).length > 0) {
          await prisma.subscription.update({ where: { id: sub.id }, data });
        }
        continue;
      }

      if (estado.diasVencida === null) continue;

      // --- Prueba gratis terminada (sin gracia) ---
      if (sub.status === "TRIAL") {
        if (estado.diasVencida >= 0 && !sub.trialEndedNoticeSentAt) {
          await enviarAvisoSuscripcion(datosTenant, "prueba_terminada");
          data.trialEndedNoticeSentAt = new Date();
          avisados.push({ slug: sub.tenant.slug, tipo: "prueba_terminada" });
        }
      } else {
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

  // --- Exceso de plan (Paso 5, 2026-10-08) ---------------------------------
  // Revisa las cuentas de paga vigentes: detecta excesos nuevos (por ejemplo
  // porque Carlos redujo un límite del catálogo) aunque nadie abra el sistema,
  // y manda el correo de aviso al detectarlo y el de último día. Cada aviso se
  // marca para no repetirse; si el correo no se pudo mandar (Resend sin
  // configurar, sin correo del negocio) se marca igual: el banner dentro del
  // sistema es el aviso principal y no se reintenta cada día.
  const conExceso: { slug: string; tipo: string }[] = [];
  const vigentes = await prisma.subscription.findMany({
    where: { status: "ACTIVE", OR: [{ endDate: null }, { endDate: { gte: ahora } }] },
    include: { tenant: { select: { id: true, slug: true, name: true, email: true, phone: true } } },
  });
  for (const sub of vigentes) {
    try {
      const estado = await sincronizarExceso(sub.tenantId, { status: sub.status, excesoDetectadoAt: sub.excesoDetectadoAt });
      if (!estado.activo) continue;
      const datosTenant = { name: sub.tenant.name, slug: sub.tenant.slug, email: sub.tenant.email, phone: sub.tenant.phone };
      // Si la marca se acaba de crear, el aviso inicial todavía no se ha enviado.
      const actual = await prisma.subscription.findUnique({
        where: { tenantId: sub.tenantId },
        select: { excesoDetectadoAt: true, excesoNoticeSentAt: true, excesoFinalNoticeSentAt: true },
      });
      if (!actual?.excesoDetectadoAt) continue;
      const estadoActual = calcularEstadoExceso(actual.excesoDetectadoAt, ahora);
      const data: Record<string, Date> = {};
      if (!actual.excesoNoticeSentAt) {
        await enviarAvisoSuscripcion(datosTenant, "exceso_plan");
        data.excesoNoticeSentAt = new Date();
        conExceso.push({ slug: sub.tenant.slug, tipo: "exceso_plan" });
      }
      if (!estadoActual.vencido && estadoActual.diasRestantes !== null && estadoActual.diasRestantes <= 1 && !actual.excesoFinalNoticeSentAt) {
        await enviarAvisoSuscripcion(datosTenant, "exceso_final");
        data.excesoFinalNoticeSentAt = new Date();
        conExceso.push({ slug: sub.tenant.slug, tipo: "exceso_final" });
      }
      if (Object.keys(data).length > 0) {
        await prisma.subscription.update({ where: { tenantId: sub.tenantId }, data });
      }
    } catch (err) {
      console.error(`❌ Error revisando el exceso de plan de ${sub.tenant.slug}:`, err);
      omitidos.push(sub.tenant.slug);
    }
  }

  return NextResponse.json({ ok: true, revisadas: candidatos.length, avisados, omitidos, conExceso });
}
