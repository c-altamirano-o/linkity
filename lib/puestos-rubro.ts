/**
 * Puestos sugeridos por rubro (Tenant.businessType) — 2026-09-17, a raíz de
 * que Carlos reportó que el catálogo de puestos/roles se pensó solo para un
 * taller de celulares (Técnico/Cajero/Gerente) y no encajaba con negocios
 * como una barbería (Recepcionista, Jefe de Barberos, Barbero...).
 *
 * A diferencia de los roles (que sí controlan acceso real, ver lib/roles.ts
 * / roles-server.ts), esto es puramente cosmético: el campo Staff.position
 * sigue siendo texto libre — estas listas solo alimentan un <datalist> de
 * autocompletado en el formulario de alta de empleado (PersonalClient.tsx),
 * para sugerir el vocabulario típico del rubro sin obligar a nada. Ningún
 * puesto de esta lista crea un Role por sí solo; el admin sigue asignando
 * el rol (acceso) por separado.
 *
 * Mismas claves de rubro que lib/modulos-rubro.ts (Tenant.businessType).
 */

export const PUESTOS_SUGERIDOS_RUBRO: Record<string, string[]> = {
  barberia: ["Barbero", "Jefe de Barberos", "Recepcionista", "Estilista"],
  consultorio_dental: ["Dentista", "Asistente dental", "Recepcionista", "Higienista"],
  consultorio_medico: ["Médico", "Enfermero(a)", "Recepcionista", "Asistente médico"],
  veterinaria: ["Veterinario", "Asistente veterinario", "Recepcionista", "Groomer"],
  estetica: ["Esteticista", "Recepcionista", "Encargado de sucursal"],
  spa: ["Terapeuta", "Masajista", "Recepcionista", "Encargado de sucursal"],
  gimnasio: ["Entrenador", "Recepcionista", "Encargado de sucursal", "Instructor"],
  tatuajes: ["Tatuador", "Recepcionista", "Encargado de estudio"],
  comercio_retail: ["Vendedor", "Cajero", "Encargado de tienda", "Almacenista"],
  reparacion_celulares: ["Técnico reparador", "Recepcionista", "Encargado de sucursal"],
  taller_autos: ["Mecánico", "Jefe de taller", "Recepción", "Asesor de servicio"],
  taller_motos: ["Mecánico", "Jefe de taller", "Recepción"],
  electrodomesticos: ["Técnico reparador", "Recepcionista", "Encargado de sucursal"],
  computadoras: ["Técnico reparador", "Recepcionista", "Encargado de sucursal"],
  relojeria_joyeria: ["Relojero/Joyero", "Vendedor", "Encargado de tienda"],
  zapateria: ["Zapatero remendón", "Vendedor", "Encargado de tienda"],
  refrigeracion_ac: ["Técnico instalador", "Recepcionista", "Encargado de sucursal"],
  bicicletas: ["Mecánico de bicicletas", "Vendedor", "Encargado de tienda"],
  cerrajeria: ["Cerrajero", "Recepcionista", "Encargado de sucursal"],
  tapiceria: ["Tapicero", "Vendedor", "Encargado de taller"],
};

/** Puestos sugeridos para el rubro dado (arreglo vacío = sin sugerencias específicas, solo texto libre). */
export function puestosSugeridos(businessType: string | null | undefined): string[] {
  if (!businessType) return [];
  return PUESTOS_SUGERIDOS_RUBRO[businessType] ?? [];
}
