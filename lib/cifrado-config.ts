import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifrado de los secretos de la configuración de la plataforma (token de
 * acceso y secreto de la app de WhatsApp, etc.) antes de guardarlos en la base
 * de datos — 2026-10-08. AES-256-GCM (cifrado autenticado: además de ocultar,
 * detecta si alguien alteró el valor guardado).
 *
 * La llave NO puede vivir en la misma base que protege, así que es lo único
 * que se queda en una variable de entorno: CONFIG_ENCRYPTION_KEY, 32 bytes en
 * base64 (o 64 caracteres hexadecimales). Se genera UNA vez:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * y NO se debe cambiar después: lo ya guardado quedaría ilegible (habría que
 * volver a capturar los secretos en Panel Maestro).
 *
 * Módulo sin dependencias de servidor a propósito (se puede probar solo).
 * Formato guardado: "v1.<iv>.<tag>.<texto cifrado>", todo en base64.
 */

export function leerLlaveCifrado(valor: string | undefined = process.env.CONFIG_ENCRYPTION_KEY): Buffer | null {
  const v = valor?.trim();
  if (!v) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(v) ? Buffer.from(v, "hex") : Buffer.from(v, "base64");
  return buf.length === 32 ? buf : null;
}

export function cifradoDisponible(): boolean {
  return leerLlaveCifrado() !== null;
}

export function cifrar(texto: string, llave: Buffer | null = leerLlaveCifrado()): string {
  if (!llave) throw new Error("CONFIG_ENCRYPTION_KEY no está configurada o no es válida (debe ser de 32 bytes)");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", llave, iv);
  const cifrado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), cifrado.toString("base64")].join(".");
}

/** Devuelve el texto original, o null si la llave no coincide / el valor está dañado. */
export function descifrar(guardado: string, llave: Buffer | null = leerLlaveCifrado()): string | null {
  if (!llave) return null;
  const partes = guardado.split(".");
  if (partes.length !== 4 || partes[0] !== "v1") return null;
  try {
    const iv = Buffer.from(partes[1], "base64");
    const tag = Buffer.from(partes[2], "base64");
    const datos = Buffer.from(partes[3], "base64");
    const decipher = createDecipheriv("aes-256-gcm", llave, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(datos), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
