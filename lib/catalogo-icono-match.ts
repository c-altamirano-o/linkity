import { iconoArranque, type IconoArranqueId } from "@/lib/catalogo-iconos-base";

/**
 * Adivinador de ícono por palabra clave (2026-09-26, a petición de Carlos:
 * al importar un catálogo desde CSV/Excel de otro sistema, ninguna fila
 * trae un ícono, así que casi todo terminaba con el emoji genérico de tipo
 * (📦/🔩/🔧, ver TYPE_FALLBACK_EMOJI en lib/catalogo-data.ts). Se usa en dos
 * lugares de catalogo-actions.ts: importarProductosAction (cada fila nueva)
 * y autoAsignarIconosAction (arreglo retroactivo de un clic para productos
 * que ya se quedaron sin ícono, sin importar cómo se dieron de alta).
 *
 * Nunca sobrescribe un ícono que el usuario ya puso a mano — ambos llamadores
 * solo lo usan cuando el producto no trae ninguno. Si no hay ninguna
 * coincidencia razonable devuelve null y el producto se queda exactamente
 * como hoy (emoji=null, cae al emoji de tipo por default) — no hay
 * regresión posible, en el peor caso simplemente no adivina nada.
 *
 * Es una heurística de texto, no magia: cubre los nombres de producto más
 * comunes de un negocio de accesorios de celular/retail (el caso real que
 * lo motivó), no cualquier catálogo imaginable. Carlos puede seguir
 * corrigiendo a mano cualquier producto desde el modal de editar — esto
 * solo reduce cuántos necesitan ese ajuste manual, no lo elimina.
 */

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

interface ReglaIcono {
  icon: IconoArranqueId;
  palabras: string[];
}

// Orden importa: la PRIMERA regla que haga match gana — las más
// específicas van primero para no perderse detrás de una más genérica
// (ej. "cámara de seguridad" antes que "cámara" a secas).
const REGLAS_NOMBRE: ReglaIcono[] = [
  { icon: "SecurityCamera", palabras: ["camara de seguridad", "camara seguridad", "cctv", "videovigilancia"] },
  { icon: "Headphones", palabras: ["audifono", "auricular", "headphone", "cascos"] },
  { icon: "SpeakerHigh", palabras: ["bocina", "altavoz", "parlante", "speaker"] },
  { icon: "Camera", palabras: ["camara", "webcam"] },
  { icon: "Sunglasses", palabras: ["lentes de sol", "lente de sol", "gafas", "sunglass", "goggles"] },
  { icon: "ShieldCheck", palabras: ["protector", "funda", "mica", "case", "forro"] },
  { icon: "Power", palabras: ["power bank", "bateria portatil"] },
  { icon: "BatteryCharging", palabras: ["cargador", "carga rapida", "charger"] },
  { icon: "Battery", palabras: ["bateria", "pila"] },
  { icon: "DeviceTablet", palabras: ["tablet"] },
  { icon: "Usb", palabras: ["cable", "usb", "auxiliar", "otg", "hdmi"] },
  { icon: "Plug", palabras: ["adaptador", "adapter", "enchufe"] },
  { icon: "GameController", palabras: ["control", "joystick", "gamepad", "videojuego", "consola"] },
  { icon: "Lightbulb", palabras: ["foco", "lampara", "ring light", " led", "iluminacion", "luz"] },
  { icon: "Mouse", palabras: ["mouse", "raton"] },
  { icon: "Keyboard", palabras: ["teclado", "keyboard"] },
  { icon: "Laptop", palabras: ["laptop", "notebook", "computadora"] },
  { icon: "HardDrive", palabras: ["disco duro", "ssd", "almacenamiento"] },
  { icon: "MemoryStick", palabras: ["memoria ram", "memoria usb"] },
  { icon: "PenTool", palabras: ["pluma", "stylus", "lapiz optico", "touch pen"] },
  { icon: "Lock", palabras: ["candado", "cerradura"] },
  { icon: "Key", palabras: ["llave"] },
  { icon: "Bike", palabras: ["bicicleta", "motocicleta", " moto "] },
  { icon: "Car", palabras: ["auto", "carro", "coche", "retrovisor", "vehiculo"] },
  { icon: "CupSoda", palabras: ["refresco", "agua embotellada", "bebida"] },
  { icon: "Basket", palabras: ["snack", "dulce", "botana"] },
  { icon: "Watch", palabras: ["reloj", "smartwatch"] },
  { icon: "Devices", palabras: ["dispositivo inteligente", "smart home", "gadget"] },
  { icon: "Cpu", palabras: ["procesador", "circuito"] },
  { icon: "ShoppingBag", palabras: ["bolsa", "mochila"] },
  { icon: "Dumbbell", palabras: ["pesa", "mancuerna"] },
  { icon: "Scissors", palabras: ["tijera"] },
  { icon: "Wrench", palabras: ["destornillador", "llave inglesa"] },
];

// Fallback por nombre de CATEGORÍA, solo cuando el nombre del producto no
// dio ninguna coincidencia — cubre casos como "Soporte X" (soportes,
// tripiés, bases para celular/auto/bici) que no tienen una palabra de
// producto confiable pero casi siempre viven en una categoría reconocible.
const REGLAS_CATEGORIA: ReglaIcono[] = [
  { icon: "Cube", palabras: ["soporte"] },
  { icon: "SpeakerHigh", palabras: ["audio"] },
  { icon: "Usb", palabras: ["cable", "adaptador"] },
  { icon: "BatteryCharging", palabras: ["cargador"] },
  { icon: "ShieldCheck", palabras: ["protector", "funda"] },
  { icon: "Power", palabras: ["power bank"] },
  { icon: "DeviceTablet", palabras: ["tablet"] },
  { icon: "Watch", palabras: ["wearable"] },
  { icon: "SecurityCamera", palabras: ["seguridad", "vigilancia"] },
  { icon: "Lightbulb", palabras: ["iluminacion"] },
  { icon: "GameController", palabras: ["videojuego", "juguete", "entretenimiento"] },
  { icon: "Car", palabras: ["auto"] },
  { icon: "Dumbbell", palabras: ["deportivo"] },
  { icon: "CupSoda", palabras: ["bebida"] },
  { icon: "Cpu", palabras: ["electronico", "electronica", "inteligente"] },
  { icon: "Laptop", palabras: ["computo"] },
  { icon: "HardDrive", palabras: ["almacenamiento"] },
  { icon: "Wrench", palabras: ["herramienta"] },
];

function buscarEnReglas(texto: string, reglas: ReglaIcono[]): IconoArranqueId | null {
  for (const r of reglas) {
    if (r.palabras.some((p) => texto.includes(p))) return r.icon;
  }
  return null;
}

/**
 * Intenta adivinar un ícono razonable a partir del nombre del producto
 * (más específico) y, si no hay nada, del nombre de su categoría (más
 * genérico). Devuelve el valor listo para guardar en Product.emoji
 * (ej. "icon:ShieldCheck"), o null si no encontró ninguna coincidencia.
 */
export function adivinarIconoProducto(nombre: string, categoryName?: string | null): string | null {
  const nombreNorm = ` ${normalizar(nombre)} `;
  const porNombre = buscarEnReglas(nombreNorm, REGLAS_NOMBRE);
  if (porNombre) return iconoArranque(porNombre);

  if (categoryName) {
    const catNorm = ` ${normalizar(categoryName)} `;
    const porCategoria = buscarEnReglas(catNorm, REGLAS_CATEGORIA);
    if (porCategoria) return iconoArranque(porCategoria);
  }

  return null;
}
