/**
 * Piezas PURAS (sin base de datos) del alta automática de una cuenta cuando
 * Hotmart avisa de la primera compra de alguien que todavía no existe en
 * Linkity (2026-10-08). Probadas aparte en test/hotmart-alta-puro.test.ts.
 */

const MS_DIA = 24 * 60 * 60 * 1000;
export const DIAS_PRUEBA_HOTMART = 30;
export const DIAS_VIGENCIA_PAGO_POR_DEFECTO = 31;

export function correoPareceValido(correo: string | null | undefined): correo is string {
  const s = String(correo ?? "").trim();
  return s.length > 3 && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function primerNombre(nombreCompleto: string | null | undefined): string | null {
  const limpio = String(nombreCompleto ?? "")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .trim()
    .split(/\s+/)[0];
  return limpio ? limpio.slice(0, 30) : null;
}

/**
 * Nombre temporal del negocio: el checkout de Hotmart no pregunta cómo se
 * llama el negocio; el dueño lo escribe en su primer acceso. Mientras tanto
 * se usa "Negocio de <primer nombre>" (o de la parte local del correo).
 */
export function nombreProvisionalNegocio(nombreComprador: string | null | undefined, correo: string): string {
  const nombre = primerNombre(nombreComprador);
  if (nombre) return `Negocio de ${nombre}`;
  const local = primerNombre(correo.split("@")[0].replace(/[._+-]+/g, " "));
  return `Negocio de ${local ?? "cliente"}`;
}

/** Nombre del dueño para su usuario: el del comprador, o la parte local del correo. */
export function nombreDelDueno(nombreComprador: string | null | undefined, correo: string): string {
  const n = String(nombreComprador ?? "").trim().slice(0, 80);
  if (n) return n;
  return correo.split("@")[0].slice(0, 80) || "Dueño";
}

/**
 * Hasta cuándo vale la cuenta recién creada. Si Hotmart manda la fecha del
 * próximo cobro (en una prueba gratis es el día del primer cobro) se usa esa;
 * si no, 30 días cuando la compra es de $0 (prueba) o 31 cuando es un pago.
 */
export function vigenciaInicial(ev: { precio: number | null; proximoCobro: Date | null }, ahora: Date = new Date()): Date {
  if (ev.proximoCobro && ev.proximoCobro.getTime() > ahora.getTime()) return ev.proximoCobro;
  const dias = ev.precio === 0 ? DIAS_PRUEBA_HOTMART : DIAS_VIGENCIA_PAGO_POR_DEFECTO;
  return new Date(ahora.getTime() + dias * MS_DIA);
}

/** Una compra de $0 es el inicio de una prueba gratis con tarjeta. */
export function esInicioDePrueba(ev: { precio: number | null }): boolean {
  return ev.precio === 0;
}
