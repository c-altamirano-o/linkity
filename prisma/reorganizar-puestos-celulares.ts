import "dotenv/config";
import { PrismaClient, PaymentScheme, PaymentFrequency, StaffPaymentMethod, CommissionBase } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomBytes, scryptSync } from "crypto";

// No se importa hashPin de lib/staff-auth.ts a propósito: ese archivo hace
// `import "server-only"`, que en un script suelto corrido con `tsx` (fuera
// del bundler de Next) truena siempre ("This module cannot be imported from
// a Client Component module..."). Se reimplementa aquí el mismo algoritmo
// EXACTO (scrypt con salt aleatorio, mismo formato "salt:hash" en hex) para
// que el PIN de este script funcione con verificarPin sin ningún cambio.
function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/**
 * Script de un solo uso (2026-09-24) — reorganiza los puestos del tenant
 * demo-reparacion-celulares al rediseño completo de 6 roles de PIN que
 * Carlos pidió explícitamente para este rubro (ver el comentario largo
 * junto a ROLES_SUGERIDOS_RUBRO.reparacion_celulares en lib/roles-rubro.ts —
 * este script es la contraparte de datos de ese catálogo, deben leerse
 * juntos).
 *
 * Qué hace, en orden:
 *   1. Renombra los 4 roles "ad hoc" que sembró prisma/seed-demo.ts (nunca
 *      pasaron por el catálogo por rubro) a sus nombres nuevos — así el
 *      personal YA asignado a esos roles pasa automáticamente al puesto
 *      correcto sin tocar Staff.roleId uno por uno:
 *        "Encargado de sucursal" → "Encargado de Tienda"
 *        "Recepcionista"         → "Asesor de Ventas"
 *        "Técnico reparador"     → "Técnico de Reparación"
 *        "Jefe de técnicos"      → "Jefe de Taller"
 *   2. Reemplaza por completo los permisos (RolePermission) y las banderas
 *      (verTodoTaller/verMontosCaja/verTodoNegocio) de los 6 roles para que
 *      coincidan EXACTAMENTE con lib/roles-rubro.ts, sin importar qué
 *      tuvieran antes (a diferencia de asegurarRolesRubro, que nunca toca
 *      un rol que ya tiene permisos — aquí sí, porque es una reorganización
 *      explícita, no el punto de partida de un negocio nuevo).
 *   3. Borra el rol huérfano "Recepción/Aduana" (0 empleados — lo había
 *      creado asegurarRolesRubro con el catálogo VIEJO, que ya no existe:
 *      su función se fusionó en "Jefe de Taller").
 *   4. Contrata al personal nuevo que la nueva estructura necesita y que
 *      antes no existía en este demo: un Cajero en cada una de las 5
 *      sucursales (antes NINGUNA tenía uno — cobrar y recibir/entregar
 *      eran la misma persona), un Asesor de Ventas en Las Torres/Oriente
 *      (antes solo tenían Encargado+Técnico, sin nadie de mostrador), un
 *      Técnico de Reparación en Centro (antes solo tenía el que ahora es
 *      Jefe de Taller de tiempo completo, ningún técnico "de piso") y un
 *      Supervisor de Sucursales nuevo, con sede en Centro pero
 *      verTodoNegocio:true (ve las 5 tiendas).
 *
 * Seguro de volver a correr: los renombres de rol se saltan solos si el
 * nombre viejo ya no existe (ya corrió antes); las altas de personal nuevo
 * se saltan por nombre exacto si ese empleado ya existe.
 *
 * Cómo correrlo: `npx tsx prisma/reorganizar-puestos-celulares.ts`
 * (después de `npx prisma db push`, nunca antes — este script depende de
 * Role.verTodoNegocio y Repair.deviceUnlockCode, columnas nuevas).
 */

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

const SLUG_TENANT = "demo-reparacion-celulares";

type ModuloKey =
  | "dashboard" | "pos" | "reparaciones" | "taller" | "aduana" | "clientes"
  | "catalogo" | "inventario" | "compras" | "caja" | "sucursales" | "reportes";

interface RolDef {
  nombreViejo?: string;
  nombre: string;
  descripcion: string;
  modulos: ModuloKey[];
  verTodoTaller: boolean;
  verMontosCaja: boolean;
  verTodoNegocio: boolean;
}

