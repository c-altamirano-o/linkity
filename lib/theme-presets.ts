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
// "Chips" de categoría (2026-09-23, a petición de Carlos: "la variedad de
// colores... se vé novedoso y dinámico, pero a la vez minimalista" —
// inspirado en los paneles de LCARS y los tiles de Windows Phone: colores
// planos y saturados, uno distinto por categoría, sin degradados ni
// sombras falsas). Son 8 tonos de una paleta categórica validada (orden
// fijo, banda de luminosidad y separación de daltonismo verificadas con el
// validador de la guía de visualización de datos de Anthropic) — NO
// reemplazan --primary (que sigue siendo el acento de marca del negocio en
// botones, Cobrar, la barra lateral, etc.); son una capa aparte que
// POSClient.tsx usa solo para separar visualmente las categorías del
// catálogo entre sí. El color de texto/ícono de cada chip (--chip-N-fg) ya
// viene resuelto aquí mismo, uno por uno, para cumplir contraste mínimo
// 3:1 (WCAG para elementos gráficos) — no se calcula en el cliente.
// Los 4 temas claros comparten el mismo set (pensado para fondo claro);
// BLACK_GOLD usa el set separado ajustado para fondo oscuro. Si se agrega
// otro tema oscuro más adelante, debe llevar CATEGORY_CHIPS_DARK_VARS
// también.
const CATEGORY_CHIPS_LIGHT_VARS = {
  "--chip-1": "#2a78d6", "--chip-1-fg": "#ffffff", // azul
  "--chip-2": "#eb6834", "--chip-2-fg": "#0b0b0b", // naranja
  "--chip-3": "#1baf7a", "--chip-3-fg": "#0b0b0b", // aqua
  "--chip-4": "#eda100", "--chip-4-fg": "#0b0b0b", // amarillo
  "--chip-5": "#e87ba4", "--chip-5-fg": "#0b0b0b", // magenta
  "--chip-6": "#008300", "--chip-6-fg": "#ffffff", // verde
  "--chip-7": "#4a3aa7", "--chip-7-fg": "#ffffff", // violeta
  "--chip-8": "#e34948", "--chip-8-fg": "#ffffff", // rojo
};

const CATEGORY_CHIPS_DARK_VARS = {
  "--chip-1": "#3987e5", "--chip-1-fg": "#ffffff",
  "--chip-2": "#d95926", "--chip-2-fg": "#ffffff",
  "--chip-3": "#199e70", "--chip-3-fg": "#ffffff",
  "--chip-4": "#c98500", "--chip-4-fg": "#0b0b0b",
  "--chip-5": "#d55181", "--chip-5-fg": "#ffffff",
  "--chip-6": "#008300", "--chip-6-fg": "#ffffff",
  "--chip-7": "#9085e9", "--chip-7-fg": "#0b0b0b",
  "--chip-8": "#e66767", "--chip-8-fg": "#ffffff",
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
