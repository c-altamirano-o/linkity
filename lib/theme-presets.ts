// Diccionario expandido: cubre TODOS los tokens de color del sistema
// (fondo, texto, tarjetas, popovers, secundario, muted, acento, bordes,
// inputs, anillo de foco y sidebar) para que un cambio de tema se note de
// verdad en toda la interfaz — no solo en el color primario.
//
// A propósito NO incluye "destructive": ese token (y, por separado, los
// colores de estatus rojo/ámbar/verde usados en badges, alertas y
// prioridades a lo largo de la app) se mantienen fijos sin importar el
// tema — "Mal/Medio/Bien" debe significar lo mismo en cualquier paleta.
//
// Vive en su propio archivo (antes estaba solo dentro de
// app/(tenant)/[tenant]/layout.tsx) porque ahora también lo necesita
// ConfiguracionClient.tsx para la vista previa en vivo del selector de
// tema — un Client Component no puede importar un archivo de Server
// Component sin arriesgar arrastrar código de servidor (Prisma, etc.) al
// bundle del navegador, así que este objeto se movió a un módulo neutral
// que ambos lados pueden importar sin problema.

/* ────────────────────────────────────────────────────────────────────
 * TEMAS ESTILO WINDOWS PHONE / METRO (2026-09-24)
 *
 * Historia completa: Carlos pidió un POS "estilo Windows Phone/tiles"
 * (ver POSClient.tsx). Los dos primeros intentos fallaron porque metían
 * el ícono dentro de una caja de color distinto ("sigues cometiendo el
 * error de encerrar el icono en un contenedor de un color diferente...
 * haces que se vea feo"). Carlos entonces mandó un JSON con 10 temas
 * reales inspirados en Lumia/Windows 8, cada uno con exactamente 3
 * piezas — nada de contenedor de ícono:
 *   - backgroundColor: fondo de TODA la ventana del catálogo del POS
 *   - defaultIconColor: UN SOLO color (blanco o negro) para el ícono Y
 *     el texto de producto, igual en las 5 fichas — el ícono se dibuja
 *     directo sobre la ficha, sin nada detrás
 *   - tileColors: 5 colores variados para el fondo de cada ficha
 * Se los mostré en una galería visual (10 tarjetas) y Carlos aprobó:
 * "ok, adelante con esas [...] hazlas personalizables para subir o
 * bajar la intensidad de los colores".
 *
 * WINDOWS_THEMES de abajo es una copia fiel de ese JSON (mismos hex,
 * nombres y colores — no se "corrigieron" combinaciones de bajo
 * contraste que Carlos ya vio y aceptó, como el ícono negro sobre la
 * ficha azul cobalto de "Windows 8 Start"). construirPresetWindowsPhone
 * deriva de ahí el resto de los tokens del sistema (fondo general,
 * sidebar, bordes, etc.) que el resto de la app YA necesita — Carlos
 * solo definió lo que le importaba para el POS, el resto se infiere de
 * forma consistente según baseStyle (Dark/Light) y el matiz del
 * backgroundColor.
 *
 * INTENSIDAD (el pedido más reciente): un número 0–200 (100 = la
 * paleta tal cual la mandó Carlos) que escala la SATURACIÓN de
 * backgroundColor y de los 5 tileColors antes de derivar todo lo demás
 * — 0 los deja en escala de grises, 200 los satura al máximo. Vive en
 * Tenant.themeIntensity (schema.prisma) y se aplica tanto en el layout
 * real (server) como en la vista previa en vivo de Configuración
 * (cliente) llamando a la MISMA función, para que nunca se desincronicen.
 *
 * INTENSIDAD DEL FONDO (2026-09-24, a petición de Carlos — "estoy
 * complacido con el modulador de intensidad para las fichas, pero
 * también falta uno para el fondo o color primario"): un SEGUNDO
 * modulador, independiente del de arriba, que escala solo la saturación
 * de backgroundColor (nunca la de los tileColors) — así el dueño puede
 * mover el fondo/color primario sin que eso mueva las fichas, y viceversa.
 * Mismo mecanismo (HSL, solo canal de Saturación), pero Carlos pidió que
 * este vaya en pasos de 10% ("aplicar variaciones de 10% progresivos") en
 * vez de los pasos de 5% del de fichas. Vive en Tenant.themeIntensityFondo
 * (schema.prisma, default 100 = mismo comportamiento que antes de existir
 * este segundo control).
 * ──────────────────────────────────────────────────────────────────── */

export type WindowsThemeId =
  | "LUMIA_COBALT"
  | "METRO_MAGENTA"
  | "WINDOWS8_LIGHT"
  | "SAPPHIRE_NIGHT"
  | "MONOCHROME_METRO"
  | "VIBRANT_LUMIA"
  | "MANGO_TANGERINE"
  | "LAWN_LIME"
  | "DEEP_PLUM"
  | "CRIMSON_START";

interface WindowsThemeDef {
  name: string;
  baseStyle: "Dark" | "Light";
  backgroundColor: string;
  defaultIconColor: string;
  tileColors: string[];
}

