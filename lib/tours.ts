"use client";

import { useEffect, useRef } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { vocabReparacion, type LabelDictionary } from "@/lib/labels";
import { resolverTextoVocabulario } from "@/lib/textos-vocabulario";

/**
 * "Muéstrame cómo" — tutorial interactivo real dentro del sistema (2026-10-02,
 * a petición de Carlos, después de ver el manual de Ayuda: "podemos crear un
 * 'muéstrame cómo' que... te ilumine los botones, como en los juegos de la
 * Play Store"). Primera versión, con 2 decisiones explícitas de Carlos:
 *
 * 1. Alcance: solo 3 flujos de validación (Registrar una venta en POS,
 *    Recibir un equipo nuevo en Reparaciones, Asignar técnico y avanzar un
 *    folio en Aduana) antes de replicarlo en los otros módulos — ver
 *    AYUDA_MODULO en lib/ayuda-contenido.ts para el resto, que por ahora solo
 *    tiene los pasos en texto, sin tour.
 * 2. Nivel de guía: "Resalta y tú avanzas" — el usuario decide cuándo
 *    presionar "Siguiente" (a diferencia de forzar que de verdad haya hecho
 *    clic en el botón real antes de dejarlo continuar). Por eso cada paso
 *    aquí es solo texto + selector, sin ningún callback que valide la acción.
 *
 * Mecanismo: cada botón/campo real que el tour señala tiene un atributo
 * data-tour="<id>" agregado a propósito en su Client Component (ej.
 * POSClient.tsx, ReparacionesClient.tsx, AduanaClient.tsx) — el selector de
 * cada paso de abajo apunta a ese atributo, nunca al texto visible del
 * elemento (que si cambia algún día, no rompe el tour).
 *
 * `waitForElement`/`skipMissingElement` (driver.js) resuelven el único caso
 * delicado: un paso que apunta a un campo DENTRO de un modal que el usuario
 * todavía no ha abierto (ej. "Nueva reparación"). driver.js espera unos
 * segundos a que el elemento aparezca en el DOM — tiempo de sobra para que
 * el usuario haga clic en el botón del paso anterior y el modal real se
 * monte — y si de plano no aparece (el usuario presionó "Siguiente" sin
 * hacer la acción), simplemente salta ese paso en vez de tronar.
 */
export interface TourStep {
  selector: string;
  titulo: string;
  descripcion: string;
  // Paso que solo aplica según cómo recibe el negocio sus trabajos
  // (Configuración → Vocabulario de tu negocio): "dosCampos" = marca y
  // modelo por separado; "unaDescripcion" = un solo campo de descripción;
  // "desbloqueo" = pide contraseña/patrón. Si no aplica, el paso se omite.
  requiere?: "dosCampos" | "unaDescripcion" | "desbloqueo";
}

// Resuelve las marcas {token} con el vocabulario del negocio, omite los pasos
// que no aplican y vuelve a numerar los títulos ("1. ", "2. ") sin huecos.
function prepararPasos(pasos: TourStep[], labels?: LabelDictionary): TourStep[] {
  if (!labels) return pasos;
  const v = vocabReparacion(labels);
  const aplica = (p: TourStep) =>
    !(
      (p.requiere === "dosCampos" && v.unaDescripcion) ||
      (p.requiere === "unaDescripcion" && !v.unaDescripcion) ||
      (p.requiere === "desbloqueo" && !v.usaDesbloqueo)
    );
  const numerado = pasos.some((p) => /^\d+\.\s/.test(p.titulo));
  return pasos.filter(aplica).map((p, i) => {
    const sinNumero = p.titulo.replace(/^\d+\.\s*/, "");
    const titulo = resolverTextoVocabulario(sinNumero, labels);
    return {
      ...p,
      titulo: numerado ? `${i + 1}. ${titulo}` : titulo,
      descripcion: resolverTextoVocabulario(p.descripcion, labels),
    };
  });
}

function iniciarTour(pasos: TourStep[]) {
  if (pasos.length === 0) return;
  driver({
    showProgress: true,
    progressText: "Paso {{current}} de {{total}}",
    nextBtnText: "Siguiente",
    prevBtnText: "Atrás",
    doneBtnText: "Listo",
    overlayOpacity: 0.65,
    stagePadding: 6,
    stageRadius: 8,
    skipMissingElement: true,
    waitForElement: 4000,
    steps: pasos.map((p) => ({
      element: p.selector,
      popover: { title: p.titulo, description: p.descripcion },
    })),
  }).drive();
}

