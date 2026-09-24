/**
 * Roles sugeridos por rubro (Tenant.businessType), CON permisos reales —
 * 2026-09-21, a petición de Carlos.
 *
 * Historia: lib/puestos-rubro.ts ya sugería el VOCABULARIO de puestos por
 * rubro (ej. "Asistente dental" para un consultorio dental), pero era
 * puramente cosmético — solo alimentaba el <datalist> del campo "Puesto"
 * (texto libre) y los chips de "Sugeridos para tu rubro" en Roles y
 * permisos, que solo rellenaban el NOMBRE del rol nuevo; el admin tenía que
 * tildar las casillas de módulo a mano, una por una, para cada rol de cada
 * negocio. En la práctica eso significaba que todo negocio nuevo arrancaba
 * con los 3 roles genéricos "Gerente/Cajero/Técnico" (pensados para un
 * taller de celulares, ver MATRIZ_ACCESO_BASE en lib/roles.ts) sin importar
 * su rubro real, y el propio Carlos lo notó en el tenant demo de
 * consultorio dental: roles con el nombre correcto (Dentista, Higienista,
 * Asistente dental, Recepcionista) pero armados a mano y a medias, sin
 * "Citas" ni "Expediente Clínico" siquiera para la Dentista.
 *
 * Carlos fue tajante: "una empresa seria y profesional... no puede tener
 * sus roles a medias... debe tener puestos definidos, jerarquías y tareas
 * específicas. Y así igual con los demás rubros... no puede ser el mismo
 * rol para una barbería que para un consultorio dental". Este archivo es
 * la respuesta — un catálogo real de roles CON su matriz de acceso, uno
 * por cada uno de los 19 rubros de PUESTOS_SUGERIDOS_RUBRO (lib/
 * puestos-rubro.ts, mismos nombres exactos de rol a propósito, para que
 * "puesto sugerido" y "rol sugerido" sean la misma cosa desde el punto de
 * vista del admin). lib/roles-server.ts (asegurarRolesRubro) es quien
 * efectivamente CREA estos roles con sus permisos ya cargados — la primera
 * vez que alguien abre "Roles y permisos" de ese negocio, o desde el alta
 * misma (app/(auth)/register/actions.ts) — sin que el admin tenga que
 * tildar una sola casilla para tener un punto de partida profesional.
 *
 * Criterio de diseño para cada rubro (misma jerarquía en todos, adaptada al
 * vocabulario y a los módulos que de verdad le aplican a ese giro — ver
 * lib/modulos-rubro.ts para qué módulo está prendido/apagado por default):
 *   1. Un puesto "de mando" (Jefe/Encargado/Gerente del rubro, o el propio
 *      profesional dueño del oficio en consultorios donde no hay una
 *      jerarquía de sucursal separada — ej. Dentista, Médico, Veterinario)
 *      con acceso amplio: todo lo operativo del negocio, salvo lo que es
 *      100% exclusivo del administrador con cuenta real (Personal,
 *      Facturación, Configuración, Asistencia — ningún rol de PIN los
 *      tiene nunca, ver MODULOS_ASIGNABLES en RolesManager.tsx).
 *   2. Uno o más puestos "especialistas" (quien de verdad hace el
 *      servicio/reparación) con acceso angosto: su agenda/órdenes de
 *      trabajo, el expediente o ficha del cliente, y el catálogo de
 *      servicios — sin caja, compras, ni reportes del negocio completo. En
 *      los rubros de taller (reparación de celulares, autos, motos,
 *      electrodomésticos, relojería, zapatería, etc. — ver
 *      lib/modules-catalog.ts) esto es a propósito "taller" y NO
 *      "reparaciones": el especialista (técnico/mecánico/relojero/etc.) ve
 *      SOLO el folio que tiene asignado y puede alertar a Recepción/Aduana
 *      si necesita información o una cotización, pero YA NO puede agregar
 *      piezas, cambiar el costo ni avanzar el estatus él mismo (2026-09-22,
 *      corregido a petición de Carlos con el ejemplo hipotético "Fix
 *      Expres" — antes sí podía, y eso seguía sin resolver el hueco real:
 *      un técnico con edición de piezas/costo podía quitar una que sí
 *      reparó, cobrar completo por fuera y quedarse con la diferencia). Ver
 *      el comentario de "taller"/"aduana" en lib/roles.ts.
 *   2.b Un puesto de "Recepción/Aduana" (permiso "aduana") — SOLO en los
 *      rubros de taller, donde el trabajo técnico ocurre en una ubicación
 *      centralizada separada de cada punto de venta ("Fix Expres": 5
 *      tiendas + 1 taller central con recepción/aduana). Es quien asigna
 *      el técnico a cada equipo, cambia su estatus y ajusta costo/piezas —
 *      "eso no lo hacen desde tienda". Y, cuando el rubro lo amerita (más
 *      de un técnico), un "Jefe de técnicos" con el mismo módulo "taller"
 *      pero verTodoTaller:true — ve TODOS los folios del taller, sin poder
 *      editar nada ("ve todos los folios, pero sin editar").
 *   3. Un puesto de "Recepción"/"Encargado de sucursal" (cobra, agenda,
 *      recibe, da de alta el folio) con Punto de Venta + Caja + Clientes +
 *      Citas/Reparaciones — pero SIN Expediente Clínico (quien solo cobra
 *      no tiene por qué ver datos clínicos del paciente, NOM-004) y, para
 *      los rubros de taller, SIN control de costo/piezas/estatus/técnico
 *      (eso es del puesto de Recepción/Aduana del punto 2.b, no de tienda).
 *
 * Son solo el PUNTO DE PARTIDA — el admin sigue pudiendo editar, agregar o
 * quitar módulos de cualquiera de estos roles desde "Roles y permisos" en
 * cualquier momento; nada aquí es un candado.
 *
 * Igual que lib/puestos-rubro.ts, este archivo es universal (sin
 * "server-only", sin Prisma): solo texto y el vocabulario compartido de
 * ModuloKey, así que lib/roles-server.ts (server-only) lo puede importar
 * sin problema para crear los roles en la BD.
 */

