/**
 * Recibo de pago imprimible, genérico (2026-09-21, a petición de Carlos:
 * "Al cobrar en el punto de venta, solo guarda la venta, no genera un
 * ticket. Es imprescindible que toda venta genere un ticket, ya sea de una
 * reparación, articulo o servicio").
 *
 * Antes de esto, el único ticket imprimible de todo el proyecto era el de
 * RECEPCIÓN de una reparación (abrirTicketImprimible en
 * ReparacionesClient.tsx, con el costo ESTIMADO) — no existía ningún
 * comprobante para el pago real: ni el cobro final de una reparación
 * (cobrarYEntregarAction) ni ninguna venta del Punto de Venta (POS,
 * crearVentaAction) generaban nada entregable al cliente.
 *
 * Este archivo es a propósito uno nuevo y genérico (no una modificación del
 * ticket de recepción, que tiene su propio formato — costo estimado, falla
 * reportada, firma de conformidad, sin desglose de IVA porque en ese punto
 * ni siquiera se ha cobrado nada) para cubrir el caso distinto: un COBRO ya
 * consumado, con lo que de verdad se pagó (monto, método, cambio si aplica)
 * — el mismo formato sirve igual para una venta de POS (artículos/servicios)
 * que para el cobro final de una reparación entregada, que es exactamente lo
 * que pidió Carlos ("ya sea de una reparación, articulo o servicio").
 *
 * Mismo criterio que el ticket de recepción: se abre en una ventana aparte
 * con su propio HTML/CSS mínimo (no pelea con el tema oscuro de la app) y
 * llama a print() de una vez — funciona igual sin importar el navegador. No
 * es un CFDI/factura fiscal.
 *
 * 2026-09-26, a petición de Carlos ("¿existe un apartado para personalizar
 * el ticket?"): hasta ahora `negocio` era un string plano, siempre
 * nombreNegocioDeSlug(tenantSlug) — un nombre "bonito-ficado" a partir de la
 * URL, nunca el nombre real capturado en Configuración, y sin logo,
 * dirección, teléfono ni RFC (Tenant ya tenía esos campos, solo no se
 * usaban aquí). Ahora `negocio` es DatosNegocioRecibo: cada dato se imprime
 * solo si el negocio ya lo capturó (mismo criterio que `cliente`/`telefono`
 * de abajo, que tampoco se imprimen si vienen null) — así ningún ticket
 * existente cambia de aspecto para un negocio que no llenó nada nuevo en
 * Configuración. `nombreNegocioDeSlug` se conserva (no se borra) porque
 * sigue siendo el único dato disponible en contextos que hoy no traen el
 * Tenant completo — pero ya no es el camino recomendado para construir un
 * ReciboData nuevo.
 *
 * También se agrega qrUrl/qrEtiqueta (opcional): mismo mecanismo que ya
 * usaba abrirTicketImprimible (QRCode.toString → SVG inline) para el ticket
 * de RECEPCIÓN de una reparación — aquí es genérico porque el destino del
 * QR depende del renglón que se está cobrando, lo decide cada caller:
 * `/rep/<publicToken>` para el cobro/entrega de una reparación (misma
 * página pública de seguimiento de siempre), o `/pub/<tenantSlug>` — la
 * nueva página pública de catálogo + sucursales — para una venta de
 * artículo/servicio del catálogo. Por eso abrirReciboImprimible ahora es
 * async (igual que abrirTicketImprimible): la ventana se sigue abriendo
 * SÍNCRONA, en la misma línea, antes de cualquier await, para no arriesgar
 * el bloqueador de pop-ups — el contenido (incluido el QR) se escribe
 * después, cuando la promesa de QRCode.toString ya se resolvió.
 */

import QRCode from "qrcode";

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

