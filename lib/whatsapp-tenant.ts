import "server-only";
import { prisma, getTenantPrisma } from "@/lib/prisma";
import { telefonoWhatsapp } from "@/lib/paises";
import { construirMensajeReparacion } from "@/lib/whatsapp-mensaje";
import { crearNotificacionWhatsappFallido } from "@/lib/notificaciones";

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
 * Meta solo aprueba la forma UNA vez y el contenido real lo arma
 * construirMensajeReparacion() (lib/whatsapp-mensaje.ts). Mientras esa
 * plantilla no exista o no esté aprobada para un tenant, Meta responderá
 * con error — se regresa tal cual en ResultadoWhatsappTenant.motivo para
 * que se vea en Configuración (botón "Enviar prueba") en vez de fallar en
 * silencio.
 *
 * 2026-10-02: este archivo sigue siendo SOLO el modo API. Desde esta fecha
 * existe un segundo modo, MANUAL (Tenant.whatsappNumeroManual) — un simple
 * enlace "wa.me/..." sin ninguna API ni verificación de Meta, para los
 * negocios que no quieren/pueden pasar por ese trámite. Ver el comentario
 * junto al campo en schema.prisma y lib/whatsapp-mensaje.ts
 * (whatsappModoActivo, construirMensajeReparacion — compartido entre los
 * dos modos a propósito) para la arquitectura completa. Este archivo
 * (whatsapp-tenant.ts) sigue teniendo "server-only" porque SÍ toca el
 * access token real; el modo MANUAL nunca necesita tocar este archivo desde
 * el cliente, por eso vive en un archivo aparte sin esa restricción.
 */

const NOMBRE_PLANTILLA = "actualizacion_reparacion_linkity";
const IDIOMA_PLANTILLA = "es_MX";

export interface ResultadoWhatsappTenant {
  enviado: boolean;
  motivo?: string;
}

export interface DatosWhatsappTenant {
  id: string;
  whatsappPhoneNumberId: string | null;
  whatsappAccessToken: string | null;
}

/**
 * Visibilidad REAL de entrega (2026-10-05, a petición de Carlos: "el SaaS
 * dice que se envió pero al número no le llega nada... necesito ver a
 * dónde se mandó ese mensaje o por qué da el falso positivo"). Hasta este
 * cambio, un 200 de la API de Meta se traducía directo a
 * `{ enviado: true }` — técnicamente correcto (Meta sí aceptó el mensaje en
 * su cola) pero engañoso en la práctica, porque Meta nunca confirma la
 * entrega real en esa misma respuesta: lo hace después, de forma asíncrona,
 * vía webhook (ver app/api/webhooks/whatsapp/route.ts).
 *
 * Esta versión agrega dos cosas:
 *
 * 1) Correlación: cada envío exitoso guarda una fila en
 *    WhatsappMensajeEnviado (wamid + contexto + el mensaje exacto) para que,
 *    cuando el webhook reciba el estado real, se pueda saber de qué se
 *    trataba y a quién avisar si falló.
 *
 * 2) El problema de México investigado con Carlos: algunas cuentas de
 *    WhatsApp registradas antes de agosto 2019 todavía esperan el "1" extra
 *    después del 52 (formato "521XXXXXXXXXX"), mientras que las demás usan
 *    el formato vigente desde entonces (formato "52XXXXXXXXXX", el que ya
 *    arma telefonoWhatsapp() en lib/paises.ts). Investigación confirmó que
 *    Meta NO ofrece ninguna forma confiable de consultar por adelantado cuál
 *    le corresponde a un número — así que en vez de adivinar, el sistema:
 *    intenta primero el formato vigente, y si YA se confirmó antes (por una
 *    entrega real de un envío anterior) qué formato funciona con ese cliente
 *    en particular, usa ese directo (ver WhatsappNumeroConfirmado). Si Meta
 *    reporta que el primer intento falló, procesarEstadoWhatsapp (abajo)
 *    dispara un único reintento automático con el otro formato — nadie,
 *    ni Carlos ni el dueño del negocio, tiene que adivinar ni configurar
 *    nada a mano.
 */

function esNumeroMexicano(digitos: string): boolean {
  return digitos.startsWith("52");
}

/** Los últimos 10 dígitos — el número LOCAL mexicano nunca cambia entre
 * formatos, solo cambia el prefijo de país antepuesto. */
function telefonoNormalizadoMx(digitos: string): string {
  return digitos.slice(-10);
}

/** Formato vigente desde agosto 2019 (sin el "1" extra) — primera opción
 * para cualquier cliente del que todavía no se sepa nada. */
