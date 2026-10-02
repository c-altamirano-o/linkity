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

export const TOUR_REPARACIONES_RECIBIR: TourStep[] = [
  {
    selector: '[data-tour="reparaciones-nueva"]',
    titulo: "1. Abre el formulario",
    descripcion: "Presiona \"Nueva\" para empezar a recibir un equipo.",
  },
  {
    selector: '[data-tour="reparaciones-falla"]',
    titulo: "2. Describe la falla",
    descripcion: "Además del cliente, marca y modelo (arriba en el formulario), describe aquí la falla reportada por el cliente.",
  },
  {
    selector: '[data-tour="reparaciones-piezas"]',
    titulo: "3. Agrega al menos una pieza o servicio",
    descripcion: "Es obligatorio — el sistema no deja crear el folio sin un costo estipulado.",
  },
  {
    selector: '[data-tour="reparaciones-crear"]',
    titulo: "4. Crea el folio",
    descripcion: "El sistema genera el folio automáticamente — no se captura a mano.",
  },
];

export const TOUR_ADUANA_ASIGNAR: TourStep[] = [
  {
    selector: '[data-tour="aduana-tecnico"]',
    titulo: "1. Asigna un técnico",
    descripcion: "Elige al técnico responsable de este equipo — se guarda solo con elegirlo, sin botón aparte.",
  },
  {
    selector: '[data-tour="aduana-costo"]',
    titulo: "2. Ajusta el costo si hace falta",
    descripcion: "Captura el costo estimado o la pieza cotizada y presiona \"Guardar\".",
  },
  {
    selector: '[data-tour="aduana-estatus"]',
    titulo: "3. Avanza el estatus",
    descripcion: "Presiona el botón con el siguiente estatus (ej. \"Listo\") cuando el equipo avance.",
  },
];