/** Mismo criterio que nombreNegocio() en ReparacionesClient.tsx — "bonito-ficado" a partir del slug porque este módulo no recibe el nombre real del tenant. Duplicado a propósito (mismo criterio que ya sigue el proyecto: ver el comentario de nombreNegocio ahí). */
export function nombreNegocioDeSlug(tenantSlug: string): string {
  return decodeURIComponent(tenantSlug).replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

export interface DatosNegocioRecibo {
  nombre: string;
  logoUrl?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  rfc?: string | null;
  /** Tenant.reciboMensajePie — reemplaza "¡Gracias por tu preferencia!" cuando el negocio capturó uno propio en Configuración. */
  mensajePie?: string | null;
}

export interface ReciboRenglon {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
}

export interface ReciboData {
  /** Ej. "Venta" o "Reparación". Encabezado del tipo de comprobante. */
  tipoDocumento: string;
  folio: string;
  cliente: string | null;
  telefono: string | null;
  renglones: ReciboRenglon[];
  subtotal: number;
  iva: number;
  total: number;
  /** Texto ya formateado para mostrar (ej. "Efectivo", "Tarjeta", "Efectivo + Tarjeta"). */
  metodoPago: string;
  /** Solo si el método incluyó efectivo y hubo cambio que dar. */
  montoRecibido?: number | null;
  cambio?: number | null;
  /** Nota libre al pie, ej. detalle extra o agradecimiento. */
  notaPie?: string | null;
  /** URL a codificar en el QR del pie del ticket — cada caller decide el destino (ver el comentario largo arriba). Se omite el bloque de QR por completo si no se manda o si QRCode.toString falla. */
  qrUrl?: string | null;
  /** Texto bajo el QR — ignorado si qrUrl no viene. */
  qrEtiqueta?: string;
}

export async function abrirReciboImprimible(r: ReciboData, negocio: DatosNegocioRecibo) {
  if (typeof window === "undefined") return;

  const win = window.open("", "_blank", "width=420,height=720");
  if (!win) return; // bloqueador de pop-ups del navegador — el botón "Reimprimir" queda como respaldo manual

  // margin:0 — el propio contenedor .qr del HTML ya le da espacio en
  // blanco alrededor; un margen extra de la librería solo lo duplicaría.
  const qrSvg = r.qrUrl
    ? await QRCode.toString(r.qrUrl, { type: "svg", margin: 0, width: 96 }).catch(() => null)
    : null;

  const filas = r.renglones
    .map(
      (l) => `
        <tr>
          <td>${l.nombre}</td>
          <td style="text-align:center">${l.cantidad}</td>
          <td style="text-align:right">${formatMXN(l.precioUnitario)}</td>
          <td style="text-align:right">${formatMXN(l.precioUnitario * l.cantidad)}</td>
        </tr>`
    )
    .join("");

  win.document.write(`
    <!DOCTYPE html>
    <html lang="es-MX">
    <head>
      <meta charset="utf-8" />
      <title>${r.tipoDocumento} ${r.folio}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; padding: 20px; color: #111827; font-size: 13px; max-width: 380px; margin: 0 auto; }
        h1 { font-size: 16px; margin: 0 0 2px; }
        .muted { color: #6b7280; font-size: 11px; margin: 0; }
        hr { border: none; border-top: 1px dashed #9ca3af; margin: 10px 0; }
        p { margin: 4px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 6px; }
        th, td { padding: 4px 2px; font-size: 11.5px; border-bottom: 1px solid #f3f4f6; }
        th { text-align: left; color: #6b7280; font-weight: 600; }
        .renglon { display: flex; justify-content: space-between; }
        .total { font-size: 15px; font-weight: bold; text-align: right; margin-top: 8px; }
        .aviso { margin-top: 14px; font-size: 10.5px; color: #4b5563; border-top: 1px dashed #9ca3af; padding-top: 8px; text-align: center; }
        .encabezado { display: flex; align-items: center; gap: 8px; }
        .encabezado img { width: 40px; height: 40px; object-fit: contain; border-radius: 6px; flex-shrink: 0; }
        .qr { margin-top: 14px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .qr svg { width: 96px; height: 96px; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="encabezado">
        ${negocio.logoUrl ? `<img src="${negocio.logoUrl}" alt="" />` : ""}
        <div>
          <h1>${negocio.nombre}</h1>
          ${negocio.direccion ? `<p class="muted">${negocio.direccion}</p>` : ""}
          ${negocio.telefono || negocio.rfc
            ? `<p class="muted">${[negocio.telefono, negocio.rfc ? `RFC: ${negocio.rfc}` : null].filter(Boolean).join(" · ")}</p>`
            : ""
          }
        </div>
      </div>
      <p class="muted">${r.tipoDocumento} · ${r.folio}</p>
      <p class="muted">${new Date().toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })}</p>
      <hr />
      ${r.cliente ? `<p><strong>Cliente:</strong> ${r.cliente}${r.telefono ? ` · ${r.telefono}` : ""}</p>` : ""}
      ${r.renglones.length > 0
        ? `<table>
        <thead><tr><th>Concepto</th><th style="text-align:center">Cant.</th><th style="text-align:right">P. Unit.</th><th style="text-align:right">Subtotal</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>`
        : ""
      }
      <hr />
      <div class="renglon"><span class="muted">Subtotal</span><span class="muted">${formatMXN(r.subtotal)}</span></div>
      <div class="renglon"><span class="muted">IVA</span><span class="muted">${formatMXN(r.iva)}</span></div>
      <p class="total">Total: ${formatMXN(r.total)}</p>
      <hr />
      <div class="renglon"><span>Método de pago</span><span>${r.metodoPago}</span></div>
      ${r.montoRecibido != null ? `<div class="renglon"><span class="muted">Recibido</span><span class="muted">${formatMXN(r.montoRecibido)}</span></div>` : ""}
      ${r.cambio != null && r.cambio > 0 ? `<div class="renglon"><strong>Cambio</strong><strong>${formatMXN(r.cambio)}</strong></div>` : ""}
      ${r.notaPie ? `<p class="aviso">${r.notaPie}</p>` : ""}
      ${qrSvg ? `<div class="qr">${qrSvg}${r.qrEtiqueta ? `<p class="muted">${r.qrEtiqueta}</p>` : ""}</div>` : ""}
      <p class="aviso">${negocio.mensajePie?.trim() || "¡Gracias por tu preferencia!"}</p>
    </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}