/**
 * Cada Client Component con un tour definido llama este hook UNA vez,
 * incondicionalmente (reglas de hooks) — se activa solo cuando la URL trae
 * ?tour=<tourId> (el botón "Muéstrame cómo" de AyudaClient.tsx/
 * ManualAyudaClient.tsx arma esa URL). Se lee/limpia con la API nativa del
 * navegador (URLSearchParams sobre window.location), nunca con
 * useSearchParams de next/navigation — así se evita por completo cualquier
 * requisito de Suspense boundary de Next.js para ese hook, y la limpieza del
 * query param (para que un refresh no vuelva a lanzar el tour) no dispara
 * una navegación/refetch de Next, solo reescribe la URL visible.
 */
export function useTourDesdeUrl(tourId: string, pasos: TourStep[], labels?: LabelDictionary) {
  const yaLanzado = useRef(false);

  useEffect(() => {
    if (yaLanzado.current) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tour") !== tourId) return;
    if (pasos.length === 0) return;
    yaLanzado.current = true;

    params.delete("tour");
    const nuevaUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nuevaUrl);

    const t = window.setTimeout(() => iniciarTour(prepararPasos(pasos, labels)), 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId, pasos]);
}

// ── Los 3 tours de validación ──────────────────────────────────────────

export const TOUR_POS_VENTA: TourStep[] = [
  {
    selector: '[data-tour="pos-producto"]',
    titulo: "1. Agrega un producto",
    descripcion: "Da clic en cualquier producto o servicio del catálogo — se agrega al carrito. Puedes agregar varios antes de cobrar.",
  },
  {
    selector: '[data-tour="pos-metodo-pago"]',
    titulo: "2. Elige el método de pago",
    descripcion: "Efectivo, Tarjeta, Transferencia o Mixto.",
  },
  {
    selector: '[data-tour="pos-cobrar"]',
    titulo: "3. Cobra la venta",
    descripcion: "Presiona este botón para cerrar la venta y generar el ticket.",
  },
];

export const TOUR_POS_COBRAR_REPARACION: TourStep[] = [
  {
    selector: '[data-tour="pos-reparacion-aviso"]',
    titulo: "1. Llegaste desde {reparaciones}",
    descripcion: "Al presionar \"Entregar\" en un folio listo (o en una devolución), el carrito llega aquí ya precargado con el costo cotizado y la sucursal queda fija.",
  },
  {
    selector: '[data-tour="pos-reparacion-monto"]',
    titulo: "2. Ajusta el monto si hace falta",
    descripcion: "El monto viene del costo cotizado, pero puedes corregirlo aquí antes de cobrar.",
  },
  {
    selector: '[data-tour="pos-metodo-pago"]',
    titulo: "3. Elige el método de pago",
    descripcion: "Efectivo, Tarjeta, Transferencia o Mixto — igual que en una venta normal.",
  },
  {
    selector: '[data-tour="pos-cobrar"]',
    titulo: "4. Cobra y entrega",
    descripcion: "Presiona este botón para cerrar el cobro y generar el ticket de entrega.",
  },
];

// 2026-10-02 (revisión de Carlos, tras probar la primera versión): "el
// problema es en la guía interactiva" — los 4 pasos originales agrupaban
// varios campos reales en uno solo (ej. "cliente, marca y modelo" dentro del
// paso de "Describe la falla"), lo que hacía que el tour saltara de largo
// sobre campos que sí necesitan su propia explicación. Ahora cada campo real
// del formulario de "Nueva reparación" tiene su propio paso — ver los
// data-tour nuevos en ReparacionesClient.tsx (reparaciones-cliente,
// reparaciones-marca, reparaciones-modelo, reparaciones-contrasena,
// reparaciones-prioridad, reparaciones-fecha).
export const TOUR_REPARACIONES_RECIBIR: TourStep[] = [
  {
    selector: '[data-tour="reparaciones-nueva"]',
    titulo: "1. Abre el formulario",
    descripcion: "Presiona \"Nueva\" para registrar un nuevo trabajo.",
  },
  {
    selector: '[data-tour="reparaciones-cliente"]',
    titulo: "2. Elige o registra al cliente",
    descripcion: "Búscalo por nombre; si no aparece, presiona \"+ Registrar cliente nuevo\" y captura su nombre y teléfono.",
  },
  {
    selector: '[data-tour="reparaciones-marca"]',
    titulo: "3. Captura el campo «{Marca}»",
    descripcion: "El fabricante o la marca de lo que recibes{ejMarca}.",
    requiere: "dosCampos",
  },
  {
    selector: '[data-tour="reparaciones-modelo"]',
    titulo: "4. Captura el campo «{Modelo}»",
    descripcion: "El dato específico dentro de esa marca{ejModelo} — lo encuentras en la caja, en la etiqueta o placa, o te lo dice el cliente.",
    requiere: "dosCampos",
  },
  {
    selector: '[data-tour="reparaciones-modelo"]',
    titulo: "3. Captura el campo «{Descripcion}»",
    descripcion: "Describe con claridad lo que el cliente deja (tipo, marca o características) para poder identificarlo después.",
    requiere: "unaDescripcion",
  },
  {
    selector: '[data-tour="reparaciones-falla"]',
    titulo: "5. Captura el campo «{Falla}»",
    descripcion: "Lo que el cliente dice que necesita o que le pasa, o lo que tú notaste al revisarlo.",
  },
  {
    selector: '[data-tour="reparaciones-contrasena"]',
    titulo: "6. {Desbloqueo} (opcional)",
    descripcion: "Solo si tiene bloqueo — es exclusivamente para que quien lo trabaje pueda hacer pruebas, nunca se muestra al cliente.",
    requiere: "desbloqueo",
  },
  {
    selector: '[data-tour="reparaciones-piezas"]',
    titulo: "7. Agrega piezas y/o servicios cotizados",
    descripcion: "Indica si se cotizó una pieza, un servicio (mano de obra, revisión) o ambos — es lo que verá el cliente en su ticket, y el sistema no deja crear el folio sin esto.",
  },
  {
    selector: '[data-tour="reparaciones-prioridad"]',
    titulo: "8. Elige la prioridad",
    descripcion: "Qué tan urgente es que quede terminado — normalmente te lo indica el propio cliente.",
  },
  {
    selector: '[data-tour="reparaciones-fecha"]',
    titulo: "9. Fecha estimada de entrega (opcional)",
    descripcion: "La defines tú según tu carga de trabajo, o la que acordaste con el cliente — aparece en su ticket.",
  },
  {
    selector: '[data-tour="reparaciones-crear"]',
    titulo: "10. Crea el folio",
    descripcion: "El sistema genera el folio automáticamente — no se captura a mano.",
  },
];