// Mismo catálogo, mismo orden y mismos textos que
// ROLES_SUGERIDOS_RUBRO.reparacion_celulares en lib/roles-rubro.ts — si se
// edita uno, hay que editar el otro.
const ROLES: RolDef[] = [
  {
    nombre: "Supervisor de Sucursales",
    descripcion: "Audita inventarios, ventas y cortes de caja de las 5 tiendas, autoriza traslados de mercancía entre sucursales — sin gestión operativa del taller (solo consulta el estatus de equipos recibidos en tienda).",
    modulos: ["reportes", "inventario", "catalogo", "compras", "caja", "sucursales", "reparaciones", "clientes"],
    verTodoTaller: false, verMontosCaja: true, verTodoNegocio: true,
  },
  {
    nombreViejo: "Recepción/Aduana", // se borra aparte más abajo — no se renombra a este
    nombre: "Jefe de Taller",
    descripcion: "Puente entre las tiendas y los técnicos: recibe equipos derivados del taller central, asigna el trabajo según carga, agrega refacciones al costo y actualiza el estatus (en revisión/en reparación/reparado) — sin ver las ventas diarias de las tiendas.",
    modulos: ["aduana", "clientes", "catalogo", "inventario"],
    verTodoTaller: false, verMontosCaja: false, verTodoNegocio: false,
  },
  {
    nombreViejo: "Encargado de sucursal",
    nombre: "Encargado de Tienda",
    descripcion: "A cargo de la sucursal en su turno: abre y cierra la tienda, inventario local, tickets de venta, recepción de equipos para enviar al taller, y anula ventas o registra mermas de su sucursal.",
    modulos: ["pos", "reparaciones", "clientes", "catalogo", "inventario", "caja"],
    verTodoTaller: false, verMontosCaja: true, verTodoNegocio: false,
  },
  {
    nombre: "Cajero",
    descripcion: "Única persona autorizada para cobrar: procesa pagos y emite recibos en Punto de Venta y Caja, y entrega reparaciones ya listas — no modifica inventarios ni ve costos de proveedores.",
    modulos: ["pos", "caja", "clientes", "reparaciones"],
    verTodoTaller: false, verMontosCaja: false, verTodoNegocio: false,
  },
  {
    nombreViejo: "Recepcionista",
    nombre: "Asesor de Ventas",
    descripcion: "Atiende al cliente, vende accesorios, ve existencias del inventario local y documenta la recepción inicial de un equipo dañado (falla, datos del cliente) para generar la orden de servicio — no cobra ni ve reportes de ventas del negocio.",
    modulos: ["clientes", "catalogo", "inventario", "reparaciones"],
    verTodoTaller: false, verMontosCaja: false, verTodoNegocio: false,
  },
  {
    nombreViejo: "Técnico reparador",
    nombre: "Técnico de Reparación",
    descripcion: "Ejecuta la reparación física según la orden de servicio: ve sus equipos asignados, la falla y la contraseña de desbloqueo, y puede alertar a Jefe de Taller para pedir piezas o avisar que terminó — sin ver costos, piezas cotizadas ni ventas de las tiendas.",
    modulos: ["taller", "clientes", "catalogo", "inventario"],
    verTodoTaller: false, verMontosCaja: false, verTodoNegocio: false,
  },
];

// nombreViejo especial: "Jefe de técnicos" también se renombra a "Jefe de
// Taller" — se agrega aparte porque el rol de arriba ya usa `nombreViejo`
// para marcar el huérfano a borrar ("Recepción/Aduana").
const RENOMBRE_JEFE_TALLER_VIEJO = "Jefe de técnicos";

interface NuevoEmpleado {
  nombre: string;
  puesto: string; // nombre del rol nuevo (debe estar en ROLES)
  branchCode: string;
  telefono: string;
  esquema: PaymentScheme;
  baseSalary: number;
  commissionRate: number;
  commissionBase: CommissionBase;
  metodoPago: StaffPaymentMethod;
}

