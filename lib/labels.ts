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
  // "module.workshop.name"/"module.reception.name" (2026-09-24, corrigiendo
  // un bug real que Carlos reportó con capturas: "aparecen dos con el
  // nombre de Reparaciones" — una para el mostrador/tienda [módulo
  // "reparaciones"], otra para el taller central [módulo "aduana", control
  // total] y otra para el técnico [módulo "taller", solo lectura]).
  // TenantShell.tsx compartía a propósito "module.repair.name" entre las
  // tres, asumiendo que "un rol nunca tiene los dos módulos a la vez en la
  // práctica" — un supuesto que un rol con más de uno de los tres (ej. el
  // rediseño de puestos de reparación de celulares, 2026-09-24) rompe: se
  // ven dos/tres pestañas IDÉNTICAS. La corrección real es que cada
  // módulo tenga su propio nombre, no evitar el solape — así, si un puesto
  // sí necesita más de uno, se ven como pestañas distintas y claras, nunca
  // duplicadas.
  //
  // 2026-10-01, a petición de Carlos ("Aduana" le genera confusión a su
  // personal — no es vocabulario del giro, nadie entiende qué va a
  // encontrar ahí): el módulo "aduana" (control central: asigna técnico,
  // cambia estatus, ajusta costo/piezas) pasa a llamarse simplemente
  // "Taller" — es, en los hechos, el panel de control del taller. Para que
  // esto NO reviva el bug de arriba, el módulo "taller" (la vista angosta,
  // de solo lectura, del propio técnico) deja de llamarse "Taller" y pasa a
  // "Mis Reparaciones" — dos nombres que además describen mejor cada uno
  // (uno es el panel completo, el otro es "lo mío, nada más"). Administrador/
  // Gerente/Recepción ven "Taller"; el técnico ve "Mis Reparaciones"; ningún
  // rol de los catálogos base o por rubro tiene ambos módulos a la vez (ver
  // lib/roles.ts y lib/roles-rubro.ts), así que no hay pestañas duplicadas —
  // pero si algún negocio arma desde "Roles y permisos" un puesto con los
  // dos permisos juntos, sí volverían a verse dos pestañas iguales; eso
  // queda pendiente de una validación en RolesManager.tsx si Carlos la pide.
  "module.workshop.name": "Mis Reparaciones",
  "module.reception.name": "Taller",
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
  // "Ayuda" (2026-10-02, a petición de Carlos: manual de usuario dentro de
  // la propia app, visible para CUALQUIER rol — ver el comentario largo
  // junto al ítem "ayuda" en NAV_STRUCTURE, TenantShell.tsx). Nombre fijo,
  // sin personalizar por rubro a propósito: a diferencia de "Reparaciones"/
  // "Soporte", no hay ninguna razón para que varíe de un negocio a otro.
  "module.help.name": "Ayuda",
  "module.attendance.name": "Asistencia",
  // "Configuración" (2026-10-02): hasta ahora TenantShell.tsx la escribía
  // literal (no es un ítem de NAV_STRUCTURE, vive aparte como acceso directo
  // junto al logout — ver el comentario junto a href={`/${tenant}/configuracion`}),
  // así que nunca había pasado por este sistema de labels. Se agrega aquí
  // porque lib/ayuda-contenido.ts necesita un labelKey real para CADA
  // ModuloKey (incluida "configuracion") al resolver el nombre del módulo en
  // el manual — no varía por rubro, igual que "Ayuda"/"Soporte".
  "module.configuration.name": "Configuración",
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
  // Vocabulario por rubro (2026-10-09, a petición de Carlos): el "especialista"
  // es quien presta el servicio o hace la reparación (técnico, barbero,
  // dentista…); la recepción/mostrador es otro puesto y no cambia. Los
  // ejemplos y el ícono del Catálogo y el motivo de una cita también cambian
  // por rubro. Ver VOCABULARIO_RUBRO más abajo.
  "vocab.especialista.singular": "Técnico",
  "vocab.especialista.plural": "Técnicos",
  "example.catalog.product": "Nombre del producto",
  "example.appointment.reason": "Revisión general",
  "icon.catalog.product": "Package",
  // Nombre del tipo de catálogo que en reparación se llama "Refacción" (tipo PART).
  "catalog.part.singular": "Refacción",
  "catalog.part.plural": "Refacciones",
  // Expediente clínico (grupo C): quien recibe la atención y firma/autoriza, y ejemplos.
  "vocab.paciente": "paciente",
  "example.clinical.allergy": "Penicilina",
  "example.clinical.plan": "Plan de seguimiento",
  "example.clinical.plan.item": "Tratamiento o procedimiento",
  "example.clinical.prescription": "Medicamento, dosis y duración",
  // Reparaciones/servicios (grupo B, 2026-10-09): lugar de trabajo y campos del
  // formulario de recepción. "unlock.enabled" y "single" son interruptores "1"/"0".
  "vocab.lugar": "taller",
  "repair.field.brand": "Marca",
  "repair.field.model": "Modelo",
  "repair.field.fault": "Falla reportada",
  "repair.field.unlock": "Contraseña de desbloqueo",
  "repair.field.unlock.enabled": "0",
  "example.repair.brand": "",
  "example.repair.model": "",
  "repair.field.single": "0",
  "repair.field.single.label": "Descripción del objeto",

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

