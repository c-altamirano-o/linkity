import type { ModuloKey } from "@/lib/roles";
import {
  LayoutDashboard, ShoppingCart, Wrench, Users, Package,
  Warehouse, DollarSign, UserCog, BarChart3, FileText,
  GitBranch, BookOpen, CalendarCheck, CalendarDays, Settings,
  LifeBuoy, Stethoscope,
} from "lucide-react";

/**
 * Contenido del manual de usuario ("Ayuda") — 2026-10-02, a petición de
 * Carlos: quiere un manual completo dentro de la propia app, pero sin
 * ahogar al principiante ni limitar al experto. Este archivo es la fuente
 * ÚNICA de la descripción de cada módulo, compartida por las dos pantallas:
 *
 * - /ayuda (Guía rápida, AyudaClient.tsx) usa solo `esencial`, filtrado a
 *   los módulos que el rol de la sesión tiene permitido (o todos, en modo
 *   administrador).
 * - /ayuda/manual (Manual de referencia, ManualAyudaClient.tsx) muestra
 *   `esencial` siempre visible + `avanzado` plegado debajo (clic para
 *   expandir), sin filtrar por rol — cualquiera que tenga acceso a Ayuda
 *   puede profundizar en cualquier módulo, lo use su rol o no.
 *
 * Primera versión (2026-10-02): contenido real pero breve — el "esqueleto"
 * que Carlos pidió ver funcionando antes de invertir en redactar cada
 * módulo a fondo (tarea pendiente, ver el task list de esta sesión).
 */
export interface ContenidoModuloAyuda {
  // Mismo labelKey que ya usa NAV_STRUCTURE (TenantShell.tsx) — resuelve el
  // nombre REAL de este módulo para este negocio/rubro vía
  // label(labels, labelKey), nunca un nombre fijo escrito aquí.
  labelKey: string;
  esencial: string;
  avanzado?: string;
}

// Único módulo de este diccionario cuyo NOMBRE varía por rubro (ver
// module.repair.name, lib/labels.ts — "Reparaciones" en una reparación de
// celulares, "Órdenes de Servicio" en un taller automotriz, etc.). "Taller"
// (aduana) y "Mis Reparaciones" (taller) no varían por rubro, así que ahí
// se escriben literales. AyudaClient.tsx/ManualAyudaClient.tsx reemplazan
// este token por label(labels, "module.repair.name") antes de mostrar el
// texto.
export const PLACEHOLDER_REPARACIONES = "{{reparaciones}}";

// Agrupación del Manual de referencia (/ayuda/manual) — mismo orden/criterio
// de secciones que NAV_STRUCTURE (TenantShell.tsx), con dos diferencias
// deliberadas: (1) "expediente-clinico" y "configuracion" no tienen ítem
// propio en NAV_STRUCTURE (el primero vive embebido en la ficha del
// cliente; el segundo es un acceso directo aparte, junto al logout), así
// que aquí sí se les da un lugar — el manual documenta TODO módulo real,
// tenga o no su propio renglón de menú; (2) "ayuda" no aparece (no es un
// ModuloKey, el manual no se documenta a sí mismo). Cubre los 19 ModuloKey
// exactamente una vez — si se agrega un ModuloKey nuevo a lib/roles.ts y no
// se agrega aquí, ManualAyudaClient.tsx simplemente no lo mostrará (no
// truena), así que conviene revisar este arreglo cuando eso pase.
export const AYUDA_SECCIONES: { titulo: string; modulos: ModuloKey[] }[] = [
  { titulo: "PRINCIPAL", modulos: ["dashboard", "pos", "citas", "reparaciones", "taller", "aduana", "expediente-clinico"] },
  { titulo: "GESTIÓN", modulos: ["clientes", "catalogo", "inventario", "compras"] },
  { titulo: "OPERACIÓN", modulos: ["caja", "personal", "asistencia", "sucursales"] },
  { titulo: "REPORTES", modulos: ["reportes", "facturacion"] },
  { titulo: "SOPORTE Y CONFIGURACIÓN", modulos: ["configuracion", "soporte"] },
];