export const WINDOWS_THEMES: Record<WindowsThemeId, WindowsThemeDef> = {
  LUMIA_COBALT: {
    name: "Lumia Cobalt",
    baseStyle: "Dark",
    backgroundColor: "#004E8A",
    defaultIconColor: "#FFFFFF",
    tileColors: ["#00A4A4", "#32CD32", "#D80073", "#F09609", "#001AC0"],
  },
  METRO_MAGENTA: {
    name: "Metro Magenta",
    baseStyle: "Dark",
    backgroundColor: "#D80073",
    defaultIconColor: "#FFFFFF",
    tileColors: ["#00A4A4", "#FFD700", "#008A00", "#81007F", "#F09609"],
  },
  WINDOWS8_LIGHT: {
    name: "Windows 8 Start",
    baseStyle: "Light",
    // 2026-10-02, bug real reportado por Carlos con capturas ("el tema con
    // el que más tengo problema es Windows 8 Start. No realza en otro
    // color la selección o los botones... no se sabe si está activado o
    // no"). Causa raíz: a diferencia de los otros 9 temas Windows Phone,
    // este tenía "backgroundColor" (el valor que se vuelve literalmente
    // "--primary", el acento de botones/menú activo/selección en TODA la
    // app, ver construirPresetDesdeDef) en blanco puro — y el fondo de
    // página de un tema "Light" también es casi blanco. Un botón o un
    // ítem de menú "activo" con acento blanco sobre una página blanca no
    // tiene NINGÚN contraste, sin importar qué tan bien calculado esté el
    // color del texto encima (ese es un problema distinto, ya resuelto
    // por textoLegibleSobre más abajo, pero no alcanza a arreglar esto:
    // el problema aquí es el RELLENO del botón, no su texto). Se cambia a
    // "#0078D7" (el azul de acento clásico de Windows 8/10/11, distinto
    // del "#004E8A" de Lumia Cobalt para que los dos temas se sigan
    // viendo claramente diferentes). Contraste verificado: ~4.5:1 contra
    // blanco y contra el fondo de página, por encima del mínimo. El
    // resto del tema (fondo de página claro, fichas de categoría) no
    // cambia en nada.
    backgroundColor: "#0078D7",
    defaultIconColor: "#FFFFFF",
    tileColors: ["#004E8A", "#00A4A4", "#32CD32", "#D80073", "#F09609"],
  },
  SAPPHIRE_NIGHT: {
    name: "Sapphire Night",
    baseStyle: "Dark",
    backgroundColor: "#002D59",
    defaultIconColor: "#FFFFFF",
    tileColors: ["#004E8A", "#008080", "#66CC66", "#4A0E4E", "#B8860B"],
  },
  MONOCHROME_METRO: {
    name: "Monochrome Metro",
    baseStyle: "Dark",
    backgroundColor: "#1A1A1A",
    defaultIconColor: "#FFFFFF",
    tileColors: ["#6A5ACD", "#556B2F", "#800000", "#008B8B", "#70AFCE"],
  },
  VIBRANT_LUMIA: {
    name: "Vibrant Lumia",
    baseStyle: "Dark",
    backgroundColor: "#00C7C7",
    defaultIconColor: "#FFFFFF",
    tileColors: ["#4169E1", "#9ACD32", "#FF00FF", "#CC5500", "#4682B4"],
  },
  MANGO_TANGERINE: {
    name: "Mango Tangerine",
    baseStyle: "Dark",
    backgroundColor: "#F09609",
    defaultIconColor: "#FFFFFF",
    tileColors: ["#004F70", "#228B22", "#DC143C", "#8B008B", "#00A4A4"],
  },
  LAWN_LIME: {
    name: "Lawn Lime",
    baseStyle: "Dark",
    backgroundColor: "#76EE00",
    defaultIconColor: "#FFFFFF",
    tileColors: ["#191970", "#C71585", "#FFD700", "#9966CC", "#00566A"],
  },
  DEEP_PLUM: {
    name: "Deep Plum",
    baseStyle: "Dark",
    backgroundColor: "#4A0E4E",
    defaultIconColor: "#FFFFFF",
    tileColors: ["#B0E0E6", "#98FF98", "#FA8072", "#FFFACD", "#70AFCE"],
  },
  CRIMSON_START: {
    name: "Crimson Start",
    baseStyle: "Dark",
    backgroundColor: "#DC143C",
    defaultIconColor: "#FFFFFF",
    tileColors: ["#6495ED", "#7FFF00", "#FF00FF", "#FFFFE0", "#00BFFF"],
  },
};

/* ────────────────────────────────────────────────────────────────────
 * TEMAS ESTILO MATERIAL DESIGN (2026-09-28)
 *
 * Carlos encontró un repositorio de Google (material-components-web) que
 * le pareció más pulido que los temas Windows Phone ("los que pones, se
 * me hacen un poco toscos"). Ese repo está descontinuado y es JS
 * imperativo (mdc.textField.MDCTextField.attachTo(...)) — no encaja con
 * Next.js/React/Tailwind/shadcn sin reescribir cada componente desde
 * cero. Carlos confirmó (AskUserQuestion) que lo que quiere es el ESTILO
 * VISUAL de Material Design como temas nuevos, no la librería en sí.
 *
 * MATERIAL_THEMES reutiliza EXACTAMENTE el mismo mecanismo que
 * WINDOWS_THEMES (mismas 3 piezas: backgroundColor = color Primary,
 * defaultIconColor = color de ícono/texto, tileColors = 5 colores de
 * ficha de categoría del POS) y la misma construirPresetDesdeDef — cero
 * código nuevo de derivación de color, cero riesgo de tocar
 * POSClient.tsx/CatalogoClient.tsx. Los 6 temas son combinaciones reales
 * "de catálogo" de Material Design 2 (Índigo/Rosa, Teal, Azul, Rojo/Cian,
 * Púrpura oscuro, y el "Material Dark" oficial con su morado #BB86FC
 * característico) — Carlos los vio en un mockup interactivo (mismo
 * cálculo que construirPresetDesdeDef) y confirmó "si, me agradan esos
 * temas" antes de escribir esto. Se agregan de forma ADITIVA junto a los
 * 10 temas Windows Phone — ninguno de esos ni "Personalizado" se toca.
 * ──────────────────────────────────────────────────────────────────── */

export type MaterialThemeId =
  | "MATERIAL_INDIGO"
  | "MATERIAL_TEAL"
  | "MATERIAL_BLUE"
  | "MATERIAL_RED_CYAN"
  | "MATERIAL_DEEP_PURPLE_DARK"
  | "MATERIAL_DARK_THEME";

