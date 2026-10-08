import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const maxDuration = 30;

/**
 * Webhook de Hotmart (2026-10-06, a petición de Carlos: "se puedan
 * suscribir y usar su mes gratis… al terminar el periodo de prueba, se les
 * bloquee el acceso"). El cobro vive en Hotmart; este endpoint es lo único
 * que activa una cuenta de forma automática cuando el cliente paga.
 *
 * CONFIGURACIÓN (la hace Carlos, ver instrucciones al final del archivo):
 *   - Variable de entorno HOTMART_HOTTOK en Vercel = el "hottok" que Hotmart
 *     muestra al crear el webhook (Herramientas → Webhook).
 *   - URL a registrar en Hotmart: https://linkitysoluciones.mx/api/webhooks/hotmart
 *   - Eventos a marcar: Compra aprobada, Compra completa, Compra reembolsada,
 *     Chargeback, Cancelación de suscripción.
 *
 * AUTENTICACIÓN: Hotmart manda el hottok en el header `X-HOTMART-HOTTOK`
 * (versión 2.0.0 del webhook) — por si alguna versión lo manda en el cuerpo
 * (`hottok`, como la 1.0), también se acepta de ahí. Se compara en tiempo
 * constante. Sin HOTMART_HOTTOK configurado el endpoint RECHAZA todo (500)
 * en vez de dejarse abierto: nunca "falla abierto".
 *
 * CÓMO SE LIGA UNA COMPRA CON UN NEGOCIO: por el CORREO del comprador
 * (`data.buyer.email`) — se busca primero como correo del negocio
 * (Tenant.email, que el auto-registro llena con el del dueño) y, si no,
 * como correo de algún usuario. Por eso el cliente debe pagar en Hotmart con
 * el MISMO correo con el que se registró (el banner/pantalla de bloqueo ya se
 * lo indican). Si no hay coincidencia se responde 200 (para que Hotmart no
 * reintente eternamente) y se deja el evento en el log del servidor para que
 * Carlos active la cuenta a mano desde Panel Maestro → Renovar.
 * Para renovaciones y cancelaciones se usa además el código de suscriptor
 * (`data.subscription.subscriber.code`) que se guarda en el primer pago.
 *
 * IDEMPOTENCIA: Hotmart reintenta si no recibe 200, y manda varios eventos
 * por la misma compra (APPROVED y COMPLETE) — cada pago se procesa una sola
 * vez por su `purchase.transaction` (Subscription.hotmartLastTransaction).
 *
 * QUÉ HACE CADA EVENTO:
 *   - PURCHASE_APPROVED / PURCHASE_COMPLETE → status ACTIVE, endDate = próxima
 *     fecha de cobro que informa Hotmart (o +31 días si no la manda), limpia
 *     todos los avisos (prueba y vencimiento) y guarda código de suscriptor.
 *   - PURCHASE_REFUNDED / PURCHASE_CHARGEBACK → status SUSPENDED (bloquea de
 *     inmediato). Carlos puede reactivar a mano desde Panel Maestro.
 *   - SUBSCRIPTION_CANCELLATION → NO bloquea (el cliente ya pagó el periodo
 *     actual); solo marca autoRenew=false. Cuando llegue su endDate sin
 *     renovar, el ciclo normal de vencimiento se encarga.
 *   - Cualquier otro evento → se ignora (200).
 */

const MS_DIA = 24 * 60 * 60 * 1000;
const DIAS_VIGENCIA_POR_DEFECTO = 31;

