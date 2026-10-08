import "server-only";

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { identificarPlan } from "@/lib/hotmart-plan";
import type { EventoHotmart } from "@/lib/hotmart-payload";
import { crearNegocio, generarSlugUnico } from "@/lib/crear-negocio";
import { generarPasswordTemporal } from "@/lib/password-temporal";
import { correoConfigurado, correoBienvenidaSuscripcion, enviarCorreo } from "@/lib/correo-transaccional";
import { canonizarCorreo } from "@/lib/correo-canonico";
import {
  correoPareceValido,
  nombreProvisionalNegocio,
  nombreDelDueno,
  vigenciaInicial,
  esInicioDePrueba,
} from "@/lib/hotmart-alta-puro";

/**
 * Alta AUTOMÁTICA de una cuenta cuando Hotmart avisa de una compra aprobada de
 * alguien que todavía no existe en Linkity (2026-10-08, decisión de Carlos:
 * "deleguemos todo a Hotmart" — la prueba gratis con tarjeta y el cobro viven
 * en Hotmart; Linkity solo crea la cuenta cuando llega el aviso).
 *
 * Reglas:
 *  - Solo se crea la cuenta si el plan se identifica por la oferta/producto de
 *    la compra (lib/hotmart-plan.ts). Si no, NO se crea nada y el evento queda
 *    para revisión en Panel Maestro → Hotmart (nunca se adivina el plan).
 *  - La cuenta nace ACTIVE (no TRIAL) con vigencia hasta el primer cobro de
 *    Hotmart: así, si el cobro llega con horas de retraso, rige la gracia de 7
 *    días de las cuentas de paga en vez del bloqueo inmediato de la prueba, y
 *    los avisos "suscríbete" de la prueba de Linkity no le llegan a alguien
 *    que ya tiene tarjeta registrada.
 *  - El dueño recibe su contraseña temporal por correo (el correo con el que
 *    pagó). Si el correo no sale NO se deshace la cuenta (el cliente ya
 *    pagó o registró su tarjeta): queda marcada para revisión y el dueño puede
 *    pedir el reenvío desde el login.
 *  - Si algo falla al crear el negocio, se borra la cuenta de acceso recién
 *    creada y se relanza el error (el webhook responde 500 y Hotmart
 *    reintenta; no queda nada a medias).
 *  - El negocio nace con nombre provisional y sin giro: se piden en el primer
 *    acceso (Tenant.datosPendientes = true marca que faltan).
 */

export type ResultadoAlta =
  | { tipo: "creada"; tenantId: string; commercialPlanId: string; needsAttention: boolean; note: string }
  | { tipo: "sin_resolver"; outcome: string; note: string }
  | { tipo: "correo_en_uso" };

const MENSAJES_CORREO_EN_USO = ["already registered", "already exists", "already been registered"];

