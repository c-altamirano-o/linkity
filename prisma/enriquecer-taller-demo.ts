import "dotenv/config";
import { PrismaClient, RepairStatus, Priority, ProductType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Script de un solo uso (2026-09-24) — enriquece el tenant demo
 * "demo-reparacion-celulares" con ejemplos variados del flujo de Taller
 * REDISEÑADO (Recepción/Aduana, Técnico/Taller, asignación de técnico,
 * los 8 estatus reales de TRANSICIONES_VALIDAS, página pública de
 * seguimiento) — a petición de Carlos: "crea en la base de datos ejemplos
 * variados de la operación diaria para mostrar diferentes fases de cada
 * proceso... equipos en diferentes etapas del proceso. Que sea en todas
 * las tiendas no en una aleatoria".
 *
 * Por qué hacía falta (hallazgo al revisar este tenant): el personal de
 * este demo lo crea prisma/seed-demo.ts con un mecanismo VIEJO
 * (inferirModulosPorPuesto), anterior a todo el rediseño de Aduana/Taller
 * de esta sesión — el rol "Técnico reparador" del demo quedó con los
 * módulos "pos"+"reparaciones" (el molde genérico de "mostrador"), NUNCA
 * con "taller", y ningún rol del demo tiene "aduana". Sin esto, ni
 * getEstadoTallerChecklist (lib/roles-server.ts, la tarjeta nueva de
 * Configuración) ni el selector de técnicos de /reparaciones encontrarían
 * personal válido en este tenant — el demo se vería "vacío" justo en la
 * funcionalidad que más se acaba de construir. Este script corrige eso Y
 * siembra reparaciones nuevas que sí usan el flujo completo (asignación,
 * historial con visibleCliente, alerta al cliente, cobro y entrega).
 *
 * Deliberadamente ADITIVO, no destructivo: las reparaciones viejas que ya
 * sembró seed-demo.ts (con estatus legacy DIAGNOSING/READY/CANCELLED, sin
 * técnico asignado) se quedan intactas — siguen siendo válidas para
 * Dashboard/Reportes (rangos de fecha, historial), solo ya no son las que
 * mejor demuestran el flujo de Taller de hoy. Las reparaciones NUEVAS que
 * crea este script llevan un marcador (`notes: MARCADOR_SEED`) para que
 * volver a correr el script sea seguro (no duplica si una sucursal ya
 * tiene su repair de un estatus dado).
 *
 * Cómo correrlo: `npx tsx prisma/enriquecer-taller-demo.ts`
 * (después de `npx prisma db push`, nunca antes).
 */

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

const SLUG_TENANT = "demo-reparacion-celulares";
const MARCADOR_SEED = "seed-variedad-taller-2026-09-24";

const DISPOSITIVOS = [
  { brand: "Apple", model: "iPhone 13" },
  { brand: "Samsung", model: "Galaxy A54" },
  { brand: "Xiaomi", model: "Redmi Note 12" },
  { brand: "Motorola", model: "Moto G84" },
];
const FALLAS = ["Pantalla rota", "No enciende", "Batería se descarga rápido", "No carga", "Sin señal"];

// Los 8 estatus que de verdad recorre el flujo actual (TRANSICIONES_VALIDAS,
// app/actions/reparaciones-actions.ts) — a propósito SIN DIAGNOSING/READY/
// CANCELLED (legacy, ya no alcanzables desde la UI de hoy).
const ESTATUS_DEMO: { estado: RepairStatus; diasAtras: number }[] = [
  { estado: RepairStatus.DELIVERED, diasAtras: 9 },
  { estado: RepairStatus.SHOP_RETURN, diasAtras: 6 },
  { estado: RepairStatus.SHOP_READY, diasAtras: 5 },
  { estado: RepairStatus.WORKSHOP_RETURN, diasAtras: 4 },
  { estado: RepairStatus.WORKSHOP_READY, diasAtras: 3 },
  { estado: RepairStatus.WAITING_PARTS, diasAtras: 2 },
  { estado: RepairStatus.IN_REPAIR, diasAtras: 1 },
  { estado: RepairStatus.RECEIVED, diasAtras: 0 },
];

const NOTA_POR_ESTADO: Partial<Record<RepairStatus, string>> = {
  IN_REPAIR: "Reparación iniciada",
  WAITING_PARTS: "En espera de refacción",
  WORKSHOP_READY: "Reparación completada — listo en taller",
  WORKSHOP_RETURN: "No se pudo reparar — marcado para devolución",
  SHOP_READY: "Equipo trasladado a tienda — listo para entrega",
  SHOP_RETURN: "Equipo trasladado a tienda — devolución al cliente",
};

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}
function fechaHaceDias(dias: number, hora: string): Date {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const [h, m] = hora.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG_TENANT }, select: { id: true, name: true } });
  if (!tenant) {
    console.log(`⚠️  No existe el tenant "${SLUG_TENANT}" — nada que enriquecer (¿ya corriste seed-demo.ts?).`);
    return;
  }

  const branches = await prisma.branch.findMany({
    where: { tenantId: tenant.id },
    orderBy: { code: "asc" },
    select: { id: true, name: true, code: true },
  });
  if (branches.length === 0) {
    console.log("⚠️  El tenant no tiene sucursales — nada que enriquecer.");
    return;
  }

  // ── 1) Roles: dar "aduana" a Encargado de sucursal/Recepcionista, y
  // corregir "Técnico reparador" para que use "taller" (no "reparaciones"/
  // "pos") — ver el comentario largo del archivo. ──────────────────────
  const MODULOS_NECESARIOS = ["aduana", "taller", "clientes", "catalogo", "inventario"] as const;
  const permisos = await Promise.all(
    MODULOS_NECESARIOS.map((m) =>
      prisma.permission.upsert({
        where: { module_action: { module: m, action: "acceso" } },
        update: {},
        create: { module: m, action: "acceso" },
        select: { id: true, module: true },
      })
    )
  );
  const idPermiso = new Map(permisos.map((p) => [p.module, p.id]));

  const rolesDemo = await prisma.role.findMany({
    where: { tenantId: tenant.id, name: { in: ["Encargado de sucursal", "Recepcionista", "Técnico reparador"] } },
    select: { id: true, name: true },
  });
  const rolPorNombre = new Map(rolesDemo.map((r) => [r.name, r]));

  const rolEncargado = rolPorNombre.get("Encargado de sucursal");
  const rolRecepcionista = rolPorNombre.get("Recepcionista");
  const rolTecnico = rolPorNombre.get("Técnico reparador");

  if (rolEncargado && rolRecepcionista) {
    await prisma.rolePermission.createMany({
      data: [rolEncargado.id, rolRecepcionista.id].map((roleId) => ({ roleId, permissionId: idPermiso.get("aduana")! })),
      skipDuplicates: true,
    });
    console.log(`✅ "Encargado de sucursal" y "Recepcionista" ahora pueden entrar a Aduana.`);
  } else {
    console.log(`⚠️  No se encontraron los roles "Encargado de sucursal"/"Recepcionista" — ¿ya corriste seed-demo.ts para este tenant?`);
  }

  if (rolTecnico) {
    // Le quita "reparaciones"/"pos" (el molde viejo de mostrador) y le deja
    // "taller" + lo mínimo que ya trae MATRIZ del rubro (clientes/catalogo/
    // inventario) — mismo criterio que ROLES_SUGERIDOS_RUBRO.reparacion_
    // celulares."Técnico reparador" en lib/roles-rubro.ts.
    const permisosAQuitar = await prisma.permission.findMany({
      where: { module: { in: ["reparaciones", "pos"] } },
      select: { id: true },
    });
    await prisma.rolePermission.deleteMany({
      where: { roleId: rolTecnico.id, permissionId: { in: permisosAQuitar.map((p) => p.id) } },
    });
    await prisma.rolePermission.createMany({
      data: ["taller", "clientes", "catalogo", "inventario"].map((m) => ({ roleId: rolTecnico.id, permissionId: idPermiso.get(m)! })),
      skipDuplicates: true,
    });
    console.log(`✅ "Técnico reparador" corregido: ahora usa el módulo "taller" (antes "reparaciones"/"pos").`);
  } else {
    console.log(`⚠️  No se encontró el rol "Técnico reparador" — ¿ya corriste seed-demo.ts para este tenant?`);
  }

  // ── 2) Un "Jefe de técnicos" de ejemplo (verTodoTaller) — se promueve a
  // Kevin Loera (Sucursal Centro, el segundo técnico de esa tienda) para
  // no dejar ninguna sucursal sin su técnico de piso. ──────────────────
  const kevin = await prisma.staff.findFirst({ where: { tenantId: tenant.id, name: "Kevin Loera" }, select: { id: true, roleId: true, position: true } });
  if (kevin && rolTecnico && kevin.roleId === rolTecnico.id) {
    const rolJefe = await prisma.role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: "Jefe de técnicos" } },
      update: {},
      create: { tenantId: tenant.id, name: "Jefe de técnicos", description: "Ve todas las reparaciones asignadas del taller, sin poder editarlas.", isSystem: false, verTodoTaller: true },
      select: { id: true, _count: { select: { permissions: true } } },
    });
    if (rolJefe._count.permissions === 0) {
      await prisma.rolePermission.createMany({
        data: ["taller", "clientes", "catalogo", "inventario"].map((m) => ({ roleId: rolJefe.id, permissionId: idPermiso.get(m)! })),
        skipDuplicates: true,
      });
    }
    await prisma.staff.update({ where: { id: kevin.id }, data: { roleId: rolJefe.id, position: "Jefe de técnicos" } });
    console.log(`✅ Kevin Loera (Sucursal Centro) promovido a "Jefe de técnicos" (ve todo el taller, sin editar).`);
  } else {
    console.log(`ℹ️  Kevin Loera ya no tiene el rol "Técnico reparador" (o no existe) — se deja como está, no se toca dos veces.`);
  }

  // ── 3) Reparaciones nuevas, una por cada uno de los 8 estatus reales,
  // en TODAS las sucursales (no una al azar). ──────────────────────────
  const clientes = await prisma.customer.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true } });
  if (clientes.length === 0) {
    console.log("⚠️  El tenant no tiene clientes — nada que sembrar en Reparaciones.");
    return;
  }

  const productos = await prisma.product.findMany({
    where: { tenantId: tenant.id, type: { in: [ProductType.PART, ProductType.SERVICE] }, isActive: true },
    select: { id: true, name: true, price: true, type: true },
  });
  const partes = productos.filter((p) => p.type === ProductType.PART);
  const servicios = productos.filter((p) => p.type === ProductType.SERVICE);
  if (partes.length === 0 && servicios.length === 0) {
    console.log("⚠️  El tenant no tiene piezas ni servicios en el catálogo — nada que sembrar en Reparaciones.");
    return;
  }

  // Técnicos y personal de tienda por sucursal, ya con los roles corregidos
  // arriba (findMany fresco, no reutiliza el `rolTecnico` de antes — Kevin
  // Loera ya no cuenta como técnico "normal" tras la promoción).
  const permisoTaller = await prisma.permission.findUnique({ where: { module_action: { module: "taller", action: "acceso" } }, select: { id: true } });
  const rolesConTaller = permisoTaller
    ? (await prisma.rolePermission.findMany({ where: { permissionId: permisoTaller.id }, select: { roleId: true } })).map((r) => r.roleId)
    : [];
  const tecnicosPorSucursal = await prisma.staff.findMany({
    where: { tenantId: tenant.id, roleId: { in: rolesConTaller }, isActive: true },
    select: { id: true, branchId: true, name: true, role: { select: { name: true } } },
  });

  const staffTienda = await prisma.staff.findMany({
    where: { tenantId: tenant.id, roleId: { in: [rolEncargado?.id, rolRecepcionista?.id].filter((x): x is string => Boolean(x)) } },
    select: { id: true, branchId: true, userId: true },
  });

  let totalCreadas = 0;

  for (let bi = 0; bi < branches.length; bi++) {
    const branch = branches[bi];
    const tecnicoSucursal = tecnicosPorSucursal.find((t) => t.branchId === branch.id) ?? null;
    const personaTienda = staffTienda.find((s) => s.branchId === branch.id && s.userId) ?? null;
    if (!personaTienda?.userId) {
      console.log(`⚠️  Sucursal "${branch.name}" sin personal de tienda con cuenta de atribución — se omite.`);
      continue;
    }

    // Ya sembradas por una corrida anterior de este mismo script — se
    // detecta por el marcador en Repair.notes, para que volver a correrlo
    // no duplique.
    const yaExistentes = await prisma.repair.findMany({
      where: { tenantId: tenant.id, branchId: branch.id, notes: MARCADOR_SEED },
      select: { status: true },
    });
    const estatusYaCubiertos = new Set(yaExistentes.map((r) => r.status));

    // Folio — continúa la secuencia REP-{code}-NNNN que ya use esta
    // sucursal (mismo criterio que crearReparacionAction).
    const prefijo = branch.code ? `REP-${branch.code}-` : "REP-";
    const patron = branch.code ? new RegExp(`^REP-${branch.code}-(\\d+)$`) : /^REP-(\d+)$/;
    const ultima = await prisma.repair.findFirst({
      where: branch.code ? { tenantId: tenant.id, branchId: branch.id } : { tenantId: tenant.id, branch: { code: null } },
      orderBy: { receivedAt: "desc" },
      select: { folio: true },
    });
    let siguienteNum = 1;
    const m = ultima?.folio.match(patron);
    if (m) siguienteNum = parseInt(m[1], 10) + 1;

    for (let ei = 0; ei < ESTATUS_DEMO.length; ei++) {
      const { estado, diasAtras } = ESTATUS_DEMO[ei];
      if (estatusYaCubiertos.has(estado)) continue; // idempotente

      const seed = bi * 8 + ei;
      const cliente = pick(clientes, seed);
      const dispositivo = pick(DISPOSITIVOS, seed);
      const falla = pick(FALLAS, seed);
      const parte = partes.length ? pick(partes, seed) : null;
      const servicio = servicios.length ? pick(servicios, seed + 1) : null;
      const costoEstimado = Number(parte?.price ?? 0) + Number(servicio?.price ?? 0) || 300;
      const entregado = estado === RepairStatus.DELIVERED;
      const asignado = estado !== RepairStatus.RECEIVED; // el recién recibido aún no se asigna, mismo criterio que la app real
      const folio = `${prefijo}${String(siguienteNum++).padStart(4, "0")}`;

      const receivedAt = fechaHaceDias(diasAtras + 1, "10:15");

      const repair = await prisma.repair.create({
        data: {
          tenantId: tenant.id, branchId: branch.id, customerId: cliente.id, userId: personaTienda.userId,
          folio, deviceBrand: dispositivo.brand, deviceModel: dispositivo.model, issueDesc: falla,
          status: estado, priority: pick([Priority.NORMAL, Priority.NORMAL, Priority.HIGH, Priority.LOW], seed),
          estimatedCost: costoEstimado, finalCost: entregado ? costoEstimado : null,
          receivedAt, estimatedAt: entregado ? null : fechaHaceDias(Math.max(diasAtras - 3, 0), "18:00"),
          deliveredAt: entregado ? fechaHaceDias(diasAtras, "17:30") : null,
          notes: MARCADOR_SEED,
        },
      });

      if (parte) await prisma.repairItem.create({ data: { repairId: repair.id, productId: parte.id, quantity: 1, price: parte.price } });
      if (servicio) await prisma.repairItem.create({ data: { repairId: repair.id, productId: servicio.id, quantity: 1, price: servicio.price } });

      // Historial encadenado — igual que iría acumulándose en la app real
      // (crearReparacionAction → asignarTecnicoAction → avanzarEstadoAction*
      // → cobrarYEntregarAction), no un solo brinco directo al estatus final.
      await prisma.repairHistory.create({
        data: { repairId: repair.id, status: RepairStatus.RECEIVED, notes: "Equipo recibido en taller", visibleCliente: true, createdAt: receivedAt },
      });

      if (asignado && tecnicoSucursal) {
        await prisma.repairHistory.create({
          data: {
            repairId: repair.id, status: RepairStatus.RECEIVED,
            notes: `Asignado a ${tecnicoSucursal.role?.name ?? "Técnico reparador"}`,
            visibleCliente: true, createdAt: fechaHaceDias(diasAtras + 1, "11:00"),
          },
        });
        await prisma.repair.update({ where: { id: repair.id }, data: { assignedToStaffId: tecnicoSucursal.id } });
      }

      // Un solo ejemplo de "mensaje del taller" para el cliente en toda la
      // corrida (Sucursal Centro, estatus WAITING_PARTS) — para mostrar la
      // tarjeta destacada en /rep/[token] sin repetirla en cada reparación.
      if (bi === 0 && estado === RepairStatus.WAITING_PARTS) {
        await prisma.repairHistory.create({
          data: {
            repairId: repair.id, status: estado,
            notes: "Alerta del técnico: Necesitamos tu autorización para cambiar la pantalla, el precio subió $50",
            visibleCliente: true, createdAt: fechaHaceDias(diasAtras, "12:30"),
          },
        });
      }

      if (estado !== RepairStatus.RECEIVED) {
        const nota = NOTA_POR_ESTADO[estado];
        if (nota) {
          await prisma.repairHistory.create({
            data: { repairId: repair.id, status: estado, notes: nota, visibleCliente: true, createdAt: fechaHaceDias(diasAtras, "16:00") },
          });
        }
      }

      if (entregado) {
        await prisma.repairHistory.create({
          data: {
            repairId: repair.id, status: RepairStatus.DELIVERED,
            notes: `Cobro registrado: ${costoEstimado.toLocaleString("es-MX", { style: "currency", currency: "MXN" })} (efectivo) — equipo entregado al cliente`,
            visibleCliente: true, createdAt: fechaHaceDias(diasAtras, "17:30"),
          },
        });
      }

      totalCreadas++;
    }
    console.log(`✅ Sucursal "${branch.name}": reparaciones de ejemplo sembradas (o ya existían de una corrida anterior).`);
  }

  console.log(`\nListo — ${totalCreadas} reparación(es) nueva(s) creada(s) en "${tenant.name}", repartidas en las ${branches.length} sucursales.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
