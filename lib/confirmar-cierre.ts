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