export const MATERIAL_THEMES: Record<MaterialThemeId, WindowsThemeDef> = {
  MATERIAL_INDIGO: {
    name: "Material Índigo",
    baseStyle: "Light",
    backgroundColor: "#3F51B5",
    defaultIconColor: "#FFFFFF",
    tileColors: ["#FF4081", "#009688", "#FFC107", "#673AB7", "#8BC34A"],
  },
  MATERIAL_TEAL: {
    name: "Material Teal",
    baseStyle: "Light",
    backgroundColor: "#009688",
    defaultIconColor: "#FFFFFF",
    tileColors: ["#FF5722", "#3F51B5", "#FFC107", "#9C27B0", "#4CAF50"],
  },
  MATERIAL_BLUE: {
    name: "Material Azul",
    baseStyle: "Light",
    backgroundColor: "#2196F3",
    defaultIconColor: "#FFFFFF",
    tileColors: ["#FF9800", "#8BC34A", "#E91E63", "#009688", "#9C27B0"],
  },
  MATERIAL_RED_CYAN: {
    name: "Material Rojo",
    baseStyle: "Light",
    backgroundColor: "#F44336",
    defaultIconColor: "#FFFFFF",
    tileColors: ["#00BCD4", "#FFC107", "#4CAF50", "#3F51B5", "#9C27B0"],
  },
  MATERIAL_DEEP_PURPLE_DARK: {
    name: "Material Púrpura",
    baseStyle: "Dark",
    backgroundColor: "#673AB7",
    defaultIconColor: "#FFFFFF",
    tileColors: ["#00BCD4", "#FF4081", "#FFEB3B", "#4CAF50", "#FF7043"],
  },
  MATERIAL_DARK_THEME: {
    name: "Material Dark",
    baseStyle: "Dark",
    backgroundColor: "#BB86FC",
    defaultIconColor: "#121212",
    tileColors: ["#03DAC6", "#CF6679", "#FFD54F", "#81D4FA", "#A5D6A7"],
  },
};

/* ────────────────────────────────────────────────────────────────────
 * TEMA "LINKITY" (2026-10-02, a petición de Carlos: "noté que no hay un
 * tema llamado Linkity que venga por default. usando los colores del
 * logo como base. Tomando en cuenta que el fondo será blanco")
 *
 * Mismo mecanismo que WINDOWS_THEMES/MATERIAL_THEMES (una galería más,
 * ninguna de las otras dos se toca) — la diferencia es que este es el
 * único tema derivado de una fuente verificable en vez de a mano: el
 * color morado se extrajo directamente de public/images/logo-icon.png
 * (el ícono real de la plataforma, no una aproximación visual) — "#6C4FE5"
 * es, con mucho, el color dominante de ese archivo. Contraste verificado
 * (misma fórmula que textoLegibleSobre más abajo): ~5.4:1 contra blanco,
 * tanto como texto encima del morado como fondo de página detrás de
 * él — bien por encima del mínimo, así que NO dispara el fallback de
 * textoLegibleSobre (el tema ya nace con buen contraste, a diferencia del
 * bug que se acaba de corregir en "Windows 8 Start" arriba).
 *
 * Las 5 fichas reutilizan el set de acentos que Carlos ya vio y aprobó en
 * varios de los otros temas (teal/verde/magenta/ámbar), cambiando solo la
 * quinta por un violeta más oscuro que amarra con el morado de marca en
 * vez de un azul genérico.
 *
 * Carlos pidió que sea el tema que "venga por default" — eso se resuelve
 * en prisma/schema.prisma (Tenant.themePreset @default(LINKITY), antes
 * MATERIAL_INDIGO) para negocios NUEVOS; los tenants que ya existen no se
 * tocan (siguen con el tema que ya tenían elegido, igual que cualquier
 * otro cambio de catálogo en este archivo).
 * ──────────────────────────────────────────────────────────────────── */

export type LinkityThemeId = "LINKITY";

export const LINKITY_THEMES: Record<LinkityThemeId, WindowsThemeDef> = {
  LINKITY: {
    name: "Linkity",
    baseStyle: "Light",
    backgroundColor: "#6C4FE5",
    defaultIconColor: "#FFFFFF",
    tileColors: ["#00A4A4", "#32CD32", "#D80073", "#F09609", "#2D1B69"],
  },
};

export const CANTIDAD_CHIPS_CATEGORIA = 5;

// Intensidad: 100 = paleta original de Carlos, 0 = escala de grises, 200 =
// saturación máxima. El slider de Configuración manda este rango tal cual.
export const INTENSIDAD_DEFAULT = 100;
export const INTENSIDAD_MIN = 0;
export const INTENSIDAD_MAX = 200;

/* ── Utilidades de color (hex <-> HSL) ──
 * Con estas dos basta para "subir/bajar intensidad": convertir a HSL,
 * escalar solo el canal de Saturación (nunca matiz ni luminosidad, para
 * no cambiar de qué color se trata, solo qué tan "apagado" o "vivo" se ve),
 * y volver a hex. */
function hexToRgb(hex: string): [number, number, number] {
  const limpio = hex.replace("#", "");
  const n = parseInt(limpio, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return "#" + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("");
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) { const v = l * 255; return [v, v, v]; }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
}

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

