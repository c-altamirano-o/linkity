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
 *
 * 2026-09-26 (mismo día, segunda petición): `negocio.extra` (Tenant.reciboExtra)
 * es un cuadro de texto TOTALMENTE libre y sin tope de caracteres — a
 * propósito aparte de `mensajePie` (despedida corta, 200 caracteres) — para
 * "direcciones, promociones, un saludo, lo que sea". Va hasta el fondo del
 * ticket, después de todo lo demás (incluida la despedida), y respeta los
 * saltos de línea que el negocio haya escrito (white-space: pre-wrap) — es
 * el único bloque del ticket que lo necesita, porque es el único que puede
 * traer varias líneas de texto libre.
 *
 * 2026-09-26 (mismo día, tercera petición): "podemos hacerlo configurable.
 * Que el cliente seleccione el tipo de salida que quiera. Darle las
 * opciones mas comunes y que el formato se adapte según el seleccionado" —
 * hasta ahora el `<style>` de este ticket no traía ninguna regla `@page`,
 * así que imprimía en lo que el diálogo de impresión del navegador tuviera
 * configurado, sin ajustarse al ancho real de una impresora térmica.
 * `negocio.formato` (Tenant.reciboFormato) resuelve esto con 3 opciones —
 * ver FormatoTicket/estilosImpresionTicket abajo. Esta misma función la usa
 * TAMBIÉN abrirTicketImprimible en ReparacionesClient.tsx (el ticket de
 * RECEPCIÓN, con su propio HTML pero la MISMA impresora física del
 * negocio) — para que ambos tickets respeten el mismo formato sin que el
 * negocio tenga que configurarlo dos veces.
 */

import QRCode from "qrcode";

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

