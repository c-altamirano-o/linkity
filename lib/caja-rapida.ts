// Lógica pura de "Caja rápida" del POS (2026-10-09, a petición de Carlos:
// "tiendas con flujo de cliente continuo tipo supermercado ... que el dueño del
// tenant decida"). Sin "use client" NI "server-only": funciones puras, sin
// efectos, para poder probarlas aisladas — POSClient.tsx solo las llama.

/** Ventana (ms) tras agregar un artículo durante la que un Enter vacío se ignora:
 *  algunos lectores de código de barras mandan un Enter extra pegado al código. */
export const VENTANA_ANTI_DOBLE_ENTER_MS = 350;

export type DecisionEnterBuscador =
  | { tipo: "agregar" }                    // seguir con la lógica normal: buscar y agregar
  | { tipo: "ignorar" }                    // no hacer nada
  | { tipo: "aviso"; mensaje: string }     // no cobrar, pero decir por qué
  | { tipo: "cobrar" };

/**
 * Qué hace Enter dentro del buscador del POS.
 *  - Caja rápida APAGADA: siempre "agregar" (comportamiento de siempre).
 *  - Caja rápida ENCENDIDA y el buscador trae texto: "agregar".
 *  - Caja rápida ENCENDIDA y el buscador está vacío: cobra si se puede; si no,
 *    ignora o explica por qué (nunca cobra a ciegas).
 */
export function decidirEnterBuscador(p: {
  cajaRapida: boolean;
  busqueda: string;
  hayArticulos: boolean;
  msDesdeUltimoAgregado: number;
  cobrando: boolean;
  puedeCobrar: boolean;
  razonNoPuedeCobrar: string | null;
}): DecisionEnterBuscador {
  if (!p.cajaRapida || p.busqueda.trim() !== "") return { tipo: "agregar" };
  if (!p.hayArticulos) return { tipo: "ignorar" };
  if (p.msDesdeUltimoAgregado < VENTANA_ANTI_DOBLE_ENTER_MS) return { tipo: "ignorar" };
  if (p.cobrando) return { tipo: "aviso", mensaje: "Se está registrando la venta anterior; espera un instante." };
  if (!p.puedeCobrar) return p.razonNoPuedeCobrar ? { tipo: "aviso", mensaje: p.razonNoPuedeCobrar } : { tipo: "ignorar" };
  return { tipo: "cobrar" };
}

/** Busca por código de barras o SKU EXACTO (sin distinguir mayúsculas). */
export function buscarCodigoExacto<T extends { barcode?: string | null; sku?: string | null }>(
  productos: T[],
  consulta: string
): T | undefined {
  const q = consulta.trim().toLowerCase();
  if (!q) return undefined;
  return productos.find(
    (p) => (!!p.barcode && p.barcode.toLowerCase() === q) || (!!p.sku && p.sku.toLowerCase() === q)
  );
}

/**
 * Restaura una venta que NO se pudo cobrar: el carrito anterior más lo que el
 * cajero ya haya escaneado del cliente siguiente (se suman cantidades del mismo
 * artículo; nada se pierde).
 */
export function unirCarritos<T extends { productId: string; cantidad: number }>(previo: T[], actual: T[]): T[] {
  const unido = previo.map((x) => ({ ...x }));
  for (const it of actual) {
    const i = unido.findIndex((x) => x.productId === it.productId);
    if (i >= 0) unido[i] = { ...unido[i], cantidad: unido[i].cantidad + it.cantidad };
    else unido.push({ ...it });
  }
  return unido;
}
