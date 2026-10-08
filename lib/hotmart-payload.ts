/**
 * Lectura tolerante del cuerpo de un webhook de Hotmart (versión 2.0.0).
 * Módulo PURO, probado aparte. Los nombres de campos se confirmaron por
 * fuentes de terceros, no con un evento real: por eso cada campo se lee con
 * alternativas y NUNCA lanza — lo que no se encuentra queda en null y el
 * webhook lo trata como "requiere revisión" en vez de adivinar.
 *
 * También arma un `resumen` SIN datos personales sensibles (sin teléfono,
 * dirección ni documentos del comprador) para guardarlo en HotmartEvent:
 * solo lo necesario para auditar y conciliar un cobro.
 */

export interface EventoHotmart {
  eventId: string | null; // `id` de nivel raíz (único por evento)
  evento: string; // PURCHASE_APPROVED, etc.
  version: string | null;
  transaccion: string | null;
  email: string | null; // en minúsculas
  nombreComprador: string | null;
  codigoSuscriptor: string | null;
  productId: string | null;
  nombreProducto: string | null;
  offerCode: string | null;
  proximoCobro: Date | null;
  precio: number | null;
  moneda: string | null;
  resumen: Record<string, unknown>;
}

function texto(v: unknown): string | null {
  if (typeof v === "string") {
    const s = v.trim();
    return s ? s : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** Hotmart manda fechas como milisegundos desde epoch. */
export function fechaDeHotmart(valor: unknown): Date | null {
  const n = typeof valor === "number" ? valor : typeof valor === "string" ? Number(valor) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function leerEvento(payload: unknown): EventoHotmart {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, any>;
  const data = (p.data && typeof p.data === "object" ? p.data : {}) as Record<string, any>;

  const email = (texto(data.buyer?.email) ?? texto(data.subscriber?.email))?.toLowerCase() ?? null;
  const precioN = Number(data.purchase?.price?.value);

  const ev: EventoHotmart = {
    eventId: texto(p.id),
    evento: texto(p.event) ?? "",
    version: texto(p.version),
    transaccion: texto(data.purchase?.transaction),
    email,
    nombreComprador: texto(data.buyer?.name) ?? texto(data.subscriber?.name),
    codigoSuscriptor: texto(data.subscription?.subscriber?.code) ?? texto(data.subscriber?.code),
    productId: texto(data.product?.id),
    nombreProducto: texto(data.product?.name),
    offerCode: texto(data.purchase?.offer?.code),
    proximoCobro: fechaDeHotmart(data.purchase?.date_next_charge) ?? fechaDeHotmart(data.date_next_charge),
    precio: Number.isFinite(precioN) ? precioN : null,
    moneda: texto(data.purchase?.price?.currency_value) ?? texto(data.purchase?.price?.currency_code),
    resumen: {},
  };

  ev.resumen = {
    evento: ev.evento,
    version: ev.version,
    transaccion: ev.transaccion,
    estadoCompra: texto(data.purchase?.status),
    producto: { id: ev.productId, nombre: ev.nombreProducto },
    oferta: ev.offerCode,
    plan: texto(data.subscription?.plan?.name),
    estadoSuscripcion: texto(data.subscription?.status),
    precio: ev.precio,
    moneda: ev.moneda,
    proximoCobro: ev.proximoCobro ? ev.proximoCobro.toISOString() : null,
    comprador: { email: ev.email, nombre: ev.nombreComprador },
    codigoSuscriptor: ev.codigoSuscriptor,
  };

  return ev;
}
