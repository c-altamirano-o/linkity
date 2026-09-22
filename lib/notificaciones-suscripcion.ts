import "server-only";

/**
 * Envío de los 4 avisos del ciclo de vida de suscripción (ver el comentario
 * largo en Subscription, schema.prisma, y lib/ciclo-suscripcion.ts) —
 * 2026-09-22, a petición de Carlos: "tendré un correo de linkitysoluciones
 * y un whatsapp business para la gestión con los clientes. Deja todo
 * preparado para que cuando lo suba al sitio real pueda llenar esos campos
 * y funcione".
 *
 * DOS canales, cada uno independiente y opcional — si sus variables de
 * entorno no están puestas, ese canal simplemente no se usa (nunca truena
 * el cron, nunca bloquea el otro canal):
 *
 * 1. CORREO (Resend, https://resend.com) — de verdad "llenar campos y
 *    funciona": Carlos solo necesita crear una cuenta gratuita, verificar
 *    un dominio propio (para no caer en spam) y poner RESEND_API_KEY +
 *    RESEND_FROM_EMAIL en las variables de entorno de Vercel. Sin eso, el
 *    correo simplemente no se manda (se loguea y se sigue de largo).
 *
 * 2. WHATSAPP BUSINESS (Meta Cloud API) — con una advertencia honesta
 *    (mismo criterio de "simulación honesta y documentada" que ya usa
 *    Linkity para CFDI): a diferencia del correo, esto NO es solo "llenar
 *    campos". Meta exige que un mensaje que INICIA tu negocio (no es
 *    respuesta a algo que el cliente escribió en las últimas 24h) use una
 *    PLANTILLA pre-aprobada por Meta Business Manager — no se puede mandar
 *    texto libre. Carlos va a necesitar, aparte de
 *    WHATSAPP_BUSINESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID, dar de alta y
 *    esperar la aprobación de una plantilla llamada exactamente
 *    "aviso_suscripcion_linkity" con un solo parámetro de texto (el cuerpo
 *    del aviso) en business.facebook.com antes de que esto envíe algo de
 *    verdad — mientras esa plantilla no exista/esté aprobada, Meta
 *    responderá con error y quedará logueado, sin tronar el cron.
 */

export type TipoAvisoSuscripcion = "expirada" | "bloqueada" | "recordatorio" | "eliminacion";

interface DatosTenantAviso {
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
}

const ASUNTOS: Record<TipoAvisoSuscripcion, string> = {
  expirada: "Tu suscripción a Linkity venció — tienes 7 días de gracia",
  bloqueada: "Tu cuenta de Linkity fue bloqueada por falta de pago",
  recordatorio: "Recordatorio: tu cuenta de Linkity sigue bloqueada",
  eliminacion: "Última oportunidad: tu información en Linkity será eliminada",
};

function construirCuerpo(tipo: TipoAvisoSuscripcion, tenant: DatosTenantAviso): string {
  const negocio = tenant.name;
  switch (tipo) {
    case "expirada":
      return `Hola, equipo de ${negocio}. Tu suscripción a Linkity venció hoy. Tienes 7 días de gracia para renovar sin perder acceso al sistema. Pasado ese plazo, tu cuenta se bloqueará hasta que renueves. Si ya renovaste, ignora este mensaje.`;
    case "bloqueada":
      return `Hola, equipo de ${negocio}. Ya pasaron los 7 días de gracia y tu cuenta de Linkity quedó bloqueada: nadie del negocio puede entrar al sistema hasta que renueves tu suscripción. Tus datos siguen intactos — en cuanto renueves, recuperas el acceso de inmediato.`;
    case "recordatorio":
      return `Hola, equipo de ${negocio}. Tu cuenta de Linkity sigue bloqueada por falta de renovación (ya han pasado 30 días). Renueva cuando puedas para recuperar el acceso — tus datos siguen guardados y no se ha perdido nada todavía.`;
    case "eliminacion":
      return `Hola, equipo de ${negocio}. Han pasado 90 días desde que tu suscripción a Linkity venció y tu cuenta sigue bloqueada. Si no tenemos respuesta tuya, tu información (ventas, clientes, inventario, personal — todo) podría eliminarse permanentemente de nuestros servidores. Contáctanos lo antes posible si quieres conservar tus datos y reactivar tu cuenta.`;
  }
}