// Vocabulario por rubro (especialista, ejemplos y ícono). Se mezcla dentro de
// VERTICAL_LABEL_DEFAULTS, así el negocio puede seguir sobreescribiendo
// cualquiera de estas keys desde TenantLabel.
const VOCABULARIO_RUBRO: Record<string, { esp: [string, string]; producto: string; icono: string; cita?: string; parte?: [string, string]; clin?: { paciente?: string; alergia: string; plan: string; item: string; receta: string }; rep?: { falla?: string; desbloqueo?: boolean; unico?: boolean; ejMarca?: string; ejModelo?: string } }> = {
  reparacion_celulares: { esp: ["Técnico", "Técnicos"], producto: "Pantalla iPhone 13", icono: "Smartphone", rep: { ejMarca: "Samsung, Apple, Huawei o Motorola", ejModelo: '"A16", "iPhone 8" o "Nova 2"', desbloqueo: true } },
  taller_autos: { esp: ["Mecánico", "Mecánicos"], producto: "Balatas delanteras", icono: "Car", rep: { ejMarca: "Nissan, Chevrolet, Ford o Volkswagen", ejModelo: '"Versa 2018" o "Aveo 2015"', falla: "Falla o servicio solicitado" } },
  taller_motos: { esp: ["Mecánico", "Mecánicos"], producto: "Kit de arrastre", icono: "Bike", rep: { ejMarca: "Italika, Honda, Yamaha o Suzuki", ejModelo: '"FT150" o "CBR 250"', falla: "Falla o servicio solicitado" } },
  electrodomesticos: { esp: ["Técnico", "Técnicos"], producto: "Motor de lavadora", icono: "WashingMachine", rep: { ejMarca: "Mabe, LG, Samsung o Whirlpool", ejModelo: '"lavadora de 18 kg" o "refrigerador de 14 pies"' } },
  computadoras: { esp: ["Técnico", "Técnicos"], producto: "Disco SSD 480 GB", icono: "Laptop", rep: { ejMarca: "HP, Dell, Lenovo o Apple", ejModelo: '"Pavilion 15" o "MacBook Air M1"', desbloqueo: true } },
  relojeria_joyeria: { esp: ["Especialista", "Especialistas"], producto: "Pila para reloj", icono: "Watch", rep: { unico: true } },
  zapateria: { esp: ["Zapatero", "Zapateros"], producto: "Suela de goma", icono: "Footprints", rep: { unico: true, falla: "Daño o trabajo solicitado" } },
  refrigeracion_ac: { esp: ["Técnico", "Técnicos"], producto: "Compresor de 1/4 HP", icono: "Snowflake", rep: { ejMarca: "Mirage, LG, Carrier o York", ejModelo: '"minisplit de 1 tonelada"' } },
  bicicletas: { esp: ["Mecánico", "Mecánicos"], producto: "Cámara rodada 26", icono: "Bike", rep: { ejMarca: "Trek, Specialized, Giant o Benotto", ejModelo: '"Marlin 5" o "rodada 29"', falla: "Falla o servicio solicitado" } },
  cerrajeria: { esp: ["Cerrajero", "Cerrajeros"], producto: "Chapa de seguridad", icono: "Key", rep: { unico: true, falla: "Servicio solicitado" } },
  tapiceria: { esp: ["Tapicero", "Tapiceros"], producto: "Vinil por metro", icono: "Sofa", rep: { unico: true, falla: "Trabajo solicitado" } },
  barberia: { esp: ["Barbero", "Barberos"], producto: "Cera para peinar", icono: "Scissors", cita: "Corte de cabello", parte: ["Insumo", "Insumos"] },
  consultorio_dental: { esp: ["Dentista", "Dentistas"], producto: "Cepillo dental", icono: "Stethoscope", cita: "Limpieza dental", parte: ["Insumo", "Insumos"], clin: { alergia: "Penicilina", plan: "Rehabilitación oral, Plan de ortodoncia", item: "Corona diente 16", receta: "Amoxicilina 500mg, 1 cápsula cada 8 horas por 7 días" } },
  consultorio_medico: { esp: ["Médico", "Médicos"], producto: "Termómetro digital", icono: "Stethoscope", cita: "Consulta general", parte: ["Insumo", "Insumos"], clin: { alergia: "Penicilina", plan: "Control de diabetes, Plan de rehabilitación", item: "Electrocardiograma", receta: "Paracetamol 500mg, 1 tableta cada 8 horas por 3 días" } },
  veterinaria: { esp: ["Veterinario", "Veterinarios"], producto: "Alimento para perro 20 kg", icono: "PawPrint", cita: "Vacuna", parte: ["Insumo", "Insumos"], clin: { paciente: "dueño", alergia: "Pollo", plan: "Plan de vacunación, Plan de esterilización", item: "Esterilización", receta: "Antibiótico 5 ml cada 12 horas por 7 días" } },
  estetica: { esp: ["Esteticista", "Esteticistas"], producto: "Shampoo profesional", icono: "Sparkles", cita: "Limpieza facial", parte: ["Insumo", "Insumos"] },
  spa: { esp: ["Terapeuta", "Terapeutas"], producto: "Aceite para masaje", icono: "Flower2", cita: "Masaje relajante", parte: ["Insumo", "Insumos"] },
  gimnasio: { esp: ["Entrenador", "Entrenadores"], producto: "Proteína 2 lb", icono: "Dumbbell", cita: "Clase de prueba", parte: ["Insumo", "Insumos"] },
  tatuajes: { esp: ["Tatuador", "Tatuadores"], producto: "Tinta negra", icono: "PenTool", cita: "Sesión de tatuaje", parte: ["Insumo", "Insumos"] },
  comercio_retail: { esp: ["Vendedor", "Vendedores"], producto: "Playera talla M", icono: "ShoppingBag", parte: ["Material", "Materiales"] },
};
for (const [rubro, v] of Object.entries(VOCABULARIO_RUBRO)) {
  VERTICAL_LABEL_DEFAULTS[rubro] = {
    ...VERTICAL_LABEL_DEFAULTS[rubro],
    "vocab.especialista.singular": v.esp[0],
    "vocab.especialista.plural": v.esp[1],
    "example.catalog.product": v.producto,
    "icon.catalog.product": v.icono,
    ...(v.cita ? { "example.appointment.reason": v.cita } : {}),
    ...(v.clin ? {
      "vocab.paciente": v.clin.paciente ?? "paciente",
      "example.clinical.allergy": v.clin.alergia,
      "example.clinical.plan": v.clin.plan,
      "example.clinical.plan.item": v.clin.item,
      "example.clinical.prescription": v.clin.receta,
    } : {}),
    ...(v.parte ? { "catalog.part.singular": v.parte[0], "catalog.part.plural": v.parte[1] } : {}),
    ...(v.rep?.falla ? { "repair.field.fault": v.rep.falla } : {}),
    ...(v.rep?.desbloqueo ? { "repair.field.unlock.enabled": "1" } : {}),
    ...(v.rep?.unico ? { "repair.field.single": "1" } : {}),
    ...(v.rep?.ejMarca ? { "example.repair.brand": v.rep.ejMarca } : {}),
    ...(v.rep?.ejModelo ? { "example.repair.model": v.rep.ejModelo } : {}),
  };
}

