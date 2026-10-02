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
 * - /ayuda (Guía rápida, AyudaClient.tsx) usa `esencial` + `flujos`,
 *   filtrado a los módulos que el rol de la sesión tiene permitido (o
 *   todos, en modo administrador).
 * - /ayuda/manual (Manual de referencia, ManualAyudaClient.tsx) muestra
 *   `esencial` siempre visible + `avanzado`/`flujos` plegados debajo (clic
 *   para expandir), sin filtrar por rol — cualquiera que tenga acceso a
 *   Ayuda puede profundizar en cualquier módulo, lo use su rol o no.
 *
 * 2026-10-02 (misma tarde): Carlos revisó la primera versión (solo
 * `esencial`/`avanzado`) y señaló el hueco real — "te dice para qué es cada
 * menú... pero no te dice el cómo lo harás, que creo que es lo más
 * importante". `flujos` es la respuesta: pasos numerados, con el texto
 * LITERAL de cada botón/campo tal como aparece hoy en cada pantalla — se
 * verificaron contra el código real de cada Client Component (no se
 * inventó ningún botón). Si algún botón cambia de texto más adelante, este
 * archivo se vuelve el único lugar que hay que actualizar.
 */
export interface FlujoPasos {
  // Nombre corto de la tarea (ej. "Recibir un equipo nuevo").
  titulo: string;
  // Pasos en orden — cada uno ya listo para mostrarse como item de lista.
  pasos: string[];
  // Id del tour interactivo ("Muéstrame cómo", 2026-10-02 — ver lib/tours.ts)
  // para este flujo, si ya existe uno. Ausente = este flujo todavía solo
  // tiene los pasos en texto, sin tour (la primera versión solo cubre 3
  // flujos de validación, a petición explícita de Carlos). Cuando está
  // presente, AyudaClient.tsx/ManualAyudaClient.tsx muestran un botón extra
  // que navega a `/${tenantSlug}/${ruta}?tour=${tourId}` — ese Client
  // Component (ver lib/tours.ts) lo detecta y lanza el tour real.
  tourId?: string;
}

