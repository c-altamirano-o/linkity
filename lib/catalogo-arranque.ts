import "server-only";
// Importa de catalogo-iconos-base.ts (NO de catalogo-iconos.tsx) a propósito:
// esa otra versión trae los ~60 componentes reales de @phosphor-icons/react,
// cuya llamada interna a createContext rompe el bundle de servidor de
// /bienvenida bajo la condición "react-server" de Next. Este módulo base solo
// expone el string "icon:<id>" (iconoArranque), sin tocar React/Phosphor —
// ver el comentario largo en catalogo-iconos-base.ts para el detalle.
import { iconoArranque } from "@/lib/catalogo-iconos-base";

/**
 * Catálogo de arranque por rubro. Resuelve el "no tengo nada que vender"
 * de un negocio recién registrado: un puñado de productos/servicios de
 * ejemplo reales para su giro, que el dueño puede editar o borrar después
 * — no es data de mockup para mostrar en pantalla, son filas reales de
 * Product que el negocio pidió crear con un clic (acción explícita del
 * usuario, ver cargarCatalogoArranqueAction en catalogo-actions.ts), así
 * que no rompe el criterio de "no fabricar datos" del resto del proyecto.
 *
 * Precios en MXN, razonables para un negocio típico mexicano de cada
 * rubro — de ningún modo son precios que Carlos deba respetar como
 * catálogo oficial, son solo un punto de partida editable.
 *
 * `emoji` guarda un ícono del sistema (lib/catalogo-iconos.tsx) en vez de
 * un emoji de texto — Carlos pidió reemplazarlos porque "demeritan la
 * estética del sistema". El nombre del campo se queda igual (así no hace
 * falta tocar el schema ni el modal de crear/editar producto, que sigue
 * aceptando cualquier emoji escrito a mano para productos que el negocio
 * dé de alta él mismo).
 *
 * Los valores que se usan aquí abajo (iconoArranque("Wrench"), etc.) son
 * claves lógicas propias del proyecto, NO nombres de ninguna librería de
 * iconos en particular — lib/catalogo-iconos.tsx es el único lugar que
 * sabe a qué componente real apunta cada clave (hoy @phosphor-icons/react;
 * antes lucide-react). Este archivo no cambia si esa librería cambia.
 *
 * Regla de asignación (ajustada tras feedback de Carlos: "los iconos... los
 * veo demasiado genéricos"): CatalogoClient.tsx agrupa la vista en 3
 * pestañas por Product.type (Productos/Refacciones/Servicios) — dentro de
 * CADA pestaña de un mismo rubro, ningún ítem repite el ícono de otro, para
 * que nunca se vean dos tarjetas idénticas una junto a otra. Repetir un
 * ícono ENTRE pestañas distintas (ej. "Droplet" en un servicio y también en
 * un producto) o entre rubros distintos sí es válido — no hace falta que
 * cada ícono sea único en todo el catálogo, solo dentro de la misma vista.
 */

export interface ItemArranque {
  categoryName: string;
  categoryType: "PRODUCT" | "PART" | "SERVICE";
  name: string;
  type: "PRODUCT" | "PART" | "SERVICE";
  price: number;
  cost?: number;
  emoji?: string;
}

