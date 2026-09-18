import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Semana laboral configurable por tenant (2026-09-18, a petición explícita
 * de Carlos: "no quiero que sea un sistema cerrado... que cada cliente o
 * administrador asigne un día para inicio de semana y otro para cierre.
 * Cada dueño debe poder crear su propio periodo laboral"). Antes de este
 * archivo, cada módulo que hablaba de "esta semana" tenía su propio
 * criterio improvisado y sin configurar (ver el comentario largo en
 * Tenant.weekStartDay, schema.prisma) — este archivo es el único punto de
 * verdad para "¿cuándo empieza/termina la semana laboral de este negocio?",
 * y lib/dashboard-data.ts, lib/personal-data.ts y AsistenciaClient.tsx lo
 * usan (los dos primeros importando estas funciones directamente; el
 * tercero — Client Component — duplica la MISMA fórmula a mano siguiendo la
 * convención ya establecida del proyecto de que cada Client Component trae
 * su propia copia chica de sus helpers de fecha, para no arrastrar
 * "server-only" al bundle del navegador).
 *
 * weekStartDay: 0=domingo … 6=sábado — mismo índice que DIAS_SEMANA en
 * lib/dashboard-data.ts. Un negocio con corte de nómina "de sábado a
 * viernes" usa weekStartDay=6; uno con la semana calendario normal
 * (lunes a domingo, el default) usa weekStartDay=1.
 */

// México (Zona Centro) opera en UTC-6 fijo — misma constante que
// lib/dashboard-data.ts (duplicada a propósito, ver el comentario ahí
// sobre por qué no hay un lib/fechas.ts compartido todavía).
const MX_OFFSET_MS = 6 * 60 * 60 * 1000;

/** weekStartDay guardado del tenant — 1 (lunes) si el tenant no existe o el campo aún no se ha migrado. */
export async function obtenerWeekStartDay(tenantId: string): Promise<number> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { weekStartDay: true } });
  return tenant?.weekStartDay ?? 1;
}

/** Inicio (00:00 hora de México) de la semana laboral que contiene `fecha`, según weekStartDay (0=domingo…6=sábado). */
export function inicioSemanaLaboral(fecha: Date, weekStartDay: number): Date {
  const mx = new Date(fecha.getTime() - MX_OFFSET_MS);
  const diaSemanaActual = mx.getUTCDay(); // 0=domingo…6=sábado, ya en hora civil de México
  const diasTranscurridos = (diaSemanaActual - weekStartDay + 7) % 7;
  const y = mx.getUTCFullYear();
  const m = mx.getUTCMonth();
  const d = mx.getUTCDate() - diasTranscurridos;
  const inicioMx = new Date(Date.UTC(y, m, d, 0, 0, 0));
  return new Date(inicioMx.getTime() + MX_OFFSET_MS);
}

/** Rango [inicio, fin) de la semana laboral en curso — fin es el inicio de la siguiente, nunca incluido. */
export function rangoSemanaLaboral(fecha: Date, weekStartDay: number): { start: Date; end: Date } {
  const start = inicioSemanaLaboral(fecha, weekStartDay);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}