const NUEVOS_EMPLEADOS: NuevoEmpleado[] = [
  { nombre: "Iván Mercado", puesto: "Técnico de Reparación", branchCode: "CEN", telefono: "6621459087", esquema: PaymentScheme.MIXTO, baseSalary: 4200, commissionRate: 8, commissionBase: CommissionBase.REPARACIONES, metodoPago: StaffPaymentMethod.TRANSFERENCIA },
  { nombre: "Brenda Salcido", puesto: "Cajero", branchCode: "CEN", telefono: "6621459123", esquema: PaymentScheme.FIJO, baseSalary: 5200, commissionRate: 0, commissionBase: CommissionBase.VENTAS, metodoPago: StaffPaymentMethod.TARJETA_NOMINA },
  { nombre: "Rodrigo Ibarra", puesto: "Supervisor de Sucursales", branchCode: "CEN", telefono: "6621459256", esquema: PaymentScheme.FIJO, baseSalary: 9500, commissionRate: 0, commissionBase: CommissionBase.VENTAS, metodoPago: StaffPaymentMethod.TRANSFERENCIA },
  { nombre: "Karla Delgado", puesto: "Cajero", branchCode: "PLM", telefono: "6621459341", esquema: PaymentScheme.FIJO, baseSalary: 5000, commissionRate: 0, commissionBase: CommissionBase.VENTAS, metodoPago: StaffPaymentMethod.EFECTIVO },
  { nombre: "Emiliano Cabrera", puesto: "Asesor de Ventas", branchCode: "TOR", telefono: "6621459478", esquema: PaymentScheme.MIXTO, baseSalary: 3900, commissionRate: 6, commissionBase: CommissionBase.VENTAS, metodoPago: StaffPaymentMethod.TRANSFERENCIA },
  { nombre: "Yolanda Reyes", puesto: "Cajero", branchCode: "TOR", telefono: "6621459512", esquema: PaymentScheme.FIJO, baseSalary: 5100, commissionRate: 0, commissionBase: CommissionBase.VENTAS, metodoPago: StaffPaymentMethod.TARJETA_NOMINA },
  { nombre: "Marco Solano", puesto: "Cajero", branchCode: "VAL", telefono: "6621459639", esquema: PaymentScheme.FIJO, baseSalary: 5000, commissionRate: 0, commissionBase: CommissionBase.VENTAS, metodoPago: StaffPaymentMethod.EFECTIVO },
  { nombre: "Daniela Paredes", puesto: "Asesor de Ventas", branchCode: "ORI", telefono: "6621459715", esquema: PaymentScheme.MIXTO, baseSalary: 3900, commissionRate: 6, commissionBase: CommissionBase.VENTAS, metodoPago: StaffPaymentMethod.TRANSFERENCIA },
  { nombre: "Héctor Bautista", puesto: "Cajero", branchCode: "ORI", telefono: "6621459802", esquema: PaymentScheme.FIJO, baseSalary: 5100, commissionRate: 0, commissionBase: CommissionBase.VENTAS, metodoPago: StaffPaymentMethod.TARJETA_NOMINA },
];

