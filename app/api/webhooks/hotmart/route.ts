import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { identificarPlan } from "@/lib/hotmart-plan";
import { leerEvento } from "@/lib/hotmart-payload";
import { obtenerHotmartPlataforma } from "@/lib/config-plataforma";
import { altaDesdeCompra } from "@/lib/hotmart-alta";

export const maxDuration = 30;

/**
 * Webhook de Hotmart, versión 2 (Paso 4 de planes comerciales, 2026-10-08).
 * El cobro vive en Hotmart; este endpoint es lo único que activa una cuenta
 * de forma automática cuando el cliente paga.
 *
 * CONFIGURACIÓN (la hace Carlos):
 *   - Variable de entorno HOTMART_HOTTOK en Vercel = el "hottok" que Hotmart
 *     muestra al crear el webhook (Herramientas → Webhook).
 *   - URL a registrar: https://linkitysoluciones.mx/api/webhooks/hotmart
 *   - Eventos: Compra aprobada, Compra completa, Compra reembolsada,
 *     Chargeback, Cancelación de suscripción (opcional: Cambio de plan).
 *   - Cada plan de Panel Maestro → Planes comerciales debe tener su ID de
 *     producto y/o código de oferta de Hotmart: así se sabe QUÉ plan compró.
 *
 * AUTENTICACIÓN: header `X-HOTMART-HOTTOK` (o `hottok` en el cuerpo, versión
 * 1.0). Comparación en tiempo constante. Sin HOTMART_HOTTOK el endpoint
 * RECHAZA todo (500): nunca "falla abierto".
 *
 * REGLAS DE NEGOCIO (cambios respecto a la v1):
 *  - Una cuenta NUNCA queda ACTIVE sin plan comercial. El plan se identifica
 *    por la oferta/producto de la compra (lib/hotmart-plan.ts). Si no se
 *    puede identificar y el negocio no tenía plan, NO se activa: queda
 *    registrado como "sin_plan" para que Carlos lo resuelva en Panel Maestro
 *    → Hotmart (o con Renovar). Si el negocio ya tenía plan (renovación) se
 *    conserva el plan actual y se extiende la vigencia, pero se marca para
 *    revisar la configuración.
 *  - Si el correo del comprador coincide con MÁS de un negocio no se adivina:
 *    se registra como "correo_ambiguo" sin activar nada.
 *  - TODO evento queda en la tabla HotmartEvent (también los que no
 *    activan). Los que requieren una decisión humana llevan
 *    needsAttention=true y salen en Panel Maestro → Hotmart, con contador
 *    en el menú. Se responde 200 aunque no se pueda procesar (para que
 *    Hotmart no reintente eternamente algo que no mejorará solo); solo un
 *    fallo temporal (base de datos) responde 500 para que Hotmart reintente.
 *
 * IDEMPOTENCIA: por `id` del evento (HotmartEvent.eventId) y por
 * `purchase.transaction` (Subscription.hotmartLastTransaction): APPROVED y
 * COMPLETE de la misma compra no extienden la vigencia dos veces.
 *
 * ALTA AUTOMÁTICA (2026-10-08): una compra aprobada de alguien SIN cuenta en
 * Linkity crea el negocio, el dueño y su suscripción en el acto y le manda su
 * contraseña temporal por correo (lib/hotmart-alta.ts). Solo si el plan se
 * identifica; si no, queda en "sin_plan" para revisión.
 *
 * LIGA COMPRA↔NEGOCIO: primero por código de suscriptor (se guarda en el
 * primer pago), luego por correo del comprador (Tenant.email, luego
 * User.email). El cliente debe pagar con el mismo correo con que se registró.
 *
 * NOTA: los nombres de campos de la v2.0.0 se confirmaron con fuentes de
 * terceros, no con un evento real: con el primer evento de prueba hay que
 * revisar en Panel Maestro → Hotmart que producto, oferta y correo se
 * leyeron bien (si un campo no se encuentra, el evento queda para revisión).
 */

const MS_DIA = 24 * 60 * 60 * 1000;
const DIAS_VIGENCIA_POR_DEFECTO = 31;