export interface ResultadoAviso {
  enviado: boolean;
  canal: "correo" | "whatsapp" | "ninguno";
  motivo?: string;
}

async function enviarCorreo(tenant: DatosTenantAviso, tipo: TipoAvisoSuscripcion): Promise<ResultadoAviso> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { enviado: false, canal: "ninguno", motivo: "RESEND_API_KEY/RESEND_FROM_EMAIL no configurados" };
  if (!tenant.email) return { enviado: false, canal: "ninguno", motivo: "el negocio no tiene correo registrado" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: tenant.email,
        subject: ASUNTOS[tipo],
        text: construirCuerpo(tipo, tenant),
      }),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      console.error(`❌ Resend respondió ${res.status} al avisar a ${tenant.slug} (${tipo}):`, detalle);
      return { enviado: false, canal: "correo", motivo: `Resend ${res.status}` };
    }
    return { enviado: true, canal: "correo" };
  } catch (err) {
    console.error(`❌ Error de red mandando correo a ${tenant.slug} (${tipo}):`, err);
    return { enviado: false, canal: "correo", motivo: "error de red" };
  }
}

async function enviarWhatsapp(tenant: DatosTenantAviso, tipo: TipoAvisoSuscripcion): Promise<ResultadoAviso> {
  const token = process.env.WHATSAPP_BUSINESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return { enviado: false, canal: "ninguno", motivo: "WHATSAPP_BUSINESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID no configurados" };
  if (!tenant.phone) return { enviado: false, canal: "ninguno", motivo: "el negocio no tiene teléfono registrado" };

  try {
    // Mensaje iniciado por el negocio (no es respuesta a algo que el
    // cliente escribió en las últimas 24h) — Meta exige una PLANTILLA
    // pre-aprobada, no texto libre. Ver el comentario largo al inicio del
    // archivo: Carlos necesita dar de alta y esperar la aprobación de
    // "aviso_suscripcion_linkity" en Meta Business Manager antes de que
    // esto entregue algo de verdad.
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: tenant.phone,
        type: "template",
        template: {
          name: "aviso_suscripcion_linkity",
          language: { code: "es_MX" },
          components: [{ type: "body", parameters: [{ type: "text", text: construirCuerpo(tipo, tenant) }] }],
        },
      }),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      console.error(`❌ WhatsApp Business respondió ${res.status} al avisar a ${tenant.slug} (${tipo}):`, detalle);
      return { enviado: false, canal: "whatsapp", motivo: `Meta ${res.status}` };
    }
    return { enviado: true, canal: "whatsapp" };
  } catch (err) {
    console.error(`❌ Error de red mandando WhatsApp a ${tenant.slug} (${tipo}):`, err);
    return { enviado: false, canal: "whatsapp", motivo: "error de red" };
  }
}

/**
 * Manda el aviso por TODOS los canales configurados (correo y/o WhatsApp)
 * — no es "uno u otro", si Carlos configura ambos se manda por los dos.
 * Nunca lanza: cada canal atrapa sus propios errores, así un canal roto
 * (ej. plantilla de WhatsApp todavía sin aprobar) no detiene el correo ni
 * tumba el cron completo.
 */
export async function enviarAvisoSuscripcion(tenant: DatosTenantAviso, tipo: TipoAvisoSuscripcion): Promise<ResultadoAviso[]> {
  const resultados = await Promise.all([enviarCorreo(tenant, tipo), enviarWhatsapp(tenant, tipo)]);
  const algunoEnviado = resultados.some((r) => r.enviado);
  if (!algunoEnviado) {
    console.warn(`⚠️  No se pudo avisar a ${tenant.slug} (${tipo}) por ningún canal:`, resultados.map((r) => r.motivo).join(" / "));
  }
  return resultados;
}
