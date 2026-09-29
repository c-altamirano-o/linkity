import "server-only";
import { prisma, getTenantPrisma } from "@/lib/prisma";
import { telefonoWhatsapp } from "@/lib/paises";

/**
 * WhatsApp Business PROPIO de cada negocio (2026-09-29, a petición de
 * Carlos: "comencemos a conectar todo... ¿cómo establezco un número de
 * WhatsApp Business para que el cliente lo configure y de ahí se manden
 * todos los mensajes?"). Deliberadamente el OPUESTO de
 * lib/notificaciones-suscripcion.ts: aquella usa UNA cuenta de WhatsApp
 * Business (la de Linkity, la plataforma) para avisarle A LOS TENANTS de su
 * propia suscripción — esta usa la cuenta de WhatsApp Business de CADA
 * TENANT (Tenant.whatsappPhoneNumberId/whatsappAccessToken) para que ESE
 * negocio avise a SUS PROPIOS clientes (reparaciones: recibido, en
 * reparación, listo, entregado...).
 *
 * Se eligió a propósito que cada negocio conecte su PROPIA cuenta (gratis,
 * directo con Meta vía developers.facebook.com) en vez de que Linkity se
 * registre como "Proveedor Tecnológico" de Meta con Embedded Signup: esto
 * último exige que Meta APRUEBE la cuenta de Linkity como proveedor (puede
 * tardar semanas) antes de que funcione para CUALQUIER tenant, mientras que
 * con este enfoque cada negocio puede estar funcionando en cuanto termine
 * su propio proceso con Meta, sin esperar a nadie más.
 *
 * MISMA advertencia honesta que ya documenta notificaciones-suscripcion.ts:
 * un mensaje que INICIA el negocio (el cliente no le escribió primero en
 * las últimas 24h — que es el caso de TODOS estos avisos) exige que Meta
 * tenga una PLANTILLA pre-aprobada, no admite texto libre. Por eso, además
 * de pegar su Phone Number ID + Access Token en Configuración, cada negocio
 * necesita dar de alta y esperar la aprobación (normalmente minutos a un
 * par de días) de UNA plantilla en Meta Business Manager, EXACTAMENTE así:
 *
 *   Nombre:    actualizacion_reparacion_linkity
 *   Categoría: Utilidad (Utility)
 *   Idioma:    Español (MX) — es_MX
 *   Cuerpo:    {{1}}
 *
 * Un solo parámetro de texto libre (todo el mensaje ya armado) — mismo
 * criterio que "aviso_suscripcion_linkity": evita necesitar una plantilla
 * distinta por cada tipo de aviso (recibido/en reparación/listo/entregado),
 * Meta solo aprueba la forma UNA vez y el contenido real lo arma este
 * archivo en construirMensaje() de abajo. Mientras esa plantilla no exista
 * o no esté aprobada para un tenant, Meta responderá con error — se
 * regresa tal cual en ResultadoWhatsappTenant.motivo para que se vea en
 * Configuración (botón "Enviar prueba") en vez de fallar en silencio.
 */

const NOMBRE_PLANTILLA = "actualizacion_reparacion_linkity";
const IDIOMA_PLANTILLA = "es_MX";

export interface ResultadoWhatsappTenant {
  enviado: boolean;
  motivo?: string;
}

export interface DatosWhatsappTenant {
  whatsappPhoneNumberId: string | null;
  whatsappAccessToken: string | null;
}

/** Solo para decidir si mostrar "conectado"/"sin conectar" en la UI — nunca expone el token. */
export function whatsappTenantConfigurado(tenant: DatosWhatsappTenant): boolean {
  return Boolean(tenant.whatsappPhoneNumberId && tenant.whatsappAccessToken);
}

/**
 * Arma el mensaje que ve el cliente final — mismo texto tanto para los
 * avisos automáticos (creación/cambio de estatus) como para el envío
 * manual ("Avisar" en Reparaciones). `estadoTexto` es siempre
 * ESTADO_CLIENTE_TEXTO[...] (lib/reparaciones-data.ts) — MISMO texto que ya
 * ve el cliente en la página pública, para que el WhatsApp y la página
 * jamás se contradigan.
 */
export function construirMensajeReparacion(params: {
  negocio: string;
  clientePrimerNombre: string;
  folio: string;
  estadoTexto: string;
  urlSeguimiento: string;
}): string {
  const { negocio, clientePrimerNombre, folio, estadoTexto, urlSeguimiento } = params;
  return `Hola ${clientePrimerNombre}, este es un mensaje de ${negocio}. Folio ${folio}: ${estadoTexto}. Sigue el estatus en tiempo real aquí: ${urlSeguimiento}`;
}

/**
 * Arma la URL absoluta de la página pública de seguimiento
 * (app/rep/[token]/page.tsx) desde un Server Action — ahí no existe
 * `window.location.origin` (eso solo lo tienen los Client Components, ver
 * ReparacionesClient.tsx/AduanaClient.tsx, que arman el mismo link para el
 * QR del ticket impreso). NEXT_PUBLIC_SITE_URL es opcional — sin
 * configurar, cae al dominio real de producción (linkitysoluciones.mx, la
 * app es multi-tenant por RUTA — /[tenant]/... — no por subdominio, así que
 * un solo dominio fijo aplica a todos los negocios por igual).
 */
export function urlSeguimientoReparacion(publicToken: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://linkitysoluciones.mx";
  return `${base.replace(/\/$/, "")}/rep/${publicToken}`;
}

