/**
 * Captura rápida de stock (2026-10-10, a petición de Carlos: "una lista en
 * columnas solo con la parte de stock editable... solo ir dando Enter hasta
 * terminar y al final darle guardar" — capturar el stock de 58 artículos
 * uno por uno en el modal le tomó casi una hora). Módulo PURO — sin React ni
 * Prisma — para poder probarlo aislado.
 *
 * Significado del número tecleado (decisión de Carlos): es el stock NUEVO
 * TOTAL de esa sucursal — reemplaza lo que había (mismo criterio que el
 * tipo "ajuste" de ajustarStock), no se suma.
 */

/** Tope razonable para un Int de stock; evita teclear de más sin querer. */
export const STOCK_MAXIMO = 1_000_000;

/** Máximo de productos por guardado en lote (el servidor lo revalida). */
export const MAX_CAMBIOS_LOTE = 500;

/** Deja solo dígitos (sin signo, decimales ni letras) y recorta al tope. */
export function limpiarEntradaStock(crudo: string): string {
  const soloDigitos = crudo.replace(/\D/g, "").slice(0, 7);
  if (soloDigitos === "") return "";
  const n = Number(soloDigitos);
  if (n > STOCK_MAXIMO) return String(STOCK_MAXIMO);
  // Sin ceros a la izquierda ("007" → "7"), pero "0" se conserva.
  return String(n);
}

export interface FilaStock {
  id: string;
  /** Stock actual en la sucursal que se está capturando. */
  stock: number;
}

export interface CambioStock {
  productId: string;
  stock: number;
}

/**
 * Filas cuyo valor tecleado difiere del stock actual. Un campo vacío o igual
 * al stock actual NO es un cambio (se deja intacto el producto).
 */
export function calcularCambiosStock(
  filas: FilaStock[],
  ediciones: Record<string, string>
): CambioStock[] {
  const cambios: CambioStock[] = [];
  for (const f of filas) {
    const crudo = ediciones[f.id];
    if (crudo === undefined || crudo === "") continue;
    const n = Number(crudo);
    if (!Number.isInteger(n) || n < 0 || n > STOCK_MAXIMO) continue;
    if (n === f.stock) continue;
    cambios.push({ productId: f.id, stock: n });
  }
  return cambios;
}