const EVENTOS_PAGO = ["PURCHASE_APPROVED", "PURCHASE_COMPLETE"];
const EVENTOS_REVERSA = ["PURCHASE_REFUNDED", "PURCHASE_CHARGEBACK"];
const EVENTOS_CANCELACION = ["SUBSCRIPTION_CANCELLATION"];
// Eventos que no cambian nada automáticamente pero que alguien debe ver.
const EVENTOS_A_REVISAR = ["SWITCH_PLAN"];

function tokenValido(recibido: string | null | undefined, esperado: string): boolean {
  if (!recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type Resultado = {
  outcome: string;
  needsAttention?: boolean;
  note?: string;
  tenantId?: string | null;
  commercialPlanId?: string | null;
  respuesta?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const esperado = (await obtenerHotmartPlataforma()).hottok;
  if (!esperado) {
    console.error("❌ Webhook Hotmart: el Hottok no está configurado (Panel Maestro → Conexiones) — se rechaza el evento.");
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

  const ev = leerEvento(payload);

  // --- Registrar el evento (o retomar uno que falló antes) ----------------
  let registroId: string;
  try {
    if (ev.eventId) {
      const previo = await prisma.hotmartEvent.findUnique({
        where: { eventId: ev.eventId },
        select: { id: true, outcome: true },
      });
      if (previo && previo.outcome !== "error" && previo.outcome !== "recibido") {
        return NextResponse.json({ ok: true, duplicado: true });
      }
      if (previo) registroId = previo.id;
      else registroId = await crearRegistro(ev);
    } else {
      registroId = await crearRegistro(ev);
    }
  } catch (err) {
    if ((err as { code?: string } | null)?.code === "P2002") {
      // Mismo evento llegando en paralelo: el otro request lo procesa.
      return NextResponse.json({ ok: true, duplicado: true });
    }
    console.error("❌ Webhook Hotmart: no se pudo registrar el evento:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  try {
    const r = await procesar(ev);
    await prisma.hotmartEvent.update({
      where: { id: registroId },
      data: {
        outcome: r.outcome,
        needsAttention: r.needsAttention ?? false,
        note: r.note ?? null,
        tenantId: r.tenantId ?? null,
        commercialPlanId: r.commercialPlanId ?? null,
      },
    });
    return NextResponse.json({ ok: true, resultado: r.outcome, ...(r.respuesta ?? {}) });
  } catch (err) {
    console.error("❌ Error procesando webhook de Hotmart:", err);
    // Best-effort: dejar constancia. 500 → Hotmart reintenta (fallo temporal).
    await prisma.hotmartEvent
      .update({
        where: { id: registroId },
        data: { outcome: "error", needsAttention: true, note: err instanceof Error ? err.message.slice(0, 500) : "Error desconocido" },
      })
      .catch(() => {});
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

async function crearRegistro(ev: ReturnType<typeof leerEvento>): Promise<string> {
  const fila = await prisma.hotmartEvent.create({
    data: {
      eventId: ev.eventId,
      event: ev.evento || "(sin evento)",
      transaction: ev.transaccion,
      buyerEmail: ev.email,
      subscriberCode: ev.codigoSuscriptor,
      productId: ev.productId,
      offerCode: ev.offerCode,
      outcome: "recibido",
      summary: JSON.parse(JSON.stringify(ev.resumen)),
    },
    select: { id: true },
  });
  return fila.id;
}

async function localizarNegocio(
  ev: ReturnType<typeof leerEvento>
): Promise<{ tipo: "ok"; tenantId: string } | { tipo: "ninguno" } | { tipo: "ambiguo"; cuantos: number }> {
  if (ev.codigoSuscriptor) {
    const porCodigo = await prisma.subscription.findFirst({
      where: { hotmartSubscriberCode: ev.codigoSuscriptor },
      select: { tenantId: true },
    });
    if (porCodigo) return { tipo: "ok", tenantId: porCodigo.tenantId };
  }
  if (ev.email) {
    const ids = new Set<string>();
    const porNegocio = await prisma.tenant.findMany({
      where: { email: { equals: ev.email, mode: "insensitive" } },
      select: { id: true },
      take: 3,
    });
    porNegocio.forEach((t) => ids.add(t.id));
    if (ids.size === 0) {
      const porUsuario = await prisma.user.findMany({
        where: { email: { equals: ev.email, mode: "insensitive" } },
        select: { tenantId: true },
        take: 3,
      });
      porUsuario.forEach((u) => ids.add(u.tenantId));
    }
    if (ids.size === 1) return { tipo: "ok", tenantId: [...ids][0] };
    if (ids.size > 1) return { tipo: "ambiguo", cuantos: ids.size };
  }
  return { tipo: "ninguno" };
}

async function procesar(ev: ReturnType<typeof leerEvento>): Promise<Resultado> {
  const { evento } = ev;

  if (EVENTOS_A_REVISAR.includes(evento)) {
    return { outcome: "ignorado", needsAttention: true, note: `Evento ${evento}: no se aplica solo. Revisa en Hotmart si el cliente cambió de plan; el siguiente cobro actualizará el plan automáticamente.` };
  }
  if (![...EVENTOS_PAGO, ...EVENTOS_REVERSA, ...EVENTOS_CANCELACION].includes(evento)) {
    return { outcome: "ignorado", respuesta: { ignorado: evento || "sin evento" } };
  }

  // --- Localizar el negocio ---------------------------------------------
  let loc = await localizarNegocio(ev);

  // Compra aprobada de alguien que todavía no existe en Linkity: la cuenta se
  // crea sola (lib/hotmart-alta.ts). Reembolsos y cancelaciones de alguien sin
  // cuenta NO crean nada.
  if (loc.tipo === "ninguno" && EVENTOS_PAGO.includes(evento)) {
    const alta = await altaDesdeCompra(ev);
    if (alta.tipo === "creada") {
      return {
        outcome: "cuenta_creada",
        needsAttention: alta.needsAttention,
        note: alta.note,
        tenantId: alta.tenantId,
        commercialPlanId: alta.commercialPlanId,
        respuesta: { cuentaCreada: true },
      };
    }
    if (alta.tipo === "sin_resolver") {
      return { outcome: alta.outcome, needsAttention: true, note: alta.note };
    }
    // "correo_en_uso": existe una cuenta de acceso con ese correo. Puede ser
    // otro aviso de la misma compra creándola en este instante: se vuelve a
    // buscar el negocio; si aún no aparece, se responde 500 para que Hotmart
    // reintente en un rato (cuando el negocio ya exista).
    loc = await localizarNegocio(ev);
    if (loc.tipo === "ninguno") {
      throw new Error(`El correo ${ev.email ?? "?"} ya tiene cuenta de acceso pero ningún negocio todavía; se reintentará.`);
    }
  }

  if (loc.tipo === "ninguno") {
    console.warn(`⚠️  Webhook Hotmart (${evento}): sin negocio para "${ev.email ?? "(sin correo)"}" / suscriptor "${ev.codigoSuscriptor ?? "(sin código)"}" — transacción ${ev.transaccion ?? "?"}.`);
    return { outcome: "sin_negocio", needsAttention: true, note: "No se encontró ningún negocio con ese correo ni código de suscriptor. Activar a mano desde Negocios → Renovar eligiendo plan." };
  }
  if (loc.tipo === "ambiguo") {
    return { outcome: "correo_ambiguo", needsAttention: true, note: `El correo del comprador coincide con ${loc.cuantos} negocios; no se activó ninguno.` };
  }
  const tenantId = loc.tenantId;

  const sub = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!sub) {
    return { outcome: "sin_suscripcion", needsAttention: true, tenantId, note: "El negocio no tiene fila de suscripción." };
  }

  // --- Reembolso / contracargo: bloquear ---------------------------------
  if (EVENTOS_REVERSA.includes(evento)) {
    await prisma.subscription.update({ where: { tenantId }, data: { status: "SUSPENDED", autoRenew: false } });
    console.log(`⛔ Webhook Hotmart (${evento}): negocio ${tenantId} suspendido.`);
    return { outcome: "suspendido", needsAttention: true, tenantId, commercialPlanId: sub.commercialPlanId, note: "Reembolso o contracargo: cuenta suspendida. Reactívala a mano si corresponde." };
  }

  // --- Cancelación: no bloquea, deja de renovarse ------------------------
  if (EVENTOS_CANCELACION.includes(evento)) {
    await prisma.subscription.update({ where: { tenantId }, data: { autoRenew: false } });
    console.log(`ℹ️  Webhook Hotmart (${evento}): negocio ${tenantId} ya no se renovará.`);
    return { outcome: "cancelacion_registrada", tenantId, commercialPlanId: sub.commercialPlanId };
  }

  // --- Pago aprobado: activar / renovar ----------------------------------
  if (ev.transaccion && sub.hotmartLastTransaction === ev.transaccion) {
    return { outcome: "duplicado", tenantId, commercialPlanId: sub.commercialPlanId, respuesta: { duplicado: true } };
  }

  const planes = await prisma.commercialPlan.findMany({
    select: { id: true, code: true, name: true, isActive: true, hotmartProductId: true, hotmartOfferCode: true },
  });
  const id = identificarPlan(planes, { offerCode: ev.offerCode, productId: ev.productId });

  let planFinal: { id: string; name: string } | null = null;
  let aviso: string | null = null;
  let atencion = false;

  if (id.tipo === "ok") {
    planFinal = { id: id.plan.id, name: id.plan.name };
  } else if (sub.commercialPlanId) {
    // Renovación de un cliente que ya tenía plan: se conserva y se extiende,
    // pero se avisa porque la compra no coincide con ningún plan configurado.
    const actual = planes.find((p) => p.id === sub.commercialPlanId);
    planFinal = actual ? { id: actual.id, name: actual.name } : null;
    atencion = true;
    aviso = `La compra (producto ${ev.productId ?? "?"}, oferta ${ev.offerCode ?? "?"}) ${id.tipo === "ambiguo" ? "coincide con varios planes" : "no coincide con ningún plan"}; se conservó el plan actual. Revisa los códigos de Hotmart en Planes comerciales.`;
  }

  if (!planFinal) {
    console.warn(`⚠️  Webhook Hotmart (${evento}): pago de ${ev.email ?? "?"} sin plan identificable (producto ${ev.productId ?? "?"}, oferta ${ev.offerCode ?? "?"}). NO se activó.`);
    return {
      outcome: "sin_plan",
      needsAttention: true,
      tenantId,
      note: `Pago recibido pero no se pudo identificar el plan (producto ${ev.productId ?? "?"}, oferta ${ev.offerCode ?? "?"}). La cuenta NO se activó: captura los códigos de Hotmart del plan en Planes comerciales y activa con Negocios → Renovar.`,
    };
  }

  const ahora = new Date();
  const endDate =
    ev.proximoCobro && ev.proximoCobro.getTime() > ahora.getTime()
      ? ev.proximoCobro
      : new Date(ahora.getTime() + DIAS_VIGENCIA_POR_DEFECTO * MS_DIA);

  await prisma.subscription.update({
    where: { tenantId },
    data: {
      status: "ACTIVE",
      endDate,
      autoRenew: true,
      commercialPlanId: planFinal.id,
      plan: planFinal.name,
      ...(ev.precio !== null && ev.precio > 0 ? { price: ev.precio } : {}),
      hotmartLastTransaction: ev.transaccion,
      hotmartSubscriberCode: ev.codigoSuscriptor ?? sub.hotmartSubscriberCode,
      // Cuenta al corriente: todos los avisos arrancan de cero.
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
  console.log(`✅ Webhook Hotmart (${evento}): negocio ${tenantId} activado con plan ${planFinal.name} hasta ${endDate.toISOString()}.`);
  return {
    outcome: "activado",
    needsAttention: atencion,
    note: aviso ?? undefined,
    tenantId,
    commercialPlanId: planFinal.id,
    respuesta: { activado: true },
  };
}
