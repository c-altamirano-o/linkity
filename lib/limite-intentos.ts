import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Límite de intentos para endpoints PÚBLICOS que cuestan algo (crear una
 * cuenta, mandar un correo) — 2026-10-08, punto 10 de la revisión. Sin
 * cuentas externas: se apoya en la propia base de datos, porque en Vercel
 * (serverless) la memoria no se comparte entre peticiones.
 *
 * Dos topes por tipo de acción dentro de la ventana:
 *  - por IP (se guarda un hash con sal, nunca la IP en claro);
 *  - global (frena una inundación distribuida y limita el gasto de correos).
 *
 * Cuenta TODOS los intentos, también los fallidos, para que sirva contra
 * quien prueba correos o nombres en bucle. Si la base falla, deja pasar
 * (y lo registra): la acción protegida depende de esa misma base, así que
 * bloquear aquí solo duplicaría la caída.
 *
 * Limitación honesta: un atacante que cambie de IP en cada intento no es
 * frenado por el tope por IP (sí por el global). Para eso, más adelante, se
 * puede sumar Cloudflare Turnstile sin tocar esto.
 */

export interface OpcionesLimite {
  tipo: string;
  maxPorIp: number;
  maxGlobal: number;
  ventanaMs: number;
}

export async function ipDeLaPeticion(): Promise<string | null> {
  try {
    const h = await headers();
    const reenviada = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = reenviada || h.get("x-real-ip")?.trim() || null;
    return ip && ip.length <= 64 ? ip : null;
  } catch {
    return null;
  }
}

function hashIp(ip: string): string {
  const sal = process.env.RATE_LIMIT_SALT || process.env.CRON_SECRET || "linkity";
  return createHash("sha256").update(`${sal}:${ip}`).digest("hex");
}

/** Registra el intento y responde si todavía está dentro del límite. */
export async function permitirIntento(op: OpcionesLimite): Promise<boolean> {
  try {
    const ip = await ipDeLaPeticion();
    // Sin IP identificable no se puede limitar por IP (todos compartirían la
    // misma clave y se bloquearían entre sí): solo aplica el tope global.
    const claveHash = ip ? hashIp(ip) : "sin-ip";
    const desde = new Date(Date.now() - op.ventanaMs);

    await prisma.intentoAcceso.create({ data: { tipo: op.tipo, claveHash } });

    const [global, porIp] = await Promise.all([
      prisma.intentoAcceso.count({ where: { tipo: op.tipo, createdAt: { gte: desde } } }),
      ip ? prisma.intentoAcceso.count({ where: { tipo: op.tipo, claveHash, createdAt: { gte: desde } } }) : Promise.resolve(0),
    ]);

    if (global > op.maxGlobal) {
      console.warn(`⚠️  Límite global de "${op.tipo}" superado (${global}/${op.maxGlobal} en la ventana).`);
      return false;
    }
    if (ip && porIp > op.maxPorIp) return false;
    return true;
  } catch (err) {
    console.error(`❌ No se pudo revisar el límite de intentos de "${op.tipo}" (se deja pasar):`, err);
    return true;
  }
}

export async function limpiarIntentosViejos(): Promise<number> {
  const corte = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const r = await prisma.intentoAcceso.deleteMany({ where: { createdAt: { lt: corte } } });
  return r.count;
}

export const LIMITE_REGISTRO: OpcionesLimite = { tipo: "registro", maxPorIp: 5, maxGlobal: 100, ventanaMs: 60 * 60 * 1000 };
export const LIMITE_REENVIO: OpcionesLimite = { tipo: "reenvio", maxPorIp: 6, maxGlobal: 200, ventanaMs: 60 * 60 * 1000 };
export const MENSAJE_DEMASIADOS_INTENTOS = "Hiciste demasiados intentos en poco tiempo. Espera un rato e inténtalo de nuevo.";
