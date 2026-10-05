import { NextResponse } from "next/server";
import { procesarEstadoWhatsapp } from "@/lib/whatsapp-tenant";

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

  if (modo === "subscribe" && challenge && token && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Verificación fallida", { status: 403 });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
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
