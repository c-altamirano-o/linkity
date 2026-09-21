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
 *      "reparaciones": el especialista (técnico/mecánico/relojero/etc.)
 *      puede diagnosticar, agregar piezas y avanzar el estatus, pero el
 *      sistema le bloquea eliminar piezas, cambiar el costo, cobrar/entregar
 *      y contactar al cliente — eso queda para el puesto de mando o
 *      Recepción (2026-09-21, a petición de Carlos, tras encontrar el hueco
 *      real en el demo de reparación de celulares: un técnico con acceso
 *      total podía quitar una pieza que sí reparó, cobrar completo por
 *      fuera y quedarse con la diferencia). Ver el comentario de "taller" en
 *      lib/roles.ts para el porqué de la ruta/módulo aparte en vez de un
 *      permiso fino dentro del mismo "reparaciones".
 *   3. Un puesto de "Recepción" (cobra, agenda, recibe) con Punto de
 *      Venta + Caja + Clientes + Citas/Reparaciones — pero SIN Expediente
 *      Clínico: quien solo cobra no tiene por qué ver datos clínicos del
 *      paciente (NOM-004), mismo criterio que ya regía en MATRIZ_ACCESO_BASE.
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
  reparacion_celulares: [
    { name: "Encargado de sucursal", description: "Reparaciones, clientes, catálogo, inventario, compras, caja y reportes de la sucursal.", modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Técnico reparador", description: "Sus órdenes de reparación, ficha de clientes, catálogo de servicios e inventario de refacciones.", modulos: ["taller", "clientes", "catalogo", "inventario"] },
    { name: "Recepcionista", description: "Recibe equipos, da seguimiento a reparaciones y cobra en Punto de Venta y Caja.", modulos: ["pos", "reparaciones", "clientes", "caja"] },
  ],
  taller_autos: [
    { name: "Jefe de taller", description: "Reparaciones, clientes, catálogo, inventario, compras, caja y reportes del taller.", modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Mecánico", description: "Sus órdenes de reparación, ficha de clientes, catálogo de servicios e inventario de refacciones.", modulos: ["taller", "clientes", "catalogo", "inventario"] },
    { name: "Asesor de servicio", description: "Recibe el vehículo, cotiza y da seguimiento a la reparación, cobra en Punto de Venta y Caja.", modulos: ["reparaciones", "clientes", "pos", "caja"] },
    { name: "Recepción", description: "Recibe vehículos, da seguimiento a reparaciones y cobra en Punto de Venta y Caja.", modulos: ["pos", "reparaciones", "clientes", "caja"] },
  ],
  taller_motos: [
    { name: "Jefe de taller", description: "Reparaciones, clientes, catálogo, inventario, compras, caja y reportes del taller.", modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Mecánico", description: "Sus órdenes de reparación, ficha de clientes, catálogo de servicios e inventario de refacciones.", modulos: ["taller", "clientes", "catalogo", "inventario"] },
    { name: "Recepción", description: "Recibe motos, da seguimiento a reparaciones y cobra en Punto de Venta y Caja.", modulos: ["pos", "reparaciones", "clientes", "caja"] },
  ],
  electrodomesticos: [
    { name: "Encargado de sucursal", description: "Reparaciones, clientes, catálogo, inventario, compras, caja y reportes de la sucursal.", modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Técnico reparador", description: "Sus órdenes de reparación, ficha de clientes, catálogo de servicios e inventario de refacciones.", modulos: ["taller", "clientes", "catalogo", "inventario"] },
    { name: "Recepcionista", description: "Recibe equipos, da seguimiento a reparaciones y cobra en Punto de Venta y Caja.", modulos: ["pos", "reparaciones", "clientes", "caja"] },
  ],
  computadoras: [
    { name: "Encargado de sucursal", description: "Reparaciones, clientes, catálogo, inventario, compras, caja y reportes de la sucursal.", modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Técnico reparador", description: "Sus órdenes de reparación, ficha de clientes, catálogo de servicios e inventario de refacciones.", modulos: ["taller", "clientes", "catalogo", "inventario"] },
    { name: "Recepcionista", description: "Recibe equipos, da seguimiento a reparaciones y cobra en Punto de Venta y Caja.", modulos: ["pos", "reparaciones", "clientes", "caja"] },
  ],
  relojeria_joyeria: [
    { name: "Encargado de tienda", description: "Reparaciones, ventas, clientes, catálogo, inventario, compras, caja y reportes de la tienda.", modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Relojero/Joyero", description: "Sus órdenes de reparación/ajuste, ficha de clientes, catálogo e inventario de piezas.", modulos: ["taller", "clientes", "catalogo", "inventario"] },
    { name: "Vendedor", description: "Vende en Punto de Venta, ve el catálogo y la ficha de sus clientes.", modulos: ["pos", "clientes", "catalogo"] },
  ],
  zapateria: [
    { name: "Encargado de tienda", description: "Reparaciones, ventas, clientes, catálogo, inventario, compras, caja y reportes de la tienda.", modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Zapatero remendón", description: "Sus órdenes de reparación, ficha de clientes, catálogo e inventario de materiales.", modulos: ["taller", "clientes", "catalogo", "inventario"] },
    { name: "Vendedor", description: "Vende en Punto de Venta, ve el catálogo y la ficha de sus clientes.", modulos: ["pos", "clientes", "catalogo"] },
  ],
  refrigeracion_ac: [
    { name: "Encargado de sucursal", description: "Reparaciones/instalaciones, clientes, catálogo, inventario, compras, caja y reportes de la sucursal.", modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Técnico instalador", description: "Sus órdenes de servicio, ficha de clientes, catálogo de servicios e inventario de refacciones.", modulos: ["taller", "clientes", "catalogo", "inventario"] },
    { name: "Recepcionista", description: "Recibe solicitudes de servicio, da seguimiento y cobra en Punto de Venta y Caja.", modulos: ["pos", "reparaciones", "clientes", "caja"] },
  ],
  bicicletas: [
    { name: "Encargado de tienda", description: "Reparaciones, ventas, clientes, catálogo, inventario, compras, caja y reportes de la tienda.", modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Mecánico de bicicletas", description: "Sus órdenes de reparación, ficha de clientes, catálogo e inventario de refacciones.", modulos: ["taller", "clientes", "catalogo", "inventario"] },
    { name: "Vendedor", description: "Vende en Punto de Venta, ve el catálogo y la ficha de sus clientes.", modulos: ["pos", "clientes", "catalogo"] },
  ],
  cerrajeria: [
    { name: "Encargado de sucursal", description: "Reparaciones/servicios, clientes, catálogo, inventario, compras, caja y reportes de la sucursal.", modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Cerrajero", description: "Sus órdenes de servicio, ficha de clientes, catálogo de servicios e inventario de piezas.", modulos: ["taller", "clientes", "catalogo", "inventario"] },
    { name: "Recepcionista", description: "Recibe solicitudes de servicio, da seguimiento y cobra en Punto de Venta y Caja.", modulos: ["pos", "reparaciones", "clientes", "caja"] },
  ],
  tapiceria: [
    { name: "Encargado de taller", description: "Reparaciones, ventas, clientes, catálogo, inventario, compras, caja y reportes del taller.", modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "compras", "caja", "reportes"] },
    { name: "Tapicero", description: "Sus órdenes de trabajo, ficha de clientes, catálogo e inventario de materiales.", modulos: ["taller", "clientes", "catalogo", "inventario"] },
    { name: "Vendedor", description: "Vende en Punto de Venta, ve el catálogo y la ficha de sus clientes.", modulos: ["pos", "clientes", "catalogo"] },
  ],
};

/** Roles sugeridos (con permisos) para el rubro dado (arreglo vacío = sin catálogo específico para ese rubro — se usan los 3 roles base genéricos, ver ROLES_BASE en lib/roles.ts). */
export function rolesSugeridosRubro(businessType: string | null | undefined): RolSugeridoRubro[] {
  if (!businessType) return [];
  return ROLES_SUGERIDOS_RUBRO[businessType] ?? [];
}