// Escala SOLO la saturación de un color por `factor` (1 = sin cambio,
// 0 = gris total, >1 más vivo, tope 1 = saturación máxima posible).
function escalarSaturacion(hex: string, factor: number): string {
  const [h, s, l] = hexToHsl(hex);
  const sNueva = Math.max(0, Math.min(1, s * factor));
  const [r, g, b] = hslToRgb(h, sNueva, l);
  return rgbToHex(r, g, b);
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

/* ── Contraste de texto sobre "--primary" (2026-10-02, a petición de
 * Carlos: "botones sin realce, sin énfasis" — un reporte distinto de la
 * jerarquía de componentes, ver button.tsx, pero con la MISMA causa raíz
 * en al menos 3 de los 10 temas Windows Phone) ──
 *
 * Cada WindowsThemeDef/MaterialThemeDef trae "defaultIconColor" fijado A
 * MANO por quien armó el catálogo (casi siempre "#FFFFFF") sin calcular
 * contraste real contra "backgroundColor". Tres temas quedaron con texto
 * blanco sobre un fondo igual de claro/brillante:
 *   - LAWN_LIME (#76EE00, verde lima) → contraste real ~1.3:1
 *   - VIBRANT_LUMIA (#00C7C7, cian claro) → ~1.6:1
 *   - MANGO_TANGERINE (#F09609, naranja claro) → ~2:1
 * (el mínimo WCAG AA para texto de botón es 3:1). El botón "primario"
 * técnicamente tiene relleno sólido, pero el texto se funde con él — de
 * ahí el "sin énfasis" para cualquier negocio con uno de estos 3 temas.
 *
 * En vez de corregir esas 3 entradas a mano (lo que deja el mismo bug
 * listo para repetirse en el próximo tema que alguien agregue al
 * catálogo), se calcula el contraste real de "defaultIconColor" contra
 * el color de fondo EFECTIVO (fondoVentana, ya con la intensidad del
 * tenant aplicada) y, si no alcanza el mínimo, se elige automáticamente
 * blanco o negro — lo que sí contraste — en su lugar. Un tema bien hecho
 * (los otros 13) nunca activa el fallback: el cálculo simplemente
 * confirma que su elección manual ya era la correcta.
 *
 * Deliberadamente NO se toca "--tile-fg" (las 5 fichas de categoría del
 * POS) — cada ficha tiene su propio color de fondo y un solo "--tile-fg"
 * no puede ser correcto para las 5 a la vez; ese es un problema distinto
 * (ya existía antes de este cambio) que Carlos no reportó esta vez. */
function luminanciaRelativa(hex: string): number {
  const canal = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function contraste(hexA: string, hexB: string): number {
  const la = luminanciaRelativa(hexA);
  const lb = luminanciaRelativa(hexB);
  const [claro, oscuro] = la >= lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (oscuro + 0.05);
}

const UMBRAL_CONTRASTE_BOTON = 3; // WCAG AA, texto grande/negrita (botones)
function textoLegibleSobre(fondo: string, preferido: string): string {
  if (contraste(fondo, preferido) >= UMBRAL_CONTRASTE_BOTON) return preferido;
  const blanco = "#FFFFFF", negro = "#000000";
  return contraste(fondo, blanco) >= contraste(fondo, negro) ? blanco : negro;
}

/**
 * Deriva el set COMPLETO de tokens del sistema a partir de uno de los 10
 * temas de WINDOWS_THEMES y DOS intensidades independientes (0–200,
 * 100 = original cada una): `intensidadFicha` escala solo los 5
 * tileColors (fichas del POS); `intensidadFondo` escala solo
 * backgroundColor (fondo de ventana / color primario del resto de la
 * app). Por defecto `intensidadFondo` toma el mismo valor que
 * `intensidadFicha` — así cualquier llamada vieja que solo mandaba un
 * número sigue funcionando igual que antes de que existiera el segundo
 * control.
 *
 * Carlos solo definió 3 piezas por tema (fondo de ventana, color de
 * ícono/texto, 5 colores de ficha) — el resto de la app (Dashboard, Caja,
 * sidebar, etc.) sigue necesitando el set de tokens completo que ya
 * usaba el sistema anterior de 5 presets. Esta función construye ese
 * resto de forma consistente a partir del matiz de backgroundColor y de
 * si el tema es Dark o Light, para que cualquier tema de la lista se
 * sienta como una paleta terminada, no solo como el POS coloreado.
 */
export function construirPresetWindowsPhone(
  id: WindowsThemeId,
  intensidadFicha: number = INTENSIDAD_DEFAULT,
  intensidadFondo: number = intensidadFicha,
): Record<string, string> {
  return construirPresetDesdeDef(WINDOWS_THEMES[id], intensidadFicha, intensidadFondo);
}

// Misma derivación que construirPresetWindowsPhone, pero para uno de los 6
// temas nuevos de MATERIAL_THEMES (ver el comentario largo arriba de esa
// constante) — función separada (en vez de aceptar cualquier id en la
// misma función) para que quede explícito en cada punto de llamada de qué
// galería viene el tema, aunque ambas terminen en construirPresetDesdeDef.
export function construirPresetMaterial(
  id: MaterialThemeId,
  intensidadFicha: number = INTENSIDAD_DEFAULT,
  intensidadFondo: number = intensidadFicha,
): Record<string, string> {
  return construirPresetDesdeDef(MATERIAL_THEMES[id], intensidadFicha, intensidadFondo);
}

// Misma derivación que construirPresetWindowsPhone/construirPresetMaterial,
// para el único tema de LINKITY_THEMES (ver el comentario largo junto a esa
// constante) — función separada por el mismo motivo que las otras dos: que
// quede explícito en cada punto de llamada de qué galería viene el tema.
export function construirPresetLinkity(
  id: LinkityThemeId,
  intensidadFicha: number = INTENSIDAD_DEFAULT,
  intensidadFondo: number = intensidadFicha,
): Record<string, string> {
  return construirPresetDesdeDef(LINKITY_THEMES[id], intensidadFicha, intensidadFondo);
}

// 2026-09-24, a petición de Carlos: forma que necesita un tema "Personalizado"
// (ver CUSTOM_THEME_ID más abajo) — mismas 4 piezas que un WindowsThemeDef
// menos "name" (el personalizado no tiene nombre fijo, es "Personalizado" a
// secas en la UI). Vive aparte de WindowsThemeDef (en vez de reusarlo con
// "name" opcional) para que construirPresetPersonalizado nunca reciba por
// accidente uno de los 10 temas fijos con su name intacto.
export interface ColoresPersonalizados {
  baseStyle: "Dark" | "Light";
  backgroundColor: string;
  defaultIconColor: string;
  tileColors: string[];
}

// Validación defensiva de lo que viene de Tenant.themeCustomColors (columna
// Json — Prisma la tipa como `unknown`/`JsonValue`, nunca se puede confiar en
// su forma sin revisarla): un negocio que nunca ha usado "Personalizado"
// tiene este campo en null, y un dato corrupto/manual en la BD no debe
// tumbar el layout — en cualquiera de esos casos resolverPresetTenant cae al
// tema por defecto en vez de lanzar una excepción a medio render.
const HEX_VALIDO = /^#[0-9a-fA-F]{6}$/;
export function parseColoresPersonalizados(raw: unknown): ColoresPersonalizados | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.baseStyle !== "Dark" && obj.baseStyle !== "Light") return null;
  if (typeof obj.backgroundColor !== "string" || !HEX_VALIDO.test(obj.backgroundColor)) return null;
  if (typeof obj.defaultIconColor !== "string" || !HEX_VALIDO.test(obj.defaultIconColor)) return null;
  if (!Array.isArray(obj.tileColors) || obj.tileColors.length !== CANTIDAD_CHIPS_CATEGORIA) return null;
  if (!obj.tileColors.every((c) => typeof c === "string" && HEX_VALIDO.test(c))) return null;
  return {
    baseStyle: obj.baseStyle,
    backgroundColor: obj.backgroundColor,
    defaultIconColor: obj.defaultIconColor,
    tileColors: obj.tileColors as string[],
  };
}