// 2026-10-02 (misma revisión de Carlos que corrigió Reparaciones): "costo" y
// "piezas" son dos controles reales distintos en la pantalla (dos bloques de
// UI separados, ver AduanaClient.tsx) — antes compartían un solo paso del
// tour. Ahora cada uno tiene su propio paso.
// 2026-10-02 — extensión del tour al resto de los módulos (a petición de
// Carlos, ya validado el mecanismo con los 3 flujos anteriores). Mismo
// criterio: un paso por cada campo real, y para los grupos de botones que
// son mutuamente excluyentes según el estatus actual (ej. los íconos de
// seguimiento de una cita, o "Cambiar estatus" en Aduana) se usa UN solo
// data-tour envolviendo todo el grupo, con la explicación de las opciones en
// el texto del paso, en vez de un paso por botón (varios nunca están
// visibles al mismo tiempo).
export const TOUR_REPARACIONES_ENTREGAR: TourStep[] = [
  {
    selector: '[data-tour="reparaciones-abrir-folio"]',
    titulo: "1. Abre el folio",
    descripcion: "Elige de la lista el trabajo que ya está \"Listo\" (o en devolución) para entregar.",
  },
  {
    selector: '[data-tour="reparaciones-entregar"]',
    titulo: "2. Entregar",
    descripcion: "Si está \"Listo\", te manda a Punto de Venta a cobrar el costo cotizado. Si es una devolución, solo te pide cobrar cuando tu negocio tiene activo \"Cobrar en devolución\" en Configuración — si no, se entrega directo con ticket en $0.00.",
  },
];

export const TOUR_CITAS_AGENDAR: TourStep[] = [
  {
    selector: '[data-tour="citas-nueva"]',
    titulo: "1. Abre el formulario",
    descripcion: "Presiona \"Nueva cita\".",
  },
  {
    selector: '[data-tour="citas-cliente"]',
    titulo: "2. Elige o registra al cliente",
    descripcion: "Selecciónalo de la lista, o presiona \"+ Cliente nuevo\" y captura su Nombre (obligatorio) y Teléfono (opcional).",
  },
  {
    selector: '[data-tour="citas-sucursal"]',
    titulo: "3. Elige la sucursal",
    descripcion: "La sucursal donde se va a atender la cita.",
  },
  {
    selector: '[data-tour="citas-atiende"]',
    titulo: "4. Elige quién atiende",
    descripcion: "La persona de tu equipo que va a atender esta cita.",
  },
  {
    selector: '[data-tour="citas-motivo"]',
    titulo: "5. Describe el motivo",
    descripcion: "Ej. \"{ejCita}\".",
  },
  {
    selector: '[data-tour="citas-fecha"]',
    titulo: "6. Captura la fecha y hora",
    descripcion: "La duración (30 min por defecto) y las notas son opcionales, justo debajo.",
  },
  {
    selector: '[data-tour="citas-guardar"]',
    titulo: "7. Guarda la cita",
    descripcion: "Presiona \"Guardar\" para agendarla.",
  },
];