export const CATALOGO_ARRANQUE: Record<string, ItemArranque[]> = {
  reparacion_celulares: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Diagnóstico", type: "SERVICE", price: 100, emoji: iconoArranque("Search") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de pantalla", type: "SERVICE", price: 800, emoji: iconoArranque("Smartphone") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de batería", type: "SERVICE", price: 450, emoji: iconoArranque("BatteryCharging") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de puerto de carga", type: "SERVICE", price: 350, emoji: iconoArranque("Plug") },
    { categoryName: "Refacciones", categoryType: "PART", name: "Pantalla genérica", type: "PART", price: 800, cost: 450, emoji: iconoArranque("Smartphone") },
    { categoryName: "Refacciones", categoryType: "PART", name: "Batería genérica", type: "PART", price: 400, cost: 220, emoji: iconoArranque("Battery") },
    { categoryName: "Accesorios", categoryType: "PRODUCT", name: "Mica de cristal templado", type: "PRODUCT", price: 80, cost: 30, emoji: iconoArranque("ShieldCheck") },
    { categoryName: "Accesorios", categoryType: "PRODUCT", name: "Funda protectora", type: "PRODUCT", price: 150, cost: 60, emoji: iconoArranque("Package") },
    { categoryName: "Accesorios", categoryType: "PRODUCT", name: "Cargador USB-C", type: "PRODUCT", price: 200, cost: 90, emoji: iconoArranque("Zap") },
  ],
  taller_autos: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de aceite", type: "SERVICE", price: 450, emoji: iconoArranque("Droplet") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Afinación mayor", type: "SERVICE", price: 1800, emoji: iconoArranque("Wrench") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Diagnóstico computarizado", type: "SERVICE", price: 350, emoji: iconoArranque("Search") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Alineación y balanceo", type: "SERVICE", price: 600, emoji: iconoArranque("CircleGauge") },
    { categoryName: "Refacciones", categoryType: "PART", name: "Filtro de aceite", type: "PART", price: 150, cost: 70, emoji: iconoArranque("Droplet") },
    { categoryName: "Refacciones", categoryType: "PART", name: "Balatas delanteras (juego)", type: "PART", price: 900, cost: 500, emoji: iconoArranque("Cog") },
    { categoryName: "Refacciones", categoryType: "PART", name: "Batería 12V", type: "PART", price: 1800, cost: 1200, emoji: iconoArranque("Battery") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Aceite de motor 1L", type: "PRODUCT", price: 180, cost: 100, emoji: iconoArranque("Droplet") },
  ],
  taller_motos: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de aceite", type: "SERVICE", price: 250, emoji: iconoArranque("Droplet") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Afinación", type: "SERVICE", price: 700, emoji: iconoArranque("Wrench") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de llanta", type: "SERVICE", price: 400, emoji: iconoArranque("Bike") },
    { categoryName: "Refacciones", categoryType: "PART", name: "Kit de arrastre", type: "PART", price: 1200, cost: 700, emoji: iconoArranque("Cog") },
    { categoryName: "Refacciones", categoryType: "PART", name: "Balatas", type: "PART", price: 350, cost: 180, emoji: iconoArranque("Wrench") },
    { categoryName: "Refacciones", categoryType: "PART", name: "Batería para moto", type: "PART", price: 900, cost: 550, emoji: iconoArranque("Battery") },
  ],
  electrodomesticos: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Diagnóstico", type: "SERVICE", price: 150, emoji: iconoArranque("Search") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Reparación de lavadora", type: "SERVICE", price: 600, emoji: iconoArranque("WashingMachine") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Reparación de refrigerador", type: "SERVICE", price: 800, emoji: iconoArranque("Refrigerator") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Mantenimiento de aire acondicionado", type: "SERVICE", price: 500, emoji: iconoArranque("AirVent") },
    { categoryName: "Refacciones", categoryType: "PART", name: "Motor de lavadora", type: "PART", price: 1200, cost: 700, emoji: iconoArranque("Cog") },
    { categoryName: "Refacciones", categoryType: "PART", name: "Compresor", type: "PART", price: 1800, cost: 1100, emoji: iconoArranque("Fan") },
    { categoryName: "Refacciones", categoryType: "PART", name: "Termostato", type: "PART", price: 350, cost: 180, emoji: iconoArranque("Thermometer") },
  ],
  computadoras: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Diagnóstico", type: "SERVICE", price: 150, emoji: iconoArranque("Search") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Formateo e instalación de sistema", type: "SERVICE", price: 350, emoji: iconoArranque("Laptop") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Limpieza interna", type: "SERVICE", price: 250, emoji: iconoArranque("Brush") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de disco a SSD", type: "SERVICE", price: 400, emoji: iconoArranque("HardDrive") },
    { categoryName: "Refacciones", categoryType: "PART", name: "SSD 480GB", type: "PART", price: 800, cost: 500, emoji: iconoArranque("HardDrive") },
    { categoryName: "Refacciones", categoryType: "PART", name: "Memoria RAM 8GB", type: "PART", price: 700, cost: 450, emoji: iconoArranque("MemoryStick") },
    { categoryName: "Refacciones", categoryType: "PART", name: "Fuente de poder", type: "PART", price: 600, cost: 350, emoji: iconoArranque("Zap") },
    { categoryName: "Accesorios", categoryType: "PRODUCT", name: "Mouse", type: "PRODUCT", price: 150, cost: 70, emoji: iconoArranque("Mouse") },
    { categoryName: "Accesorios", categoryType: "PRODUCT", name: "Teclado", type: "PRODUCT", price: 250, cost: 130, emoji: iconoArranque("Keyboard") },
  ],
  barberia: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Corte de cabello", type: "SERVICE", price: 120, emoji: iconoArranque("Scissors") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Barba", type: "SERVICE", price: 80, emoji: iconoArranque("Feather") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Corte + barba", type: "SERVICE", price: 180, emoji: iconoArranque("Star") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Diseño de cejas", type: "SERVICE", price: 50, emoji: iconoArranque("Sparkles") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Tinte", type: "SERVICE", price: 250, emoji: iconoArranque("Palette") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Cera para cabello", type: "PRODUCT", price: 150, cost: 70, emoji: iconoArranque("Brush") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Aceite para barba", type: "PRODUCT", price: 180, cost: 90, emoji: iconoArranque("Droplet") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Shampoo", type: "PRODUCT", price: 120, cost: 60, emoji: iconoArranque("SprayCan") },
  ],
  consultorio_dental: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Consulta / valoración", type: "SERVICE", price: 300, emoji: iconoArranque("Smile") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Limpieza dental", type: "SERVICE", price: 600, emoji: iconoArranque("Brush") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Extracción simple", type: "SERVICE", price: 800, emoji: iconoArranque("Cross") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Resina", type: "SERVICE", price: 700, emoji: iconoArranque("Droplet") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Blanqueamiento", type: "SERVICE", price: 2500, emoji: iconoArranque("Sparkles") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Cepillo dental", type: "PRODUCT", price: 60, cost: 25, emoji: iconoArranque("Brush") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Pasta dental", type: "PRODUCT", price: 80, cost: 35, emoji: iconoArranque("Droplet") },
  ],
  consultorio_medico: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Consulta general", type: "SERVICE", price: 400, emoji: iconoArranque("Stethoscope") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Consulta de seguimiento", type: "SERVICE", price: 250, emoji: iconoArranque("Cross") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Certificado médico", type: "SERVICE", price: 200, emoji: iconoArranque("ClipboardList") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Curación", type: "SERVICE", price: 150, emoji: iconoArranque("Bandage") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Kit de curación", type: "PRODUCT", price: 100, cost: 50, emoji: iconoArranque("Bandage") },
  ],
  veterinaria: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Consulta general", type: "SERVICE", price: 350, emoji: iconoArranque("PawPrint") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Vacunación", type: "SERVICE", price: 300, emoji: iconoArranque("Syringe") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Desparasitación", type: "SERVICE", price: 200, emoji: iconoArranque("Pill") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Baño y corte", type: "SERVICE", price: 250, emoji: iconoArranque("Bath") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cirugía menor", type: "SERVICE", price: 1500, emoji: iconoArranque("Activity") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Alimento premium 1kg", type: "PRODUCT", price: 120, cost: 70, emoji: iconoArranque("Bone") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Shampoo antipulgas", type: "PRODUCT", price: 150, cost: 80, emoji: iconoArranque("SprayCan") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Collar antipulgas", type: "PRODUCT", price: 180, cost: 90, emoji: iconoArranque("PawPrint") },
  ],
  relojeria_joyeria: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de pila de reloj", type: "SERVICE", price: 80, emoji: iconoArranque("Watch") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Ajuste de extensión", type: "SERVICE", price: 100, emoji: iconoArranque("Ruler") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Limpieza y pulido", type: "SERVICE", price: 200, emoji: iconoArranque("Gem") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Reparación de cierre", type: "SERVICE", price: 150, emoji: iconoArranque("Wrench") },
    { categoryName: "Refacciones", categoryType: "PART", name: "Pila de reloj", type: "PART", price: 40, cost: 15, emoji: iconoArranque("Battery") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Correa de piel", type: "PRODUCT", price: 250, cost: 120, emoji: iconoArranque("Watch") },
  ],
  zapateria: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de suela", type: "SERVICE", price: 250, emoji: iconoArranque("Footprints") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de tacón", type: "SERVICE", price: 150, emoji: iconoArranque("Wrench") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Boleada", type: "SERVICE", price: 50, emoji: iconoArranque("Sparkles") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Ajuste de talla", type: "SERVICE", price: 100, emoji: iconoArranque("Ruler") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Plantillas", type: "PRODUCT", price: 120, cost: 55, emoji: iconoArranque("Footprints") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Betún", type: "PRODUCT", price: 60, cost: 25, emoji: iconoArranque("Droplet") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Agujetas", type: "PRODUCT", price: 40, cost: 15, emoji: iconoArranque("Tag") },
  ],
  refrigeracion_ac: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Mantenimiento preventivo", type: "SERVICE", price: 600, emoji: iconoArranque("Snowflake") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Carga de gas refrigerante", type: "SERVICE", price: 900, emoji: iconoArranque("Droplet") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Diagnóstico", type: "SERVICE", price: 250, emoji: iconoArranque("Search") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Instalación de minisplit", type: "SERVICE", price: 1500, emoji: iconoArranque("AirVent") },
    { categoryName: "Refacciones", categoryType: "PART", name: "Capacitor", type: "PART", price: 350, cost: 180, emoji: iconoArranque("Cog") },
    { categoryName: "Refacciones", categoryType: "PART", name: "Filtro de aire", type: "PART", price: 200, cost: 90, emoji: iconoArranque("Fan") },
    { categoryName: "Refacciones", categoryType: "PART", name: "Termostato", type: "PART", price: 400, cost: 220, emoji: iconoArranque("Thermometer") },
  ],
  bicicletas: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Afinación completa", type: "SERVICE", price: 350, emoji: iconoArranque("Bike") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de llanta", type: "SERVICE", price: 150, emoji: iconoArranque("Wrench") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Ajuste de frenos", type: "SERVICE", price: 120, emoji: iconoArranque("CircleGauge") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de cadena", type: "SERVICE", price: 200, emoji: iconoArranque("Cog") },
    { categoryName: "Refacciones", categoryType: "PART", name: "Cámara", type: "PART", price: 80, cost: 35, emoji: iconoArranque("Package") },
    { categoryName: "Refacciones", categoryType: "PART", name: "Llanta", type: "PART", price: 350, cost: 180, emoji: iconoArranque("CircleGauge") },
    { categoryName: "Refacciones", categoryType: "PART", name: "Cadena", type: "PART", price: 250, cost: 120, emoji: iconoArranque("Cog") },
    { categoryName: "Refacciones", categoryType: "PART", name: "Pastillas de freno", type: "PART", price: 150, cost: 70, emoji: iconoArranque("Wrench") },
  ],
  cerrajeria: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Apertura de auto", type: "SERVICE", price: 350, emoji: iconoArranque("Car") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de cerradura", type: "SERVICE", price: 450, emoji: iconoArranque("Lock") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Duplicado de llave", type: "SERVICE", price: 60, emoji: iconoArranque("Key") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Programación de control", type: "SERVICE", price: 500, emoji: iconoArranque("Wrench") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Cerradura estándar", type: "PRODUCT", price: 400, cost: 220, emoji: iconoArranque("Lock") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Candado", type: "PRODUCT", price: 150, cost: 75, emoji: iconoArranque("KeyRound") },
  ],
  tapiceria: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Tapizado de sillón (por pieza)", type: "SERVICE", price: 1500, emoji: iconoArranque("Armchair") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Reparación de resortes", type: "SERVICE", price: 400, emoji: iconoArranque("Wrench") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de espuma", type: "SERVICE", price: 600, emoji: iconoArranque("Sofa") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Tela por metro", type: "PRODUCT", price: 180, cost: 100, emoji: iconoArranque("Ruler") },
  ],
  estetica: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Corte de cabello", type: "SERVICE", price: 150, emoji: iconoArranque("Scissors") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Peinado", type: "SERVICE", price: 200, emoji: iconoArranque("Brush") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Manicure", type: "SERVICE", price: 120, emoji: iconoArranque("Sparkles") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Pedicure", type: "SERVICE", price: 150, emoji: iconoArranque("Footprints") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Tinte", type: "SERVICE", price: 350, emoji: iconoArranque("Palette") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Esmalte", type: "PRODUCT", price: 80, cost: 35, emoji: iconoArranque("Sparkles") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Shampoo", type: "PRODUCT", price: 150, cost: 70, emoji: iconoArranque("SprayCan") },
  ],
  spa: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Masaje relajante 60 min", type: "SERVICE", price: 500, emoji: iconoArranque("Heart") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Masaje descontracturante", type: "SERVICE", price: 600, emoji: iconoArranque("HeartPulse") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Facial básico", type: "SERVICE", price: 400, emoji: iconoArranque("Sparkles") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Exfoliación corporal", type: "SERVICE", price: 450, emoji: iconoArranque("Flower2") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Aceite esencial", type: "PRODUCT", price: 200, cost: 100, emoji: iconoArranque("Droplet") },
  ],
  gimnasio: [
    { categoryName: "Membresías", categoryType: "SERVICE", name: "Membresía mensual", type: "SERVICE", price: 450, emoji: iconoArranque("Dumbbell") },
    { categoryName: "Membresías", categoryType: "SERVICE", name: "Membresía semanal", type: "SERVICE", price: 150, emoji: iconoArranque("Star") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Sesión personalizada", type: "SERVICE", price: 250, emoji: iconoArranque("HeartPulse") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Evaluación física", type: "SERVICE", price: 150, emoji: iconoArranque("ClipboardList") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Shaker", type: "PRODUCT", price: 100, cost: 45, emoji: iconoArranque("CupSoda") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Toalla deportiva", type: "PRODUCT", price: 80, cost: 35, emoji: iconoArranque("Shirt") },
  ],
  tatuajes: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Consulta de diseño", type: "SERVICE", price: 100, emoji: iconoArranque("Palette") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Tatuaje pequeño", type: "SERVICE", price: 600, emoji: iconoArranque("PenTool") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Tatuaje mediano", type: "SERVICE", price: 1500, emoji: iconoArranque("Feather") },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Retoque", type: "SERVICE", price: 300, emoji: iconoArranque("Sparkles") },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Crema cicatrizante", type: "PRODUCT", price: 150, cost: 70, emoji: iconoArranque("Droplet") },
  ],
  comercio_retail: [
    { categoryName: "Bebidas", categoryType: "PRODUCT", name: "Agua embotellada 600ml", type: "PRODUCT", price: 15, cost: 8, emoji: iconoArranque("Droplets") },
    { categoryName: "Bebidas", categoryType: "PRODUCT", name: "Refresco 600ml", type: "PRODUCT", price: 20, cost: 12, emoji: iconoArranque("CupSoda") },
    { categoryName: "Snacks", categoryType: "PRODUCT", name: "Snack individual", type: "PRODUCT", price: 18, cost: 10, emoji: iconoArranque("Cookie") },
    { categoryName: "Otros", categoryType: "PRODUCT", name: "Bolsa de plástico", type: "PRODUCT", price: 2, cost: 0.5, emoji: iconoArranque("ShoppingBag") },
  ],
};

export function getCatalogoArranque(businessType: string | null): ItemArranque[] {
  if (!businessType) return [];
  return CATALOGO_ARRANQUE[businessType] ?? [];
}
