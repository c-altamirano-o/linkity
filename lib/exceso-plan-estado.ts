/**
 * Estado del plazo de gracia cuando un negocio EXCEDE lo que permite su plan
 * (más sucursales activas, o más empleados activos en una sucursal, que los
 * del plan) — Paso 5, 2026-10-08.
 *
 * Módulo PURO a propósito (sin Prisma ni "server-only"): lo usan el layout,
 * Server Actions, el cron y pruebas, y así el cálculo del plazo vive en un
 * solo lugar.
 *
 * Regla acordada con Carlos: al detectar el exceso corren 7 días para que el
 * administrador elija qué conservar. Pasado ese plazo el sistema entero queda
 * bloqueado hasta que decida (ver [tenant]/layout.tsx y lib/actor.ts).
 */

export const DIAS_GRACIA_EXCESO = 7;

const MS_DIA = 24 * 60 * 60 * 1000;

export interface EstadoExceso {
  /** true si hay un exceso registrado (hay fecha de detección). */
  activo: boolean;
  /** Días que quedan para decidir; null si no hay exceso. Mínimo 1 mientras no venza. */
  diasRestantes: number | null;
  /** true cuando ya pasaron los 7 días: el sistema debe bloquearse. */
  vencido: boolean;
}

export function calcularEstadoExceso(detectadoAt: Date | null | undefined, ahora: Date = new Date()): EstadoExceso {
  if (!detectadoAt) return { activo: false, diasRestantes: null, vencido: false };
  const transcurridoMs = ahora.getTime() - detectadoAt.getTime();
  const limiteMs = DIAS_GRACIA_EXCESO * MS_DIA;
  if (transcurridoMs >= limiteMs) return { activo: true, diasRestantes: 0, vencido: true };
  const restantes = Math.ceil((limiteMs - transcurridoMs) / MS_DIA);
  return { activo: true, diasRestantes: Math.max(1, restantes), vencido: false };
}
