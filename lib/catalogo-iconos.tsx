// Sin "use client": este módulo no usa hooks, así que en principio es
// "universal". PERO desde 2026-09-17 lib/catalogo-arranque.ts (server-only,
// usado por el Server Component de /bienvenida) YA NO importa nada de este
// archivo — importa iconoArranque()/ICON_PREFIX/IconoArranqueId de
// lib/catalogo-iconos-base.ts, que no toca React ni @phosphor-icons/react
// en absoluto. Motivo: los componentes reales de Phosphor que se importan
// abajo crean un React Context (createContext) a nivel de módulo para su
// tema de íconos, y bajo la condición "react-server" que usa Next para
// Server Components ese export de React no existe, lo que rompía el build
// de /bienvenida con "TypeError: (0 , b.createContext) is not a function".
// Este archivo se queda como está (con los componentes reales) para los
// Client Components que sí pintan el ícono (CatalogoClient.tsx,
// POSClient.tsx, InventarioClient.tsx) — ellos SÍ pueden cargar Phosphor
// porque su bundle no pasa por la condición "react-server".
import { ICON_PREFIX, ICON_IDS, iconoArranque, type IconoArranqueId } from "@/lib/catalogo-iconos-base";
import {
  MagnifyingGlassIcon, WrenchIcon, BatteryFullIcon, BatteryChargingIcon, PlugIcon,
  DeviceMobileIcon, ShieldCheckIcon, LightningIcon, CarIcon, BicycleIcon, DropIcon,
  DropHalfIcon, GaugeIcon, GearIcon, ThermometerIcon, WashingMachineIcon,
  SnowflakeIcon, WindIcon, LaptopIcon, HardDriveIcon, MemoryIcon, MouseIcon,
  KeyboardIcon, PaintBrushIcon, ScissorsIcon, PaletteIcon, SprayBottleIcon,
  SparkleIcon, SmileyIcon, StethoscopeIcon, ClipboardTextIcon, FirstAidKitIcon,
  CrossIcon, PawPrintIcon, SyringeIcon, PillIcon, BathtubIcon, PulseIcon, BoneIcon,
  HeartbeatIcon, WatchIcon, DiamondIcon, FootprintsIcon, KeyIcon, KeyholeIcon,
  LockIcon, CouchIcon, ArmchairIcon, RulerIcon, BarbellIcon, TShirtIcon, PenNibIcon,
  JarIcon, CookieIcon, ShoppingBagIcon, HeartIcon, PackageIcon, FlowerLotusIcon,
  FanIcon, FeatherIcon, StarIcon, TagIcon,
  type Icon,
} from "@phosphor-icons/react";

/**
 * Iconos vectoriales para el catálogo de arranque (lib/catalogo-arranque.ts).
 *
 * Historia: primero se usó lucide-react (mismo set que el resto de la app)
 * para reemplazar los emoji del catálogo sugerido — Carlos los veía
 * "demasiado genéricos". Después Carlos instaló @phosphor-icons/react y
 * pidió migrar estos iconos de producto específicamente a esa librería
 * (`npm install @phosphor-icons/react`, ya en package.json/node_modules de
 * su máquina) — el resto de la app (botones, menú lateral, modales) se
 * queda con lucide-react a propósito, este cambio es solo para el ícono de
 * producto/servicio.
 *
 * Cada nombre de Phosphor se verificó existente uno por uno (instalando
 * @phosphor-icons/react@2.1.10 en un directorio aparte y revisando sus
 * .d.ts/exports compilados) antes de usarlo aquí — igual que se hizo con
 * lucide-react — porque varios conceptos no tienen el mismo nombre en las
 * dos librerías (ej. "Search"→MagnifyingGlass, "Cog"→Gear,
 * "Smartphone"→DeviceMobile, "SprayCan"→SprayBottle). Se usan los exports
 * con sufijo "Icon" (ej. WrenchIcon) en vez del nombre corto sin sufijo
 * porque Phosphor marcó ese nombre corto como @deprecated a partir de la
 * v2 — sigue funcionando pero el sufijo es la forma recomendada a futuro.
 *
 * Se usa el peso "regular" (el que Carlos eligió de los 6 que ofrece
 * Phosphor: thin/light/regular/bold/fill/duotone) — es además el peso por
 * default de la librería, así que no hace falta pasar `weight` en cada
 * ícono, pero <ProductoIcono> lo pasa explícito para dejar la decisión de
 * diseño documentada en el código, no implícita.
 *
 * Los iconos "regular"/"bold"/"fill" de Phosphor dibujan su trazo con
 * fill="currentColor" salvo que se pase un `color` explícito — igual que
 * lucide-react — así que el color de cada ícono lo sigue decidiendo por
 * completo la clase de Tailwind que le pase el className del caller (ej.
 * "text-primary"), incluyendo los tokens de tema (--primary, --accent,
 * etc. de lib/theme-presets.ts). Esto es lo que permite que el color del
 * ícono cambie solo con que el negocio cambie de tema en Configuración,
 * sin tocar nada aquí — ver el comentario de tipoConfig en
 * CatalogoClient.tsx para el detalle de qué clase usa cada tipo de
 * producto.
 *
 * Product.emoji sigue siendo un campo de texto libre en el schema — sin
 * cambios ahí. Lo que sí cambió (2026-09-16, a petición de Carlos: "¿aún se
 * puede modificar cómo selecciona el usuario el ícono de su producto?") es
 * el modal de crear/editar producto (CatalogoClient.tsx): antes solo tenía
 * un campo de texto para escribir un emoji a mano; ahora tiene un selector
 * con dos modos — "Elegir de la galería" (esta misma paleta de ICONOS, la
 * que ya usa el catálogo de arranque) o "Escribir mi propio emoji" (el
 * campo de texto libre de siempre, para quien prefiera un emoji real que no
 * esté en la galería). Cualquiera de los dos caminos guarda su resultado en
 * el mismo campo Product.emoji: un ícono elegido de la galería se guarda
 * con el prefijo ICON_PREFIX ("icon:Wrench", "icon:Smartphone", ...), un
 * emoji escrito a mano se guarda tal cual. <ProductoIcono> es el único
 * lugar que sabe interpretar esa clave: si el valor trae el prefijo y la
 * clave existe en ICONOS, renderiza el ícono de Phosphor; si no, lo trata
 * como texto normal (el emoji escrito a mano, o vacío) — así los tres
 * lugares que muestran esta miniatura (Catálogo, POS, Inventario) se
 * comportan igual sin duplicar esta lógica tres veces.
 *
 * IMPORTANTE: las claves de este mapa (Search, Wrench, Smartphone, ...) son
 * las que YA están guardadas en Product.emoji en la base de datos real de
 * Carlos (incluyendo filas sembradas por el catálogo de arranque y las 8
 * filas de Difussion Barbería corregidas a mano por SQL en una sesión
 * anterior) — por eso NO se renombraron al migrar de lucide-react a
 * Phosphor, solo cambió a qué componente apunta cada clave internamente.
 * lib/catalogo-arranque.ts tampoco necesitó ningún cambio: sigue llamando
 * iconoArranque("Wrench") como antes, ajeno a qué librería hay detrás.
 * Se re-verificó programáticamente que, tras el cambio de librería, ningún
 * ítem sigue repitiendo el mismo ícono renderizado dentro de la misma
 * pestaña (Productos/Refacciones/Servicios) de un mismo rubro — la única
 * clave que comparte ícono con otra ("Refrigerator" y "Snowflake" apuntan
 * ambas a SnowflakeIcon) nunca aparece junto a su par dentro del mismo
 * rubro, así que no genera un duplicado visible en ningún catálogo real.
 *
 * ICON_PREFIX, ICON_IDS, IconoArranqueId e iconoArranque() viven en
 * lib/catalogo-iconos-base.ts (sin imports de React/Phosphor) y se
 * re-exportan aquí tal cual, para que nada que ya los importara de este
 * archivo (catalogo-arranque.ts) necesite cambiar. ICONOS se queda tipado
 * como Record<string, Icon> (no Record<IconoArranqueId, Icon>) porque
 * ProductoIcono lo indexa con un string arbitrario tomado en tiempo de
 * ejecución (value.slice(...)), no con una clave literal conocida en tiempo
 * de compilación.
 */

