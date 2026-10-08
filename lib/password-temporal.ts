import { randomInt } from "node:crypto";

/**
 * Contraseña temporal para cuentas nuevas (registro público y alta desde
 * Panel Maestro). Antes se armaba con Math.random(), que NO es seguro para
 * credenciales; esto usa el generador criptográfico de Node. 14 caracteres,
 * sin símbolos ambiguos (0/O, 1/l/I) para que se pueda copiar o dictar sin
 * confusión, y siempre con mayúscula, minúscula y número.
 */
const MAYUS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const MINUS = "abcdefghijkmnopqrstuvwxyz";
const NUMS = "23456789";
const TODOS = MAYUS + MINUS + NUMS;

function uno(alfabeto: string): string {
  return alfabeto[randomInt(alfabeto.length)];
}

export function generarPasswordTemporal(longitud = 14): string {
  const chars = [uno(MAYUS), uno(MINUS), uno(NUMS)];
  while (chars.length < longitud) chars.push(uno(TODOS));
  // Fisher-Yates con el mismo generador seguro.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
