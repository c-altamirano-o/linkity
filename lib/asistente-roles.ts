/**
 * Motor del "Asistente de puestos" (2026-09-24, a petición de Carlos) —
 * universal/sin Prisma (igual criterio que lib/roles.ts y lib/roles-rubro.ts:
 * AsistentePersonal.tsx lo importa del lado del cliente).
 *
 * Contexto: cada tenant YA arranca con un catálogo de roles pre-sembrado
 * desde el día uno (asegurarRolesRubro/asegurarRolBase, llamado tanto desde
 * el alta del negocio como cada vez que se abre "Personal" — ver
 * lib/roles-server.ts). Así que el problema real que Carlos describió no es
 * "partir de una lista vacía" (eso ya no pasa nunca) sino dos cosas
 * distintas:
 *   1. Un negocio que en realidad es una sola persona (o donde nadie separa
 *      tareas) igual se enfrenta a un catálogo de 3-6 puestos y tiene que
 *      adivinar cuál usar — cuando lo que necesita es UN solo puesto con
 *      todo el acceso operativo.
 *   2. Un negocio que sí separa tareas puede haber armado sus puestos mal
 *      desde el principio (a mano, por ensayo y error) sin darse cuenta de
 *      que dos quedaron duplicados, o que juntó dos funciones que conviene
 *      mantener separadas — y hoy no tiene forma de darse cuenta de eso salvo
 *      leyendo con cuidado la lista de "Roles y permisos".
 *
 * Este archivo resuelve la parte de DATOS/LÓGICA de ambos casos —
 * AsistentePersonal.tsx (el wizard, Client Component) es quien la usa para
 * guiar la conversación paso a paso. Nada aquí toca la base de datos: solo
 * calcula catálogos y advertencias a partir de lo que ya se le pasa
 * (rolesIniciales, ya resuelto por lib/roles-server.ts).
 */

import {
  MODULOS_BASE_EXCLUIDOS,
  ROLES_BASE,
  ROLES_DESCRIPCION_BASE,
  MATRIZ_ACCESO_BASE,
  type ModuloKey,
} from "@/lib/roles";
import { rolesSugeridosRubro, type RolSugeridoRubro } from "@/lib/roles-rubro";

/** Catálogo de "punto de partida" para el rubro de este negocio — el mismo que ya siembra roles-server.ts, o (si el rubro no tiene catálogo propio) los 3 roles base convertidos a la misma forma, para que el wizard siempre tenga algo con qué comparar. */
export function catalogoBaseParaRubro(businessType: string | null | undefined): RolSugeridoRubro[] {
  const propio = rolesSugeridosRubro(businessType);
  if (propio.length > 0) return propio;
  return ROLES_BASE.map((nombre) => ({
    name: nombre,
    description: ROLES_DESCRIPCION_BASE[nombre],
    modulos: MATRIZ_ACCESO_BASE[nombre],
    verMontosCaja: nombre === "Gerente",
  }));
}

/**
 * Plantilla para el negocio de "una sola persona hace de todo" — la unión de
 * TODOS los módulos que el catálogo de este rubro considera relevantes
 * (recortada a los módulos realmente asignables que se le pasan, para
 * respetar tanto los de acceso exclusivo del dueño como los módulos que este
 * negocio en particular tiene desactivados — ver modulosAsignables, mismo
 * criterio que MODULOS_ASIGNABLES en RolesManager.tsx). Así el "operador
 * único" de una barbería no termina con Expediente Clínico, y el de un
 * consultorio no termina con Punto de Venta si ese negocio no lo usa.
 */
export function plantillaOperadorUnico(
  businessType: string | null | undefined,
  modulosAsignables: ModuloKey[]
): { name: string; description: string; modulos: ModuloKey[] } {
  const catalogo = catalogoBaseParaRubro(businessType);
  const asignables = new Set(modulosAsignables);
  const union = new Set<ModuloKey>();
  for (const rol of catalogo) {
    for (const m of rol.modulos) {
      if (asignables.has(m)) union.add(m);
    }
  }
  return {
    name: "Dueño / Encargado único",
    description: "Un solo puesto con acceso a todo lo operativo del negocio — pensado para cuando una misma persona (o todo el equipo por igual) hace de todo, sin tareas divididas por puesto.",
    modulos: Array.from(union),
  };
}