/** Mismo criterio que nombreNegocio() en ReparacionesClient.tsx — "bonito-ficado" a partir del slug porque este módulo no recibe el nombre real del tenant. Duplicado a propósito (mismo criterio que ya sigue el proyecto: ver el comentario de nombreNegocio ahí). */
export function nombreNegocioDeSlug(tenantSlug: string): string {
  return decodeURIComponent(tenantSlug).replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Tenant.reciboFormato — tipo local (no se importa el enum de
 * @prisma/client aquí) porque este módulo se importa desde Client
 * Components (POSClient.tsx, ReparacionesClient.tsx, AduanaClient.tsx) y
 * solo hace falta el TIPO, nunca el enum como valor en tiempo de ejecución
 * — mismo criterio que MetodoPago en pos-actions.ts. Los 3 valores son
 * literalmente los mismos strings que el enum ReciboFormato de
 * schema.prisma, así que un valor real de Prisma (leído en un Server
 * Component) encaja aquí sin conversión.
 */
export type FormatoTicket = "TERMICA_58" | "TERMICA_80" | "CARTA";

/**
 * Tenant.reciboQrDestino — mismo criterio que FormatoTicket arriba (unión de
 * strings, no el enum de Prisma, porque este módulo lo importan Client
 * Components: POSClient.tsx para decidir qué URL/etiqueta usar en el QR del
 * ticket de VENTA, y ConfiguracionClient.tsx para el selector de
 * Configuración). Ver el comentario largo en schema.prisma (2026-10-01, a
 * petición de Carlos: "sería opcional para ventas... que el cliente
 * decidiera si mostrar o no un QR y que eligiera qué se mostraría en él").
 * Nunca se usa para el QR de reparaciones (ese sigue fijo a
 * /rep/[publicToken], sin pasar por esta configuración).
 */
export type QrDestinoTicket = "CATALOGO" | "SITIO_WEB" | "PROMOCION" | "UBICACION" | "PERSONALIZADO";

/**
 * CSS que ajusta el ticket al formato de salida elegido (ver el comentario
 * largo arriba). Se inyecta al FINAL del bloque <style> de cada ticket
 * (después de las reglas base) para que gane por orden de aparición sobre
 * esas mismas reglas — nunca se listan aquí propiedades que no vayan a
 * pisar una regla base ya existente.
 *
 * TERMICA_58/TERMICA_80: @page fija el ancho real de papel de una
 * impresora térmica de rollo — así el navegador ya no deja que el usuario
 * tenga que adivinar/ajustar el tamaño de papel en el diálogo de impresión
 * cada vez. El resto de los tamaños (fuente, ancho de contenido, QR) se
 * reducen proporcionalmente porque las reglas base están pensadas para un
 * ticket de ~380px (~10cm) de ancho, más ancho que cualquiera de estos dos
 * rollos.
 *
 * CARTA (o `null`/sin configurar todavía, el default de todo tenant
 * existente): sin ninguna regla nueva — es exactamente el comportamiento de
 * SIEMPRE, se imprime en lo que el navegador tenga configurado (hoja
 * carta/A4, o "Guardar como PDF").
 */

/**
 * 2026-09-29, rediseño estético del ticket a petición de Carlos ("el ticket
 * que generamos se me hace burdo, quiero un diseño inovador pero funcional"),
 * a partir de 3 propuestas mostradas como mockup — eligió la B ("minimalista
 * con acento": header centrado, sin cajas de fondo, jerarquía tipográfica,
 * total grande con regla superior). Con una condición explícita: "la mayoria
 * usará el POS con impresora térmica de 5 u 8 mm así que sería
 * monocromática" (58mm/80mm) — por eso NINGÚN elemento depende de color para
 * comunicar algo: el "acento" del diseño es tipográfico/estructural (tamaño,
 * peso, espaciado, líneas negras) en vez de un color, así se ve exactamente
 * igual de bien en térmica monocromática que en CARTA. Se agregan además
 * `sucursal` y `atendioPor` a ReciboData (ver abajo) — ambos ya existían en
 * el modelo (Sale.branchId/userId, Repair.branchId + el usuario resuelto por
 * resolverActor), este cambio solo los hace llegar hasta el ticket.
 */
export function estilosImpresionTicket(formato: FormatoTicket | null | undefined): string {
  if (formato === "TERMICA_58") {
    return `
        @page { size: 58mm auto; margin: 2mm; }
        body { max-width: 50mm; font-size: 9.5px; padding: 0; }
        h1 { font-size: 11px; }
        .muted, th, td { font-size: 8.5px; }
        .total { font-size: 17px; }
        .qr svg { width: 64px; height: 64px; }
        .badge, .renglon-item { font-size: 8.5px; }
        .renglon-item .cant { font-size: 7.5px; }
      `;
  }
  if (formato === "TERMICA_80") {
    return `
        @page { size: 80mm auto; margin: 3mm; }
        body { max-width: 72mm; font-size: 11px; padding: 0; }
        h1 { font-size: 13px; }
        .muted, th, td { font-size: 10px; }
        .total { font-size: 19px; }
        .qr svg { width: 80px; height: 80px; }
        .badge, .renglon-item { font-size: 10px; }
        .renglon-item .cant { font-size: 9px; }
      `;
  }
  return "";
}

export interface DatosNegocioRecibo {
  nombre: string;
  logoUrl?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  rfc?: string | null;
  /** Tenant.reciboMensajePie — reemplaza "¡Gracias por tu preferencia!" cuando el negocio capturó uno propio en Configuración. */
  mensajePie?: string | null;
  /** Tenant.reciboExtra — texto libre y sin tope de caracteres, hasta el fondo del ticket (direcciones, promociones, saludo, lo que el negocio quiera). Ver el comentario largo arriba. */
  extra?: string | null;
  /** Tenant.reciboFormato — TERMICA_58 / TERMICA_80 / CARTA. Ver FormatoTicket/estilosImpresionTicket arriba. */
  formato?: FormatoTicket | null;
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
  /** Nombre de la sucursal donde se hizo esta venta/entrega (Branch.name) — null si no se resolvió (ej. tenant sin sucursales configuradas). */
  sucursal?: string | null;
  /** Nombre de quién atendió (User.name — la cuenta de atribución, sea dueño con cuenta real o empleado con PIN, ver Staff.userId en schema.prisma) — null si no se resolvió. */
  atendioPor?: string | null;
  renglones: ReciboRenglon[];
  subtotal: number;
  iva: number;
  /** Monto total descontado de esta venta (Discount, 2026-09-30) — ya está
   *  restado de `subtotal`/`iva`/`total` (esos tres son los que de verdad
   *  se cobraron); este campo es solo para mostrar la línea informativa
   *  "Descuento" en el ticket. Se omite esa línea si viene null/0. */
  descuento?: number | null;
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
  // Esta función sigue sin saber nada de si el QR es "apagable" o no —
  // dibuja el QR si y solo si el caller le mandó `qrUrl` (ver el comentario
  // largo en Tenant.reciboMostrarQR, schema.prisma: esa decisión vive en
  // POSClient.tsx, antes de construir ReciboData, no aquí).
  const qrSvg = r.qrUrl
    ? await QRCode.toString(r.qrUrl, { type: "svg", margin: 0, width: 96 }).catch(() => null)
    : null;

  // Renglones: ya no es una <table> (era la única pieza del diseño viejo
  // que forzaba columnas fijas) — cada renglón es una fila flex
  // (.renglon-item) con el nombre + cantidad a la izquierda y el importe a
  // la derecha, alineado por `justify-content: space-between` renglón por
  // renglón, así que el resultado se ve igual de ordenado que una tabla sin
  // depender de <table>/<th>/<td> (que este ticket ya no usa — siguen
  // soportados por estilosImpresionTicket solo porque el ticket de
  // RECEPCIÓN, en ReparacionesClient.tsx, todavía los usa).
  const filas = r.renglones
    .map(
      (l) => `
        <div class="renglon-item">
          <span>${l.nombre}${l.cantidad !== 1 ? `<span class="cant"> ×${l.cantidad}</span>` : ""}</span>
          <span>${formatMXN(l.precioUnitario * l.cantidad)}</span>
        </div>`
    )
    .join("");

  // Sucursal/atendió: la misma "badge" (recuadro con borde, sin relleno de
  // color — ver el comentario largo arriba sobre monocromía) se reutiliza
  // para cualquiera de los dos que venga; ninguno es obligatorio (un tenant
  // de una sola sucursal, o una acción sin actor resuelto, simplemente no
  // agrega su badge, igual que negocio.direccion/telefono de siempre).
  //
  // Total de piezas — 2026-09-29, sugerencia aceptada por Carlos tras el
  // rediseño ("Cantidad total de piezas... útil para que el cliente cuadre
  // rápido cuántos artículos se llevó"). Solo aparece con 2+ renglones
  // distintos: con uno solo, la cantidad ya es obvia en ese mismo renglón
  // (o ni se muestra, si es 1 — ver `filas` arriba), así que un badge extra
  // ahí sería ruido, no información nueva.
  const totalPiezas = r.renglones.reduce((s, l) => s + l.cantidad, 0);
  const badges = [
    r.sucursal ? `<span class="badge">Sucursal: ${r.sucursal}</span>` : "",
    r.atendioPor ? `<span class="badge">Atendió: ${r.atendioPor}</span>` : "",
    r.renglones.length > 1 ? `<span class="badge">${totalPiezas} artículo${totalPiezas !== 1 ? "s" : ""}</span>` : "",
  ]
    .filter(Boolean)
    .join("");

  win.document.write(`
    <!DOCTYPE html>
    <html lang="es-MX">
    <head>
      <meta charset="utf-8" />
      <title>${r.tipoDocumento} ${r.folio}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; padding: 20px; color: #111827; font-size: 13px; max-width: 380px; margin: 0 auto; text-align: center; }
        h1 { font-size: 16px; margin: 0; font-weight: 800; letter-spacing: .03em; text-transform: uppercase; }
        .muted { color: #6b7280; font-size: 11px; margin: 0; }
        hr { border: none; border-top: 1px dashed #9ca3af; margin: 10px 0; }
        p { margin: 4px 0; }
        /* th/td siguen aquí SOLO por el ticket de recepción compartido
           (abrirTicketImprimible, ReparacionesClient.tsx) — este ticket ya
           no genera ninguna <table>. */
        th, td { padding: 4px 2px; font-size: 11.5px; border-bottom: 1px solid #f3f4f6; }
        th { text-align: left; color: #6b7280; font-weight: 600; }
        .renglon { display: flex; justify-content: space-between; text-align: left; }
        .renglon-item { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; text-align: left; padding: 4px 0; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
        .renglon-item .cant { color: #9ca3af; font-size: 10px; }
        .total-envoltura { margin-top: 10px; padding-top: 10px; border-top: 2px solid #111827; }
        .total-envoltura .etiqueta { font-size: 9.5px; text-transform: uppercase; letter-spacing: .1em; color: #6b7280; }
        .total { font-size: 22px; font-weight: 800; margin: 2px 0 0; }
        .aviso { margin-top: 14px; font-size: 10.5px; color: #4b5563; border-top: 1px dashed #9ca3af; padding-top: 8px; text-align: center; }
        .extra { margin-top: 10px; font-size: 11px; color: #374151; white-space: pre-wrap; text-align: center; }
        .encabezado { display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .encabezado img { width: 80px; height: 80px; object-fit: contain; border-radius: 12px; }
        .barra { width: 42px; height: 2px; background: #111827; margin: 10px auto; }
        .badges { display: flex; justify-content: center; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
        .badge { border: 1px solid #9ca3af; border-radius: 999px; padding: 2px 9px; font-size: 10px; color: #374151; }
        .cliente { font-size: 11.5px; }
        .qr { margin-top: 14px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .qr svg { width: 96px; height: 96px; }
        @media print { body { padding: 0; } }
        ${estilosImpresionTicket(negocio.formato)}
      </style>
    </head>
    <body>
      <div class="encabezado">
        ${negocio.logoUrl ? `<img src="${negocio.logoUrl}" alt="" />` : ""}
        <h1>${negocio.nombre}</h1>
        ${negocio.direccion ? `<p class="muted">${negocio.direccion}</p>` : ""}
        ${negocio.telefono || negocio.rfc
          ? `<p class="muted">${[negocio.telefono, negocio.rfc ? `RFC: ${negocio.rfc}` : null].filter(Boolean).join(" · ")}</p>`
          : ""
        }
      </div>
      <div class="barra"></div>
      <p class="muted">${r.tipoDocumento} · ${r.folio}</p>
      <p class="muted">${new Date().toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })}</p>
      ${badges ? `<div class="badges">${badges}</div>` : ""}
      ${r.cliente ? `<p class="cliente"><strong>Cliente:</strong> ${r.cliente}${r.telefono ? ` · ${r.telefono}` : ""}</p>` : ""}
      <hr />
      ${filas}
      <div class="renglon" style="margin-top:6px;"><span class="muted">Subtotal</span><span class="muted">${formatMXN(r.subtotal)}</span></div>
      <div class="renglon"><span class="muted">IVA</span><span class="muted">${formatMXN(r.iva)}</span></div>
      ${r.descuento != null && r.descuento > 0 ? `<div class="renglon"><span class="muted">Descuento</span><span class="muted">-${formatMXN(r.descuento)}</span></div>` : ""}
      <div class="total-envoltura">
        <div class="etiqueta">Total</div>
        <p class="total">${formatMXN(r.total)}</p>
      </div>
      <hr />
      <div class="renglon"><span>Método de pago</span><span>${r.metodoPago}</span></div>
      ${r.montoRecibido != null ? `<div class="renglon"><span class="muted">Recibido</span><span class="muted">${formatMXN(r.montoRecibido)}</span></div>` : ""}
      ${r.cambio != null && r.cambio > 0 ? `<div class="renglon"><strong>Cambio</strong><strong>${formatMXN(r.cambio)}</strong></div>` : ""}
      ${r.notaPie ? `<p class="aviso">${r.notaPie}</p>` : ""}
      ${qrSvg ? `<div class="qr">${qrSvg}${r.qrEtiqueta ? `<p class="muted">${r.qrEtiqueta}</p>` : ""}</div>` : ""}
      <p class="aviso">${negocio.mensajePie?.trim() || "¡Gracias por tu preferencia!"}</p>
      ${negocio.extra?.trim() ? `<p class="extra">${negocio.extra.trim()}</p>` : ""}
    </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}
