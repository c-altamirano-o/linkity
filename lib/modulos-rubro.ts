/**
 * Módulos recomendados como INACTIVOS por default para cada rubro
 * (Tenant.businessType) — parte de la personalización profesional por
 * rubro (2026-09-17): cada negocio debe ver solo lo que su giro necesita,
 * sin saturarlo con módulos que no le aplican (ej. un dentista no necesita
 * "Reparaciones" — ese módulo pide marca/modelo/falla de un aparato, un
 * molde que no tiene sentido para una cita).
 *
 * Solo se lista aquí lo que cambia respecto al default genérico (todo
 * activo) — un rubro que no aparece, o que aparece con un arreglo vacío,
 * no tiene ningún módulo recomendado como inactivo. Sin "use client"/
 * "server-only": es texto plano sin Prisma, así que es seguro importarlo
 * tanto desde Server Actions (app/actions/modulos-tenant-actions.ts,
 * app/(auth)/register/actions.ts) como desde Client Components que quieran
 * mostrar la recomendación antes de aplicarla (ConfiguracionClient.tsx).
 *
 * IMPORTANTE — esto es solo una SUGERENCIA, nunca un candado: el negocio
 * siempre puede reactivar cualquier módulo a mano desde Configuración
 * ("Módulos de tu negocio"), y aplicar este default nunca borra datos ya
 * capturados (si un dentista ya tenía reparaciones registradas y luego se
 * le recomienda apagar el módulo, esos registros siguen en la base de
 * datos, solo deja de aparecer el link en el menú).
 *
 * Hoy el único módulo que depende de verdad del rubro es "reparaciones"
 * (pide datos de un aparato/vehículo físico). Los otros 13 módulos
 * (Punto de Venta, Clientes, Catálogo, Inventario, Compras, Caja, Personal,
 * Asistencia, Sucursales, Reportes, Facturación, Soporte, Dashboard) los
 * usa cualquier negocio sin importar su giro, así que no tienen entrada
 * aquí. El día que se agregue un módulo nuevo específico de un rubro (ej.
 * un futuro módulo de Citas/Agenda, o de Historial Dental), su
 * recomendación por rubro se agrega en este mismo archivo, siguiendo el
 * mismo patrón.
 */

export const VERTICAL_MODULE_DEFAULTS_OFF: Record<string, string[]> = {
  // Rubros de cita/servicio — no reciben un "aparato" a reparar, así que
  // el molde de Reparaciones (marca, modelo, falla) no les aplica. "citas"
  // (2026-09-18) sí les aplica, así que se queda activo por default para
  // estos 8 — no aparece en su arreglo de apagados.
  //
  // "expediente-clinico" (2026-09-18, mismo día): solo se queda ACTIVO por
  // default para los 3 rubros de consulta clínica real (consultorio_dental,
  // consultorio_medico, veterinaria) — antecedentes/notas de evolución de un
  // paciente no le aplican a una barbería, estética, spa, gimnasio o
  // estudio de tatuajes, aunque agenden citas igual que un consultorio.
  barberia: ["reparaciones", "expediente-clinico"],
  consultorio_dental: ["reparaciones"],
  consultorio_medico: ["reparaciones"],
  veterinaria: ["reparaciones"],
  estetica: ["reparaciones", "expediente-clinico"],
  spa: ["reparaciones", "expediente-clinico"],
  gimnasio: ["reparaciones", "expediente-clinico"],
  tatuajes: ["reparaciones", "expediente-clinico"],
  // Retail puro — vende producto terminado, no repara nada, no agenda
  // citas (una venta de mostrador no se programa con anticipación) y no
  // lleva expediente clínico de nadie.
  comercio_retail: ["reparaciones", "citas", "expediente-clinico"],

  // Los 11 rubros de reparación de aparato/vehículo — Reparaciones es su
  // módulo central (se queda activo por default, por eso no aparece en su
  // arreglo), pero tampoco agendan "citas" ni llevan expediente clínico de
  // nadie — reciben el aparato cuando el cliente llega, no antes (2026-09-18).
  reparacion_celulares: ["citas", "expediente-clinico"],
  taller_autos: ["citas", "expediente-clinico"],
  taller_motos: ["citas", "expediente-clinico"],
  electrodomesticos: ["citas", "expediente-clinico"],
  computadoras: ["citas", "expediente-clinico"],
  relojeria_joyeria: ["citas", "expediente-clinico"],
  zapateria: ["citas", "expediente-clinico"],
  refrigeracion_ac: ["citas", "expediente-clinico"],
  bicicletas: ["citas", "expediente-clinico"],
  cerrajeria: ["citas", "expediente-clinico"],
  tapiceria: ["citas", "expediente-clinico"],
};

/** Códigos de módulo recomendados como inactivos para un rubro dado (arreglo vacío = ninguno). */
export function modulosRecomendadosOff(businessType: string | null | undefined): string[] {
  if (!businessType) return [];
  return VERTICAL_MODULE_DEFAULTS_OFF[businessType] ?? [];
}
