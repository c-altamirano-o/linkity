import "server-only";

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
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Diagnóstico", type: "SERVICE", price: 100, emoji: "🔍" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de pantalla", type: "SERVICE", price: 800, emoji: "🔧" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de batería", type: "SERVICE", price: 450, emoji: "🔋" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de puerto de carga", type: "SERVICE", price: 350, emoji: "🔌" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Pantalla genérica", type: "PART", price: 800, cost: 450, emoji: "🔩" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Batería genérica", type: "PART", price: 400, cost: 220, emoji: "🔩" },
    { categoryName: "Accesorios", categoryType: "PRODUCT", name: "Mica de cristal templado", type: "PRODUCT", price: 80, cost: 30, emoji: "📱" },
    { categoryName: "Accesorios", categoryType: "PRODUCT", name: "Funda protectora", type: "PRODUCT", price: 150, cost: 60, emoji: "📱" },
    { categoryName: "Accesorios", categoryType: "PRODUCT", name: "Cargador USB-C", type: "PRODUCT", price: 200, cost: 90, emoji: "📱" },
  ],
  taller_autos: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de aceite", type: "SERVICE", price: 450, emoji: "🛢️" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Afinación mayor", type: "SERVICE", price: 1800, emoji: "🔧" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Diagnóstico computarizado", type: "SERVICE", price: 350, emoji: "🔍" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Alineación y balanceo", type: "SERVICE", price: 600, emoji: "🚗" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Filtro de aceite", type: "PART", price: 150, cost: 70, emoji: "🔩" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Balatas delanteras (juego)", type: "PART", price: 900, cost: 500, emoji: "🔩" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Batería 12V", type: "PART", price: 1800, cost: 1200, emoji: "🔋" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Aceite de motor 1L", type: "PRODUCT", price: 180, cost: 100, emoji: "🛢️" },
  ],
  taller_motos: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de aceite", type: "SERVICE", price: 250, emoji: "🛢️" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Afinación", type: "SERVICE", price: 700, emoji: "🔧" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de llanta", type: "SERVICE", price: 400, emoji: "🏍️" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Kit de arrastre", type: "PART", price: 1200, cost: 700, emoji: "🔩" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Balatas", type: "PART", price: 350, cost: 180, emoji: "🔩" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Batería para moto", type: "PART", price: 900, cost: 550, emoji: "🔋" },
  ],
  electrodomesticos: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Diagnóstico", type: "SERVICE", price: 150, emoji: "🔍" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Reparación de lavadora", type: "SERVICE", price: 600, emoji: "🧺" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Reparación de refrigerador", type: "SERVICE", price: 800, emoji: "🧊" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Mantenimiento de aire acondicionado", type: "SERVICE", price: 500, emoji: "❄️" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Motor de lavadora", type: "PART", price: 1200, cost: 700, emoji: "🔩" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Compresor", type: "PART", price: 1800, cost: 1100, emoji: "🔩" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Termostato", type: "PART", price: 350, cost: 180, emoji: "🔩" },
  ],
  computadoras: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Diagnóstico", type: "SERVICE", price: 150, emoji: "🔍" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Formateo e instalación de sistema", type: "SERVICE", price: 350, emoji: "💻" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Limpieza interna", type: "SERVICE", price: 250, emoji: "🧹" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de disco a SSD", type: "SERVICE", price: 400, emoji: "🔧" },
    { categoryName: "Refacciones", categoryType: "PART", name: "SSD 480GB", type: "PART", price: 800, cost: 500, emoji: "🔩" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Memoria RAM 8GB", type: "PART", price: 700, cost: 450, emoji: "🔩" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Fuente de poder", type: "PART", price: 600, cost: 350, emoji: "🔩" },
    { categoryName: "Accesorios", categoryType: "PRODUCT", name: "Mouse", type: "PRODUCT", price: 150, cost: 70, emoji: "🖱️" },
    { categoryName: "Accesorios", categoryType: "PRODUCT", name: "Teclado", type: "PRODUCT", price: 250, cost: 130, emoji: "⌨️" },
  ],
  barberia: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Corte de cabello", type: "SERVICE", price: 120, emoji: "💈" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Barba", type: "SERVICE", price: 80, emoji: "🧔" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Corte + barba", type: "SERVICE", price: 180, emoji: "💈" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Diseño de cejas", type: "SERVICE", price: 50, emoji: "✂️" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Tinte", type: "SERVICE", price: 250, emoji: "🎨" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Cera para cabello", type: "PRODUCT", price: 150, cost: 70, emoji: "🧴" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Aceite para barba", type: "PRODUCT", price: 180, cost: 90, emoji: "🧴" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Shampoo", type: "PRODUCT", price: 120, cost: 60, emoji: "🧴" },
  ],
  consultorio_dental: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Consulta / valoración", type: "SERVICE", price: 300, emoji: "🦷" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Limpieza dental", type: "SERVICE", price: 600, emoji: "🦷" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Extracción simple", type: "SERVICE", price: 800, emoji: "🦷" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Resina", type: "SERVICE", price: 700, emoji: "🦷" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Blanqueamiento", type: "SERVICE", price: 2500, emoji: "🦷" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Cepillo dental", type: "PRODUCT", price: 60, cost: 25, emoji: "🪥" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Pasta dental", type: "PRODUCT", price: 80, cost: 35, emoji: "🧴" },
  ],
  consultorio_medico: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Consulta general", type: "SERVICE", price: 400, emoji: "🩺" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Consulta de seguimiento", type: "SERVICE", price: 250, emoji: "🩺" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Certificado médico", type: "SERVICE", price: 200, emoji: "📋" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Curación", type: "SERVICE", price: 150, emoji: "🩹" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Kit de curación", type: "PRODUCT", price: 100, cost: 50, emoji: "🩹" },
  ],
  veterinaria: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Consulta general", type: "SERVICE", price: 350, emoji: "🐾" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Vacunación", type: "SERVICE", price: 300, emoji: "💉" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Desparasitación", type: "SERVICE", price: 200, emoji: "💊" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Baño y corte", type: "SERVICE", price: 250, emoji: "🛁" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cirugía menor", type: "SERVICE", price: 1500, emoji: "🏥" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Alimento premium 1kg", type: "PRODUCT", price: 120, cost: 70, emoji: "🐶" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Shampoo antipulgas", type: "PRODUCT", price: 150, cost: 80, emoji: "🧴" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Collar antipulgas", type: "PRODUCT", price: 180, cost: 90, emoji: "🐾" },
  ],
  relojeria_joyeria: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de pila de reloj", type: "SERVICE", price: 80, emoji: "⌚" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Ajuste de extensión", type: "SERVICE", price: 100, emoji: "⌚" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Limpieza y pulido", type: "SERVICE", price: 200, emoji: "💍" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Reparación de cierre", type: "SERVICE", price: 150, emoji: "🔧" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Pila de reloj", type: "PART", price: 40, cost: 15, emoji: "🔋" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Correa de piel", type: "PRODUCT", price: 250, cost: 120, emoji: "⌚" },
  ],
  zapateria: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de suela", type: "SERVICE", price: 250, emoji: "👞" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de tacón", type: "SERVICE", price: 150, emoji: "👠" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Boleada", type: "SERVICE", price: 50, emoji: "✨" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Ajuste de talla", type: "SERVICE", price: 100, emoji: "👞" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Plantillas", type: "PRODUCT", price: 120, cost: 55, emoji: "👞" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Betún", type: "PRODUCT", price: 60, cost: 25, emoji: "🧴" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Agujetas", type: "PRODUCT", price: 40, cost: 15, emoji: "👞" },
  ],
  refrigeracion_ac: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Mantenimiento preventivo", type: "SERVICE", price: 600, emoji: "❄️" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Carga de gas refrigerante", type: "SERVICE", price: 900, emoji: "❄️" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Diagnóstico", type: "SERVICE", price: 250, emoji: "🔍" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Instalación de minisplit", type: "SERVICE", price: 1500, emoji: "🔧" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Capacitor", type: "PART", price: 350, cost: 180, emoji: "🔩" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Filtro de aire", type: "PART", price: 200, cost: 90, emoji: "🔩" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Termostato", type: "PART", price: 400, cost: 220, emoji: "🔩" },
  ],
  bicicletas: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Afinación completa", type: "SERVICE", price: 350, emoji: "🚲" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de llanta", type: "SERVICE", price: 150, emoji: "🔧" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Ajuste de frenos", type: "SERVICE", price: 120, emoji: "🔧" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de cadena", type: "SERVICE", price: 200, emoji: "🔧" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Cámara", type: "PART", price: 80, cost: 35, emoji: "🔩" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Llanta", type: "PART", price: 350, cost: 180, emoji: "🔩" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Cadena", type: "PART", price: 250, cost: 120, emoji: "🔩" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Pastillas de freno", type: "PART", price: 150, cost: 70, emoji: "🔩" },
  ],
  cerrajeria: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Apertura de auto", type: "SERVICE", price: 350, emoji: "🚗" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de cerradura", type: "SERVICE", price: 450, emoji: "🔑" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Duplicado de llave", type: "SERVICE", price: 60, emoji: "🔑" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Programación de control", type: "SERVICE", price: 500, emoji: "🔧" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Cerradura estándar", type: "PRODUCT", price: 400, cost: 220, emoji: "🔒" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Candado", type: "PRODUCT", price: 150, cost: 75, emoji: "🔒" },
  ],
  tapiceria: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Tapizado de sillón (por pieza)", type: "SERVICE", price: 1500, emoji: "🛋️" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Reparación de resortes", type: "SERVICE", price: 400, emoji: "🔧" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de espuma", type: "SERVICE", price: 600, emoji: "🛋️" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Tela por metro", type: "PRODUCT", price: 180, cost: 100, emoji: "🧵" },
  ],
  estetica: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Corte de cabello", type: "SERVICE", price: 150, emoji: "💇" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Peinado", type: "SERVICE", price: 200, emoji: "💇" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Manicure", type: "SERVICE", price: 120, emoji: "💅" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Pedicure", type: "SERVICE", price: 150, emoji: "💅" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Tinte", type: "SERVICE", price: 350, emoji: "🎨" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Esmalte", type: "PRODUCT", price: 80, cost: 35, emoji: "💅" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Shampoo", type: "PRODUCT", price: 150, cost: 70, emoji: "🧴" },
  ],
  spa: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Masaje relajante 60 min", type: "SERVICE", price: 500, emoji: "💆" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Masaje descontracturante", type: "SERVICE", price: 600, emoji: "💆" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Facial básico", type: "SERVICE", price: 400, emoji: "🧖" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Exfoliación corporal", type: "SERVICE", price: 450, emoji: "🧖" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Aceite esencial", type: "PRODUCT", price: 200, cost: 100, emoji: "🧴" },
  ],
  gimnasio: [
    { categoryName: "Membresías", categoryType: "SERVICE", name: "Membresía mensual", type: "SERVICE", price: 450, emoji: "🏋️" },
    { categoryName: "Membresías", categoryType: "SERVICE", name: "Membresía semanal", type: "SERVICE", price: 150, emoji: "🏋️" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Sesión personalizada", type: "SERVICE", price: 250, emoji: "🏋️" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Evaluación física", type: "SERVICE", price: 150, emoji: "📋" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Shaker", type: "PRODUCT", price: 100, cost: 45, emoji: "🥤" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Toalla deportiva", type: "PRODUCT", price: 80, cost: 35, emoji: "🏋️" },
  ],
  tatuajes: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Consulta de diseño", type: "SERVICE", price: 100, emoji: "🎨" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Tatuaje pequeño", type: "SERVICE", price: 600, emoji: "🖋️" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Tatuaje mediano", type: "SERVICE", price: 1500, emoji: "🖋️" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Retoque", type: "SERVICE", price: 300, emoji: "🖋️" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Crema cicatrizante", type: "PRODUCT", price: 150, cost: 70, emoji: "🧴" },
  ],
  comercio_retail: [
    { categoryName: "Bebidas", categoryType: "PRODUCT", name: "Agua embotellada 600ml", type: "PRODUCT", price: 15, cost: 8, emoji: "💧" },
    { categoryName: "Bebidas", categoryType: "PRODUCT", name: "Refresco 600ml", type: "PRODUCT", price: 20, cost: 12, emoji: "🥤" },
    { categoryName: "Snacks", categoryType: "PRODUCT", name: "Snack individual", type: "PRODUCT", price: 18, cost: 10, emoji: "🍪" },
    { categoryName: "Otros", categoryType: "PRODUCT", name: "Bolsa de plástico", type: "PRODUCT", price: 2, cost: 0.5, emoji: "🛍️" },
  ],
};

export function getCatalogoArranque(businessType: string | null): ItemArranque[] {
  if (!businessType) return [];
  return CATALOGO_ARRANQUE[businessType] ?? [];
}
