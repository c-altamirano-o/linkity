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
// "Chips" de categoría (2026-09-23/24, a petición de Carlos, en dos pasos:
// primero "la variedad de colores... se vé novedoso y dinámico" y luego,
// tras ver el resultado, la corrección precisa de la estructura de color
// que quería — inspirado en los tiles de Windows Phone/Metro y en LCARS:
// "fondo de la ficha color secundario (varios), fondo de contenedor de
// iconos según el tema, y los iconos el complementario al principal".
// Son 8 tonos de una paleta categórica validada (orden fijo, banda de
// luminosidad y separación de daltonismo verificadas con el validador de
// la guía de visualización de datos de Anthropic) — NO reemplazan
// --primary (que ahora es el fondo de TODA la ventana del catálogo del
// POS, ver POSClient.tsx); --chip-N es el fondo de la FICHA completa
// (antes solo teñía un cuadrito de ícono) y --chip-N-fg es el color del
// texto (nombre/precio) sobre esa ficha — ambos ya resueltos aquí, uno
// por uno, para cumplir contraste de texto normal AA (>= 4.5:1), no solo
// el 3:1 de un ícono. El color del ÍCONO ya no sale de aquí: usa
// --icon-accent (ver abajo), el mismo en las 8 fichas de un tema, sobre
// un contenedor de ícono que a su vez usa --card (el token de "tarjeta"
// del tema, blanco en los temas claros, gris oscuro en BLACK_GOLD) — así
// el ícono siempre contrasta contra un fondo neutral, sin importar de qué
// color sea la ficha que lo rodea.
// Los 4 temas claros comparten el mismo set (pensado para fondo claro);
// BLACK_GOLD usa el set separado ajustado para fondo oscuro. Si se agrega
// otro tema oscuro más adelante, debe llevar CATEGORY_CHIPS_DARK_VARS
// también.
const CATEGORY_CHIPS_LIGHT_VARS = {
  "--chip-1": "#2873cd", "--chip-1-fg": "#ffffff", // azul
  "--chip-2": "#eb6834", "--chip-2-fg": "#0b0b0b", // naranja
  "--chip-3": "#1baf7a", "--chip-3-fg": "#0b0b0b", // aqua
  "--chip-4": "#eda100", "--chip-4-fg": "#0b0b0b", // amarillo
  "--chip-5": "#e87ba4", "--chip-5-fg": "#0b0b0b", // magenta
  "--chip-6": "#008300", "--chip-6-fg": "#ffffff", // verde
  "--chip-7": "#4a3aa7", "--chip-7-fg": "#ffffff", // violeta
  "--chip-8": "#cc4241", "--chip-8-fg": "#ffffff", // rojo
};

const CATEGORY_CHIPS_DARK_VARS = {
  "--chip-1": "#3174c5", "--chip-1-fg": "#ffffff",
  "--chip-2": "#d95926", "--chip-2-fg": "#0b0b0b",
  "--chip-3": "#199e70", "--chip-3-fg": "#0b0b0b",
  "--chip-4": "#c98500", "--chip-4-fg": "#0b0b0b",
  "--chip-5": "#d55181", "--chip-5-fg": "#0b0b0b",
  "--chip-6": "#008300", "--chip-6-fg": "#ffffff",
  "--chip-7": "#9085e9", "--chip-7-fg": "#0b0b0b",
  "--chip-8": "#bd5454", "--chip-8-fg": "#ffffff",
};

// Color del ÍCONO de producto: el complementario (rueda de color, matiz
// +180°) del --primary de CADA tema, ya resuelto uno por uno para
// contrastar >= 3:1 (WCAG para elementos gráficos, no texto) contra
// --card de ese mismo tema, que es el fondo del contenedor de ícono. Se
// queda fijo por tema (no cambia con la categoría) porque el contenedor
// de ícono también es un color neutral fijo — no necesita recalcularse
// por ficha.
const ICON_ACCENT: Record<string, string> = {
  NEUTRAL_TECH: "#857200",
  BLACK_GOLD: "#82abff",
  EMERALD: "#bd65a1",
  CORAL_WARM: "#009cb4",
  OCEAN_BLUE: "#c16643",
};

// Cuántos chips hay disponibles — POSClient.tsx usa esto para saber cuándo
// "envolver" (ciclar) si un negocio llega a tener más de 8 categorías; con
// más de 8 dos categorías comparten color, pero aquí es solo variedad
// decorativa (el nombre de categoría y de producto ya distinguen cada uno),
// no una codificación de identidad que dependa exclusivamente del color.
export const CANTIDAD_CHIPS_CATEGORIA = 8;

export const THEME_PRESETS = {
  NEUTRAL_TECH: {
    ...CATEGORY_CHIPS_LIGHT_VARS,
    "--icon-accent": ICON_ACCENT.NEUTRAL_TECH,
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
    ...CATEGORY_CHIPS_DARK_VARS,
    "--icon-accent": ICON_ACCENT.BLACK_GOLD,
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
    ...CATEGORY_CHIPS_LIGHT_VARS,
    "--icon-accent": ICON_ACCENT.EMERALD,
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
    ...CATEGORY_CHIPS_LIGHT_VARS,
    "--icon-accent": ICON_ACCENT.CORAL_WARM,
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
    ...CATEGORY_CHIPS_LIGHT_VARS,
    "--icon-accent": ICON_ACCENT.OCEAN_BLUE,
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

export type ThemePresetId = keyof typeof THEME_PRESETS;

// Id del elemento que envuelve TenantShell en app/(tenant)/[tenant]/layout.tsx
// — ConfiguracionClient.tsx lo usa para aplicar la vista previa en vivo del
// tema directo sobre ese nodo (mismo lugar donde el layout ya pone los
// tokens del tema real vía inline style), sin tocar la base de datos hasta
// que el negocio le dé "Guardar cambios".
export const TENANT_THEME_ROOT_ID = "tenant-theme-root";