// Textos NEUTROS para el negocio que no encaja en ningún rubro ("Otro / Sin
// especificar", businessType null) — 2026-10-09, a petición de Carlos. El
// default genérico del sistema habla de reparaciones; sin rubro conviene no
// asumir ningún giro. El negocio puede ajustar lo que quiera en Configuración →
// "Vocabulario de tu negocio".
export const ETIQUETAS_NEUTRAS: LabelDictionary = {
  "module.repair.name": "Servicios",
  "module.workshop.name": "Mis Servicios",
  "module.reception.name": "Control de Servicios",
  "entity.repair.singular": "Servicio",
  "entity.repair.plural": "Servicios",
  "entity.repair.asset": "Artículo",
  "repair.status.DIAGNOSING": "En revisión",
  "repair.status.WAITING_PARTS": "En espera de material",
  "repair.status.IN_REPAIR": "En proceso",
  "repair.status.WORKSHOP_READY": "Listo en el área de trabajo",
  "repair.status.WORKSHOP_RETURN": "Regresó al área de trabajo",
  "vocab.especialista.singular": "Especialista",
  "vocab.especialista.plural": "Especialistas",
  "example.catalog.product": "Nombre del producto",
  "icon.catalog.product": "Package",
  "catalog.part.singular": "Material",
  "catalog.part.plural": "Materiales",
  "example.appointment.reason": "Revisión general",
  "vocab.lugar": "área de trabajo",
  "repair.field.fault": "Trabajo solicitado",
  "repair.field.single": "1",
};