// Id especial de tema (no vive en WindowsThemeId/WINDOWS_THEMES a propósito
// — esos son los 10 fijos que Carlos definió; "Personalizado" no tiene una
// entrada fija que buscar en ese diccionario, sus colores vienen de
// Tenant.themeCustomColors en vez de WINDOWS_THEMES). Punto de partida al
// elegir "Personalizado" por primera vez (mismos hex que LUMIA_COBALT, el
// default general del sistema) — el negocio los cambia de ahí en adelante
// con los 7 selectores de color de Configuración.
export const TEMA_PERSONALIZADO_ID = "CUSTOM";
export const COLORES_PERSONALIZADOS_DEFAULT: ColoresPersonalizados = {
  baseStyle: "Dark",
  backgroundColor: "#004E8A",
  defaultIconColor: "#FFFFFF",
  tileColors: ["#00A4A4", "#32CD32", "#D80073", "#F09609", "#001AC0"],
};

/**
 * Misma derivación que construirPresetWindowsPhone, pero a partir de los
 * colores que el propio negocio eligió (Tenant.themeCustomColors) en vez de
 * uno de los 10 temas fijos — a petición de Carlos: "hay que agregar un
 * tema totalmente customizable. Elegir el color de fondo y los colores
 * secundarios". Los 2 sliders de intensidad (fichas/fondo) siguen
 * aplicando igual que en cualquier otro tema (respuesta explícita de
 * Carlos: si el negocio elige un fondo blanco o gris, el slider de fondo
 * seguirá sin efecto visible sobre ÉL — mismo comportamiento que
 * "Windows 8 Start" — pero sí tiene efecto en cuanto elija un color con
 * algo de saturación).
 */
export function construirPresetPersonalizado(
  colores: ColoresPersonalizados,
  intensidadFicha: number = INTENSIDAD_DEFAULT,
  intensidadFondo: number = intensidadFicha,
): Record<string, string> {
  return construirPresetDesdeDef(
    { name: "Personalizado", baseStyle: colores.baseStyle, backgroundColor: colores.backgroundColor, defaultIconColor: colores.defaultIconColor, tileColors: colores.tileColors },
    intensidadFicha,
    intensidadFondo,
  );
}

