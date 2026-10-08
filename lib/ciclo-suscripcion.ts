import type { SubscriptionStatus } from "@prisma/client";

/**
 * Ciclo de vida de una suscripción vencida (2026-09-22, a petición de
 * Carlos: "7 días de gracia... 30 días bloqueado... 90 días [aviso de
 * eliminación]... la decisión [de borrar] la tomaré yo"). Módulo puro
 * (sin Prisma, sin "server-only") a propósito: lo usan tanto el servidor
 * (lib/actor.ts, [tenant]/layout.tsx, el cron, Panel Maestro) como,
 * potencialmente, un test — no debe arrastrar nada del runtime de base de
 * datos.
 *
 * El bloqueo de acceso NUNCA se guarda como un campo/estado aparte: se
 * calcula en vivo a partir de `endDate` cada vez que se necesita (ver
 * `calcularEstadoCiclo`). Eso evita que se desfase del cron — si el cron
 * no corrió hoy por lo que sea, el bloqueo real (que si importa para
 * seguridad) sigue siendo correcto en el siguiente request; solo el ENVÍO
 * de avisos depende de que el cron haya corrido (ver
 * Subscription.expiredNoticeSentAt y hermanos, schema.prisma).
 */

export const DIAS_GRACIA = 7;
export const DIAS_RECORDATORIO = 30;
export const DIAS_AVISO_ELIMINACION = 90;

// Prueba gratis (2026-10-06, a petición de Carlos: "se puedan suscribir y
// usar su mes gratis. Y al terminar el periodo de prueba, se les bloquee el
// acceso"). 30 días — coincide con lo que ya promete la landing ("1 mes de
// prueba gratis"). A diferencia de una suscripción de paga vencida, la
// prueba NO tiene días de gracia: termina y se bloquea (decisión de
// Carlos). Los avisos previos (7/3/1 días antes) los manda el cron — ver
// DIAS_AVISOS_PRUEBA y app/api/cron/revisar-suscripciones.
export const DIAS_PRUEBA = 30;
export const DIAS_AVISOS_PRUEBA = [7, 3, 1] as const;

const MS_DIA = 1000 * 60 * 60 * 24;

export interface SuscripcionParaCiclo {
  status: SubscriptionStatus | null;
  endDate: Date | string | null;
}

export type EtapaCiclo =
  | "sin_suscripcion" // el tenant no tiene ninguna fila Subscription
  | "activa" // vigente, o sin endDate (nunca vence)
  | "en_prueba" // prueba gratis vigente — acceso OK, se muestran los días restantes
  | "prueba_vencida" // la prueba terminó — acceso BLOQUEADO (sin días de gracia)
  | "en_gracia" // venció hace 0-6 días — acceso OK, ya se avisó
  | "bloqueada" // venció hace 7-89 días — acceso bloqueado
  | "lista_para_eliminar" // venció hace 90+ días — Carlos puede revisar/borrar
  | "suspendida_manual" // Carlos la suspendió a mano desde Panel Maestro
  | "cancelada"; // Carlos la canceló a mano

export interface EstadoCiclo {
  etapa: EtapaCiclo;
  // Días transcurridos desde endDate (negativo = todavía no vence). null
  // cuando no aplica (sin suscripción, sin endDate, o estados manuales).
  diasVencida: number | null;
  // Días que le quedan (redondeado hacia arriba: 0.2 días restantes = 1).
  // Solo se llena en "en_prueba" (días de prueba que faltan) y "en_gracia"
  // (días de gracia que faltan); null en cualquier otro caso.
  diasRestantes: number | null;
  // true = este negocio NO debe poder entrar al sistema ahora mismo — el
  // único campo que de verdad importa para el guard de acceso.
  bloqueada: boolean;
}

export function calcularEstadoCiclo(s: SuscripcionParaCiclo | null | undefined, ahora: Date = new Date()): EstadoCiclo {
  if (!s) return { etapa: "sin_suscripcion", diasVencida: null, diasRestantes: null, bloqueada: false };

  // Suspender/Cancelar desde Panel Maestro son decisiones manuales de
  // Carlos, separadas del ciclo automático por vencimiento — pero de aquí
  // en adelante SÍ bloquean acceso de verdad (antes "Suspender" no hacía
  // nada real, ver el comentario largo en alternarSuscripcionAction).
  if (s.status === "CANCELLED") return { etapa: "cancelada", diasVencida: null, diasRestantes: null, bloqueada: true };
  if (s.status === "SUSPENDED") return { etapa: "suspendida_manual", diasVencida: null, diasRestantes: null, bloqueada: true };

  if (!s.endDate) return { etapa: "activa", diasVencida: null, diasRestantes: null, bloqueada: false };

  const fin = typeof s.endDate === "string" ? new Date(s.endDate) : s.endDate;
  const diasVencida = Math.floor((ahora.getTime() - fin.getTime()) / MS_DIA);
  const esPrueba = s.status === "TRIAL";

  if (diasVencida < 0) {
    if (esPrueba) {
      const diasRestantes = Math.max(1, Math.ceil((fin.getTime() - ahora.getTime()) / MS_DIA));
      return { etapa: "en_prueba", diasVencida, diasRestantes, bloqueada: false };
    }
    return { etapa: "activa", diasVencida, diasRestantes: null, bloqueada: false };
  }

  // Prueba terminada: bloqueo inmediato, sin días de gracia.
  if (esPrueba) {
    if (diasVencida < DIAS_AVISO_ELIMINACION) return { etapa: "prueba_vencida", diasVencida, diasRestantes: null, bloqueada: true };
    return { etapa: "lista_para_eliminar", diasVencida, diasRestantes: null, bloqueada: true };
  }

  if (diasVencida < DIAS_GRACIA) {
    return { etapa: "en_gracia", diasVencida, diasRestantes: DIAS_GRACIA - diasVencida, bloqueada: false };
  }
  if (diasVencida < DIAS_AVISO_ELIMINACION) return { etapa: "bloqueada", diasVencida, diasRestantes: null, bloqueada: true };
  return { etapa: "lista_para_eliminar", diasVencida, diasRestantes: null, bloqueada: true };
}

export const ETAPA_LABEL: Record<EtapaCiclo, string> = {
  sin_suscripcion: "Sin suscripción",
  activa: "Activa",
  en_prueba: "En prueba gratis",
  prueba_vencida: "Prueba terminada (bloqueada)",
  en_gracia: "En gracia (venció, 7 días de margen)",
  bloqueada: "Bloqueada por falta de pago",
  lista_para_eliminar: "Lista para revisión (90+ días sin responder)",
  suspendida_manual: "Suspendida",
  cancelada: "Cancelada",
};