/** Textos propios del rubro; sin rubro (o desconocido) se usan los neutros. */
export function etiquetasDelRubro(businessType: string | null | undefined): LabelDictionary {
  return (businessType && VERTICAL_LABEL_DEFAULTS[businessType]) || ETIQUETAS_NEUTRAS;
}

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

/**
 * Nombre que se MUESTRA de un rol. El rol base "Técnico" sigue llamándose así
 * por dentro (el código y los permisos lo buscan por ese nombre), pero cada
 * rubro lo ve con su propio vocabulario: Mecánico, Barbero, Dentista…
 */
export function nombreRolVisible(nombre: string | null | undefined, labels: LabelDictionary): string {
  if (!nombre) return "";
  return nombre === "Técnico" ? label(labels, "vocab.especialista.singular") : nombre;
}

/** "Encargado de mecánicos", "Encargado de barberos"… según el rubro. */
export function etiquetaEncargado(labels: LabelDictionary): string {
  return `Encargado de ${label(labels, "vocab.especialista.plural").toLowerCase()}`;
}

// ── Vocabulario que cada negocio puede personalizar ("Otro / Especificar") ──
// 2026-10-09, a petición de Carlos: el vocabulario por rubro nunca debe limitar
// — cada negocio puede escribir su propio término. Se guarda como override en
// TenantLabel (ver setTenantLabel en lib/labels-server.ts) y gana sobre el
// default del rubro. Agregar aquí una key nueva la hace aparecer sola en
// Configuración → "Vocabulario de tu negocio".
export const ICONOS_CATALOGO: { value: string; label: string }[] = [
  { value: "Package", label: "Caja (genérico)" },
  { value: "Smartphone", label: "Celular" },
  { value: "Car", label: "Auto" },
  { value: "Bike", label: "Bicicleta o moto" },
  { value: "WashingMachine", label: "Electrodoméstico" },
  { value: "Laptop", label: "Computadora" },
  { value: "Watch", label: "Reloj" },
  { value: "Footprints", label: "Calzado" },
  { value: "Snowflake", label: "Refrigeración" },
  { value: "Key", label: "Llave o cerradura" },
  { value: "Sofa", label: "Mueble" },
  { value: "Scissors", label: "Tijeras" },
  { value: "Stethoscope", label: "Salud" },
  { value: "PawPrint", label: "Mascota" },
  { value: "Sparkles", label: "Belleza" },
  { value: "Flower2", label: "Spa" },
  { value: "Dumbbell", label: "Gimnasio" },
  { value: "PenTool", label: "Tatuaje o diseño" },
  { value: "ShoppingBag", label: "Tienda" },
];