export interface ContenidoModuloAyuda {
  // Mismo labelKey que ya usa NAV_STRUCTURE (TenantShell.tsx) — resuelve el
  // nombre REAL de este módulo para este negocio/rubro vía
  // label(labels, labelKey), nunca un nombre fijo escrito aquí.
  labelKey: string;
  esencial: string;
  avanzado?: string;
  // Una o más tareas "cómo hacerlo" de este módulo — la primera es siempre
  // la tarea principal (la que haría alguien en su primer día).
  flujos: FlujoPasos[];
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
    flujos: [
      {
        titulo: "Cambiar el periodo o la sucursal que ves",
        pasos: [
          "Elige un atajo: \"Hoy\", \"Semana\", \"Mes\" o \"Año\".",
          "Para un rango a tu medida, cambia las dos fechas (inicio y fin) y presiona \"Aplicar\".",
          "Si tienes más de una sucursal, alterna entre \"Vista global\" y \"Por sucursal\" — con \"Por sucursal\" elige la tienda en el selector que aparece.",
        ],
      },
    ],
  },
  pos: {
    labelKey: "module.pos.name",
    esencial: "Aquí registras una venta: agrega productos o servicios, elige el método de pago y cobra.",
    avanzado: "Necesitas una sesión de Caja abierta en tu sucursal para poder cobrar — si no la has abierto, el botón \"Cobrar\" se bloquea con el aviso \"La caja de esta sucursal está cerrada\" y un enlace para abrirla.",
    flujos: [
      {
        titulo: "Registrar una venta",
        tourId: "pos-registrar-venta",
        pasos: [
          "Agrega productos dando clic en su tarjeta del catálogo, o usa \"Escanear código de barras\".",
          "Opcional: en el carrito, ajusta la cantidad de cualquier producto con los botones \"+\"/\"−\" junto a su renglón.",
          "Opcional: presiona \"Agregar cliente\" y búscalo, si quieres ligar la venta a su ficha.",
          "Elige el método de pago: \"Efectivo\", \"Tarjeta\", \"Transferencia\" o \"Mixto\".",
          "Si es Efectivo, captura el \"Monto recibido\" (o usa el botón \"Exacto\"); si es Mixto, desglosa cuánto va en cada método.",
          "Presiona el botón \"Cobrar $total\" para cerrar la venta.",
        ],
      },
      {
        titulo: "Cobrar una reparación lista o una devolución",
        pasos: [
          "Llega aquí desde Reparaciones con el botón \"Entregar\" — el carrito ya viene precargado con el costo cotizado.",
          "Confirma el método de pago y presiona \"Cobrar\", igual que en una venta normal.",
        ],
      },
    ],
  },
  reparaciones: {
    labelKey: "module.repair.name",
    esencial: `Aquí recibes un equipo nuevo con su folio, y cobras/entregas cuando ya esté marcado como listo.`,
    avanzado: `No puedes cambiar el estatus, asignar técnico ni ajustar el costo desde aquí — eso se hace exclusivamente en "Taller", el panel de recepción central.`,
    flujos: [
      {
        titulo: "Recibir un equipo nuevo",
        tourId: "reparaciones-recibir-equipo",
        pasos: [
          "Presiona \"Nueva\" arriba de la lista.",
          "Busca al cliente por nombre; si no existe, presiona \"+ Registrar cliente nuevo\" y captura su Nombre y Teléfono (y elige la sucursal, si tienes más de una).",
          "Captura la Marca — el fabricante del equipo (ej. Samsung, Apple, Huawei, Motorola).",
          "Captura el Modelo — el modelo específico de esa marca (ej. \"A16\", \"iPhone 8\", \"Nova 2\"); lo encuentras en la caja del equipo, en los Ajustes del equipo, o te lo dice el cliente.",
          "Describe la Falla reportada: lo que el cliente dice que le pasa al equipo, o lo que tú notaste al revisarlo y diagnosticarlo.",
          "Si el equipo tiene bloqueo, captura la Contraseña de desbloqueo (opcional) — es solo para que el técnico pueda hacer pruebas, nunca se muestra al cliente.",
          "Agrega al menos una pieza y/o un servicio cotizado — indica qué se le cotizó al cliente (refacción, mano de obra, o ambos); es lo que verá en su ticket, y el sistema no deja crear el folio sin esto.",
          "Elige la Prioridad — qué tan urgente es que el equipo quede listo, normalmente te lo indica el propio cliente.",
          "Captura la Fecha estimada de entrega (opcional) — la defines tú según la carga de taller, o la que acordaste con el cliente.",
          "Presiona \"Crear\" — el folio lo genera el sistema, no se captura a mano.",
        ],
      },
      {
        titulo: "Entregar un equipo ya listo",
        pasos: [
          "Abre el folio y presiona \"Entregar\".",
          "Si está \"Listo\", te manda a Punto de Venta a cobrar el costo cotizado.",
          "Si es una devolución, solo te pide cobrar cuando tu negocio tiene activo \"Cobrar en devolución\" en Configuración — si no, se entrega directo con ticket en $0.00.",
        ],
      },
    ],
  },
  taller: {
    labelKey: "module.workshop.name",
    esencial: "Esta es tu vista de técnico, de solo lectura: ves los equipos asignados a ti (o a todo el equipo, si tu rol es \"Jefe de técnicos\") para dar seguimiento a tu carga de trabajo.",
    avanzado: `Aquí NO puedes cambiar el estatus, asignar técnico ni editar piezas/costo — eso es exclusivo de "Taller" (el módulo de recepción central). Lo único que puedes hacer es avisarle a recepción.`,
    flujos: [
      {
        titulo: "Avisar algo a Recepción/Tienda",
        pasos: [
          "Abre el folio de la lista.",
          "Escribe tu mensaje en el cuadro \"Enviar alerta a Recepción / Tienda\".",
          "Opcional: activa la casilla para que el cliente también vea ese mensaje en su página de seguimiento.",
          "Presiona \"Enviar alerta\".",
        ],
      },
    ],
  },
  aduana: {
    labelKey: "module.reception.name",
    esencial: "Este es el panel central de recepción del taller: aquí asignas técnico, avanzas el estatus del equipo y ajustas costo/piezas cotizadas.",
    avanzado: "El panel lateral \"Resumen de taller\" te muestra KPIs operativos, la distribución de estatus (con selector de periodo propio) y un ranking de técnicos.",
    flujos: [
      {
        titulo: "Asignar técnico y avanzar un folio",
        tourId: "aduana-asignar-tecnico",
        pasos: [
          "Abre el folio de la lista.",
          "En \"Técnico asignado\", elige al técnico del selector — se guarda solo con elegirlo, sin botón aparte.",
          "Si el costo cambió tras el diagnóstico, corrígelo en \"Costo estimado / pieza cotizada\" — queda registrado en el Historial con fecha y hora.",
          "Agrega piezas y/o servicios cotizados con el selector y el botón \"+\" (o \"Otro\" para un nombre/precio libre).",
          "En \"Cambiar estatus\", presiona el botón con el siguiente estatus (ej. \"Listo\") para avanzarlo.",
        ],
      },
      {
        titulo: "Cobrar y entregar un equipo listo",
        pasos: [
          "Si el equipo ya está \"Listo\" y tu rol también tiene acceso a Punto de Venta, usa el atajo \"Cobrar y entregar\" que aparece en el folio.",
        ],
      },
    ],
  },
  citas: {
    labelKey: "module.appointments.name",
    esencial: "Aquí agendas y llevas el control de las citas de tus clientes.",
    avanzado: "El personal de PIN solo ve y agenda citas de su propia sucursal, salvo que su rol tenga permiso de ver todo el negocio.",
    flujos: [
      {
        titulo: "Agendar una cita",
        pasos: [
          "Presiona \"Nueva cita\".",
          "Elige el cliente del selector, o presiona \"+ Cliente nuevo\" y captura su Nombre (obligatorio) y, si quieres, Teléfono.",
          "Si tienes más de una sucursal, elígela.",
          "En \"Atiende\", elige quién va a atender la cita.",
          "Describe el Motivo (ej. \"Limpieza dental\").",
          "Captura la Fecha y hora.",
          "Opcional: ajusta la Duración (15, 30, 45, 60, 90 o 120 minutos — 30 por defecto) y agrega Notas.",
          "Presiona \"Guardar\".",
        ],
      },
      {
        titulo: "Dar seguimiento a una cita",
        pasos: [
          "Desde la lista, usa los íconos rápidos (los que aparecen dependen del estatus actual de la cita): \"Confirmar\", \"Iniciar atención\", \"Completar\", \"No se presentó\", \"Editar\" o \"Cancelar\".",
        ],
      },
    ],
  },
  "expediente-clinico": {
    labelKey: "module.clinicalRecord.name",
    esencial: "Historial y notas clínicas del paciente: diagnósticos, tratamientos, consentimientos y recetas.",
    avanzado: "Solo lo tienen permitido roles que de verdad atienden pacientes (ej. un dentista/doctor con PIN) — no quien solo cobra, por la sensibilidad de este tipo de datos.",
    flujos: [
      {
        titulo: "Marcar el odontograma",
        pasos: [
          "Entra a la ficha del cliente y abre su expediente.",
          "Da clic en un diente.",
          "Elige su condición en los botones agrupados por categoría (General, Patologías, Restauraciones, Endodoncia).",
          "Opcional: agrega una nota de ese diente.",
          "Presiona \"Guardar\".",
        ],
      },
      {
        titulo: "Agregar una nota de evolución",
        pasos: [
          "Presiona \"Nueva nota\".",
          "Captura el Motivo de la consulta (obligatorio).",
          "Opcional: agrega Diagnóstico, Tratamiento y Notas.",
          "Presiona \"Guardar\".",
        ],
      },
      {
        titulo: "Armar un plan de tratamiento",
        pasos: [
          "Presiona \"Nuevo plan\".",
          "Captura el Título del plan (obligatorio, ej. \"Rehabilitación oral\").",
          "Si tienes más de una sucursal, elige la Sucursal y el Doctor responsable.",
          "Agrega cada fase con \"+ Agregar fase\": la Descripción y el Costo son obligatorios por fase (el Diente es opcional).",
          "Opcional: agrega Notas.",
          "Presiona \"Guardar plan\".",
        ],
      },
    ],
  },
  clientes: {
    labelKey: "module.customers.name",
    esencial: "La ficha de cada cliente: datos de contacto e historial con tu negocio.",
    avanzado: "Desde aquí también accedes al expediente clínico del cliente, si tu negocio usa ese módulo.",
    flujos: [
      {
        titulo: "Dar de alta un cliente",
        pasos: [
          "Presiona \"Agregar cliente\".",
          "Captura el Nombre completo (obligatorio) y, si quieres, Teléfono, Correo, RFC y Dirección.",
          "Marca \"Es cliente mayorista\" si aplica.",
          "Presiona \"Guardar\".",
        ],
      },
    ],
  },
  catalogo: {
    labelKey: "module.catalog.name",
    esencial: "Aquí das de alta tus productos y servicios, con su precio — es lo primero que necesitas antes de poder vender nada en Punto de Venta.",
    avanzado: "El costo y margen de cada artículo solo se muestran a quien tiene permiso de ver montos de caja — el resto del personal solo ve el precio de venta.",
    flujos: [
      {
        titulo: "Dar de alta un producto o servicio",
        pasos: [
          "Presiona \"Nuevo\".",
          "Elige el Tipo: Productos, Refacciones o Servicios — determina qué categorías puedes elegir, y si es Servicio no se captura Existencia inicial.",
          "Captura el Nombre y el Precio público (obligatorios).",
          "Opcional: SKU, ícono, Precio mayoreo, Costo (si tu rol ve montos), Existencia inicial (si no es Servicio) y Categoría.",
          "Presiona \"Crear producto\".",
        ],
      },
      {
        titulo: "Archivar o eliminar un producto",
        pasos: [
          "Ábrelo para editar.",
          "Usa \"Archivar producto\" (se puede restaurar después) o, si nunca se ha usado en una venta/compra/reparación, \"Eliminar definitivamente\" — y confirma.",
        ],
      },
    ],
  },
  inventario: {
    labelKey: "module.inventory.name",
    esencial: "Las existencias/stock de tus productos, por sucursal.",
    avanzado: "El aviso de \"stock bajo\" compara el stock actual de cada producto contra su columna \"Stock mínimo\", por sucursal.",
    flujos: [
      {
        titulo: "Ajustar el stock de un producto",
        pasos: [
          "Presiona \"Ajustar\" (o \"Surtir\" si aparece en bajo/agotado) junto al producto.",
          "Si tienes más de una sucursal, elígela.",
          "Elige el tipo de movimiento: \"Entrada\" (llegó mercancía fuera de una compra, ej. una devolución), \"Salida\" (se dio de baja, ej. dañado o extraviado) o \"Ajuste\" (corrige el stock a un número exacto tras un conteo físico).",
          "Captura la Cantidad (o el \"Nuevo stock total\" si elegiste Ajuste).",
          "Presiona \"Guardar\".",
        ],
      },
    ],
  },
  compras: {
    labelKey: "module.purchases.name",
    esencial: "Aquí registras cuando te llega mercancía de un proveedor, para que se sume a tu inventario.",
    avanzado: "Cada compra queda ligada a la sucursal que la recibió.",
    flujos: [
      {
        titulo: "Registrar una orden de compra",
        pasos: [
          "Presiona \"Nueva\".",
          "Elige la Sucursal que recibe la mercancía.",
          "Elige el Proveedor, o presiona \"+ Nuevo proveedor\" y captura su Nombre (obligatorio) y, si quieres, Teléfono y Email.",
          "Agrega cada renglón: elige el Producto, su Cantidad y su Costo (se prellena con el costo del catálogo, pero puedes ajustarlo) — usa \"+ Agregar producto\" para más renglones.",
          "Opcional: agrega Notas.",
          "Presiona \"Crear orden de compra\".",
        ],
      },
      {
        titulo: "Confirmar que ya llegó la mercancía",
        pasos: [
          "Abre la orden mientras esté \"Pendiente\".",
          "Presiona \"Marcar recibida\" — esto es lo que de verdad suma el stock a tu Inventario.",
        ],
      },
    ],
  },
  caja: {
    labelKey: "module.cash.name",
    esencial: "Abrir y cerrar tu sesión de caja del día — es obligatorio abrirla antes de poder cobrar cualquier venta.",
    avanzado: "Al cerrar, el sistema hace el corte y compara el efectivo esperado contra lo que de verdad contaste, por método de pago.",
    flujos: [
      {
        titulo: "Abrir caja al iniciar tu turno",
        pasos: [
          "Captura el \"Fondo inicial\" (o \"Monto de apertura\", si eres supervisor).",
          "Presiona \"Guardar y continuar\" (o \"Abrir caja\").",
        ],
      },
      {
        titulo: "Cerrar caja al terminar tu turno (el corte)",
        pasos: [
          "Presiona \"Cerrar caja\".",
          "Cuenta tu efectivo real y captúralo en \"Efectivo contado\" (agrega una nota si algo no cuadra).",
          "Presiona \"Cerrar caja\" para confirmar — si tu rol ve montos, también verás la diferencia contra lo esperado.",
        ],
      },
    ],
  },
  personal: {
    labelKey: "module.staff.name",
    esencial: "Aquí das de alta a tus empleados y les asignas un PIN y un rol — sin esto, nadie más que tú puede entrar al sistema.",
    avanzado: "Los roles controlan módulo por módulo qué puede ver y hacer cada quien. Puedes usar los roles base (Gerente/Cajero/Técnico) o crear los tuyos propios, módulo por módulo.",
    flujos: [
      {
        titulo: "Dar de alta un empleado",
        pasos: [
          "Presiona \"Nuevo empleado\".",
          "Captura Nombre, Puesto, País y Teléfono.",
          "Si tienes más de una sucursal, elígela.",
          "Elige el Rol — determina a qué módulos tendrá acceso y qué podrá hacer en cada uno.",
          "Asígnale su PIN de inicio (6 dígitos exactos) — con eso entrará al sistema.",
          "Elige el Esquema de pago: \"Sueldo fijo\", \"Comisión (% del precio)\", \"Fijo + comisión\" o \"Destajo ($ fijo por unidad, no %)\".",
          "Si elegiste Comisión, Fijo + comisión o Destajo, captura el porcentaje o monto por unidad, sobre qué se calcula (Ventas, Reparaciones o Utilidad) y con qué frecuencia se paga.",
          "Elige el Método de pago (Efectivo, Transferencia, Cheque, Tarjeta de nómina u Otro) — si es Transferencia, captura su CLABE (18 dígitos exactos).",
          "Opcional: si \"Lidera un equipo\", activa la casilla y captura el porcentaje de comisión de equipo.",
          "Presiona \"Guardar\".",
        ],
      },
      {
        titulo: "Crear un rol personalizado",
        pasos: [
          "Presiona \"Roles y permisos\" y luego \"Crear rol personalizado\".",
          "Dale un nombre (ej. \"Barbero\") y marca las casillas de los módulos que podrá usar.",
          "Presiona \"Crear rol\".",
        ],
      },
    ],
  },
  sucursales: {
    labelKey: "module.branches.name",
    esencial: "Administra tus tiendas/ubicaciones — si tienes más de una, aquí las das de alta.",
    avanzado: "Varios módulos (Caja, Inventario, Reportes) se acotan por sucursal para el personal de PIN, salvo que su rol tenga permiso de ver todo el negocio.",
    flujos: [
      {
        titulo: "Dar de alta una sucursal",
        pasos: [
          "Presiona \"Nueva sucursal\".",
          "Captura el Nombre (obligatorio) y, si quieres, Código, Dirección y Teléfono.",
          "Opcional: define el horario esperado de apertura/cierre de caja y los Días que opera — si lo defines, te llega un aviso si la sucursal no reporta apertura o cierre a esa hora (con 15 minutos de margen).",
          "Presiona \"Crear sucursal\".",
        ],
      },
    ],
  },
  reportes: {
    labelKey: "module.reports.name",
    esencial: "Métricas y análisis más a fondo que el Dashboard: ventas, reparaciones, por sucursal.",
    avanzado: "Los montos de dinero solo se muestran a quien tiene permiso de verlos — el resto ve los mismos reportes con las cifras ocultas, no en ceros ni tachadas.",
    flujos: [
      {
        titulo: "Cómo leer esta pantalla",
        pasos: [
          "Es de solo lectura — no tiene filtros propios; las tarjetas que ves cambian según el rubro de tu negocio y tu rol.",
          "Un empleado de PIN solo ve su propia sucursal, salvo que su rol tenga \"Ver todo el negocio\".",
        ],
      },
    ],
  },
  facturacion: {
    labelKey: "module.invoicing.name",
    esencial: "Aquí generas las facturas fiscales (CFDI) de tus ventas.",
    avanzado: "Necesitas tus datos fiscales completos y correctos en Configuración. El timbrado de Linkity hoy es una simulación (no hay un PAC/SAT real conectado todavía) — sirve para probar el flujo completo, pero no genera un CFDI con validez fiscal real. Exclusivo del administrador.",
    flujos: [
      {
        titulo: "Generar una factura de una venta",
        pasos: [
          "Presiona \"Nueva\".",
          "Elige la venta a facturar.",
          "Usa el cliente ya ligado a la venta, o presiona \"Facturar a otro receptor\" y captura Nombre o razón social (RFC y Teléfono son opcionales).",
          "Presiona \"Generar factura\" y después \"Timbrar ahora\" en el detalle.",
        ],
      },
    ],
  },
  soporte: {
    labelKey: "module.support.name",
    esencial: "Si algo no lo resuelves con este manual, aquí abres un ticket con nosotros.",
    avanzado: "Puedes darle seguimiento y ver el historial de tus tickets anteriores, con su prioridad y estatus.",
    flujos: [
      {
        titulo: "Abrir un ticket",
        pasos: [
          "Presiona \"Nuevo ticket\" (o \"Abrir tu primer ticket\" si es el primero).",
          "Captura el Asunto.",
          "Elige la Prioridad: Baja, Normal, Alta o Urgente.",
          "Escribe tu Mensaje.",
          "Presiona \"Enviar ticket\".",
        ],
      },
    ],
  },
  configuracion: {
    labelKey: "module.configuration.name",
    esencial: "Aquí personalizas tu negocio: tema/colores, logo, datos fiscales, WhatsApp, y qué módulos usas.",
    avanzado: "El tipo de negocio que elijas aquí cambia los nombres y la disponibilidad de módulos en TODO el sistema — ver la Guía rápida antes de cambiarlo.",
    flujos: [
      {
        titulo: "Cambiar el tipo de negocio/rubro",
        pasos: [
          "Ve a la sección \"Giro del negocio\", elige tu Rubro y presiona \"Guardar cambios\".",
        ],
      },
      {
        titulo: "Subir tu logo",
        pasos: [
          "Ve a \"Logo de tu negocio\", elige el archivo (PNG/JPG/WEBP/SVG, máximo 2MB) y presiona \"Subir logo\".",
        ],
      },
      {
        titulo: "Capturar tus datos fiscales",
        pasos: [
          "Ve a \"Personalizar ticket\" y captura tu RFC, Dirección y mensaje de pie.",
          "Presiona \"Guardar cambios\".",
        ],
      },
      {
        titulo: "Activar o desactivar un módulo",
        pasos: [
          "Ve a \"Módulos de tu negocio\" y usa el interruptor de cada módulo — se aplica de inmediato, sin botón de guardar aparte.",
          "O presiona \"Aplicar recomendado para tu rubro\" para que el sistema apague en bloque lo que no suele usarse en tu giro.",
        ],
      },
    ],
  },
  asistencia: {
    labelKey: "module.attendance.name",
    esencial: "Registro de cuándo entró y salió cada empleado con su PIN.",
    avanzado: "Exclusivo del administrador. Una sesión de personal se cierra sola al cambiar de día calendario, aunque el empleado no haya marcado salida.",
    flujos: [
      {
        titulo: "Revisar el registro",
        pasos: [
          "Usa el buscador, el selector de sucursal y los atajos de periodo (Hoy/Semana/Mes/Todo) para filtrar.",
          "Si una sesión quedó sin salida registrada, presiona \"Cerrar ahora\" para cerrarla a mano.",
        ],
      },
    ],
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
