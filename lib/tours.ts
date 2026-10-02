"use client";

import { useEffect, useRef } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

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
export function useTourDesdeUrl(tourId: string, pasos: TourStep[]) {
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

    const t = window.setTimeout(() => iniciarTour(pasos), 200);
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
    descripcion: "Presiona \"Nueva\" para empezar a recibir un equipo.",
  },
  {
    selector: '[data-tour="reparaciones-cliente"]',
    titulo: "2. Elige o registra al cliente",
    descripcion: "Búscalo por nombre; si no aparece, presiona \"+ Registrar cliente nuevo\" y captura su nombre y teléfono.",
  },
  {
    selector: '[data-tour="reparaciones-marca"]',
    titulo: "3. Captura la marca",
    descripcion: "El fabricante del equipo — por ejemplo Samsung, Apple, Huawei o Motorola.",
  },
  {
    selector: '[data-tour="reparaciones-modelo"]',
    titulo: "4. Captura el modelo",
    descripcion: "El modelo específico dentro de esa marca (ej. \"A16\", \"iPhone 8\", \"Nova 2\") — lo encuentras en la caja del equipo, en los Ajustes del equipo, o te lo dice el cliente.",
  },
  {
    selector: '[data-tour="reparaciones-falla"]',
    titulo: "5. Describe la falla reportada",
    descripcion: "Lo que el cliente dice que le pasa al equipo, o lo que tú notaste al revisarlo y diagnosticarlo.",
  },
  {
    selector: '[data-tour="reparaciones-contrasena"]',
    titulo: "6. Contraseña de desbloqueo (opcional)",
    descripcion: "Solo si el equipo tiene bloqueo — es exclusivamente para que el técnico pueda hacer pruebas, nunca se muestra al cliente.",
  },
  {
    selector: '[data-tour="reparaciones-piezas"]',
    titulo: "7. Agrega piezas y/o servicios cotizados",
    descripcion: "Indica si se cotizó una pieza, un servicio (mano de obra, diagnóstico) o ambos — es lo que verá el cliente en su ticket, y el sistema no deja crear el folio sin esto.",
  },
  {
    selector: '[data-tour="reparaciones-prioridad"]',
    titulo: "8. Elige la prioridad",
    descripcion: "Qué tan urgente es que el equipo quede listo — normalmente te lo indica el propio cliente.",
  },
  {
    selector: '[data-tour="reparaciones-fecha"]',
    titulo: "9. Fecha estimada de entrega (opcional)",
    descripcion: "La defines tú según la carga de trabajo del taller, o la que acordaste con el cliente — aparece en su ticket.",
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
export const TOUR_ADUANA_ASIGNAR: TourStep[] = [
  {
    selector: '[data-tour="aduana-tecnico"]',
    titulo: "1. Asigna un técnico",
    descripcion: "Elige al técnico responsable de este equipo en el selector — se guarda solo con elegirlo, sin botón aparte.",
  },
  {
    selector: '[data-tour="aduana-costo"]',
    titulo: "2. Ajusta el costo estimado",
    descripcion: "Captura o corrige el monto aquí si el costo cambió tras el diagnóstico — queda registrado en el Historial con fecha y hora.",
  },
  {
    selector: '[data-tour="aduana-piezas"]',
    titulo: "3. Agrega piezas y/o servicios cotizados",
    descripcion: "Usa el selector y el botón \"+\" para sumar una pieza o servicio del catálogo, o \"Otro\" para un nombre/precio libre.",
  },
  {
    selector: '[data-tour="aduana-estatus"]',
    titulo: "4. Avanza el estatus",
    descripcion: "Presiona el botón con el siguiente estatus (ej. \"Listo\") cuando el equipo avance.",
  },
];