export const TOUR_CLIENTES_ALTA: TourStep[] = [
  {
    selector: '[data-tour="clientes-nuevo"]',
    titulo: "1. Abre el formulario",
    descripcion: "Presiona \"Agregar cliente\" (o \"Nuevo\").",
  },
  {
    selector: '[data-tour="clientes-nombre"]',
    titulo: "2. Captura el nombre completo",
    descripcion: "Es el único campo obligatorio.",
  },
  {
    selector: '[data-tour="clientes-opcionales"]',
    titulo: "3. Opcional: datos de contacto",
    descripcion: "Teléfono, Correo, RFC y Dirección, aquí y en los campos de abajo.",
  },
  {
    selector: '[data-tour="clientes-mayorista"]',
    titulo: "4. Opcional: cliente mayorista",
    descripcion: "Si lo marcas, se le aplicarán los precios de mayoreo automáticamente en Punto de Venta.",
  },
  {
    selector: '[data-tour="clientes-guardar"]',
    titulo: "5. Guarda el cliente",
    descripcion: "Presiona \"Guardar\".",
  },
];

export const TOUR_ODONTOGRAMA_MARCAR: TourStep[] = [
  {
    selector: '[data-tour="odontograma-diente"]',
    titulo: "1. Da clic en un diente",
    descripcion: "Elige el diente que quieres marcar en el odontograma.",
  },
  {
    selector: '[data-tour="odontograma-condicion"]',
    titulo: "2. Elige su condición",
    descripcion: "Agrupadas por categoría: General, Patologías, Restauraciones, Endodoncia.",
  },
  {
    selector: '[data-tour="odontograma-guardar"]',
    titulo: "3. Guarda",
    descripcion: "Puedes agregar una nota del diente antes de presionar \"Guardar\".",
  },
];

export const TOUR_NOTA_EVOLUCION: TourStep[] = [
  {
    selector: '[data-tour="nota-nueva"]',
    titulo: "1. Abre el formulario",
    descripcion: "Presiona \"Nueva nota\".",
  },
  {
    selector: '[data-tour="nota-motivo"]',
    titulo: "2. Captura el motivo de la consulta",
    descripcion: "Es el único campo obligatorio.",
  },
  {
    selector: '[data-tour="nota-opcionales"]',
    titulo: "3. Opcional: diagnóstico, tratamiento y notas",
    descripcion: "Agrega el detalle que necesites, aquí y en los campos de abajo.",
  },
  {
    selector: '[data-tour="nota-guardar"]',
    titulo: "4. Guarda la nota",
    descripcion: "Presiona \"Guardar\".",
  },
];

export const TOUR_PLAN_TRATAMIENTO: TourStep[] = [
  {
    selector: '[data-tour="plan-nuevo"]',
    titulo: "1. Abre el formulario",
    descripcion: "Presiona \"Nuevo plan\".",
  },
  {
    selector: '[data-tour="plan-titulo"]',
    titulo: "2. Captura el título del plan",
    descripcion: "Ej. \"Rehabilitación oral\". Si tienes más de una sucursal, elige también Sucursal y {Esp}.",
  },
  {
    selector: '[data-tour="plan-fases"]',
    titulo: "3. Agrega cada fase",
    descripcion: "Descripción y Costo son obligatorios por fase (el Diente es opcional) — usa \"+ Agregar fase\" para más.",
  },
  {
    selector: '[data-tour="plan-guardar"]',
    titulo: "4. Guarda el plan",
    descripcion: "Presiona \"Guardar plan\".",
  },
];

export const TOUR_CITAS_SEGUIMIENTO: TourStep[] = [
  {
    selector: '[data-tour="citas-seguimiento"]',
    titulo: "Da seguimiento a la cita",
    descripcion: "Según el estatus actual verás distintos íconos: \"Confirmar\", \"Iniciar atención\", \"Completar\", \"No se presentó\", \"Editar\" o \"Cancelar\".",
  },
];

export const TOUR_CATALOGO_ALTA: TourStep[] = [
  {
    selector: '[data-tour="catalogo-nuevo"]',
    titulo: "1. Abre el formulario",
    descripcion: "Presiona \"Nuevo\".",
  },
  {
    selector: '[data-tour="catalogo-tipo"]',
    titulo: "2. Elige el Tipo",
    descripcion: "Productos, {Partes} o Servicios — determina qué categorías puedes elegir, y si es Servicio no se captura Existencia inicial.",
  },
  {
    selector: '[data-tour="catalogo-nombre"]',
    titulo: "3. Captura el Nombre",
    descripcion: "Es obligatorio.",
  },
  {
    selector: '[data-tour="catalogo-precio"]',
    titulo: "4. Captura el Precio público",
    descripcion: "Es el otro campo obligatorio.",
  },
  {
    selector: '[data-tour="catalogo-opcionales"]',
    titulo: "5. Opcional: SKU, ícono, precio mayoreo, costo, existencia y categoría",
    descripcion: "Todo lo demás es opcional, aquí y en los campos de abajo.",
  },
  {
    selector: '[data-tour="catalogo-guardar"]',
    titulo: "6. Guarda el producto",
    descripcion: "Presiona \"Crear producto\".",
  },
];