function formatoPredeterminadoMx(normalizado: string): string {
  return `52${normalizado}`;
}

/** Formato legado, el que aún esperan algunas cuentas registradas antes del
 * cambio de 2019. */
function formatoAlternoMx(normalizado: string): string {
  return `521${normalizado}`;
}

/** Solo para decidir si mostrar "conectado"/"sin conectar" en la UI — nunca expone el token. */
export function whatsappTenantConfigurado(tenant: DatosWhatsappTenant): boolean {
  return Boolean(tenant.whatsappPhoneNumberId && tenant.whatsappAccessToken);
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
  mensaje: string,
  contexto: string,
  opciones?: {
    // Usado SOLO por reintentarWhatsappFormatoAlternoMx (abajo): fuerza el
    // número exacto a mandar (el formato alterno), sin volver a consultar
    // WhatsappNumeroConfirmado ni recalcular nada.
    telefonoForzado?: string;
    // Id del WhatsappMensajeEnviado original cuando este envío es un
    // reintento automático — se guarda en la fila nueva para que
    // procesarEstadoWhatsapp sepa que ya no debe reintentar de nuevo.
    reintentoDeId?: string;
  }
): Promise<ResultadoWhatsappTenant> {
  if (!tenant.whatsappPhoneNumberId || !tenant.whatsappAccessToken) {
    return { enviado: false, motivo: "Este negocio no ha conectado WhatsApp Business todavía (Configuración → WhatsApp Business)" };
  }
  if (!telefonoDestino) {
    return { enviado: false, motivo: "El cliente no tiene teléfono registrado" };
  }

  const digitos = telefonoDestino.replace(/\D/g, "");
  if (!digitos) {
    return { enviado: false, motivo: "El cliente no tiene teléfono registrado" };
  }
  const normalizado = telefonoNormalizadoMx(digitos);

  let telefonoAEnviar = digitos;
  if (opciones?.telefonoForzado) {
    telefonoAEnviar = opciones.telefonoForzado;
  } else if (esNumeroMexicano(digitos)) {
    // ¿Ya sabemos, por un envío anterior de verdad entregado/leído, qué
    // formato funciona con este cliente? Si sí, se usa directo — ya no hay
    // nada que adivinar para él.
    try {
      const confirmado = await prisma.whatsappNumeroConfirmado.findUnique({
        where: { tenantId_telefonoNormalizado: { tenantId: tenant.id, telefonoNormalizado: normalizado } },
      });
      telefonoAEnviar = confirmado?.telefonoConfirmado ?? formatoPredeterminadoMx(normalizado);
    } catch (err) {
      console.error("No se pudo consultar el formato de WhatsApp confirmado (se usa el predeterminado):", err);
      telefonoAEnviar = formatoPredeterminadoMx(normalizado);
    }
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${tenant.whatsappPhoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tenant.whatsappAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telefonoAEnviar,
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

    // Esto SOLO confirma que Meta aceptó el mensaje en su cola — nunca que
    // se entregó de verdad (ver el comentario largo arriba). Se guarda la
    // correlación para que, cuando llegue el estado real por el webhook,
    // se sepa de qué se trataba. Mejor esfuerzo a propósito: si esto falla,
    // el mensaje YA se mandó, no se le hace fallar al caller por esto.
    try {
      const cuerpo = await res.json().catch(() => null);
      const wamid = cuerpo?.messages?.[0]?.id;
      if (wamid) {
        await prisma.whatsappMensajeEnviado.create({
          data: {
            tenantId: tenant.id,
            wamid,
            telefonoNormalizado: normalizado,
            telefonoEnviado: telefonoAEnviar,
            contexto,
            mensajeTexto: mensaje,
            reintentoDeId: opciones?.reintentoDeId ?? null,
          },
        });
      }
    } catch (err) {
      console.error("No se pudo guardar la correlación de WhatsApp enviado (el mensaje sí se mandó):", err);
    }

    return { enviado: true };
  } catch (err) {
    console.error("Error de red mandando WhatsApp de tenant:", err);
    return { enviado: false, motivo: "Error de red al contactar WhatsApp" };
  }
}

/**
 * Se llama desde el webhook (app/api/webhooks/whatsapp/route.ts) cuando
 * Meta reporta `status: failed` para un mensaje del formato predeterminado
 * (sin el "1" extra) que todavía no se ha reintentado — intenta UNA vez más
 * con el formato alterno, reusando el mismo texto ya guardado. Null si no
 * aplica (no es un número mexicano, ya era un reintento, o no se encontró
 * el mensaje original).
 */
export async function reintentarWhatsappFormatoAlternoMx(mensajeOriginalId: string): Promise<ResultadoWhatsappTenant | null> {
  const original = await prisma.whatsappMensajeEnviado.findUnique({ where: { id: mensajeOriginalId } });
  if (!original) return null;
  if (original.reintentoDeId) return null; // ya era un reintento — no se encadena un tercer intento
  if (!esNumeroMexicano(original.telefonoEnviado)) return null; // la ambigüedad 52/521 es solo de México

  const yaReintentado = await prisma.whatsappMensajeEnviado.findFirst({ where: { reintentoDeId: original.id } });
  if (yaReintentado) return null; // el webhook de Meta puede repetir el mismo evento — evita duplicar el reintento

  const alterno =
    original.telefonoEnviado === formatoPredeterminadoMx(original.telefonoNormalizado)
      ? formatoAlternoMx(original.telefonoNormalizado)
      : formatoPredeterminadoMx(original.telefonoNormalizado);

  const tenant = await prisma.tenant.findUnique({
    where: { id: original.tenantId },
    select: { id: true, whatsappPhoneNumberId: true, whatsappAccessToken: true },
  });
  if (!tenant) return null;

  return enviarWhatsappTenant(tenant, alterno, original.mensajeTexto, `${original.contexto} (reintento automático con otro formato de número)`, {
    telefonoForzado: alterno,
    reintentoDeId: original.id,
  });
}

/**
 * Se llama desde el webhook por cada entrada `statuses[]` que manda Meta —
 * es la única fuente de verdad sobre si un mensaje de verdad se entregó, se
 * leyó, o falló (ver el comentario largo junto a enviarWhatsappTenant).
 * Mensajes sin fila de correlación (mandados antes de este cambio, o cuya
 * creación de WhatsappMensajeEnviado falló silenciosamente) se ignoran —
 * no hay nada que hacer con ellos.
 */
export async function procesarEstadoWhatsapp(params: {
  wamid: string;
  status: "sent" | "delivered" | "read" | "played" | "failed";
  errorDetalle?: string;
}): Promise<void> {
  const mensaje = await prisma.whatsappMensajeEnviado.findUnique({ where: { wamid: params.wamid } });
  if (!mensaje) return;

  if (params.status === "delivered" || params.status === "read") {
    // Confirmado de verdad: se "recuerda" este formato para este cliente,
    // así el siguiente envío ya no tiene que adivinar ni esperar un
    // reintento.
    try {
      await prisma.whatsappNumeroConfirmado.upsert({
        where: { tenantId_telefonoNormalizado: { tenantId: mensaje.tenantId, telefonoNormalizado: mensaje.telefonoNormalizado } },
        create: { tenantId: mensaje.tenantId, telefonoNormalizado: mensaje.telefonoNormalizado, telefonoConfirmado: mensaje.telefonoEnviado },
        update: { telefonoConfirmado: mensaje.telefonoEnviado, confirmadoEn: new Date() },
      });
    } catch (err) {
      console.error("No se pudo guardar el formato de WhatsApp confirmado:", err);
    }
    return;
  }

  if (params.status === "failed") {
    if (!mensaje.reintentoDeId) {
      const reintento = await reintentarWhatsappFormatoAlternoMx(mensaje.id).catch((err) => {
        console.error("Error reintentando WhatsApp con el formato alterno:", err);
        return null;
      });
      // Se mandó el reintento — se espera su propio estado por separado,
      // no se avisa todavía (evita un falso "falló" mientras el reintento
      // sigue en curso).
      if (reintento?.enviado) return;
    }

    // Ya no hay nada más que intentar (era un reintento, no es México, o el
    // reintento mismo no se pudo mandar) — aquí sí se avisa de verdad, con
    // el motivo real de Meta en vez del falso positivo de siempre.
    await crearNotificacionWhatsappFallido({
      tenantId: mensaje.tenantId,
      contexto: mensaje.contexto,
      telefono: mensaje.telefonoEnviado,
      motivo: params.errorDetalle ?? "Meta reportó un fallo de entrega sin más detalle",
    }).catch((err) => console.error("No se pudo crear la notificación de WhatsApp fallido:", err));
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
        select: { id: true, name: true, whatsappPhoneNumberId: true, whatsappAccessToken: true },
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

    return await enviarWhatsappTenant(tenant, telefono, mensaje, `Reparación folio ${params.folio}`);
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
