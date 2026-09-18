/**
 * Constantes y tipos del odontograma (notación FDI) — separados de
 * expediente-data.ts a propósito (2026-09-18, fix de build).
 *
 * expediente-data.ts importa "server-only" y getTenantPrisma, que arrastra
 * el driver `pg` (y éste, módulos de Node como fs/net/tls/dns). Un import
 * de TIPO de algo definido ahí se elide en compilación y no rompe nada
 * (así es como ClientesClient.tsx ya podía importar `type ExpedienteCliente`
 * sin problema), pero un import de VALOR —como DIENTES_SUPERIOR/
 * DIENTES_INFERIOR, que ClientesClient.tsx necesita en tiempo de ejecución
 * para dibujar la grilla de dientes— arrastra el módulo completo a un
 * Client Component y Turbopack lo rechaza ("'server-only' cannot be
 * imported from a Client Component module"). Este archivo no importa nada
 * de servidor, así que es seguro para ambos lados.
 */

export type CondicionDiente =
  | "SANO" | "CARIES" | "OBTURADO" | "CORONA" | "ENDODONCIA" | "AUSENTE"
  | "EXTRACCION_INDICADA" | "IMPLANTE" | "FRACTURADO" | "SELLANTE";

// Notación FDI, dispuesta como se dibuja un odontograma en dos filas (visto
// de frente al paciente, como lo lee cualquier dentista mexicano):
//   Superior: 18 17 16 15 14 13 12 11 | 21 22 23 24 25 26 27 28
//   Inferior: 48 47 46 45 44 43 42 41 | 31 32 33 34 35 36 37 38
// Fase 1 cubre solo dentición permanente (32 piezas) — dentición temporal/
// infantil (serie 51-85) queda fuera de alcance de esta primera versión.
export const DIENTES_SUPERIOR: number[] = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const DIENTES_INFERIOR: number[] = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
export const DIENTES_FDI_VALIDOS = new Set([...DIENTES_SUPERIOR, ...DIENTES_INFERIOR]);
