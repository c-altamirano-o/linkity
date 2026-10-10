"use client";

// Enter = hacer lo mismo que el botón principal (2026-10-09, a petición de
// Carlos: "en varios puntos del SaaS donde existe un cuadro de texto, al dar
// Enter no guarda ni hace la función; se tiene que presionar el botón").
//
// Una sola pieza para todo el SaaS, montada una vez en app/layout.tsx.
// Escucha Enter en campos de una línea y, si el campo está dentro de una
// "zona" que tiene UN botón principal marcado, le hace clic — exactamente lo
// mismo que hacer clic con el mouse (si el botón está deshabilitado, por
// ejemplo mientras guarda, no pasa nada; así no hay doble envío).
//
// Cómo se usa en una pantalla (no se toca ninguna lógica de guardado):
//   data-enter-primario  → en el botón principal (Guardar, Crear, Agregar...)
//   data-enter-zona      → en el contenedor que agrupa los campos y su botón.
//                           Los modales (".fixed.inset-0") ya cuentan como
//                           zona sin marcarlos; las secciones dentro de una
//                           página sí necesitan la marca.
//   data-enter-ignorar   → en un campo (o contenedor) donde Enter NO debe
//                           disparar nada.
//
// A propósito NO se marca el botón de Confirmar / Eliminar / Cancelar /
// Cobrar: son acciones que requieren atención y se siguen haciendo con clic.

import { useEffect } from "react";

const TIPOS_DE_UNA_LINEA = new Set([
  "text", "number", "date", "time", "datetime-local", "month",
  "tel", "email", "search", "url", "password",
]);

const SELECTOR_ZONA = "[data-enter-zona], .fixed.inset-0";

/**
 * Devuelve el botón al que Enter debe hacerle clic, o null si no aplica.
 * Exportada y sin efectos para poder probarla aislada.
 */
export function botonPrincipalParaEnter(e: KeyboardEvent): HTMLElement | null {
  if (e.key !== "Enter" || e.defaultPrevented || e.isComposing) return null;
  if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return null;

  const campo = e.target;
  if (!(campo instanceof HTMLInputElement)) return null;
  if (!TIPOS_DE_UNA_LINEA.has(campo.type)) return null;
  if (campo.readOnly || campo.disabled) return null;
  // Dentro de un <form> el navegador ya envía con Enter por su cuenta.
  if (campo.form) return null;
  if (campo.closest("[data-enter-ignorar]")) return null;

  const zona = campo.closest(SELECTOR_ZONA);
  if (!zona) return null;

  // Solo botones principales de ESTA zona (no los de una zona anidada).
  const candidatos = Array.from(
    zona.querySelectorAll<HTMLElement>("[data-enter-primario]")
  ).filter((b) => b.closest(SELECTOR_ZONA) === zona);

  const habilitados = candidatos.filter(
    (b) => !(b as HTMLButtonElement).disabled && b.getAttribute("aria-disabled") !== "true"
  );
  // Ninguno, o más de uno (ambiguo): mejor no hacer nada que adivinar.
  if (habilitados.length !== 1) return null;
  return habilitados[0];
}

export function EnterAccion() {
  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      const boton = botonPrincipalParaEnter(e);
      if (!boton) return;
      e.preventDefault();
      boton.click();
    }
    document.addEventListener("keydown", alPresionar);
    return () => document.removeEventListener("keydown", alPresionar);
  }, []);

  return null;
}
