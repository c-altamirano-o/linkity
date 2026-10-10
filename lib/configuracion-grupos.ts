/**
 * Submenús de Configuración (2026-10-10, a petición de Carlos: la pantalla
 * tenía 19 secciones en una sola columna y el dueño perdía de vista lo que
 * quería cambiar). Módulo PURO — sin React — para poder probarlo aislado.
 *
 * El grupo activo se recuerda en la dirección (`?seccion=ventas`) y también
 * se deduce de dos parámetros que ya existían, para que ningún enlace
 * antiguo caiga en un grupo donde su sección está oculta:
 *  - `?tour=<id>`: los tours guiados resaltan elementos con data-tour; si
 *    el grupo que los contiene está oculto, el tour no los encuentra.
 *  - `?dispositivos=1`: lo usa la notificación push de "dispositivo nuevo
 *    por autorizar" (lib/notificaciones.ts).
 */

export type GrupoConfig = "general" | "ventas" | "comunicacion" | "modulos" | "cuenta";

export const GRUPOS_CONFIG: { id: GrupoConfig; etiqueta: string; descripcion: string }[] = [
  { id: "general", etiqueta: "General del negocio", descripcion: "Giro, logo, apariencia y horario" },
  { id: "ventas", etiqueta: "Ventas y cobro", descripcion: "Caja rápida, ticket, devoluciones y descuentos" },
  { id: "comunicacion", etiqueta: "Comunicación", descripcion: "WhatsApp y notificaciones" },
  { id: "modulos", etiqueta: "Módulos", descripcion: "Qué funciones usa tu negocio" },
  { id: "cuenta", etiqueta: "Cuenta y seguridad", descripcion: "Contraseña" },
];

const IDS = new Set<string>(GRUPOS_CONFIG.map((g) => g.id));

/** Grupo donde vive el elemento que resalta cada tour de Configuración. */
export const GRUPO_POR_TOUR: Record<string, GrupoConfig> = {
  "config-cambiar-rubro": "general",
  "config-subir-logo": "general",
  "config-datos-fiscales": "ventas",
  "config-activar-modulo": "modulos",
};

export function esGrupoConfig(valor: string | null | undefined): valor is GrupoConfig {
  return !!valor && IDS.has(valor);
}

export function grupoInicialConfig(params: { get(nombre: string): string | null }): GrupoConfig {
  const explicito = params.get("seccion");
  if (esGrupoConfig(explicito)) return explicito;
  const tour = params.get("tour");
  if (tour && GRUPO_POR_TOUR[tour]) return GRUPO_POR_TOUR[tour];
  if (params.get("dispositivos") === "1") return "comunicacion";
  return "general";
}