export { ICON_PREFIX, ICON_IDS, iconoArranque };
export type { IconoArranqueId };

export const ICONOS: Record<string, Icon> = {
  Search: MagnifyingGlassIcon,
  Wrench: WrenchIcon,
  Battery: BatteryFullIcon,
  BatteryCharging: BatteryChargingIcon,
  Plug: PlugIcon,
  Smartphone: DeviceMobileIcon,
  ShieldCheck: ShieldCheckIcon,
  Zap: LightningIcon,
  Car: CarIcon,
  Bike: BicycleIcon,
  Droplet: DropIcon,
  Droplets: DropHalfIcon,
  CircleGauge: GaugeIcon,
  Cog: GearIcon,
  Thermometer: ThermometerIcon,
  WashingMachine: WashingMachineIcon,
  Refrigerator: SnowflakeIcon,
  AirVent: WindIcon,
  Snowflake: SnowflakeIcon,
  Laptop: LaptopIcon,
  HardDrive: HardDriveIcon,
  MemoryStick: MemoryIcon,
  Mouse: MouseIcon,
  Keyboard: KeyboardIcon,
  Brush: PaintBrushIcon,
  Scissors: ScissorsIcon,
  Palette: PaletteIcon,
  SprayCan: SprayBottleIcon,
  Sparkles: SparkleIcon,
  Smile: SmileyIcon,
  Stethoscope: StethoscopeIcon,
  ClipboardList: ClipboardTextIcon,
  Bandage: FirstAidKitIcon,
  Cross: CrossIcon,
  PawPrint: PawPrintIcon,
  Syringe: SyringeIcon,
  Pill: PillIcon,
  Bath: BathtubIcon,
  Activity: PulseIcon,
  Bone: BoneIcon,
  HeartPulse: HeartbeatIcon,
  Watch: WatchIcon,
  Gem: DiamondIcon,
  Footprints: FootprintsIcon,
  Key: KeyIcon,
  KeyRound: KeyholeIcon,
  Lock: LockIcon,
  Sofa: CouchIcon,
  Armchair: ArmchairIcon,
  Ruler: RulerIcon,
  Dumbbell: BarbellIcon,
  Shirt: TShirtIcon,
  PenTool: PenNibIcon,
  CupSoda: JarIcon,
  Cookie: CookieIcon,
  ShoppingBag: ShoppingBagIcon,
  Heart: HeartIcon,
  Package: PackageIcon,
  Flower2: FlowerLotusIcon,
  Fan: FanIcon,
  Feather: FeatherIcon,
  Star: StarIcon,
  Tag: TagIcon,
};

export function ProductoIcono({
  value,
  className,
}: {
  value?: string | null;
  className?: string;
}) {
  if (value?.startsWith(ICON_PREFIX)) {
    const Icono = ICONOS[value.slice(ICON_PREFIX.length)];
    if (Icono) return <Icono className={className} weight="regular" />;
  }
  // Fallback: emoji real escrito a mano, o nada.
  return <>{value}</>;
}