export const TOUR_CATALOGO_ARCHIVAR: TourStep[] = [
  {
    selector: '[data-tour="catalogo-archivar-eliminar"]',
    titulo: "Archiva o elimina el producto",
    descripcion: "\"Archivar producto\" se puede restaurar después. \"Eliminar definitivamente\" solo aparece si nunca se ha usado en una venta, compra o trabajo.",
  },
];

export const TOUR_COMPRAS_REGISTRAR: TourStep[] = [
  {
    selector: '[data-tour="compras-nueva"]',
    titulo: "1. Abre el formulario",
    descripcion: "Presiona \"Nueva\".",
  },
  {
    selector: '[data-tour="compras-sucursal"]',
    titulo: "2. Elige la Sucursal",
    descripcion: "La que recibe la mercancía.",
  },
  {
    selector: '[data-tour="compras-proveedor"]',
    titulo: "3. Elige el Proveedor",
    descripcion: "O presiona \"+ Nuevo proveedor\" y captura su Nombre (obligatorio), Teléfono y Email (opcionales).",
  },
  {
    selector: '[data-tour="compras-productos"]',
    titulo: "4. Agrega cada producto",
    descripcion: "Elige el Producto, su Cantidad y su Costo (se prellena con el costo del catálogo) — usa \"+ Agregar producto\" para más renglones.",
  },
  {
    selector: '[data-tour="compras-crear"]',
    titulo: "5. Crea la orden",
    descripcion: "Las Notas son opcionales. Presiona \"Crear orden de compra\".",
  },
];

export const TOUR_COMPRAS_RECIBIDA: TourStep[] = [
  {
    selector: '[data-tour="compras-marcar-recibida"]',
    titulo: "Confirma que llegó la mercancía",
    descripcion: "Presiona \"Marcar recibida\" — esto es lo que de verdad suma el stock a tu Inventario. Solo disponible mientras la orden está \"Pendiente\".",
  },
];

export const TOUR_PERSONAL_ALTA: TourStep[] = [
  {
    selector: '[data-tour="personal-nuevo"]',
    titulo: "1. Abre el formulario",
    descripcion: "Presiona \"Nuevo empleado\".",
  },
  {
    selector: '[data-tour="personal-nombre"]',
    titulo: "2. Captura Nombre, Puesto, País y Teléfono",
    descripcion: "Puesto es solo una etiqueta — no cambia su acceso al sistema.",
  },
  {
    selector: '[data-tour="personal-sucursal"]',
    titulo: "3. Elige la Sucursal",
    descripcion: "Solo aparece si tienes más de una.",
  },
  {
    selector: '[data-tour="personal-rol"]',
    titulo: "4. Elige el Rol",
    descripcion: "Determina a qué módulos tendrá acceso y qué podrá hacer en cada uno — no confundir con Puesto.",
  },
  {
    selector: '[data-tour="personal-pin"]',
    titulo: "5. Asígnale su PIN de inicio",
    descripcion: "6 dígitos exactos — con eso entrará al sistema.",
  },
  {
    selector: '[data-tour="personal-esquema-pago"]',
    titulo: "6. Elige el Esquema de pago",
    descripcion: "Sueldo fijo, Comisión (% del precio), Fijo + comisión, o Destajo ($ fijo por unidad, no %).",
  },
  {
    selector: '[data-tour="personal-cascada-comision"]',
    titulo: "7. Si no es Sueldo fijo, completa el cálculo",
    descripcion: "El porcentaje o monto por unidad, sobre qué se calcula (Ventas, {Entidades} o Utilidad), y con qué frecuencia se paga.",
  },
  {
    selector: '[data-tour="personal-metodo-pago"]',
    titulo: "8. Elige el Método de pago",
    descripcion: "Si es Transferencia, captura también su CLABE (18 dígitos exactos), justo abajo.",
  },
  {
    selector: '[data-tour="personal-lidera-equipo"]',
    titulo: "9. Opcional: ¿Lidera un equipo?",
    descripcion: "Si lo activas, captura el porcentaje de comisión de equipo, calculado sobre la producción de toda su sucursal.",
  },
  {
    selector: '[data-tour="personal-guardar"]',
    titulo: "10. Guarda al empleado",
    descripcion: "Presiona \"Guardar\".",
  },
];

