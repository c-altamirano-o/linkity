import { useEffect } from "react";

/**
 * Confirmación antes de cerrar una ventana emergente de captura de datos al
 * hacer click FUERA de ella (2026-09-21, a petición de Carlos: "En cualquier
 * ventana emergente ya sea para capturar un articulo o un cliente una venta
 * al dar click fuera del espacio designado solo se cierra. Deberia bloquear
 * lo que está debajo y sonar una advertencia o aparecer un mensaje de
 * 'Salir sin guardar'").
 *
 * Antes de esto, el fondo oscuro (backdrop) de cada modal de captura tenía
 * un onClick que cerraba el modal sin más — un click accidental fuera del
 * recuadro (muy fácil en pantallas grandes, donde el modal es angosto y
 * centrado) perdía todo lo que el usuario ya había escrito, sin aviso.
 *
 * Se usa el confirm() nativo del navegador a propósito, no un modal de
 * confirmación propio: ya bloquea la interacción con todo lo de atrás (es
 * modal de verdad, a nivel de sistema operativo/navegador) y en la mayoría
 * de navegadores emite el mismo sonido de alerta del sistema que un
 * diálogo nativo cualquiera — exactamente lo que Carlos pidió ("bloquear
 * lo que está debajo y sonar una advertencia"), sin construir ni mantener
 * un componente de diálogo aparte solo para esto.
 *
 * No se intenta distinguir "el formulario ya tiene cambios" de "está tal
 * cual se abrió" (un tracker de "dirty" por formulario sería mucho más
 * código para un beneficio marginal): se pregunta siempre que se hace click
 * fuera, sin excepción — un formulario recién abierto y sin tocar tampoco
 * se cierra con un solo click accidental, que es justo el comportamiento
 * que Carlos reportó como el problema.
 */
export function confirmarSalirSinGuardar(): boolean {
  if (typeof window === "undefined") return true;
  return window.confirm("¿Salir sin guardar los cambios?");
}

/**
 * Advertencia al cerrar/recargar la PESTAÑA o navegar a otra URL fuera de
 * la app (2026-09-22, a petición de Carlos, revisando el flujo de Caja:
 * "si se cierra o se sale de esa ventana se queda a medias" — corrigiendo
 * de paso una idea equivocada suya de que el sistema "guarda en tiempo
 * real cada cambio": NINGÚN formulario de este proyecto autoguarda — cada
 * Server Action solo escribe cuando el usuario da click en Guardar/
 * Cobrar/Abrir caja/etc., y esa escritura es atómica (todo o nada). Lo que
 * de verdad se pierde si cierra antes de dar click en ese botón es el
 * INPUT AÚN NO GUARDADO — exactamente igual que en cualquier formulario
 * web. Este hook es el aviso para ANTES de que eso pase.
 *
 * Complementa, no reemplaza, a confirmarSalirSinGuardar() de arriba: ese
 * cubre cerrar el MODAL (click fuera, Cancelar, X) sin salir de la
 * pestaña; este cubre cerrar/recargar la PESTAÑA/VENTANA del navegador, o
 * teclear otra URL a mano, mientras un modal de captura sigue abierto.
 *
 * Se usa desde cada <Modulo>Client.tsx así:
 *   useAdvertirCierrePestaña(mostrarModalA || mostrarModalB || ...)
 * (el OR de cada state var que controla un modal de captura de esa
 * pantalla) — mismo criterio de "sin distinguir si ya se tocó algo" que
 * confirmarSalirSinGuardar(): se advierte mientras el modal esté abierto,
 * sin intentar rastrear campo por campo si de verdad cambió algo.
 *
 * Dos limitaciones del navegador, no de este código, que vale la pena
 * tener presentes:
 * 1. `beforeunload` NO se dispara al navegar DENTRO de la app (dar click
 *    en un link del menú lateral, redirect de una Server Action) — solo
 *    al cerrar/recargar la pestaña/ventana o ir a una URL fuera de la app
 *    (escribirla a mano, un favorito, cerrar el navegador entero).
 * 2. Todos los navegadores modernos ignoran cualquier texto personalizado
 *    y muestran su propio mensaje genérico (ej. "Los cambios que
 *    realizaste no se guardarán") — es una restricción de seguridad del
 *    navegador (evita que un sitio use un mensaje engañoso), no un
 *    descuido de esta implementación.
 */
export function useAdvertirCierrePestaña(hayModalDeCapturaAbierto: boolean): void {
  // useEffect nunca corre en el servidor, así que no hace falta un guard
  // de `typeof window` aparte: mientras este hook no se llame antes de
  // "use client" en el árbol (siempre se llama desde un <Modulo>Client.tsx),
  // el callback de abajo solo se ejecuta en el navegador.
  useEffect(() => {
    if (!hayModalDeCapturaAbierto) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Requerido por navegadores viejos (Chrome ignora el valor real,
      // pero exige que la propiedad se asigne para mostrar su diálogo).
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hayModalDeCapturaAbierto]);
}