/**
 * Envío real vía WhatsApp Business Cloud API de Meta, con las credenciales
 * DEL TENANT (nunca las de Linkity). Nunca lanza — cada caller decide qué
 * tan silencioso ser con el resultado: los envíos automáticos (creación y
 * cambio de estatus de una reparación) son "mejor esfuerzo" y jamás deben
 * frenar la operación real (el estatus se actualiza igual aunque WhatsApp
 * falle); el botón "Enviar prueba" de Configuración y el "Avisar" manual sí
 * muestran el resultado/motivo al usuario.
 */
export async function enviarWhatsappTenant(
  tenant: DatosWhatsappTenant,
  telefonoDestino: string | null,
  mensaje: string
): Promise<ResultadoWhatsappTenant> {
  if (!tenant.whatsappPhoneNumberId || !tenant.whatsappAccessToken) {
    return { enviado: false, motivo: "Este negocio no ha conectado WhatsApp Business todavía (Configuración → WhatsApp Business)" };
  }
  if (!telefonoDestino) {
    return { enviado: false, motivo: "El cliente no tiene teléfono registrado" };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${tenant.whatsappPhoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tenant.whatsappAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telefonoDestino,
        type: "template",
        template: {
          name: NOMBRE_PLANTILLA,
          language: { code: IDIOMA_PLANTILLA },
          components: [{ type: "body", parameters: [{ type: "text", text: mensaje }] }],
        },
      }),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      return { enviado: false, motivo: `Meta respondió ${res.status}: ${detalle.slice(0, 300)}` };
    }
    return { enviado: true };
  } catch (err) {
    console.error("Error de red mandando WhatsApp de tenant:", err);
    return { enviado: false, motivo: "Error de red al contactar WhatsApp" };
  }
}

/**
 * Reúne los datos que hacen falta para armar el mensaje de una reparación
 * (nombre/teléfono del cliente vía el cliente `db` YA scopeado al tenant que
 * manda cada caller, nombre/credenciales del negocio vía el `prisma` base,
 * igual que ya hace avanzarEstadoAction para leer Tenant.cobrarEnDevolucion)
 * y hace el envío — compartido entre el aviso automático (silencioso) y el
 * manual/prueba (que sí necesita mostrarle el motivo al usuario). Nunca
 * lanza: cualquier fallo se regresa como {enviado:false, motivo}.
 */
async function prepararYEnviarWhatsappReparacion(params: {
  db: ReturnType<typeof getTenantPrisma>;
  tenantId: string;
  customerId: string;
  folio: string;
  publicToken: string;
  estadoTexto: string;
}): Promise<ResultadoWhatsappTenant> {
  try {
    const [tenant, customer] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: params.tenantId },
        select: { name: true, whatsappPhoneNumberId: true, whatsappAccessToken: true },
      }),
      params.db.customer.findUnique({
        where: { id: params.customerId },
        select: { name: true, phone: true, phoneCountryCode: true },
      }),
    ]);
    if (!tenant) return { enviado: false, motivo: "Negocio no encontrado" };
    if (!customer) return { enviado: false, motivo: "Cliente no encontrado" };
    if (!whatsappTenantConfigurado(tenant)) {
      return { enviado: false, motivo: "Este negocio no ha conectado WhatsApp Business todavía (Configuración → WhatsApp Business)" };
    }

    const telefono = telefonoWhatsapp(customer.phone, customer.phoneCountryCode);
    const primerNombre = customer.name.trim().split(/\s+/)[0] || customer.name;
    const mensaje = construirMensajeReparacion({
      negocio: tenant.name,
      clientePrimerNombre: primerNombre,
      folio: params.folio,
      estadoTexto: params.estadoTexto,
      urlSeguimiento: urlSeguimientoReparacion(params.publicToken),
    });

    return await enviarWhatsappTenant(tenant, telefono, mensaje);
  } catch (err) {
    console.error("Error inesperado armando/mandando WhatsApp de reparación:", err);
    return { enviado: false, motivo: "Error inesperado al mandar WhatsApp" };
  }
}

/**
 * Envío automático "mejor esfuerzo" para un evento real de una reparación
 * (creación o cambio de estatus) — usado por crearReparacionAction /
 * avanzarEstadoAction (reparaciones-actions.ts) y por la entrega vía POS
 * (pos-actions.ts). A diferencia de enviarWhatsappReparacionManual (abajo),
 * este SIEMPRE traga el resultado — si el negocio no conectó WhatsApp, si el
 * cliente no tiene teléfono, o si Meta responde con error, solo se loguea —
 * la reparación/venta ya se guardó de todas formas, esto es una
 * notificación de cortesía, jamás debe poder tumbar la operación real.
 */
export async function avisarWhatsappReparacion(params: {
  db: ReturnType<typeof getTenantPrisma>;
  tenantId: string;
  customerId: string;
  folio: string;
  publicToken: string;
  estadoTexto: string;
}): Promise<void> {
  const res = await prepararYEnviarWhatsappReparacion(params);
  if (!res.enviado) {
    console.warn(`WhatsApp automático no enviado (folio ${params.folio}): ${res.motivo}`);
  }
}

/**
 * Envío manual — botón "Avisar" en Reparaciones
 * (ReparacionesClient.tsx/marcarWhatsappEnviadoAction). A diferencia de
 * avisarWhatsappReparacion (arriba), aquí SÍ importa el resultado: el caller
 * solo debe marcar Repair.whatsappSent si realmente se mandó, y debe
 * mostrarle el motivo al usuario si no.
 */
export async function enviarWhatsappReparacionManual(params: {
  db: ReturnType<typeof getTenantPrisma>;
  tenantId: string;
  customerId: string;
  folio: string;
  publicToken: string;
  estadoTexto: string;
}): Promise<ResultadoWhatsappTenant> {
  return prepararYEnviarWhatsappReparacion(params);
}