const PIN_DEMO = "111111";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG_TENANT }, select: { id: true } });
  if (!tenant) {
    console.log(`No existe el tenant "${SLUG_TENANT}" — nada que hacer.`);
    return;
  }

  // 1. Renombres (idempotente: se saltan solos si el nombre viejo ya no existe).
  const renombres: [string, string][] = [
    ["Encargado de sucursal", "Encargado de Tienda"],
    ["Recepcionista", "Asesor de Ventas"],
    ["Técnico reparador", "Técnico de Reparación"],
    [RENOMBRE_JEFE_TALLER_VIEJO, "Jefe de Taller"],
  ];
  for (const [viejo, nuevo] of renombres) {
    const existente = await prisma.role.findUnique({ where: { tenantId_name: { tenantId: tenant.id, name: viejo } }, select: { id: true } });
    if (existente) {
      await prisma.role.update({ where: { id: existente.id }, data: { name: nuevo } });
      console.log(`↻ Rol renombrado: "${viejo}" → "${nuevo}"`);
    }
  }

  // 2. Borra el huérfano "Recepción/Aduana" (0 empleados) si existe.
  const huerfano = await prisma.role.findUnique({
    where: { tenantId_name: { tenantId: tenant.id, name: "Recepción/Aduana" } },
    select: { id: true, _count: { select: { staff: true } } },
  });
  if (huerfano && huerfano._count.staff === 0) {
    await prisma.rolePermission.deleteMany({ where: { roleId: huerfano.id } });
    await prisma.role.delete({ where: { id: huerfano.id } });
    console.log(`🗑 Rol huérfano "Recepción/Aduana" eliminado (0 empleados, ya fusionado en "Jefe de Taller").`);
  }

  // 3. Catálogo de permisos (upsert idempotente).
  const modulosNecesarios: ModuloKey[] = [
    "dashboard", "pos", "reparaciones", "taller", "aduana", "clientes",
    "catalogo", "inventario", "compras", "caja", "sucursales", "reportes",
  ];
  const permisos = await Promise.all(
    modulosNecesarios.map((m) =>
      prisma.permission.upsert({
        where: { module_action: { module: m, action: "acceso" } },
        update: {},
        create: { module: m, action: "acceso" },
        select: { id: true, module: true },
      })
    )
  );
  const mapaPermisos = new Map(permisos.map((p) => [p.module as ModuloKey, p.id]));

  // 4. Los 6 roles: upsert + reemplazo TOTAL de permisos y banderas.
  const idsPorRol = new Map<string, string>();
  for (const rol of ROLES) {
    const r = await prisma.role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: rol.nombre } },
      update: {
        description: rol.descripcion, isSystem: true,
        verTodoTaller: rol.verTodoTaller, verMontosCaja: rol.verMontosCaja, verTodoNegocio: rol.verTodoNegocio,
      },
      create: {
        tenantId: tenant.id, name: rol.nombre, description: rol.descripcion, isSystem: true,
        verTodoTaller: rol.verTodoTaller, verMontosCaja: rol.verMontosCaja, verTodoNegocio: rol.verTodoNegocio,
      },
      select: { id: true },
    });
    idsPorRol.set(rol.nombre, r.id);

    await prisma.rolePermission.deleteMany({ where: { roleId: r.id } });
    await prisma.rolePermission.createMany({
      data: rol.modulos.map((m) => mapaPermisos.get(m)).filter((id): id is string => Boolean(id)).map((permissionId) => ({ roleId: r.id, permissionId })),
      skipDuplicates: true,
    });
    console.log(`✅ Rol "${rol.nombre}": ${rol.modulos.join(", ")}${rol.verTodoNegocio ? " [ve las 5 sucursales]" : ""}${rol.verMontosCaja ? " [ve montos de caja]" : ""}`);
  }

  // 5. Personal nuevo — se salta por nombre si ya existe (idempotente).
  const branches = await prisma.branch.findMany({ where: { tenantId: tenant.id }, select: { id: true, code: true, name: true } });
  const branchPorCodigo = new Map(branches.map((b) => [b.code, b]));

  for (let i = 0; i < NUEVOS_EMPLEADOS.length; i++) {
    const e = NUEVOS_EMPLEADOS[i];
    const yaExiste = await prisma.staff.findFirst({ where: { tenantId: tenant.id, name: e.nombre }, select: { id: true } });
    if (yaExiste) {
      console.log(`⏭  ${e.nombre} ya existe — se omite.`);
      continue;
    }
    const branch = branchPorCodigo.get(e.branchCode);
    const roleId = idsPorRol.get(e.puesto);
    if (!branch || !roleId) {
      console.error(`⚠️  No se pudo dar de alta a ${e.nombre}: sucursal o rol no encontrado.`);
      continue;
    }

    const email = `staff-demo-nuevo-${i}@${SLUG_TENANT}.personal.linkity.internal`;
    const supabaseIdFalso = `staff-placeholder-demo-nuevo-${SLUG_TENANT}-${i}`;

    await prisma.$transaction(async (tx) => {
      const usuarioOculto = await tx.user.create({
        data: { tenantId: tenant.id, branchId: branch.id, email, name: e.nombre, supabaseId: supabaseIdFalso, isActive: true },
      });
      await tx.staff.create({
        data: {
          tenantId: tenant.id, branchId: branch.id, userId: usuarioOculto.id,
          name: e.nombre, phone: e.telefono, phoneCountryCode: "+52", position: e.puesto,
          pinHash: hashPin(PIN_DEMO), roleId,
          paymentScheme: e.esquema,
          baseSalary: e.esquema === PaymentScheme.FIJO || e.esquema === PaymentScheme.MIXTO ? e.baseSalary : 0,
          commissionRate: e.esquema === PaymentScheme.COMISION || e.esquema === PaymentScheme.MIXTO ? e.commissionRate : 0,
          commissionBase: e.commissionBase,
          paymentFrequency: PaymentFrequency.QUINCENAL,
          commissionFrequency: PaymentFrequency.QUINCENAL,
          staffPaymentMethod: e.metodoPago,
          clabe: e.metodoPago === StaffPaymentMethod.TRANSFERENCIA ? "032180000118359719" : null,
          isActive: true,
        },
      });
    });
    console.log(`🆕 ${e.nombre} — ${e.puesto} en ${branch.name} (PIN ${PIN_DEMO})`);
  }

  console.log("\nListo — puestos de reparación de celulares reorganizados.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