function construirPresetDesdeDef(
  tema: WindowsThemeDef,
  intensidadFicha: number = INTENSIDAD_DEFAULT,
  intensidadFondo: number = intensidadFicha,
): Record<string, string> {
  const factorFicha = Math.max(INTENSIDAD_MIN, Math.min(INTENSIDAD_MAX, intensidadFicha)) / 100;
  const factorFondo = Math.max(INTENSIDAD_MIN, Math.min(INTENSIDAD_MAX, intensidadFondo)) / 100;

  const fondoVentana = escalarSaturacion(tema.backgroundColor, factorFondo);
  const chips = tema.tileColors.map((c) => escalarSaturacion(c, factorFicha));
  const [h, sBase] = hexToHsl(tema.backgroundColor); // el matiz no cambia con la intensidad, solo la saturación

  // Corrección de un bug real reportado por Carlos ("¿por qué el Negro no es
  // Negro? se ve como rojizo o guinda", 2026-09-25): un color de fondo
  // ACROMÁTICO (gris/negro/blanco puro, sin nada de saturación — p.ej.
  // "Monochrome Metro" #1A1A1A o "Windows 8 Start" #FFFFFF) no tiene un
  // matiz real que extraer, así que hexToHsl regresa h=0 por convención (sin
  // significado). El problema: los tokens "neutrales" de abajo tomaban ese
  // matiz prestado y le aplicaban SU PROPIA saturación (0.06–0.24) para
  // fondo/texto/sidebar — y matiz 0 con saturación > 0 en HSL es rojo, no
  // gris. Resultado: cualquier tema con fondo acromático se veía con un
  // tinte rojizo/guinda en toda la interfaz en vez de gris neutro de
  // verdad. Con sBase (la saturación ORIGINAL de backgroundColor) ahora se
  // detecta ese caso y se fuerza saturación 0 en los tokens neutrales
  // también — un negro/blanco/gris real se queda gris, sin importar qué
  // tan oscuro o claro sea.
  const esAcromatico = sBase < 0.02;
  const hNeutral = esAcromatico ? 0 : h;
  const hslNeutro = (s: number, l: number) => hsl(hNeutral, esAcromatico ? 0 : s, l);

  const chipVars: Record<string, string> = {};
  chips.forEach((c, i) => { chipVars[`--chip-${i + 1}`] = c; });

  const esOscuro = tema.baseStyle === "Dark";

  const neutrales = esOscuro
    ? {
        "--background": hslNeutro(0.16, 0.09),
        "--foreground": hslNeutro(0.08, 0.96),
        "--card": hslNeutro(0.14, 0.14),
        "--card-foreground": hslNeutro(0.08, 0.96),
        "--popover": hslNeutro(0.14, 0.14),
        "--popover-foreground": hslNeutro(0.08, 0.96),
        "--secondary": hslNeutro(0.12, 0.2),
        "--secondary-foreground": hslNeutro(0.08, 0.96),
        "--muted": hslNeutro(0.12, 0.2),
        "--muted-foreground": hslNeutro(0.06, 0.65),
        "--accent": hslNeutro(0.18, 0.24),
        "--accent-foreground": hslNeutro(0.08, 0.96),
        "--border": hslNeutro(0.12, 0.26),
        "--input": hslNeutro(0.12, 0.28),
        "--sidebar": hslNeutro(0.18, 0.06),
        "--sidebar-foreground": hslNeutro(0.08, 0.96),
        "--sidebar-accent": hslNeutro(0.18, 0.16),
        "--sidebar-accent-foreground": hslNeutro(0.08, 0.96),
        "--sidebar-border": hslNeutro(0.12, 0.2),
        "--sidebar-ring": hslNeutro(0.08, 0.55),
      }
    : {
        "--background": hslNeutro(0.22, 0.98),
        "--foreground": hslNeutro(0.1, 0.1),
        "--card": "hsl(0, 0%, 100%)",
        "--card-foreground": hslNeutro(0.1, 0.1),
        "--popover": "hsl(0, 0%, 100%)",
        "--popover-foreground": hslNeutro(0.1, 0.1),
        "--secondary": hslNeutro(0.14, 0.95),
        "--secondary-foreground": hslNeutro(0.1, 0.15),
        "--muted": hslNeutro(0.14, 0.95),
        "--muted-foreground": hslNeutro(0.06, 0.42),
        "--accent": hslNeutro(0.24, 0.92),
        "--accent-foreground": hslNeutro(0.1, 0.15),
        "--border": hslNeutro(0.14, 0.9),
        "--input": hslNeutro(0.14, 0.9),
        "--sidebar": "hsl(0, 0%, 100%)",
        "--sidebar-foreground": hslNeutro(0.1, 0.1),
        "--sidebar-accent": hslNeutro(0.24, 0.92),
        "--sidebar-accent-foreground": hslNeutro(0.1, 0.15),
        "--sidebar-border": hslNeutro(0.14, 0.9),
        "--sidebar-ring": hslNeutro(0.08, 0.6),
      };

  // "--primary-text" (2026-09-24, corrigiendo un bug real que Carlos
  // reportó con capturas: "al seleccionar el sub menú se coloca el texto
  // blanco, sobre fondo blanco... lo había notado en otros botones y
  // pestañas también"). Causa raíz: "--primary" son literalmente
  // fondoVentana — el color de ventana/ficha que el dueño eligió para el
  // POS (ver el comentario largo arriba de este archivo) — perfecto para
  // un RELLENO sólido junto con "--primary-foreground" (que sí se calculó
  // para contrastar con ÉL), pero varios componentes compartidos (el menú
  // lateral activo en TenantShell.tsx, el botón "link" en
  // components/ui/button.tsx, algunos íconos/enlaces sueltos) usan
  // "text-primary" SOLO, como color de texto sobre un fondo neutro
  // (sidebar/card) — si el dueño elige un tema claro (ej. "Windows 8
  // Start", blanco), fondoVentana también es blanco y ese texto
  // desaparece sobre el sidebar (también blanco). "--primary" y
  // "--primary-foreground" se dejan TAL CUAL (nada de POS se ve afectado,
  // sigue siendo exactamente el color que el dueño eligió) — se agrega
  // este token nuevo, aparte, calculado como los "neutrales" de arriba: a
  // partir del mismo matiz (h) pero con saturación/luminosidad FIJAS y
  // pensadas para leerse siempre bien como texto, sin importar qué tan
  // clara u oscura haya quedado fondoVentana. Los componentes que usan
  // "text-primary" a secas (sin relleno "bg-primary" a juego) deben usar
  // "text-primary-text" en su lugar — ver el fallback en app/globals.css
  // (":root"/".dark") para negocios sin tema personalizado o con uno de
  // los 5 presets oklch viejos, que no traen este token y no lo necesitan
  // (su "--primary" ya es un acento propio, no el fondo de una ventana).
  const primaryText = esOscuro ? hslNeutro(0.55, 0.7) : hslNeutro(0.6, 0.36);

  // 2026-10-02: ver el comentario largo junto a textoLegibleSobre más
  // arriba — "--primary-foreground"/"--sidebar-primary-foreground" ya NO
  // confían ciegamente en tema.defaultIconColor, se valida su contraste
  // real contra fondoVentana primero.
  const primaryForeground = textoLegibleSobre(fondoVentana, tema.defaultIconColor);

  return {
    ...chipVars,
    "--tile-fg": tema.defaultIconColor,
    "--primary": fondoVentana,
    "--primary-foreground": primaryForeground,
    "--primary-text": primaryText,
    "--ring": fondoVentana,
    "--sidebar-primary": fondoVentana,
    "--sidebar-primary-foreground": primaryForeground,
    ...neutrales,
    // 2026-09-28 (bug real reportado por Carlos, capturas del selector de
    // fechas del Dashboard: fondo gris oscuro con texto NEGRO ilegible,
    // aunque el tema activo ya es oscuro). Causa raíz: estos tokens de
    // color se inyectan como inline style en un <div> ANIDADO dentro de
    // <body> (TENANT_THEME_ROOT_ID, ver app/(tenant)/[tenant]/layout.tsx),
    // no en :root/<html>. `body { @apply text-foreground }` en globals.css
    // resuelve su propio var(--foreground) mirando hacia ARRIBA en el
    // árbol (donde solo existe el valor default de :root, el tema claro
    // genérico) — nunca ve este valor de aquí abajo (las custom properties
    // solo heredan hacia abajo). Cualquier elemento que dependía de
    // `color: inherit` sin una clase text-* propia (todos los <select> y
    // <input type="date"> del sistema, entre otros) terminaba heredando
    // ESE valor equivocado en cascada, no el color real del tema activo.
    // Fix: declarar "color" aquí mismo, en este mismo nodo — así cualquier
    // descendiente sin su propio color explícito hereda el valor CORRECTO
    // desde este punto en vez de seguir subiendo hasta <body>.
    color: "var(--foreground)",
    // "colorScheme" (no "--color-scheme": es una propiedad real de CSS,
    // no un token) — para que el ícono/calendario nativo de
    // <input type="date"> y el menú desplegable nativo de <select> (partes
    // que el navegador dibuja él mismo, fuera del alcance de "color") usen
    // también los colores nativos oscuros/claros correctos según el tema.
    colorScheme: esOscuro ? "dark" : "light",
  };
}

/* ── Sistema anterior de 5 presets (oklch) — se conserva TAL CUAL, sin
 * tocar, solo para que un tenant que ya tenía uno de estos elegido no se
 * quede sin tema al abrir la app (nunca se borran valores de enum en uso).
 * Ya NO aparecen en el selector de Configuración — los 10 temas de
 * WINDOWS_THEMES los reemplazan como opciones nuevas. */
