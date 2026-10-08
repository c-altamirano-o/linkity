/**
 * Forma "canónica" de un correo, para reconocer a la misma persona aunque
 * escriba su correo distinto (política de UNA prueba gratis por persona,
 * 2026-10-08). Módulo puro.
 *  - minúsculas y sin espacios;
 *  - se quita la etiqueta "+algo" de la parte local (nombre+1@x.com y
 *    nombre+tienda2@x.com son el mismo buzón en casi todos los proveedores);
 *  - Gmail (y googlemail.com) ignora los puntos: n.ombre@gmail.com = nombre@gmail.com.
 * No pretende ser infalible (alguien con dos buzones distintos de verdad
 * seguirá pudiendo registrarse dos veces); frena el abuso fácil, no el
 * determinado. Devuelve null si no parece un correo.
 */
export function canonizarCorreo(correo: string): string | null {
  const s = String(correo ?? "").normalize("NFKC").trim().toLowerCase();
  const arroba = s.lastIndexOf("@");
  if (arroba <= 0 || arroba === s.length - 1) return null;

  let local = s.slice(0, arroba);
  let dominio = s.slice(arroba + 1);

  const mas = local.indexOf("+");
  if (mas > 0) local = local.slice(0, mas);

  if (dominio === "googlemail.com") dominio = "gmail.com";
  if (dominio === "gmail.com") local = local.replace(/\./g, "");

  if (!local || !dominio) return null;
  return `${local}@${dominio}`;
}