/** Índice de Jaccard entre dos conjuntos de módulos — 0 sin nada en común, 1 idénticos. */
export function calcularSolapamiento(a: ModuloKey[], b: ModuloKey[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const interseccion = Array.from(setA).filter((m) => setB.has(m)).length;
  const union = new Set([...setA, ...setB]).size;
  if (union === 0) return 0;
  return interseccion / union;
}

/**
 * Combinaciones de módulos que, en un mismo puesto, conviene evitar por
 * separación de funciones — no son un candado (el admin puede ignorarlas),
 * solo una advertencia con el porqué. Arranca con la única que ya es
 * doctrina establecida en este proyecto (ver el comentario de "aduana" en
 * lib/roles.ts, ejemplo "Fix Expres" 2026-09-22) — deliberadamente NO se
 * agregan combinaciones especulativas (ej. "caja"+"compras") porque varios
 * puestos ya sugeridos en lib/roles-rubro.ts las combinan a propósito para
 * negocios pequeños de una sola sucursal, y advertir sobre el propio
 * catálogo recomendado sería ruido, no ayuda.
 */
export const CONFLICTOS_MODULOS: { modulos: [ModuloKey, ModuloKey]; mensaje: string }[] = [
  {
    modulos: ["aduana", "taller"],
    mensaje: "quien recibe y asigna los equipos (Aduana) y quien los repara (Taller) conviene que sean personas distintas — juntar ambos permite recibir, reparar y cerrar el folio sin que nadie más lo verifique.",
  },
];

export interface AdvertenciaAsistente {
  tipo: "solapamiento" | "conflicto";
  puestos: [string, string];
  mensaje: string;
}

const UMBRAL_SOLAPAMIENTO = 0.75;

/**
 * Revisa el conjunto de puestos tentativo (el que el wizard esté a punto de
 * guardar) y regresa advertencias de dos tipos:
 *   - "solapamiento": dos puestos con conjuntos de módulos casi idénticos
 *     (>=75% en común, y al menos 2 módulos cada uno para no disparar con
 *     puestos de un solo módulo) — probablemente el mismo puesto con dos
 *     nombres.
 *   - "conflicto": un mismo puesto junta dos módulos de CONFLICTOS_MODULOS.
 * Puramente informativo — nada aquí bloquea nada, el wizard decide cómo
 * mostrarlo.
 */
export function detectarAdvertencias(puestos: { name: string; modulos: ModuloKey[] }[]): AdvertenciaAsistente[] {
  const advertencias: AdvertenciaAsistente[] = [];

  for (let i = 0; i < puestos.length; i++) {
    for (let j = i + 1; j < puestos.length; j++) {
      const a = puestos[i];
      const b = puestos[j];
      if (a.modulos.length < 2 || b.modulos.length < 2) continue;
      const solapamiento = calcularSolapamiento(a.modulos, b.modulos);
      if (solapamiento >= UMBRAL_SOLAPAMIENTO) {
        advertencias.push({
          tipo: "solapamiento",
          puestos: [a.name, b.name],
          mensaje: `"${a.name}" y "${b.name}" comparten ${Math.round(solapamiento * 100)}% de sus módulos — ¿son en realidad el mismo puesto con dos nombres distintos? Si es así, considera dejar solo uno y reasignar al personal.`,
        });
      }
    }
  }

  for (const puesto of puestos) {
    const set = new Set(puesto.modulos);
    for (const conflicto of CONFLICTOS_MODULOS) {
      if (set.has(conflicto.modulos[0]) && set.has(conflicto.modulos[1])) {
        advertencias.push({
          tipo: "conflicto",
          puestos: [puesto.name, puesto.name],
          mensaje: `"${puesto.name}" tiene a la vez "${conflicto.modulos[0]}" y "${conflicto.modulos[1]}" — ${conflicto.mensaje}`,
        });
      }
    }
  }

  return advertencias;
}

/** Módulos que el wizard puede ofrecer para armar/editar un puesto — mismo criterio y misma lista que MODULOS_ASIGNABLES en RolesManager.tsx (se recalcula aquí en vez de importarla porque ese cálculo depende de modulosInactivos, que varía por negocio). */
export { MODULOS_BASE_EXCLUIDOS };
