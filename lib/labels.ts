/**
 * Capa de textos personalizables por tenant — SOLO lo seguro para el navegador.
 *
 * Este archivo NO debe importar nada de Prisma/BD: se usa desde Client
 * Components (ej. DashboardClient.tsx), y cualquier import de servidor aquí
 * termina metiendo Prisma/pg al bundle del navegador y truena el build
 * ("Module not found: Can't resolve 'dns'"). Lo que sí toca BD vive en
 * lib/labels-server.ts, que es el que se importa desde Server Components
 * (page.tsx) y Server Actions.
 *
 * La idea de fondo: el sistema siempre habla internamente con una "key" fija
 * (ej. "module.repair.name", "repair.status.IN_REPAIR"). Esa key NUNCA
 * cambia — es lo que usa el código, los reportes, las migraciones, etc.
 *
 * Lo que sí cambia es el texto que ve el usuario para esa key, y se
 * resuelve en cascada (ver lib/labels-server.ts):
 *
 *   1) Override guardado por el propio tenant (tabla TenantLabel en BD)
 *   2) Default del rubro del tenant (VERTICAL_LABEL_DEFAULTS, aquí abajo)
 *   3) Default genérico del sistema (DEFAULT_LABELS, aquí abajo)
 *   4) Si ni siquiera hay default genérico, se regresa la key tal cual
 *      (para que nunca truene la UI por una key nueva sin traducir)
 *
 * Agregar una key nueva NO requiere migración: solo se agrega su default
 * aquí en código, y cualquier tenant puede sobreescribirla desde BD.
 */

export type LabelDictionary = Record<string, string>;

// ── Defaults genéricos del sistema (nivel 3) ──────────────────────────
export const DEFAULT_LABELS: LabelDictionary = {
  // Nombres de módulo (como aparecen en el menú/sidebar)
  "module.repair.name": "Reparaciones",
  "module.catalog.name": "Catálogo",
  "module.pos.name": "Punto de Venta",
  "module.cash.name": "Caja",
  "module.staff.name": "Personal",
  "module.inventory.name": "Inventario",
  "module.customers.name": "Clientes",
  "module.suppliers.name": "Proveedores",
  "module.invoicing.name": "Facturación",
  "module.dashboard.name": "Dashboard",
  // Agregados 2026-09-17 al conectar el menú lateral (TenantShell.tsx) a
  // este sistema de labels — antes tenía sus nombres escritos a mano y
  // nunca variaban por rubro ni eran personalizables. "module.purchases"
  // es el módulo real "Compras" (no confundir con "module.suppliers" de
  // arriba, que quedó sin usar — se conserva por si en el futuro se separa
  // el catálogo de proveedores de las compras en sí).
  "module.purchases.name": "Compras",
  "module.branches.name": "Sucursales",
  "module.reports.name": "Reportes",
  "module.support.name": "Soporte",
  "module.attendance.name": "Asistencia",
  // Agenda de citas (2026-09-18) — ver el comentario largo en
  // lib/modules-catalog.ts sobre por qué este módulo es distinto de
  // Reparaciones.
  "module.appointments.name": "Citas",
  // Expediente Clínico + Odontograma (2026-09-18) — embebido en la ficha
  // del cliente, ver el comentario largo en lib/modules-catalog.ts.
  "module.clinicalRecord.name": "Expediente Clínico",

  // Condición de cada diente en el odontograma (ToothCondition) — el texto
  // que ve el usuario para cada valor del enum; no varía por rubro (el
  // odontograma solo aplica a consultorio_dental).
  "tooth.condition.SANO": "Sano",
  "tooth.condition.CARIES": "Caries",
  "tooth.condition.OBTURADO": "Obturado",
  "tooth.condition.CORONA": "Corona",
  "tooth.condition.ENDODONCIA": "Endodoncia",
  "tooth.condition.AUSENTE": "Ausente",
  "tooth.condition.EXTRACCION_INDICADA": "Extracción indicada",
  "tooth.condition.IMPLANTE": "Implante",
  "tooth.condition.FRACTURADO": "Fracturado",
  "tooth.condition.SELLANTE": "Sellante",

  // Nombre de la entidad principal del módulo de reparaciones
  "entity.repair.singular": "Reparación",
  "entity.repair.plural": "Reparaciones",
  "entity.repair.asset": "Dispositivo",

  // Nombre de la entidad principal del módulo de citas, y estatus de
  // AppointmentStatus — igual que repair.status.*, personalizable por rubro
  // si algún negocio quiere otro texto (ej. "Sesión" en un spa).
  "entity.appointment.singular": "Cita",
  "entity.appointment.plural": "Citas",
  "appointment.status.SCHEDULED": "Programada",
  "appointment.status.CONFIRMED": "Confirmada",
  "appointment.status.IN_PROGRESS": "En curso",
  "appointment.status.COMPLETED": "Completada",
  "appointment.status.NO_SHOW": "No se presentó",
  "appointment.status.CANCELLED": "Cancelada",

  // Estatus del flujo de reparación (RepairStatus)
  "repair.status.RECEIVED": "Recibido",
  "repair.status.DIAGNOSING": "En diagnóstico",
  "repair.status.WAITING_PARTS": "Esperando refacciones",
  "repair.status.IN_REPAIR": "En reparación",
  "repair.status.READY": "Listo",
  "repair.status.DELIVERED": "Entregado",
  "repair.status.CANCELLED": "Cancelado",
  "repair.status.WORKSHOP_READY": "Listo en taller",
  "repair.status.WORKSHOP_RETURN": "Regresó a taller",
  "repair.status.SHOP_READY": "Listo en sucursal",
  "repair.status.SHOP_RETURN": "Regresó a sucursal",
};

