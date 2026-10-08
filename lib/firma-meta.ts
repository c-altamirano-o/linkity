import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifica la firma X-Hub-Signature-256 que Meta pone en cada aviso (webhook):
 * "sha256=" + HMAC-SHA256 del cuerpo EXACTO recibido, usando el App Secret de
 * la app. Se compara en tiempo constante. Pura, sin dependencias de servidor.
 */
export function verificarFirmaMeta(cuerpoCrudo: string, cabecera: string | null | undefined, appSecret: string): boolean {
  if (!cabecera || !appSecret) return false;
  const m = /^sha256=([0-9a-fA-F]{64})$/.exec(cabecera.trim());
  if (!m) return false;
  const esperada = createHmac("sha256", appSecret).update(cuerpoCrudo, "utf8").digest();
  const recibida = Buffer.from(m[1], "hex");
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}