import type { ModuloKey } from "@/lib/roles";

export interface RolSugeridoRubro {
  name: string;
  description: string;
  modulos: ModuloKey[];
  // Solo tiene efecto cuando modulos incluye "taller" — ver el comentario
  // largo junto a Role.verTodoTaller (schema.prisma). Usado por el puesto
  // "Jefe de técnicos"/"Jefe de taller" de los rubros de taller (2026-09-22,
  // a petición de Carlos, ejemplo "Fix Expres": "Ve todos los folios, pero
  // sin editar").
  verTodoTaller?: boolean;
  // Solo tiene efecto cuando modulos incluye "caja" — ver el comentario
  // largo junto a Role.verMontosCaja (schema.prisma). Usado por puestos de
  // nivel supervisor (ej. "Supervisor de Sucursales", "Encargado de
  // Tienda" del rubro reparación de celulares, 2026-09-24).
  verMontosCaja?: boolean;
  // Solo tiene efecto cuando el rol tiene módulos con datos por sucursal
  // (reportes/inventario/caja) — ver el comentario largo junto a
  // Role.verTodoNegocio (schema.prisma). Usado por "Supervisor de
  // Sucursales" (2026-09-24, rediseño de puestos de reparación de
  // celulares a petición de Carlos).
  verTodoNegocio?: boolean;
}

