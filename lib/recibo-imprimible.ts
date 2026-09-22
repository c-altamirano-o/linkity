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
 */

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

/** Mismo criterio que nombreNegocio() en ReparacionesClient.tsx — "bonito-ficado" a partir del slug porque este módulo no recibe el nombre real del tenant. Duplicado a propósito (mismo criterio que ya sigue el proyecto: ver el comentario de nombreNegocio ahí). */
export function nombreNegocioDeSlug(tenantSlug: string): string {
  return decodeURIComponent(tenantSlug).replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
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
}

export function abrirReciboImprimible(r: ReciboData, negocio: string) {
  if (typeof window === "undefined") return;

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

  const win = window.open("", "_blank", "width=420,height=720");
  if (!win) return; // bloqueador de pop-ups del navegador — el botón "Reimprimir" queda como respaldo manual

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
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>${negocio}</h1>
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
      <p class="aviso">¡Gracias por tu preferencia!</p>
    </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}