export type CampoVocabulario = {
  key: string;
  titulo: string;
  ayuda: string;
  tipo: "texto" | "icono" | "opciones";
  max: number;
  // Solo para tipo "opciones": valores permitidos y su texto.
  opciones?: { value: string; label: string }[];
  // "reparaciones": solo se muestra si el negocio usa recepción de trabajos.
  grupo?: "general" | "reparaciones" | "clinico";
};

export const VOCABULARIO_PERSONALIZABLE: CampoVocabulario[] = [
  { key: "vocab.especialista.singular", titulo: "Quien presta el servicio o repara (singular)", ayuda: "Ej. Técnico, Barbero, Mecánico. Es el nombre que verán el personal y el menú.", tipo: "texto", max: 30 },
  { key: "vocab.especialista.plural", titulo: "Quien presta el servicio o repara (plural)", ayuda: "Ej. Técnicos, Barberos, Mecánicos. Se usa en \"Encargado de …\".", tipo: "texto", max: 30 },
  { key: "example.catalog.product", titulo: "Ejemplo de producto en el Catálogo", ayuda: "Solo es el texto de ejemplo al crear un producto.", tipo: "texto", max: 60 },
  { key: "icon.catalog.product", titulo: "Ícono de Productos en el Catálogo", ayuda: "Elige el que más se parezca a lo que vendes.", tipo: "icono", max: 30 },
  { key: "catalog.part.singular", titulo: "Nombre del tipo de catálogo \"Refacción\" (singular)", ayuda: "Ej. Refacción, Insumo, Material. Es el segundo tipo de producto del Catálogo.", tipo: "texto", max: 30 },
  { key: "catalog.part.plural", titulo: "Nombre del tipo de catálogo \"Refacción\" (plural)", ayuda: "Ej. Refacciones, Insumos, Materiales. Se ve en las pestañas del Catálogo y en Inventario.", tipo: "texto", max: 30 },
  { key: "vocab.paciente", titulo: "Cómo llamas a quien recibe la atención y firma", ayuda: "Ej. paciente, dueño. Escríbelo en minúsculas y en masculino singular: se usa como \"el paciente\" o \"del paciente\".", tipo: "texto", max: 30, grupo: "clinico" },
  { key: "example.clinical.allergy", titulo: "Ejemplo de alergia en el expediente", ayuda: "Solo es el texto de ejemplo.", tipo: "texto", max: 60, grupo: "clinico" },
  { key: "example.clinical.plan", titulo: "Ejemplo de plan de tratamiento", ayuda: "Solo es el texto de ejemplo al crear un plan.", tipo: "texto", max: 80, grupo: "clinico" },
  { key: "example.clinical.plan.item", titulo: "Ejemplo de una fase del plan", ayuda: "Solo es el texto de ejemplo.", tipo: "texto", max: 60, grupo: "clinico" },
  { key: "example.clinical.prescription", titulo: "Ejemplo de receta", ayuda: "Solo es el texto de ejemplo al crear una receta.", tipo: "texto", max: 100, grupo: "clinico" },
  { key: "example.appointment.reason", titulo: "Ejemplo de motivo de una cita", ayuda: "Solo es el texto de ejemplo al agendar una cita.", tipo: "texto", max: 60 },
  { key: "entity.repair.asset", titulo: "Lo que recibes del cliente", ayuda: "Ej. Dispositivo, Vehículo, Calzado, Artículo.", tipo: "texto", max: 40, grupo: "reparaciones" },
  { key: "vocab.lugar", titulo: "Dónde se hace el trabajo", ayuda: "Ej. taller, área de trabajo. Se escribe en minúsculas: \"del taller\".", tipo: "texto", max: 30, grupo: "reparaciones" },
  { key: "repair.field.single", titulo: "Datos del objeto al recibirlo", ayuda: "Elige si piden marca y modelo por separado o una sola descripción.", tipo: "opciones", max: 1, grupo: "reparaciones", opciones: [{ value: "0", label: "Dos campos (marca y modelo)" }, { value: "1", label: "Un solo campo de descripción" }] },
  { key: "repair.field.single.label", titulo: "Nombre del campo de descripción", ayuda: "Solo si usas un solo campo. Ej. Descripción del objeto.", tipo: "texto", max: 40, grupo: "reparaciones" },
  { key: "repair.field.brand", titulo: "Nombre del campo Marca", ayuda: "Solo si usas dos campos.", tipo: "texto", max: 30, grupo: "reparaciones" },
  { key: "repair.field.model", titulo: "Nombre del campo Modelo", ayuda: "Solo si usas dos campos.", tipo: "texto", max: 30, grupo: "reparaciones" },
  { key: "example.repair.brand", titulo: "Ejemplos de marcas (en tours y ayuda)", ayuda: "Solo es texto de ayuda. Ej. Samsung, Apple o Motorola. Déjalo vacío si no aplica.", tipo: "texto", max: 80, grupo: "reparaciones" },
  { key: "example.repair.model", titulo: "Ejemplos de modelos (en tours y ayuda)", ayuda: "Solo es texto de ayuda. Déjalo vacío si no aplica.", tipo: "texto", max: 80, grupo: "reparaciones" },
  { key: "repair.field.fault", titulo: "Nombre del campo de la falla", ayuda: "Ej. Falla reportada, Servicio solicitado, Trabajo solicitado.", tipo: "texto", max: 40, grupo: "reparaciones" },
  { key: "repair.field.unlock.enabled", titulo: "Pedir contraseña o patrón de desbloqueo", ayuda: "Útil para celulares y computadoras.", tipo: "opciones", max: 1, grupo: "reparaciones", opciones: [{ value: "0", label: "No" }, { value: "1", label: "Sí" }] },
  { key: "repair.field.unlock", titulo: "Nombre del campo de desbloqueo", ayuda: "Solo si lo pides.", tipo: "texto", max: 40, grupo: "reparaciones" },
];