export const ROLES_SUGERIDOS_RUBRO: Record<string, RolSugeridoRubro[]> = {
  barberia: [
    { name: "Jefe de Barberos", description: "Lidera el equipo de barberos: agenda, clientes, catálogo de servicios, inventario, compras, caja y reportes de la sucursal.", modulos: ["pos", "citas", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Barbero", description: "Su propia agenda de citas, ficha de sus clientes y catálogo de servicios/precios.", modulos: ["citas", "clientes", "catalogo"] },
    { name: "Recepcionista", description: "Agenda citas, recibe clientes y cobra en Punto de Venta y Caja.", modulos: ["pos", "citas", "clientes", "caja"] },
    { name: "Estilista", description: "Su propia agenda de citas, ficha de sus clientes y catálogo de servicios/precios.", modulos: ["citas", "clientes", "catalogo"] },
  ],
  consultorio_dental: [
    { name: "Dentista", description: "Agenda clínica, expediente/historial del paciente, catálogo de tratamientos y sus propios reportes de producción.", modulos: ["citas", "expediente-clinico", "clientes", "catalogo", "reportes"] },
    { name: "Higienista", description: "Agenda clínica, expediente del paciente y catálogo de procedimientos de higiene/limpieza.", modulos: ["citas", "expediente-clinico", "clientes", "catalogo"] },
    { name: "Asistente dental", description: "Apoyo de silla (agenda y expediente clínico) y recepción del paciente: cobra en Punto de Venta y Caja.", modulos: ["citas", "expediente-clinico", "clientes", "pos", "caja"] },
    { name: "Recepcionista", description: "Agenda citas, recibe pacientes y cobra en Punto de Venta y Caja — sin expediente clínico (NOM-004: solo personal clínico lo ve).", modulos: ["pos", "citas", "clientes", "caja"] },
  ],
  consultorio_medico: [
    { name: "Médico", description: "Agenda clínica, expediente/historial del paciente, catálogo de consultas/procedimientos y sus propios reportes.", modulos: ["citas", "expediente-clinico", "clientes", "catalogo", "reportes"] },
    { name: "Enfermero(a)", description: "Agenda clínica, expediente del paciente y catálogo de procedimientos de enfermería.", modulos: ["citas", "expediente-clinico", "clientes", "catalogo"] },
    { name: "Asistente médico", description: "Apoyo clínico: agenda y expediente del paciente.", modulos: ["citas", "expediente-clinico", "clientes"] },
    { name: "Recepcionista", description: "Agenda citas, recibe pacientes y cobra en Punto de Venta y Caja — sin expediente clínico.", modulos: ["pos", "citas", "clientes", "caja"] },
  ],
  veterinaria: [
    { name: "Veterinario", description: "Agenda clínica, expediente del paciente (mascota), catálogo de servicios, inventario de medicamentos y sus propios reportes.", modulos: ["citas", "expediente-clinico", "clientes", "catalogo", "inventario", "reportes"] },
    { name: "Asistente veterinario", description: "Apoyo clínico: agenda y expediente del paciente.", modulos: ["citas", "expediente-clinico", "clientes"] },
    { name: "Groomer", description: "Su propia agenda de citas de estética/baño y ficha de sus clientes.", modulos: ["citas", "clientes", "catalogo"] },
    { name: "Recepcionista", description: "Agenda citas, recibe clientes y cobra en Punto de Venta y Caja — sin expediente clínico.", modulos: ["pos", "citas", "clientes", "caja"] },
  ],
  estetica: [
    { name: "Encargado de sucursal", description: "Agenda, clientes, catálogo, inventario, compras, caja y reportes de la sucursal.", modulos: ["pos", "citas", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Esteticista", description: "Su propia agenda de citas, ficha de sus clientes, catálogo de servicios e inventario de insumos.", modulos: ["citas", "clientes", "catalogo", "inventario"] },
    { name: "Recepcionista", description: "Agenda citas, recibe clientes y cobra en Punto de Venta y Caja.", modulos: ["pos", "citas", "clientes", "caja"] },
  ],
  spa: [
    { name: "Encargado de sucursal", description: "Agenda, clientes, catálogo, inventario, compras, caja y reportes de la sucursal.", modulos: ["pos", "citas", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Terapeuta", description: "Su propia agenda de citas, ficha de sus clientes y catálogo de servicios.", modulos: ["citas", "clientes", "catalogo"] },
    { name: "Masajista", description: "Su propia agenda de citas, ficha de sus clientes y catálogo de servicios.", modulos: ["citas", "clientes", "catalogo"] },
    { name: "Recepcionista", description: "Agenda citas, recibe clientes y cobra en Punto de Venta y Caja.", modulos: ["pos", "citas", "clientes", "caja"] },
  ],
  gimnasio: [
    { name: "Encargado de sucursal", description: "Agenda, clientes, catálogo, inventario, compras, caja y reportes de la sucursal.", modulos: ["pos", "citas", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Entrenador", description: "Su propia agenda de clases/citas y ficha de sus clientes.", modulos: ["citas", "clientes", "catalogo"] },
    { name: "Instructor", description: "Su propia agenda de clases/citas y ficha de sus clientes.", modulos: ["citas", "clientes", "catalogo"] },
    { name: "Recepcionista", description: "Agenda citas, recibe clientes y cobra membresías en Punto de Venta y Caja.", modulos: ["pos", "citas", "clientes", "caja"] },
  ],
  tatuajes: [
    { name: "Encargado de estudio", description: "Agenda, clientes, catálogo, inventario, compras, caja y reportes del estudio.", modulos: ["pos", "citas", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Tatuador", description: "Su propia agenda de citas, ficha de sus clientes y catálogo de diseños/precios.", modulos: ["citas", "clientes", "catalogo"] },
    { name: "Recepcionista", description: "Agenda citas, recibe clientes y cobra en Punto de Venta y Caja.", modulos: ["pos", "citas", "clientes", "caja"] },
  ],
  comercio_retail: [
    { name: "Encargado de tienda", description: "Ventas, clientes, catálogo, inventario, compras, caja y reportes de la tienda.", modulos: ["pos", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Vendedor", description: "Vende en Punto de Venta, ve el catálogo y la ficha de sus clientes.", modulos: ["pos", "clientes", "catalogo"] },
    { name: "Cajero", description: "Cobra en Punto de Venta y Caja, ve la ficha de clientes.", modulos: ["pos", "caja", "clientes"] },
    { name: "Almacenista", description: "Controla inventario y compras, con acceso al catálogo.", modulos: ["inventario", "compras", "catalogo"] },
  ],
  // Rediseño completo 2026-09-24, a petición explícita de Carlos: 6 puestos
  // de PIN con jerarquía y funciones que NO se suplantan entre sí (el
  // séptimo puesto que describió, "Director General/Dueño", NO es un Role
  // de PIN — es la cuenta real del negocio, con acceso sin restricción por
  // diseño desde siempre, ver resolverActor en lib/actor.ts).
  //
  // Topología organica que asumió este catálogo (un taller CENTRALIZADO,
  // no un técnico por tienda — la que describe el propio Carlos con "Jefe
  // de Taller" como puente único entre las 5 tiendas y los técnicos): por
  // eso "aduana" vive SOLO en "Jefe de Taller" y ningún puesto de tienda
  // (Encargado/Asesor/Cajero) lo tiene también — si algún negocio real
  // tuviera en cambio un técnico dedicado POR tienda, sin taller central,
  // el admin puede quitarle "aduana" a "Jefe de Taller" y dárselo desde
  // "Roles y permisos" al Encargado de esa tienda en su lugar (Carlos lo
  // planteó como una alternativa organica válida, no como un requisito
  // fijo de este rubro). Esto también es la corrección de raíz del bug que
  // Carlos reportó con capturas ("aparecen dos con el nombre de
  // Reparaciones... esa no debería poder verla un cajero o recepcionista"):
  // antes un script de un solo uso (prisma/enriquecer-taller-demo.ts) le
  // había dado "aduana" también a "Encargado de sucursal"/"Recepcionista"
  // del tenant demo — con este catálogo ya no hay ningún puesto de tienda
  // con más de uno de "reparaciones"/"aduana"/"taller" a la vez (aunque,
  // por robustez, TenantShell.tsx YA no depende de eso — ver el comentario
  // largo junto a "module.workshop.name"/"module.reception.name" en lib/
  // labels.ts).
  //
  // Dos límites del sistema que este catálogo no puede resolver del todo
  // (documentados aquí para quien lea/edite este archivo después):
  //   1. "reparaciones" es un solo módulo/permiso que cubre TANTO recibir
  //      un equipo con folio COMO cobrar/entregarlo (cobrarYEntregarAction,
  //      app/actions/reparaciones-actions.ts) — no hay forma hoy de darle a
  //      "Asesor de Ventas" solo la mitad de "recibir" sin también poder
  //      cobrar. Es una aproximación honesta a "Acceso para... registrar el
  //      ingreso de equipos a reparación... No puede cobrar" — en la
  //      práctica, quien de verdad cobra es "Cajero" (el único con
  //      verMontosCaja disponible y la costumbre real del mostrador), pero
  //      el sistema no se lo impide técnicamente al Asesor. Separar esto en
  //      dos permisos sería un cambio de arquitectura más grande, fuera de
  //      este rediseño.
  //   2. El Técnico de Reparación sigue siendo de SOLO LECTURA + alerta
  //      (módulo "taller") — a propósito NO se le devolvió la capacidad de
  //      cambiar el estatus él mismo (ej. marcar "Terminado"), aunque
  //      Carlos lo escribió así en su descripción de este puesto: eso
  //      reabriría exactamente el hueco de fraude que el propio Carlos
  //      señaló el 2026-09-22 ("Fix Expres": un técnico con edición de
  //      estatus/piezas podía quitar una que sí reparó, cobrar completo por
  //      fuera y quedarse con la diferencia). "Marcar Terminado" se resuelve
  //      con la alerta que ya existe (enviarAlertaTallerAction): el técnico
  //      avisa a Jefe de Taller que ya terminó, y es Jefe de Taller (con
  //      "aduana") quien de verdad cambia el estatus a "Listo". Si Carlos
  //      confirma que quiere revertir esa restricción específicamente para
  //      "Terminado" (sin tocar costo/piezas), es un cambio aparte a
  //      TRANSICIONES_VALIDAS/resolverActor en reparaciones-actions.ts.
  reparacion_celulares: [
    {
      name: "Supervisor de Sucursales",
      description: "Audita inventarios, ventas y cortes de caja de las 5 tiendas, autoriza traslados de mercancía entre sucursales — sin gestión operativa del taller (solo consulta el estatus de equipos recibidos en tienda).",
      modulos: ["reportes", "inventario", "catalogo", "compras", "caja", "sucursales", "reparaciones", "clientes"],
      // "ve todas las sucursales" (no solo la suya) — ver el comentario
      // largo junto a Role.verTodoNegocio (schema.prisma).
      verTodoNegocio: true,
      // Nivel supervisor: sí ve montos/totales de Caja de cualquier
      // sucursal (cortes de caja, ver su descripción arriba).
      verMontosCaja: true,
    },
    {
      name: "Jefe de Taller",
      description: "Puente entre las tiendas y los técnicos: recibe equipos derivados del taller central, asigna el trabajo según carga, agrega refacciones al costo y actualiza el estatus (en revisión/en reparación/reparado) — sin ver las ventas diarias de las tiendas.",
      modulos: ["aduana", "clientes", "catalogo", "inventario"],
    },
    {
      name: "Encargado de Tienda",
      description: "A cargo de la sucursal en su turno: abre y cierra la tienda, inventario local, tickets de venta, recepción de equipos para enviar al taller, y anula ventas o registra mermas de su sucursal.",
      modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "caja"],
      // Autoriza devoluciones/descuentos y supervisa al personal de
      // mostrador de SU sucursal — nivel supervisor de Caja, pero limitado
      // a esa tienda (sin verTodoNegocio, a diferencia de Supervisor de
      // Sucursales).
      verMontosCaja: true,
    },
    {
      name: "Cajero",
      description: "Única persona autorizada para cobrar: procesa pagos y emite recibos en Punto de Venta y Caja, y entrega reparaciones ya listas — no modifica inventarios ni ve costos de proveedores.",
      modulos: ["pos", "caja", "clientes", "reparaciones"],
    },
    {
      name: "Asesor de Ventas",
      description: "Atiende al cliente, vende accesorios, ve existencias del inventario local y documenta la recepción inicial de un equipo dañado (falla, datos del cliente) para generar la orden de servicio — no cobra ni ve reportes de ventas del negocio.",
      modulos: ["clientes", "catalogo", "inventario", "reparaciones"],
    },
    {
      name: "Técnico de Reparación",
      description: "Ejecuta la reparación física según la orden de servicio: ve sus equipos asignados, la falla y la contraseña de desbloqueo, y puede alertar a Jefe de Taller para pedir piezas o avisar que terminó — sin ver costos, piezas cotizadas ni ventas de las tiendas.",
      modulos: ["taller", "clientes", "catalogo", "inventario"],
    },
  ],
  taller_autos: [
    { name: "Jefe de taller", description: "Recibe vehículos con folio, clientes, catálogo, inventario, compras, caja y reportes del taller — cobra y entrega cuando queda listo.", modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Asesor de servicio", description: "Asigna mecánico, cambia el estatus de la reparación y ajusta costo/refacciones cotizadas.", modulos: ["aduana", "clientes", "catalogo", "inventario"] },
    { name: "Jefe de mecánicos", description: "Ve todas las órdenes de reparación asignadas del taller, sin poder editarlas.", modulos: ["taller", "clientes", "catalogo", "inventario"], verTodoTaller: true },
    { name: "Mecánico", description: "Ve solo sus propias órdenes de reparación asignadas (sin datos de contacto del cliente) y puede alertar al Asesor de servicio.", modulos: ["taller", "clientes", "catalogo", "inventario"] },
  ],
  taller_motos: [
    { name: "Jefe de taller", description: "Recibe motos con folio, clientes, catálogo, inventario, compras, caja y reportes del taller — cobra y entrega cuando queda lista.", modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Recepción", description: "Asigna mecánico, cambia el estatus de la reparación y ajusta costo/refacciones cotizadas.", modulos: ["aduana", "clientes", "catalogo", "inventario"] },
    { name: "Mecánico", description: "Ve solo sus propias órdenes de reparación asignadas (sin datos de contacto del cliente) y puede alertar a Recepción.", modulos: ["taller", "clientes", "catalogo", "inventario"] },
  ],
  electrodomesticos: [
    { name: "Encargado de sucursal", description: "Recibe equipos con folio, clientes, catálogo, inventario, compras, caja y reportes de la sucursal — cobra y entrega cuando el taller lo marca listo.", modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Recepcionista/Aduana", description: "Asigna técnico, cambia el estatus del equipo y ajusta costo/piezas cotizadas.", modulos: ["aduana", "clientes", "catalogo", "inventario"] },
    { name: "Técnico reparador", description: "Ve solo sus propias reparaciones asignadas (sin datos de contacto del cliente) y puede alertar a Recepción/Aduana.", modulos: ["taller", "clientes", "catalogo", "inventario"] },
  ],
  computadoras: [
    { name: "Encargado de sucursal", description: "Recibe equipos con folio, clientes, catálogo, inventario, compras, caja y reportes de la sucursal — cobra y entrega cuando el taller lo marca listo.", modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Recepcionista/Aduana", description: "Asigna técnico, cambia el estatus del equipo y ajusta costo/piezas cotizadas.", modulos: ["aduana", "clientes", "catalogo", "inventario"] },
    { name: "Técnico reparador", description: "Ve solo sus propias reparaciones asignadas (sin datos de contacto del cliente) y puede alertar a Recepción/Aduana.", modulos: ["taller", "clientes", "catalogo", "inventario"] },
  ],
  relojeria_joyeria: [
    { name: "Encargado de tienda", description: "Recibe piezas con folio, ventas, clientes, catálogo, inventario, compras, caja y reportes de la tienda.", modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Recepción/Aduana", description: "Asigna relojero/joyero, cambia el estatus del ajuste/reparación y ajusta costo/piezas cotizadas.", modulos: ["aduana", "clientes", "catalogo", "inventario"] },
    { name: "Relojero/Joyero", description: "Ve solo sus propias órdenes de reparación/ajuste asignadas (sin datos de contacto del cliente) y puede alertar a Recepción/Aduana.", modulos: ["taller", "clientes", "catalogo", "inventario"] },
    { name: "Vendedor", description: "Vende en Punto de Venta, ve el catálogo y la ficha de sus clientes.", modulos: ["pos", "clientes", "catalogo"] },
  ],
  zapateria: [
    { name: "Encargado de tienda", description: "Recibe calzado con folio, ventas, clientes, catálogo, inventario, compras, caja y reportes de la tienda.", modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Recepción/Aduana", description: "Asigna zapatero, cambia el estatus de la reparación y ajusta costo/materiales cotizados.", modulos: ["aduana", "clientes", "catalogo", "inventario"] },
    { name: "Zapatero remendón", description: "Ve solo sus propias órdenes de reparación asignadas (sin datos de contacto del cliente) y puede alertar a Recepción/Aduana.", modulos: ["taller", "clientes", "catalogo", "inventario"] },
    { name: "Vendedor", description: "Vende en Punto de Venta, ve el catálogo y la ficha de sus clientes.", modulos: ["pos", "clientes", "catalogo"] },
  ],
  refrigeracion_ac: [
    { name: "Encargado de sucursal", description: "Recibe solicitudes de servicio con folio, clientes, catálogo, inventario, compras, caja y reportes de la sucursal.", modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Recepcionista/Aduana", description: "Asigna técnico instalador, cambia el estatus del servicio y ajusta costo/refacciones cotizadas.", modulos: ["aduana", "clientes", "catalogo", "inventario"] },
    { name: "Técnico instalador", description: "Ve solo sus propias órdenes de servicio asignadas (sin datos de contacto del cliente) y puede alertar a Recepción/Aduana.", modulos: ["taller", "clientes", "catalogo", "inventario"] },
  ],
  bicicletas: [
    { name: "Encargado de tienda", description: "Recibe bicicletas con folio, ventas, clientes, catálogo, inventario, compras, caja y reportes de la tienda.", modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Recepción/Aduana", description: "Asigna mecánico, cambia el estatus de la reparación y ajusta costo/refacciones cotizadas.", modulos: ["aduana", "clientes", "catalogo", "inventario"] },
    { name: "Mecánico de bicicletas", description: "Ve solo sus propias órdenes de reparación asignadas (sin datos de contacto del cliente) y puede alertar a Recepción/Aduana.", modulos: ["taller", "clientes", "catalogo", "inventario"] },
    { name: "Vendedor", description: "Vende en Punto de Venta, ve el catálogo y la ficha de sus clientes.", modulos: ["pos", "clientes", "catalogo"] },
  ],
  cerrajeria: [
    { name: "Encargado de sucursal", description: "Recibe solicitudes de servicio con folio, clientes, catálogo, inventario, compras, caja y reportes de la sucursal.", modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Recepcionista/Aduana", description: "Asigna cerrajero, cambia el estatus del servicio y ajusta costo/piezas cotizadas.", modulos: ["aduana", "clientes", "catalogo", "inventario"] },
    { name: "Cerrajero", description: "Ve solo sus propias órdenes de servicio asignadas (sin datos de contacto del cliente) y puede alertar a Recepción/Aduana.", modulos: ["taller", "clientes", "catalogo", "inventario"] },
  ],
  tapiceria: [
    { name: "Encargado de taller", description: "Recibe piezas con folio, ventas, clientes, catálogo, inventario, compras, caja y reportes del taller.", modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Recepción/Aduana", description: "Asigna tapicero, cambia el estatus del trabajo y ajusta costo/materiales cotizados.", modulos: ["aduana", "clientes", "catalogo", "inventario"] },
    { name: "Tapicero", description: "Ve solo sus propias órdenes de trabajo asignadas (sin datos de contacto del cliente) y puede alertar a Recepción/Aduana.", modulos: ["taller", "clientes", "catalogo", "inventario"] },
    { name: "Vendedor", description: "Vende en Punto de Venta, ve el catálogo y la ficha de sus clientes.", modulos: ["pos", "clientes", "catalogo"] },
  ],
};

/** Roles sugeridos (con permisos) para el rubro dado (arreglo vacío = sin catálogo específico para ese rubro — se usan los 3 roles base genéricos, ver ROLES_BASE en lib/roles.ts). */
export function rolesSugeridosRubro(businessType: string | null | undefined): RolSugeridoRubro[] {
  if (!businessType) return [];
  return ROLES_SUGERIDOS_RUBRO[businessType] ?? [];
}