export const AYUDA_MODULO: Record<ModuloKey, ContenidoModuloAyuda> = {
  dashboard: {
    labelKey: "module.dashboard.name",
    esencial: "Aquí ves de un vistazo cómo va tu negocio: ventas, tickets y reparaciones del periodo, comparados contra el periodo anterior.",
    avanzado: "El selector de periodo (Hoy/Semana/Mes/Año/Personalizado) y el de sucursal (si tienes más de una) cambian TODO el Dashboard a la vez — tarjetas, gráficas y tablas, no solo una parte.",
  },
  pos: {
    labelKey: "module.pos.name",
    esencial: "Aquí registras una venta: agrega productos o servicios, elige el método de pago y cobra.",
    avanzado: "Necesitas una sesión de Caja abierta en tu sucursal para poder cobrar — si no la has abierto, el sistema te va a pedir que lo hagas primero. También puedes cobrar una reparación ya lista desde aquí.",
  },
  reparaciones: {
    labelKey: "module.repair.name",
    esencial: `Aquí recibes un equipo nuevo con su folio, y cobras/entregas cuando ya esté marcado como listo.`,
    avanzado: `No puedes cambiar el estatus, asignar técnico ni ajustar el costo desde aquí — eso se hace exclusivamente en "Taller", el panel de recepción central.`,
  },
  taller: {
    labelKey: "module.workshop.name",
    esencial: "Esta es tu vista de técnico: solo los equipos que tienes asignados a ti, para que marques tu propio avance (Esperando refacción, Listo, etc.).",
    avanzado: `No puedes editar piezas, costo ni reasignar el folio a otro técnico — para eso hace falta el panel completo de "Taller".`,
  },
  aduana: {
    labelKey: "module.reception.name",
    esencial: "Este es el panel central de recepción del taller: aquí asignas técnico, avanzas el estatus del equipo y ajustas costo/piezas cotizadas.",
    avanzado: "El panel lateral \"Resumen de taller\" te muestra KPIs operativos, la distribución de estatus (con selector de periodo propio) y un ranking de técnicos.",
  },
  citas: {
    labelKey: "module.appointments.name",
    esencial: "Aquí agendas y llevas el control de las citas de tus clientes.",
    avanzado: "El personal de PIN solo ve y agenda citas de su propia sucursal, salvo que su rol tenga permiso de ver todo el negocio.",
  },
  "expediente-clinico": {
    labelKey: "module.clinicalRecord.name",
    esencial: "Historial y notas clínicas del paciente: diagnósticos, tratamientos, consentimientos y recetas.",
    avanzado: "Solo lo tienen permitido roles que de verdad atienden pacientes (ej. un dentista/doctor con PIN) — no quien solo cobra, por la sensibilidad de este tipo de datos.",
  },
  clientes: {
    labelKey: "module.customers.name",
    esencial: "La ficha de cada cliente: datos de contacto e historial con tu negocio.",
    avanzado: "Desde aquí también accedes al expediente clínico del cliente, si tu negocio usa ese módulo.",
  },
  catalogo: {
    labelKey: "module.catalog.name",
    esencial: "Aquí das de alta tus productos y servicios, con su precio — es lo primero que necesitas antes de poder vender nada en Punto de Venta.",
    avanzado: "El costo y margen de cada artículo solo se muestran a quien tiene permiso de ver montos de caja — el resto del personal solo ve el precio de venta.",
  },
  inventario: {
    labelKey: "module.inventory.name",
    esencial: "Las existencias/stock de tus productos, por sucursal.",
    avanzado: "Te avisa cuando un producto se agota o baja de su mínimo configurado — esas alertas también aparecen en el panel de Taller si aplica a una pieza de reparación.",
  },
  compras: {
    labelKey: "module.purchases.name",
    esencial: "Aquí registras cuando te llega mercancía de un proveedor, para que se sume a tu inventario.",
    avanzado: "Cada compra queda ligada a la sucursal que la recibió.",
  },
  caja: {
    labelKey: "module.cash.name",
    esencial: "Abrir y cerrar tu sesión de caja del día — es obligatorio abrirla antes de poder cobrar cualquier venta.",
    avanzado: "Al cerrar, el sistema hace el corte y compara el efectivo esperado contra lo que de verdad contaste, por método de pago.",
  },
  personal: {
    labelKey: "module.staff.name",
    esencial: "Aquí das de alta a tus empleados y les asignas un PIN y un rol — sin esto, nadie más que tú puede entrar al sistema.",
    avanzado: "Los roles controlan módulo por módulo qué puede ver y hacer cada quien. Puedes usar los roles base (Gerente/Cajero/Técnico) o crear los tuyos propios, módulo por módulo.",
  },
  sucursales: {
    labelKey: "module.branches.name",
    esencial: "Administra tus tiendas/ubicaciones — si tienes más de una, aquí las das de alta.",
    avanzado: "Varios módulos (Caja, Inventario, Reportes) se acotan por sucursal para el personal de PIN, salvo que su rol tenga permiso de ver todo el negocio.",
  },
  reportes: {
    labelKey: "module.reports.name",
    esencial: "Métricas y análisis más a fondo que el Dashboard: ventas, reparaciones, por sucursal.",
    avanzado: "Los montos de dinero solo se muestran a quien tiene permiso de verlos — el resto ve los mismos reportes con las cifras ocultas.",
  },
  facturacion: {
    labelKey: "module.invoicing.name",
    esencial: "Aquí generas las facturas fiscales (CFDI) de tus ventas.",
    avanzado: "Necesitas tus datos fiscales completos y correctos en Configuración — si están incompletos o mal capturados, el SAT rechaza la factura. Exclusivo del administrador.",
  },
  soporte: {
    labelKey: "module.support.name",
    esencial: "Si algo no lo resuelves con este manual, aquí abres un ticket con nosotros.",
    avanzado: "Puedes darle seguimiento y ver el historial de tus tickets anteriores, con su prioridad y estatus.",
  },
  configuracion: {
    labelKey: "module.configuration.name",
    esencial: "Aquí personalizas tu negocio: tema/colores, logo, datos fiscales, WhatsApp, y qué módulos usas.",
    avanzado: "El tipo de negocio que elijas aquí cambia los nombres y la disponibilidad de módulos en TODO el sistema — ver la Guía de inicio rápido antes de cambiarlo.",
  },
  asistencia: {
    labelKey: "module.attendance.name",
    esencial: "Registro de cuándo entró y salió cada empleado con su PIN.",
    avanzado: "Exclusivo del administrador. Una sesión de personal se cierra sola al cambiar de día calendario, aunque el empleado no haya marcado salida.",
  },
};