// ── Defaults por rubro (nivel 2) ──────────────────────────────────────
// Se aplican según Tenant.businessType. Solo se listan las keys que
// cambian respecto al default genérico — todo lo demás cae a nivel 3.
//
// Nota: barbería, consultorio dental, consultorio médico y veterinaria no
// traen defaults de "repair.*" porque ese módulo no aplica a su flujo de
// trabajo (son negocios de cita/agenda, no de recepción de un activo);
// esos tenants simplemente no activarían el módulo de Reparaciones. Se
// dejan explícitos en el diccionario (aunque vacíos) para que
// BUSINESS_TYPE_OPTIONS y este objeto siempre estén sincronizados.
export const VERTICAL_LABEL_DEFAULTS: Record<string, LabelDictionary> = {
  reparacion_celulares: {
    // Coincide con el default genérico, se deja explícito por claridad.
    "module.repair.name": "Reparaciones",
    "entity.repair.asset": "Dispositivo",
  },
  taller_autos: {
    "module.repair.name": "Órdenes de Servicio",
    "entity.repair.singular": "Orden de Servicio",
    "entity.repair.plural": "Órdenes de Servicio",
    "entity.repair.asset": "Vehículo",
  },
  taller_motos: {
    "module.repair.name": "Órdenes de Servicio",
    "entity.repair.singular": "Orden de Servicio",
    "entity.repair.plural": "Órdenes de Servicio",
    "entity.repair.asset": "Motocicleta",
  },
  electrodomesticos: {
    "module.repair.name": "Equipos en Servicio",
    "entity.repair.singular": "Equipo",
    "entity.repair.plural": "Equipos",
    "entity.repair.asset": "Electrodoméstico",
  },
  computadoras: {
    "module.repair.name": "Equipos",
    "entity.repair.singular": "Equipo",
    "entity.repair.plural": "Equipos",
    "entity.repair.asset": "Equipo de cómputo",
  },
  relojeria_joyeria: {
    "entity.repair.asset": "Reloj o joya",
  },
  zapateria: {
    "entity.repair.asset": "Calzado",
  },
  refrigeracion_ac: {
    "entity.repair.asset": "Equipo de refrigeración o A/C",
  },
  bicicletas: {
    "entity.repair.asset": "Bicicleta",
  },
  cerrajeria: {
    "entity.repair.asset": "Cerradura o acceso",
  },
  tapiceria: {
    "entity.repair.asset": "Mueble",
  },
  barberia: {},
  consultorio_dental: {},
  consultorio_medico: {},
  veterinaria: {},
  // Negocios de cita/agenda (dependen del futuro módulo de Agenda, que
  // todavía no existe) — se dejan reservados desde ahora sin costo.
  estetica: {},
  spa: {},
  gimnasio: {},
  tatuajes: {},
  // Retail puro: no usa el módulo de Reparaciones en absoluto.
  comercio_retail: {},
};

// Opciones de rubro que se muestran en el selector de Configuración.
// Cada value debe existir como key en VERTICAL_LABEL_DEFAULTS de arriba
// (aunque sea con un objeto vacío) para que quede documentado que el
// sistema lo reconoce como un rubro válido.
export const BUSINESS_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "reparacion_celulares", label: "Reparación de celulares" },
  { value: "taller_autos", label: "Taller automotriz" },
  { value: "taller_motos", label: "Taller de motos" },
  { value: "electrodomesticos", label: "Reparación de electrodomésticos" },
  { value: "computadoras", label: "Reparación de computadoras" },
  { value: "barberia", label: "Barbería" },
  { value: "consultorio_dental", label: "Consultorio dental" },
  { value: "consultorio_medico", label: "Consultorio médico" },
  { value: "veterinaria", label: "Veterinaria" },
  { value: "relojeria_joyeria", label: "Relojería y joyería" },
  { value: "zapateria", label: "Zapatería / reparación de calzado" },
  { value: "refrigeracion_ac", label: "Refrigeración y aires acondicionados" },
  { value: "bicicletas", label: "Reparación de bicicletas" },
  { value: "cerrajeria", label: "Cerrajería" },
  { value: "tapiceria", label: "Tapicería" },
  { value: "estetica", label: "Estética / salón de belleza" },
  { value: "spa", label: "Spa / masajes" },
  { value: "gimnasio", label: "Gimnasio / estudio de fitness" },
  { value: "tatuajes", label: "Estudio de tatuajes" },
  { value: "comercio_retail", label: "Tienda / comercio minorista" },
];

/** Resuelve una sola key contra un diccionario ya cargado. Seguro para cliente. */
export function label(dict: LabelDictionary, key: string): string {
  return dict[key] ?? key;
}