export const THEME_PRESETS = {
  NEUTRAL_TECH: {
    "--background": "oklch(0.985 0 0)",
    "--foreground": "oklch(0.145 0 0)",
    "--card": "oklch(1 0 0)",
    "--card-foreground": "oklch(0.145 0 0)",
    "--popover": "oklch(1 0 0)",
    "--popover-foreground": "oklch(0.145 0 0)",
    "--primary": "oklch(0.546 0.215 285.5)",
    "--primary-foreground": "oklch(1 0 0)",
    "--secondary": "oklch(0.97 0 0)",
    "--secondary-foreground": "oklch(0.205 0 0)",
    "--muted": "oklch(0.97 0 0)",
    "--muted-foreground": "oklch(0.556 0 0)",
    "--accent": "oklch(0.95 0.03 285.5)",
    "--accent-foreground": "oklch(0.205 0 0)",
    "--border": "oklch(0.922 0 0)",
    "--input": "oklch(0.922 0 0)",
    "--ring": "oklch(0.546 0.215 285.5)",
    "--sidebar": "oklch(1 0 0)",
    "--sidebar-foreground": "oklch(0.145 0 0)",
    "--sidebar-primary": "oklch(0.546 0.215 285.5)",
    "--sidebar-primary-foreground": "oklch(1 0 0)",
    "--sidebar-accent": "oklch(0.95 0.03 285.5)",
    "--sidebar-accent-foreground": "oklch(0.205 0 0)",
    "--sidebar-border": "oklch(0.922 0 0)",
    "--sidebar-ring": "oklch(0.708 0 0)",
  },
  BLACK_GOLD: {
    "--background": "oklch(0.145 0 0)", // Modo oscuro
    "--foreground": "oklch(0.985 0 0)",
    "--card": "oklch(0.205 0 0)",
    "--card-foreground": "oklch(0.985 0 0)",
    "--popover": "oklch(0.205 0 0)",
    "--popover-foreground": "oklch(0.985 0 0)",
    "--primary": "oklch(0.75 0.14 85)", // Dorado
    "--primary-foreground": "oklch(0.145 0 0)",
    "--secondary": "oklch(0.269 0 0)",
    "--secondary-foreground": "oklch(0.985 0 0)",
    "--muted": "oklch(0.269 0 0)",
    "--muted-foreground": "oklch(0.708 0 0)",
    "--accent": "oklch(0.3 0.08 85)",
    "--accent-foreground": "oklch(0.985 0 0)",
    "--border": "oklch(1 0 0 / 12%)",
    "--input": "oklch(1 0 0 / 15%)",
    "--ring": "oklch(0.75 0.14 85)",
    "--sidebar": "oklch(0.1 0 0)", // Sidebar ultra oscuro
    "--sidebar-foreground": "oklch(0.985 0 0)",
    "--sidebar-primary": "oklch(0.75 0.14 85)",
    "--sidebar-primary-foreground": "oklch(0.145 0 0)",
    "--sidebar-accent": "oklch(0.22 0.05 85)",
    "--sidebar-accent-foreground": "oklch(0.985 0 0)",
    "--sidebar-border": "oklch(0.269 0 0)",
    "--sidebar-ring": "oklch(0.556 0 0)",
  },
  EMERALD: {
    "--background": "oklch(0.98 0.01 160.3)", // Fondo tinte verde tenue
    "--foreground": "oklch(0.145 0 0)",
    "--card": "oklch(1 0 0)",
    "--card-foreground": "oklch(0.145 0 0)",
    "--popover": "oklch(1 0 0)",
    "--popover-foreground": "oklch(0.145 0 0)",
    "--primary": "oklch(0.627 0.135 160.3)", // Esmeralda
    "--primary-foreground": "oklch(1 0 0)",
    "--secondary": "oklch(0.95 0.02 160.3)",
    "--secondary-foreground": "oklch(0.205 0 0)",
    "--muted": "oklch(0.95 0.02 160.3)",
    "--muted-foreground": "oklch(0.5 0.02 160.3)",
    "--accent": "oklch(0.92 0.04 160.3)",
    "--accent-foreground": "oklch(0.205 0 0)",
    "--border": "oklch(0.9 0.02 160.3)",
    "--input": "oklch(0.9 0.02 160.3)",
    "--ring": "oklch(0.627 0.135 160.3)",
    "--sidebar": "oklch(0.25 0.05 160.3)", // Sidebar verde bosque
    "--sidebar-foreground": "oklch(0.98 0.01 160.3)",
    "--sidebar-primary": "oklch(0.75 0.12 160.3)",
    "--sidebar-primary-foreground": "oklch(0.145 0 0)",
    "--sidebar-accent": "oklch(0.32 0.06 160.3)",
    "--sidebar-accent-foreground": "oklch(0.98 0.01 160.3)",
    "--sidebar-border": "oklch(0.3 0.05 160.3)",
    "--sidebar-ring": "oklch(0.627 0.135 160.3)",
  },
  CORAL_WARM: {
    "--background": "oklch(0.98 0.01 40)", // Fondo cálido
    "--foreground": "oklch(0.145 0 0)",
    "--card": "oklch(1 0 0)",
    "--card-foreground": "oklch(0.145 0 0)",
    "--popover": "oklch(1 0 0)",
    "--popover-foreground": "oklch(0.145 0 0)",
    "--primary": "oklch(0.65 0.2 25)", // Coral
    "--primary-foreground": "oklch(1 0 0)",
    "--secondary": "oklch(0.95 0.02 40)",
    "--secondary-foreground": "oklch(0.205 0 0)",
    "--muted": "oklch(0.95 0.02 40)",
    "--muted-foreground": "oklch(0.5 0.02 40)",
    "--accent": "oklch(0.92 0.05 40)",
    "--accent-foreground": "oklch(0.205 0 0)",
    "--border": "oklch(0.9 0.02 40)",
    "--input": "oklch(0.9 0.02 40)",
    "--ring": "oklch(0.65 0.2 25)",
    "--sidebar": "oklch(1 0 0)",
    "--sidebar-foreground": "oklch(0.145 0 0)",
    "--sidebar-primary": "oklch(0.65 0.2 25)",
    "--sidebar-primary-foreground": "oklch(1 0 0)",
    "--sidebar-accent": "oklch(0.92 0.05 40)",
    "--sidebar-accent-foreground": "oklch(0.205 0 0)",
    "--sidebar-border": "oklch(0.9 0.02 40)",
    "--sidebar-ring": "oklch(0.65 0.2 25)",
  },
  OCEAN_BLUE: {
    "--background": "oklch(0.98 0.01 240)", // Fondo tinte azulado
    "--foreground": "oklch(0.145 0 0)",
    "--card": "oklch(1 0 0)",
    "--card-foreground": "oklch(0.145 0 0)",
    "--popover": "oklch(1 0 0)",
    "--popover-foreground": "oklch(0.145 0 0)",
    "--primary": "oklch(0.609 0.126 221.2)", // Azul Océano
    "--primary-foreground": "oklch(1 0 0)",
    "--secondary": "oklch(0.95 0.02 240)",
    "--secondary-foreground": "oklch(0.205 0 0)",
    "--muted": "oklch(0.95 0.02 240)",
    "--muted-foreground": "oklch(0.5 0.02 240)",
    "--accent": "oklch(0.92 0.04 240)",
    "--accent-foreground": "oklch(0.205 0 0)",
    "--border": "oklch(0.9 0.02 240)",
    "--input": "oklch(0.9 0.02 240)",
    "--ring": "oklch(0.609 0.126 221.2)",
    "--sidebar": "oklch(0.2 0.05 240)", // Sidebar azul profundo
    "--sidebar-foreground": "oklch(0.98 0.01 240)",
    "--sidebar-primary": "oklch(0.7 0.1 221.2)",
    "--sidebar-primary-foreground": "oklch(0.145 0 0)",
    "--sidebar-accent": "oklch(0.28 0.06 240)",
    "--sidebar-accent-foreground": "oklch(0.98 0.01 240)",
    "--sidebar-border": "oklch(0.25 0.05 240)",
    "--sidebar-ring": "oklch(0.609 0.126 221.2)",
  },
} as const;