export const TOUR_PERSONAL_ROL_PERSONALIZADO: TourStep[] = [
  {
    selector: '[data-tour="personal-roles-permisos"]',
    titulo: "1. Abre Roles y permisos",
    descripcion: "Presiona \"Roles y permisos\".",
  },
  {
    selector: '[data-tour="roles-crear-personalizado"]',
    titulo: "2. Crea un rol nuevo",
    descripcion: "Presiona \"Crear rol personalizado\".",
  },
  {
    selector: '[data-tour="roles-nombre"]',
    titulo: "3. Dale un nombre",
    descripcion: "Ej. \"Encargado\" — hay sugerencias según tu rubro, si aplican.",
  },
  {
    selector: '[data-tour="roles-modulos"]',
    titulo: "4. Marca los módulos que podrá usar",
    descripcion: "Solo verá y usará los que actives aquí.",
  },
  {
    selector: '[data-tour="roles-guardar"]',
    titulo: "5. Guarda el rol",
    descripcion: "Presiona \"Crear rol\".",
  },
];

export const TOUR_ADUANA_ASIGNAR: TourStep[] = [
  {
    selector: '[data-tour="aduana-tecnico"]',
    titulo: "1. Asigna al responsable ({esp})",
    descripcion: "Elige a la persona responsable de este trabajo en el selector «{Esp} asignado» — se guarda solo con elegirla, sin botón aparte.",
  },
  {
    selector: '[data-tour="aduana-costo"]',
    titulo: "2. Ajusta el costo estimado",
    descripcion: "Captura o corrige el monto aquí si el costo cambió tras la revisión — queda registrado en el Historial con fecha y hora.",
  },
  {
    selector: '[data-tour="aduana-piezas"]',
    titulo: "3. Agrega piezas y/o servicios cotizados",
    descripcion: "Usa el selector y el botón \"+\" para sumar una pieza o servicio del catálogo, o \"Otro\" para un nombre/precio libre.",
  },
  {
    selector: '[data-tour="aduana-estatus"]',
    titulo: "4. Avanza el estatus",
    descripcion: "Presiona el botón con el siguiente estatus (ej. \"Listo\") cuando el trabajo avance.",
  },
];

export const TOUR_TALLER_ALERTA: TourStep[] = [
  {
    selector: '[data-tour="taller-abrir-folio"]',
    titulo: "1. Abre el folio",
    descripcion: "Elige de la lista el trabajo sobre el que necesitas avisar algo a {recepcion} / Tienda.",
  },
  {
    selector: '[data-tour="taller-alerta-mensaje"]',
    titulo: "2. Escribe tu mensaje",
    descripcion: "Cuéntale a {recepcion} / Tienda lo que necesitas (ej. autorización para cotizar una pieza extra).",
  },
  {
    selector: '[data-tour="taller-alerta-para-cliente"]',
    titulo: "3. Opcional: mostrar al cliente",
    descripcion: "Actívala si quieres que este mismo mensaje también lo vea el cliente en su página de seguimiento.",
  },
  {
    selector: '[data-tour="taller-alerta-enviar"]',
    titulo: "4. Enviar alerta",
    descripcion: "Envía el aviso a {recepcion} / Tienda.",
  },
];

export const TOUR_ASISTENCIA_REVISAR: TourStep[] = [
  {
    selector: '[data-tour="asistencia-filtros"]',
    titulo: "1. Filtra el registro",
    descripcion: "Usa el buscador, el selector de sucursal y los atajos de periodo (Hoy/Semana/Mes/Todo) para encontrar lo que buscas.",
  },
  {
    selector: '[data-tour="asistencia-cerrar-ahora"]',
    titulo: "2. Cerrar ahora",
    descripcion: "Si una sesión quedó sin salida registrada (el empleado olvidó marcarla), presiona \"Cerrar ahora\" para cerrarla a mano.",
  },
];

export const TOUR_CONFIG_RUBRO: TourStep[] = [
  {
    selector: '[data-tour="config-rubro-select"]',
    titulo: "1. Elige el Rubro",
    descripcion: "Cambia la terminología que usa todo el sistema según tu giro (ej. \"Reparaciones\" se vuelve \"Órdenes de Servicio\" para un taller automotriz).",
  },
  {
    selector: '[data-tour="config-rubro-guardar"]',
    titulo: "2. Guardar cambios",
    descripcion: "Aplica el nuevo rubro a todo el negocio.",
  },
];

export const TOUR_CONFIG_LOGO: TourStep[] = [
  {
    selector: '[data-tour="config-logo-archivo"]',
    titulo: "1. Elige el archivo",
    descripcion: "Selecciona la imagen de tu logo (PNG/JPG/WEBP/SVG, máximo 2 MB).",
  },
  {
    selector: '[data-tour="config-logo-subir"]',
    titulo: "2. Subir logo",
    descripcion: "Guarda el logo para que se muestre en tu sistema junto al de Linkity Soluciones.",
  },
];

export const TOUR_CONFIG_TICKET: TourStep[] = [
  {
    selector: '[data-tour="config-ticket-datos"]',
    titulo: "1. Dirección, RFC y mensaje de pie",
    descripcion: "Captura tu Dirección, tu RFC y el mensaje de despedida que quieres que aparezca al final de tus tickets.",
  },
  {
    selector: '[data-tour="config-ticket-guardar"]',
    titulo: "2. Guardar cambios",
    descripcion: "Aplica estos datos a los tickets de ventas y reparaciones.",
  },
];

