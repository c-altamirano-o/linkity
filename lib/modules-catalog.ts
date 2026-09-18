/**
 * Catálogo de módulos del sistema — antes vivía duplicado dentro de
 * app/(admin)/maestro/tenants/nuevo/actions.ts; se extrajo aquí porque el
 * flujo de auto-registro (app/(auth)/register) necesita exactamente la
 * misma lista para dar de alta los TenantModule del negocio nuevo, y
 * mantener dos copias del mismo catálogo es justo el tipo de duplicación
 * que ya nos mordió antes con los folios/status — mejor una sola fuente de
 * verdad.
 *
 * Reescrito 2026-09-17 (personalización por rubro): el catálogo anterior
 * usaba códigos "M1".."M14" que NO correspondían 1:1 con los módulos reales
 * que ve un negocio (M1-M4 eran conceptos de infraestructura interna —
 * "Acceso Universal", "Boveda de Datos", "Login Seguro", "Permisos" — que
 * ningún negocio "activa o desactiva", y encima le faltaban Compras,
 * Soporte y Asistencia por completo, que se agregaron después sin
 * actualizar este catálogo). Ahora cada código coincide EXACTAMENTE con la
 * clave de ruta que ya usa el menú (components/tenant/TenantShell.tsx) y
 * el sistema de roles (lib/roles.ts, tipo ModuloKey) — una sola lista de
 * nombres para nav, permisos de rol Y activación por tenant, en vez de
 * tres catálogos distintos que se desincronizan solos con el tiempo.
 *
 * "dashboard" es el único módulo núcleo (isCore:true, nunca se puede
 * desactivar) — es la pantalla de aterrizaje, no tiene sentido dejar a un
 * negocio sin ella. Los otros 13 son todos desactivables, ya sea por
 * Carlos desde Panel Maestro o por el propio negocio desde Configuración
 * (ver lib/modulos-rubro.ts para los defaults recomendados por rubro).
 *
 * Nota de compatibilidad: los Module/TenantModule ya existentes en la BD
 * con los códigos viejos ("M1".."M14") NO se tocan ni se borran — quedan
 * como filas inertes sin ningún efecto (nada en el código los vuelve a
 * consultar), y la activación real de cada negocio se reconstruye sola con
 * los códigos nuevos conforme se use el toggle de módulos (ver
 * app/actions/modulos-tenant-actions.ts) — ver ese mismo archivo para la
 * semántica de "sin fila = activo" que hace este cambio seguro para
 * negocios que ya estaban en producción antes de este catálogo.
 */

export interface ModuloInfo {
  name: string;
  isCore: boolean;
}

export const MODULE_CATALOG: Record<string, ModuloInfo> = {
  dashboard: { name: "Dashboard", isCore: true },
  pos: { name: "Punto de Venta", isCore: false },
  reparaciones: { name: "Reparaciones", isCore: false },
  // Agenda de citas (2026-09-18, Fase 1 de la propuesta de Consultorio
  // Dental) — el equivalente de Reparaciones para negocios de cita
  // (dentista, médico, veterinaria, estética, spa, gimnasio, tatuajes,
  // barbería): agendar la atención de un cliente/paciente en un horario, en
  // vez de recibir un aparato a reparar. Ver lib/modulos-rubro.ts para qué
  // rubro lo trae activado por default.
  citas: { name: "Citas", isCore: false },
  // Expediente Clínico + Odontograma (2026-09-18, items 2 y 3 de la
  // propuesta de Consultorio Dental) — vive embebido dentro de la ficha del
  // cliente (módulo Clientes), no tiene ruta propia ni aparece en el menú
  // lateral; se activa/desactiva igual que cualquier otro módulo desde
  // Configuración, y ese estado es lo que ClientesClient.tsx usa para
  // mostrar u ocultar la pestaña "Expediente Clínico". Ver lib/modulos-rubro.ts
  // para qué rubros lo traen activado por default.
  "expediente-clinico": { name: "Expediente Clínico", isCore: false },
  clientes: { name: "Clientes", isCore: false },
  catalogo: { name: "Catálogo", isCore: false },
  inventario: { name: "Inventario", isCore: false },
  compras: { name: "Compras", isCore: false },
  caja: { name: "Caja", isCore: false },
  personal: { name: "Personal", isCore: false },
  asistencia: { name: "Asistencia", isCore: false },
  sucursales: { name: "Sucursales", isCore: false },
  reportes: { name: "Reportes", isCore: false },
  facturacion: { name: "Facturación", isCore: false },
  soporte: { name: "Soporte", isCore: false },
};

export const ALL_MODULE_CODES = Object.keys(MODULE_CATALOG);