function tokenValido(recibido: string | null | undefined, esperado: string): boolean {
  if (!recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Hotmart manda fechas como milisegundos desde epoch. */
function fechaDeHotmart(valor: unknown): Date | null {
  const n = typeof valor === "number" ? valor : typeof valor === "string" ? Number(valor) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(request: Request) {
  const esperado = process.env.HOTMART_HOTTOK;
  if (!esperado) {
    console.error("❌ Webhook Hotmart: HOTMART_HOTTOK no está configurado — se rechaza el evento.");
    return NextResponse.json({ error: "Webhook no configurado" }, { status: 500 });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const recibido = request.headers.get("x-hotmart-hottok") ?? (typeof payload?.hottok === "string" ? payload.hottok : null);
  if (!tokenValido(recibido, esperado)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const evento: string = String(payload?.event ?? "");
  const data = payload?.data ?? {};
  const emailComprador: string = String(data?.buyer?.email ?? "").trim().toLowerCase();
  const transaccion: string | null = data?.purchase?.transaction ? String(data.purchase.transaction) : null;
  const codigoSuscriptor: string | null = data?.subscription?.subscriber?.code ? String(data.subscription.subscriber.code) : null;

  try {
    const eventosPago = ["PURCHASE_APPROVED", "PURCHASE_COMPLETE"];
    const eventosReversa = ["PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK"];
    const eventosCancelacion = ["SUBSCRIPTION_CANCELLATION"];

    if (![...eventosPago, ...eventosReversa, ...eventosCancelacion].includes(evento)) {
      return NextResponse.json({ ok: true, ignorado: evento || "sin evento" });
    }

    // --- Localizar el negocio ---------------------------------------------
    let tenantId: string | null = null;

    if (codigoSuscriptor) {
      const porCodigo = await prisma.subscription.findFirst({
        where: { hotmartSubscriberCode: codigoSuscriptor },
        select: { tenantId: true },
      });
      tenantId = porCodigo?.tenantId ?? null;
    }
    if (!tenantId && emailComprador) {
      const porCorreoNegocio = await prisma.tenant.findFirst({
        where: { email: { equals: emailComprador, mode: "insensitive" } },
        select: { id: true },
      });
      tenantId = porCorreoNegocio?.id ?? null;
      if (!tenantId) {
        const porCorreoUsuario = await prisma.user.findFirst({
          where: { email: { equals: emailComprador, mode: "insensitive" } },
          select: { tenantId: true },
        });
        tenantId = porCorreoUsuario?.tenantId ?? null;
      }
    }

    if (!tenantId) {
      console.warn(
        `⚠️  Webhook Hotmart (${evento}): no se encontró ningún negocio para el comprador "${emailComprador || "(sin correo)"}" / suscriptor "${codigoSuscriptor ?? "(sin código)"}" — transacción ${transaccion ?? "?"}. Activar a mano desde Panel Maestro → Renovar.`
      );
      return NextResponse.json({ ok: true, negocio: null });
    }

    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    if (!sub) {
      console.warn(`⚠️  Webhook Hotmart (${evento}): el negocio ${tenantId} no tiene fila de suscripción.`);
      return NextResponse.json({ ok: true, suscripcion: null });
    }

    // --- Pago aprobado: activar / renovar ----------------------------------
    if (eventosPago.includes(evento)) {
      // Idempotencia: este mismo pago ya se procesó (reintento de Hotmart o
      // segundo evento — APPROVED y COMPLETE — de la misma compra).
      if (transaccion && sub.hotmartLastTransaction === transaccion) {
        return NextResponse.json({ ok: true, duplicado: true });
      }

      const proximoCobro = fechaDeHotmart(data?.purchase?.date_next_charge);
      const ahora = new Date();
      const endDate =
        proximoCobro && proximoCobro.getTime() > ahora.getTime()
          ? proximoCobro
          : new Date(ahora.getTime() + DIAS_VIGENCIA_POR_DEFECTO * MS_DIA);

      const precio = Number(data?.purchase?.price?.value);

      await prisma.subscription.update({
        where: { tenantId },
        data: {
          status: "ACTIVE",
          endDate,
          autoRenew: true,
          ...(Number.isFinite(precio) && precio > 0 ? { price: precio } : {}),
          hotmartLastTransaction: transaccion,
          hotmartSubscriberCode: codigoSuscriptor ?? sub.hotmartSubscriberCode,
          // Cuenta al corriente: todos los avisos arrancan de cero para el
          // próximo vencimiento (mismo criterio que renovarSuscripcionAction).
          expiredNoticeSentAt: null,
          blockNoticeSentAt: null,
          renewalReminderSentAt: null,
          deletionNoticeSentAt: null,
          trialNotice7SentAt: null,
          trialNotice3SentAt: null,
          trialNotice1SentAt: null,
          trialEndedNoticeSentAt: null,
        },
      });
      console.log(`✅ Webhook Hotmart (${evento}): negocio ${tenantId} activado hasta ${endDate.toISOString()} (transacción ${transaccion ?? "?"}).`);
      return NextResponse.json({ ok: true, activado: true });
    }

    // --- Reembolso / contracargo: bloquear ---------------------------------
    if (eventosReversa.includes(evento)) {
      await prisma.subscription.update({
        where: { tenantId },
        data: { status: "SUSPENDED", autoRenew: false },
      });
      console.log(`⛔ Webhook Hotmart (${evento}): negocio ${tenantId} suspendido.`);
      return NextResponse.json({ ok: true, suspendido: true });
    }

    // --- Cancelación de la suscripción: no bloquea, deja de renovarse ------
    await prisma.subscription.update({
      where: { tenantId },
      data: { autoRenew: false },
    });
    console.log(`ℹ️  Webhook Hotmart (${evento}): negocio ${tenantId} ya no se renovará (conserva acceso hasta su fecha de vencimiento).`);
    return NextResponse.json({ ok: true, cancelada: true });
  } catch (err) {
    // 500 → Hotmart reintenta después, que es lo que queremos ante un fallo
    // temporal de base de datos.
    console.error("❌ Error procesando webhook de Hotmart:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