export const TOUR_CONFIG_MODULOS: TourStep[] = [
  {
    selector: '[data-tour="config-modulos-lista"]',
    titulo: "1. Activa o desactiva un módulo",
    descripcion: "Usa el interruptor de cada módulo — se aplica de inmediato, sin botón de guardar aparte. Apagar uno no borra ninguna información ya capturada.",
  },
  {
    selector: '[data-tour="config-modulos-recomendado"]',
    titulo: "2. O aplica lo recomendado para tu rubro",
    descripcion: "Si elegiste un Rubro en \"Giro del negocio\", este botón apaga en bloque los módulos que no suelen usarse en tu giro.",
  },
];

export const TOUR_FACTURACION_GENERAR: TourStep[] = [
  {
    selector: '[data-tour="facturacion-nueva"]',
    titulo: "1. Nueva",
    descripcion: "Abre el formulario para generar una factura (CFDI) de una venta ya cobrada.",
  },
  {
    selector: '[data-tour="facturacion-venta"]',
    titulo: "2. Venta a facturar",
    descripcion: "Elige, del selector, cuál venta completada quieres facturar.",
  },
  {
    selector: '[data-tour="facturacion-receptor"]',
    titulo: "3. Receptor del CFDI",
    descripcion: "Usa el cliente ya ligado a la venta, o presiona \"Facturar a otro receptor\" y captura Nombre o razón social (RFC y Teléfono son opcionales).",
  },
  {
    selector: '[data-tour="facturacion-generar"]',
    titulo: "4. Generar factura",
    descripcion: "Crea la factura con los datos capturados.",
  },
  {
    selector: '[data-tour="facturacion-timbrar"]',
    titulo: "5. Timbrar ahora",
    descripcion: "En el detalle de la factura recién creada, presiona este botón para timbrarla.",
  },
];

export const TOUR_CAJA_ABRIR_SIMPLE: TourStep[] = [
  {
    selector: '[data-tour="caja-fondo-inicial"]',
    titulo: "1. Fondo inicial",
    descripcion: "Captura el efectivo con el que arrancas hoy tu turno en esta sucursal.",
  },
  {
    selector: '[data-tour="caja-guardar-apertura"]',
    titulo: "2. Guardar y continuar",
    descripcion: "Abre la caja y te lleva directo a Punto de Venta.",
  },
];

export const TOUR_CAJA_ABRIR_SUPERVISOR: TourStep[] = [
  {
    selector: '[data-tour="caja-abrir-boton"]',
    titulo: "1. Abrir caja",
    descripcion: "Presiona este botón cuando la caja de tu sucursal esté cerrada.",
  },
  {
    selector: '[data-tour="caja-monto-apertura"]',
    titulo: "2. Monto de apertura",
    descripcion: "Captura el efectivo con el que arranca la caja en esta sucursal.",
  },
  {
    selector: '[data-tour="caja-abrir-confirmar"]',
    titulo: "3. Abrir caja",
    descripcion: "Confirma para abrir la sesión de caja del día.",
  },
];

export const TOUR_CAJA_CERRAR: TourStep[] = [
  {
    selector: '[data-tour="caja-boton-cerrar"]',
    titulo: "1. Cerrar caja",
    descripcion: "Presiona este botón al terminar tu turno para hacer el corte.",
  },
  {
    selector: '[data-tour="caja-efectivo-contado"]',
    titulo: "2. Efectivo contado",
    descripcion: "Cuenta tu efectivo real y captúralo aquí. Agrega una Nota si algo no cuadra.",
  },
  {
    selector: '[data-tour="caja-cerrar-confirmar"]',
    titulo: "3. Cerrar caja",
    descripcion: "Confirma el cierre — si tu rol ve montos, verás también la diferencia contra lo esperado.",
  },
];

export const TOUR_INVENTARIO_AJUSTAR: TourStep[] = [
  {
    selector: '[data-tour="inventario-ajustar"]',
    titulo: "1. Ajustar o surtir",
    descripcion: "Presiona \"Ajustar\" (o \"Surtir\" si el producto está en bajo/agotado) junto al producto que quieres mover.",
  },
  {
    selector: '[data-tour="inventario-sucursal"]',
    titulo: "2. Sucursal",
    descripcion: "Si tienes más de una sucursal, elige a cuál le afecta este movimiento.",
  },
  {
    selector: '[data-tour="inventario-tipo"]',
    titulo: "3. Tipo de movimiento",
    descripcion: "\"Entrada\": llegó mercancía fuera de una compra (ej. una devolución). \"Salida\": se dio de baja (ej. dañado o extraviado). \"Ajuste\": corrige el stock a un número exacto tras un conteo físico.",
  },
  {
    selector: '[data-tour="inventario-cantidad"]',
    titulo: "4. Cantidad",
    descripcion: "Captura cuánto entra o sale — o, si elegiste \"Ajuste\", el nuevo stock total exacto.",
  },
  {
    selector: '[data-tour="inventario-guardar"]',
    titulo: "5. Guardar",
    descripcion: "Guarda el movimiento y actualiza el stock de esa sucursal.",
  },
];