// Mismo set de íconos que NAV_STRUCTURE (TenantShell.tsx) — "expediente-clinico"
// y "configuracion" no tienen entrada ahí (ver el comentario junto a
// AYUDA_SECCIONES, arriba), así que se agregan aquí para que ningún módulo
// del manual se quede sin ícono. Un solo lugar, para que AyudaClient.tsx y
// ManualAyudaClient.tsx nunca puedan divergir.
export const MODULO_ICON: Record<ModuloKey, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  pos: ShoppingCart,
  reparaciones: Wrench,
  taller: Wrench,
  aduana: Wrench,
  citas: CalendarDays,
  "expediente-clinico": Stethoscope,
  clientes: Users,
  catalogo: BookOpen,
  inventario: Warehouse,
  compras: Package,
  caja: DollarSign,
  personal: UserCog,
  sucursales: GitBranch,
  reportes: BarChart3,
  facturacion: FileText,
  soporte: LifeBuoy,
  configuracion: Settings,
  asistencia: CalendarCheck,
};

// "expediente-clinico" no es una ruta propia — vive embebido dentro de la
// ficha de un cliente (clientes/[id]). El resto usa su propio ModuloKey
// como ruta, igual que NAV_STRUCTURE.
export const MODULO_RUTA: Partial<Record<ModuloKey, string>> = {
  "expediente-clinico": "clientes",
};