export type LegacyThemePresetId = keyof typeof THEME_PRESETS;
export type ThemePresetId = WindowsThemeId | MaterialThemeId | LinkityThemeId | LegacyThemePresetId | typeof TEMA_PERSONALIZADO_ID;

/**
 * Punto de entrada ÚNICO para resolver el tema real de un tenant — lo usa
 * tanto app/(tenant)/[tenant]/layout.tsx y app/(auth)/[tenant]/page.tsx
 * (con las intensidades reales guardadas en BD) como
 * ConfiguracionClient.tsx (con las intensidades que el admin está
 * arrastrando en los sliders, antes de guardar) — misma función en los
 * dos lados, para que la vista previa y el resultado guardado sean
 * SIEMPRE idénticos.
 *
 * `themeIntensityFondo` es opcional (2026-09-24): si se omite, toma el
 * valor de `themeIntensity` — así una llamada vieja que solo mandaba la
 * intensidad de fichas sigue viéndose exactamente igual que antes.
 *
 * `themeCustomColors` (2026-09-24, tema "Personalizado"): solo se usa
 * cuando themePreset === TEMA_PERSONALIZADO_ID — puede venir tal cual del
 * campo Json de Prisma (sin validar) o ya como ColoresPersonalizados desde
 * la vista previa en vivo de ConfiguracionClient.tsx; parseColoresPersonalizados
 * hace de filtro en ambos casos. Si viene null/inválido (negocio que nunca
 * configuró sus colores, o un dato corrupto) cae a
 * COLORES_PERSONALIZADOS_DEFAULT en vez de tronar a medio render.
 */
export function resolverPresetTenant(
  themePreset: string,
  themeIntensity: number | null | undefined,
  themeIntensityFondo?: number | null,
  themeCustomColors?: unknown,
): Record<string, string> {
  const intensidadFicha = themeIntensity ?? INTENSIDAD_DEFAULT;
  const intensidadFondo = themeIntensityFondo ?? intensidadFicha;
  if (themePreset === TEMA_PERSONALIZADO_ID) {
    const colores = parseColoresPersonalizados(themeCustomColors) ?? COLORES_PERSONALIZADOS_DEFAULT;
    return construirPresetPersonalizado(colores, intensidadFicha, intensidadFondo);
  }
  if (themePreset in WINDOWS_THEMES) {
    return construirPresetWindowsPhone(themePreset as WindowsThemeId, intensidadFicha, intensidadFondo);
  }
  if (themePreset in MATERIAL_THEMES) {
    return construirPresetMaterial(themePreset as MaterialThemeId, intensidadFicha, intensidadFondo);
  }
  if (themePreset in LINKITY_THEMES) {
    return construirPresetLinkity(themePreset as LinkityThemeId, intensidadFicha, intensidadFondo);
  }
  if (themePreset in THEME_PRESETS) {
    // Mismo fix de "color"/"colorScheme" que construirPresetDesdeDef (ver
    // el comentario largo ahí) — estos 5 presets viejos (oklch) ya no se
    // pueden elegir, pero un tenant que se quedó con uno no debe arrastrar
    // el mismo bug de texto negro heredado. Solo BLACK_GOLD es oscuro.
    const preset = THEME_PRESETS[themePreset as LegacyThemePresetId];
    return { ...preset, color: "var(--foreground)", colorScheme: themePreset === "BLACK_GOLD" ? "dark" : "light" };
  }
  return construirPresetWindowsPhone("LUMIA_COBALT", INTENSIDAD_DEFAULT, INTENSIDAD_DEFAULT);
}

// Id del elemento que envuelve TenantShell en app/(tenant)/[tenant]/layout.tsx
// — ConfiguracionClient.tsx lo usa para aplicar la vista previa en vivo del
// tema directo sobre ese nodo (mismo lugar donde el layout ya pone los
// tokens del tema real vía inline style), sin tocar la base de datos hasta
// que el negocio le dé "Guardar cambios".
export const TENANT_THEME_ROOT_ID = "tenant-theme-root";