export const TOUR_DASHBOARD_PERIODO: TourStep[] = [
  {
    selector: '[data-tour="dashboard-atajos"]',
    titulo: "1. Elige un atajo de periodo",
    descripcion: "Presiona \"Hoy\", \"Semana\", \"Mes\" o \"Año\" para que todo el Dashboard (tarjetas, gráficas y tablas) se recalcule a ese periodo.",
  },
  {
    selector: '[data-tour="dashboard-rango"]',
    titulo: "2. O elige un rango a tu medida",
    descripcion: "Cambia la fecha de inicio y la de fin, y presiona \"Aplicar\" para ver el Dashboard acotado exactamente a ese rango.",
  },
  {
    selector: '[data-tour="dashboard-vista"]',
    titulo: "3. Vista global o por sucursal",
    descripcion: "Si tienes más de una sucursal, alterna entre \"Vista global\" (todo el negocio) y \"Por sucursal\" (elige la tienda en el selector que aparece).",
  },
];

export const TOUR_ADUANA_COBRAR_ENTREGAR: TourStep[] = [
  {
    selector: '[data-tour="aduana-abrir-folio"]',
    titulo: "1. Abre el folio",
    descripcion: "Elige de la lista el trabajo que ya está \"Listo\" (o en devolución, si tu negocio cobra en devolución).",
  },
  {
    selector: '[data-tour="aduana-cobrar-entregar"]',
    titulo: "2. Cobrar y entregar",
    descripcion: "Si tu rol también tiene acceso a Punto de Venta, este atajo aparece en el folio y te manda directo a cobrar con el costo ya precargado — nunca cobra aquí mismo.",
  },
];

export const TOUR_SUCURSALES_ALTA: TourStep[] = [
  {
    selector: '[data-tour="sucursales-nueva"]',
    titulo: "1. Nueva sucursal",
    descripcion: "Abre el formulario para dar de alta una sucursal o punto de venta nuevo.",
  },
  {
    selector: '[data-tour="sucursales-nombre"]',
    titulo: "2. Nombre",
    descripcion: "Escribe el nombre con el que identificarás esta sucursal en el sistema (ej. \"Sucursal Centro\"). Es el único campo obligatorio.",
  },
  {
    selector: '[data-tour="sucursales-opcionales"]',
    titulo: "3. Código de sucursal (opcional)",
    descripcion: "Si manejas un punto de trabajo central para varias sucursales, un código corto (ej. \"CEN\") ayuda a identificar de dónde viene cada trabajo en el folio (ej. REP-CEN-0001).",
  },
  {
    selector: '[data-tour="sucursales-horario"]',
    titulo: "4. Horario esperado de caja (opcional)",
    descripcion: "Si defines la hora de apertura y cierre, y los días que opera, el sistema te avisará si esta sucursal no reporta su apertura o cierre de caja a tiempo (con 15 minutos de margen).",
  },
  {
    selector: '[data-tour="sucursales-guardar"]',
    titulo: "5. Crear sucursal",
    descripcion: "Guarda la nueva sucursal. A partir de aquí puedes asignarle personal e inventario propio.",
  },
];

export const TOUR_SOPORTE_TICKET: TourStep[] = [
  {
    selector: '[data-tour="soporte-nuevo"]',
    titulo: "1. Nuevo ticket",
    descripcion: "Abre el formulario para contarle al equipo de Linkity que algo no funciona o que tienes una duda.",
  },
  {
    selector: '[data-tour="soporte-asunto"]',
    titulo: "2. Asunto",
    descripcion: "Resume en una línea el problema o la duda (ej. \"No me deja registrar una venta\").",
  },
  {
    selector: '[data-tour="soporte-prioridad"]',
    titulo: "3. Prioridad",
    descripcion: "Indica qué tan urgente es: Baja, Normal, Alta o Urgente — ayuda al equipo de soporte a atenderte en el orden correcto.",
  },
  {
    selector: '[data-tour="soporte-mensaje"]',
    titulo: "4. Mensaje",
    descripcion: "Describe con el mayor detalle posible qué pasó: qué intentabas hacer, qué viste en pantalla y en qué módulo ocurrió.",
  },
  {
    selector: '[data-tour="soporte-enviar"]',
    titulo: "5. Enviar ticket",
    descripcion: "Envía el ticket. Podrás seguir la conversación con el equipo de soporte directamente en esta pantalla.",
  },
];
