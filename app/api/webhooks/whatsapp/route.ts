import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { procesarEstadoWhatsapp } from "@/lib/whatsapp-tenant";
import { obtenerWhatsappPlataforma, registrarContactoMeta } from "@/lib/config-plataforma";
import { verificarFirmaMeta } from "@/lib/firma-meta";
import { descifrar } from "@/lib/cifrado-config";
import { prisma } from "@/lib/prisma";

function iguales(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export const maxDuration = 60;

/**
 * Webhook de Meta para el estado REAL de entrega de los WhatsApp que manda
 * cada tenant (2026-10-05, a petición de Carlos: "el SaaS dice que se
 * envió pero al número no le llega nada... necesito ver a dónde se mandó
 * ese mensaje o por qué da el falso positivo de enviado"). Ver el
 * comentario largo en lib/whatsapp-tenant.ts (enviarWhatsappTenant) para la
 * arquitectura completa: sin este webhook, un 200 de Meta solo significa
 * "aceptado en cola", nunca "entregado" — este endpoint es la ÚNICA forma
 * de enterarse de verdad, porque Meta no ofrece una forma de consultarlo
 * por API, solo lo empuja aquí de forma asíncrona.
 *
 * Mismo endpoint para TODOS los tenants (no hay uno por negocio): cada
 * entrada de `statuses[]` se correlaciona por el wamid contra
 * WhatsappMensajeEnviado, que ya trae el tenantId — no hace falta nada más
 * para saber de qué negocio se trata.
 *
 * Decisión de seguridad deliberada (explicada y aprobada por Carlos el
 * 2026-10-05): esta primera versión NO verifica la firma HMAC
 * (X-Hub-Signature-256) que Meta recomienda — requeriría guardar un App
 * Secret por tenant (Tenant.whatsappAppSecret ya quedó reservado en el
 * schema para esto) y lo que este endpoint hace es de bajo riesgo (solo
 * actualiza estados de mensajes que el propio sistema ya mandó, nunca
 * ejecuta una acción sensible ni expone datos). Pendiente activarlo antes
 * de ofrecer el envío de WhatsApp como servicio a clientes externos de
 * Linkity — ver WhatsappAppSecret en schema.prisma.
 *
 * 2026-10-08: el verify token y el App Secret de LINKITY ya se capturan en
 * Panel Maestro → Conexiones (lib/config-plataforma.ts; si no hay nada
 * guardado ahí se usa la variable de entorno anterior). Con eso, los avisos
 * que llegan por el número de Linkity (metadata.phone_number_id igual al
 * configurado) se aceptan solo con firma X-Hub-Signature-256 válida. Los
 * avisos de los números de cada negocio siguen sin verificación de firma
 * hasta el siguiente paso (usará Tenant.whatsappAppSecret).
 *
 * Los avisos de entrega de un NEGOCIO se verifican con el App Secret que ese
 * negocio guardó en su Configuración (Tenant.whatsappAppSecret, cifrado). Si
 * no guardó uno se aceptan sin firma, como antes — el secreto es opcional.
 */

export async function GET(request: Request) {
  // Verificación inicial que exige Meta al configurar el webhook en el
  // Dashboard de la app (WhatsApp → Configuration → Webhooks): responde el
  // valor de hub.challenge tal cual, como texto plano, SOLO si el token
  // coincide con el que se configuró en Vercel (WHATSAPP_WEBHOOK_VERIFY_TOKEN)
  // — ese mismo valor es el que Carlos debe escribir en el campo
  // "Verify token" del Dashboard de Meta.
  const { searchParams } = new URL(request.url);
  const modo = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const config = await obtenerWhatsappPlataforma();
  if (modo === "subscribe" && challenge && token && config.verifyToken && iguales(token, config.verifyToken)) {
    // Panel Maestro → Conexiones muestra "Meta ya se comunicó" con esta fecha.
    await registrarContactoMeta();
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Verificación fallida", { status: 403 });
}

export async function POST(request: Request) {
  try {
    // Se lee el cuerpo EXACTO como texto: la firma de Meta se calcula sobre
    // esos bytes, no sobre el JSON ya interpretado.
    const cuerpoCrudo = await request.text();
    const payload = JSON.parse(cuerpoCrudo);

    const config = await obtenerWhatsappPlataforma();
    if (config.appSecret && config.phoneNumberId) {
      const idsEnAviso = new Set<string>();
      for (const e of Array.isArray(payload?.entry) ? payload.entry : []) {
        for (const c of Array.isArray(e?.changes) ? e.changes : []) {
          const id = c?.value?.metadata?.phone_number_id;
          if (typeof id === "string") idsEnAviso.add(id);
        }
      }
      if (idsEnAviso.has(config.phoneNumberId)) {
        if (!verificarFirmaMeta(cuerpoCrudo, request.headers.get("x-hub-signature-256"), config.appSecret)) {
          console.warn("⚠️  Aviso de WhatsApp del número de Linkity con firma inválida: rechazado.");
          return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
        }
        await registrarContactoMeta();
      }
    }

    // Avisos de entrega de los mensajes de un NEGOCIO (2026-10-08): el negocio
    // se identifica por el wamid (WhatsappMensajeEnviado ya trae su tenantId).
    // Si ese negocio guardó el App Secret de su app de Meta, el aviso debe
    // traer firma válida; si no lo guardó se acepta como antes (compatibilidad)
    // y queda una advertencia en el log. Un mismo aviso viene de una sola app,
    // así que basta comprobarlo con el secreto de cualquiera de los negocios
    // involucrados que lo tenga.
    const wamids = new Set<string>();
    for (const e of Array.isArray(payload?.entry) ? payload.entry : []) {
      for (const c of Array.isArray(e?.changes) ? e.changes : []) {
        for (const st of Array.isArray(c?.value?.statuses) ? c.value.statuses : []) {
          if (typeof st?.id === "string") wamids.add(st.id);
        }
      }
    }
    if (wamids.size > 0) {
      const mensajes = await prisma.whatsappMensajeEnviado.findMany({
        where: { wamid: { in: [...wamids] } },
        select: { tenantId: true },
      });
      const idsNegocios = [...new Set(mensajes.map((m) => m.tenantId))];
      if (idsNegocios.length > 0) {
        const negocios = await prisma.tenant.findMany({
          where: { id: { in: idsNegocios } },
          select: { slug: true, whatsappAppSecret: true },
        });
        for (const n of negocios) {
          if (!n.whatsappAppSecret) {
            console.warn(`⚠️  WhatsApp: el negocio ${n.slug} no tiene App Secret; sus avisos de entrega se aceptan sin verificar la firma.`);
            continue;
          }
          const secretoNegocio = descifrar(n.whatsappAppSecret);
          if (!secretoNegocio) {
            console.error(`❌ WhatsApp: no se pudo descifrar el App Secret de ${n.slug} (¿cambió CONFIG_ENCRYPTION_KEY?); aviso aceptado sin verificar.`);
            continue;
          }
          if (!verificarFirmaMeta(cuerpoCrudo, request.headers.get("x-hub-signature-256"), secretoNegocio)) {
            console.warn(`⚠️  Aviso de WhatsApp de ${n.slug} con firma inválida: rechazado.`);
            return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
          }
        }
      }
    }

    const entradas: any[] = Array.isArray(payload?.entry) ? payload.entry : [];

    for (const entrada of entradas) {
      const cambios: any[] = Array.isArray(entrada?.changes) ? entrada.changes : [];
      for (const cambio of cambios) {
        const estados: any[] = Array.isArray(cambio?.value?.statuses) ? cambio.value.statuses : [];
        for (const estado of estados) {
          const wamid: string | undefined = estado?.id;
          const status: string | undefined = estado?.status;
          if (!wamid || !status) continue;

          const errores = Array.isArray(estado?.errors) ? estado.errors : [];
          const errorDetalle =
            errores.length > 0
              ? errores
                  .map((e: any) => `${e?.title ?? e?.code ?? "error"}${e?.error_data?.details ? ` — ${e.error_data.details}` : ""}`)
                  .join("; ")
              : undefined;

          await procesarEstadoWhatsapp({
            wamid,
            status: status as "sent" | "delivered" | "read" | "played" | "failed",
            errorDetalle,
          }).catch((err) => console.error("Error procesando un estado de WhatsApp (se sigue con los demás):", err));
        }
        // `cambio.value.messages[]` (mensajes ENTRANTES de clientes) queda
        // fuera de alcance a propósito — este webhook, por ahora, solo
        // atiende el estado de entrega de lo que el negocio ya mandó.
      }
    }
  } catch (err) {
    console.error("Error procesando el webhook de WhatsApp (se responde 200 de todas formas):", err);
  }

  // Meta reintenta agresivamente (y puede terminar desactivando el webhook)
  // si no recibe 200 — se regresa 200 siempre, aunque algo interno haya
  // fallado (ya quedó logueado arriba).
  return NextResponse.json({ received: true });
}
