/**
 * Claves e "id"s de los íconos del catálogo de arranque — SIN ninguna
 * dependencia de React ni de @phosphor-icons/react.
 *
 * Por qué existe este archivo aparte de lib/catalogo-iconos.tsx: ese otro
 * archivo importa los ~60 componentes reales de @phosphor-icons/react (para
 * poder pintarlos con <ProductoIcono>), y esa librería crea un React Context
 * (createContext) a nivel de módulo para su tema de íconos (tamaño/color/peso
 * por default). lib/catalogo-arranque.ts es "server-only" y se usa desde
 * page.tsx de /bienvenida (onboarding) — un Server Component — pero lo único
 * que necesita de los íconos es el STRING que se guarda en Product.emoji
 * (ej. "icon:Wrench"), nunca el componente real. Aun así, como antes
 * importaba iconoArranque() directo de catalogo-iconos.tsx, todo el árbol de
 * imports de esa librería (incluida su llamada a createContext) se arrastraba
 * al bundle de servidor de /bienvenida — y bajo la condición "react-server"
 * que usa Next para Server Components, el export de React que usa Phosphor
 * para createContext no existe, causando en build:
 *   TypeError: (0 , b.createContext) is not a function
 *   at module evaluation (.../lib_catalogo-arranque_ts_....js)
 *   Error: Failed to collect page data for /[tenant]/bienvenida
 *
 * Solución: separar la parte "solo strings" (este archivo, sin imports de
 * React/Phosphor) de la parte "componentes reales" (catalogo-iconos.tsx, que
 * sigue existiendo igual para los Client Components que sí pintan el ícono:
 * CatalogoClient.tsx, POSClient.tsx, InventarioClient.tsx). catalogo-arranque.ts
 * ahora importa iconoArranque() de AQUÍ, no de catalogo-iconos.tsx, así que su
 * bundle de servidor ya no incluye @phosphor-icons/react en absoluto.
 *
 * IMPORTANTE: ICON_IDS debe tener EXACTAMENTE las mismas claves que el mapa
 * ICONOS en lib/catalogo-iconos.tsx (ese archivo tipa su Record con
 * IconoArranqueId, importado de aquí, así que un descuadre entre ambos da un
 * error de TypeScript inmediato en vez de fallar en silencio).
 */

export const ICON_PREFIX = "icon:";

export const ICON_IDS = [
  "Search", "Wrench", "Battery", "BatteryCharging", "Plug", "Smartphone",
  "ShieldCheck", "Zap", "Car", "Bike", "Droplet", "Droplets", "CircleGauge",
  "Cog", "Thermometer", "WashingMachine", "Refrigerator", "AirVent", "Snowflake",
  "Laptop", "HardDrive", "MemoryStick", "Mouse", "Keyboard", "Brush", "Scissors",
  "Palette", "SprayCan", "Sparkles", "Smile", "Stethoscope", "ClipboardList",
  "Bandage", "Cross", "PawPrint", "Syringe", "Pill", "Bath", "Activity", "Bone",
  "HeartPulse", "Watch", "Gem", "Footprints", "Key", "KeyRound", "Lock", "Sofa",
  "Armchair", "Ruler", "Dumbbell", "Shirt", "PenTool", "CupSoda", "Cookie",
  "ShoppingBag", "Heart", "Package", "Flower2", "Fan", "Feather", "Star", "Tag",
] as const;

export type IconoArranqueId = (typeof ICON_IDS)[number];

/** Construye el valor que se guarda en Product.emoji para un ícono del sistema. */
export function iconoArranque(id: IconoArranqueId): string {
  return `${ICON_PREFIX}${id}`;
}