export async function altaDesdeCompra(ev: EventoHotmart): Promise<ResultadoAlta> {
  if (!correoPareceValido(ev.email)) {
    return {
      tipo: "sin_resolver",
      outcome: "sin_negocio",
      note: "La compra no trae un correo válido del comprador: no se pudo crear la cuenta. Créala a mano desde Negocios.",
    };
  }
  const correo = ev.email.trim().toLowerCase();

  // 1) ¿Qué plan compró? Sin plan identificado no se crea nada.
  const planes = await prisma.commercialPlan.findMany({
    select: { id: true, code: true, name: true, isActive: true, hotmartProductId: true, hotmartOfferCode: true },
  });
  const id = identificarPlan(planes, { offerCode: ev.offerCode, productId: ev.productId });
  if (id.tipo !== "ok") {
    return {
      tipo: "sin_resolver",
      outcome: "sin_plan",
      note: `Compra de ${correo} sin cuenta en Linkity y sin plan identificable (producto ${ev.productId ?? "?"}, oferta ${ev.offerCode ?? "?"}). NO se creó la cuenta: captura los códigos de Hotmart en Planes comerciales y créala con Negocios → Nuevo.`,
    };
  }
  const plan = id.plan;

  // 2) ¿Ese correo ya usó una prueba antes? (no se bloquea: Hotmart ya la aceptó)
  const canonico = canonizarCorreo(correo);
  let pruebaPrevia = false;
  if (canonico) {
    const previa = await prisma.pruebaGratisUsada.findUnique({ where: { emailCanonico: canonico }, select: { id: true } });
    pruebaPrevia = !!previa;
  }

  // 3) Cuenta de acceso (Supabase Auth) con contraseña temporal.
  const admin = createAdminClient();
  const password = generarPasswordTemporal();
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: correo,
    password,
    email_confirm: true,
    user_metadata: { must_change_password: true, temp_sent_at: new Date().toISOString() },
  });
  if (authError || !authData.user) {
    const msg = authError?.message?.toLowerCase() ?? "";
    if (MENSAJES_CORREO_EN_USO.some((m) => msg.includes(m))) return { tipo: "correo_en_uso" };
    throw new Error(`No se pudo crear la cuenta de acceso: ${authError?.message ?? "sin detalle"}`);
  }
  const authUserId = authData.user.id;

  // 4) Negocio + dueño + suscripción. Si falla, se borra la cuenta de acceso.
  let tenantId: string;
  let slug: string;
  try {
    const nombreNegocio = nombreProvisionalNegocio(ev.nombreComprador, correo);
    const creado = await crearNegocio({
      businessName: nombreNegocio,
      slug: await generarSlugUnico(nombreNegocio),
      businessType: null,
      datosPendientes: true,
      ownerName: nombreDelDueno(ev.nombreComprador, correo),
      ownerEmail: correo,
      authUserId,
      suscripcion: {
        plan: plan.name,
        status: "ACTIVE",
        price: ev.precio !== null && ev.precio > 0 ? ev.precio : 0,
        endDate: vigenciaInicial(ev),
        commercialPlanId: plan.id,
        autoRenew: true,
        hotmartSubscriberCode: ev.codigoSuscriptor,
        hotmartLastTransaction: ev.transaccion,
      },
      pruebaUsada: canonico && !pruebaPrevia ? { emailCanonico: canonico, emailOriginal: correo } : null,
    });
    tenantId = creado.id;
    slug = creado.slug;
  } catch (err) {
    await admin.auth.admin.deleteUser(authUserId).catch((e: unknown) => console.error("No se pudo borrar la cuenta de acceso tras fallar el alta:", e));
    throw err;
  }

  // 5) Correo de bienvenida con la contraseña temporal.
  const avisos: string[] = [];
  let correoEnviado = false;
  if (!correoConfigurado()) {
    avisos.push("No hay correo configurado (Resend): la cuenta se creó pero el dueño NO recibió su contraseña. Cuando Resend esté configurado, que pida «Reenviar contraseña» en el login.");
  } else {
    const mensaje = correoBienvenidaSuscripcion({
      password,
      plan: plan.name,
      finDePrueba: esInicioDePrueba(ev) ? vigenciaInicial(ev) : null,
    });
    const envio = await enviarCorreo({ to: correo, ...mensaje });
    correoEnviado = envio.ok;
    if (!envio.ok) avisos.push(`La cuenta se creó pero no salió el correo con la contraseña (${envio.motivo}). El dueño puede pedir «Reenviar contraseña» en el login.`);
  }
  if (pruebaPrevia) avisos.push("Ese correo (o una variante con + o puntos) ya había usado una prueba gratis antes. Revisa si corresponde.");

  console.log(`✅ Webhook Hotmart: cuenta nueva ${slug} (${tenantId}) creada para ${correo}, plan ${plan.name}${correoEnviado ? "" : " — SIN correo de acceso"}.`);
  return {
    tipo: "creada",
    tenantId,
    commercialPlanId: plan.id,
    needsAttention: avisos.length > 0,
    note: avisos.length > 0 ? avisos.join(" ") : `Cuenta ${slug} creada automáticamente (plan ${plan.name}); contraseña enviada por correo.`,
  };
}