/** Valor por defecto de una key para un rubro, sin personalizaciones del negocio. */
export function valorPorDefectoDeRubro(businessType: string | null | undefined, key: string): string {
  const base = { ...DEFAULT_LABELS, ...etiquetasDelRubro(businessType) };
  return base[key] ?? key;
}

/** Vocabulario de recepción de trabajos ya resuelto (con valores por omisión seguros). */
export function vocabReparacion(labels: LabelDictionary) {
  const g = (k: string) => labels[k] ?? DEFAULT_LABELS[k] ?? k;
  const esp = g("vocab.especialista.singular");
  const espPlural = g("vocab.especialista.plural");
  return {
    objeto: g("entity.repair.asset"),
    esp,
    espMin: esp.toLowerCase(),
    espPlural,
    espPluralMin: espPlural.toLowerCase(),
    lugar: g("vocab.lugar"),
    marca: g("repair.field.brand"),
    modelo: g("repair.field.model"),
    falla: g("repair.field.fault"),
    desbloqueo: g("repair.field.unlock"),
    usaDesbloqueo: g("repair.field.unlock.enabled") === "1",
    unaDescripcion: g("repair.field.single") === "1",
    etiquetaDescripcion: g("repair.field.single.label"),
  };
}
export type VocabReparacion = ReturnType<typeof vocabReparacion>;

/**
 * Texto de un botón de cambio de estatus. Los textos base llevan marcas
 * {lugar}, {entidad} y {espera} que se resuelven con el vocabulario del negocio.
 */
export function textoAccion(texto: string, labels: LabelDictionary): string {
  const v = vocabReparacion(labels);
  return texto
    .replace("{lugar}", v.lugar)
    .replace("{entidad}", label(labels, "entity.repair.singular").toLowerCase())
    .replace("{espera}", label(labels, "repair.status.WAITING_PARTS"));
}
