"use server";

import { prisma, getTenantPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { resolverActor, puedeOperarSucursal } from "@/lib/actor";
import { MAX_CAMBIOS_LOTE, STOCK_MAXIMO } from "@/lib/captura-stock";

/**
 * Server Action que persiste un ajuste de stock. Es intencionalmente
 * simple por ahora: actualiza Inventory.stock directamente y no deja
 * bitácora — a diferencia de Caja, que sí tiene CashMovement como
 * historial de cada entrada/salida.
 *
 * Si más adelante se quiere auditoría de inventario (quién ajustó qué,
 * cuándo y por qué), el siguiente paso natural es un modelo
 * StockMovement análogo a CashMovement.
 *
 * Nota de seguridad: antes de este cambio, esta función no verificaba en
 * absoluto que productId/branchId pertenecieran al tenant que dice estar
 * haciendo el ajuste — Inventory no tiene tenantId propio (se llega a su
 * tenant vía Product o Branch), así que quedaba fuera del alcance de
 * getTenantPrisma a menos que se verifique explícitamente. Ahora sí se
 * verifica: se resuelve el tenant real por su slug y se usa
 * getTenantPrisma para leer Product y Branch (ambos SÍ tienen tenantId
 * propio) — si cualquiera de los dos no pertenece a este tenant, la
 * extensión lanza "Acceso denegado" antes de tocar Inventory.
 */

export type AjusteTipo = "entrada" | "salida" | "ajuste";

export async function ajustarStock(params: {
  tenantSlug: string;
  productId: string;
  branchId: string;
  tipo: AjusteTipo;
  cantidad: number;
}): Promise<
  | {
      ok: true;
      nuevoStock: number;
      // 2026-10-05, a petición de Carlos (auditoría de Inventario): cuánto se
      // descontó DE VERDAD en una "salida" — antes, pedir descontar más de lo
      // que había disponible se recortaba en silencio a 0 sin que el
      // empleado se enterara de que no se quitó la cantidad completa que
      // tecleó. Igual a `cantidad` en "entrada"/"ajuste" (ahí nunca hay
      // recorte); en "salida" puede ser menor que `cantidad` si el stock
      // disponible no alcanzaba.
      cantidadAplicada: number;
    }
  | { ok: false; error: string }
> {
  const { tenantSlug, productId, branchId, tipo, cantidad } = params;

  if (!Number.isFinite(cantidad) || cantidad < 0) {
    return { ok: false, error: "Cantidad inválida" };
  }
  if (!branchId) {
    return { ok: false, error: "Selecciona una sucursal" };
  }

  // Hallazgo al conectar este archivo a las sesiones de PIN de personal
  // (M11): esta acción tampoco validaba ninguna sesión, solo el tenantSlug
  // — se cierra aquí de paso. Gerente tiene "inventario" en su matriz de
  // acceso (lib/roles.ts), Cajero y Técnico no.
  const resuelto = await resolverActor(tenantSlug, "inventario");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  // 2026-09-21, a petición de Carlos: un empleado de PIN solo puede
  // ajustar stock de SU sucursal.
  if (!puedeOperarSucursal(resuelto, branchId)) {
    return { ok: false, error: "No tienes acceso a esa sucursal" };
  }

  const db = getTenantPrisma(tenant.id);

  try {
    // findUnique en un modelo con tenantId propio valida ownership solo —
    // si el producto o la sucursal son de otro tenant, esto truena antes
    // de llegar al upsert de Inventory.
    const [product, branch] = await Promise.all([
      db.product.findUnique({ where: { id: productId }, select: { id: true } }),
      db.branch.findUnique({ where: { id: branchId }, select: { id: true } }),
    ]);
    if (!product) return { ok: false, error: "Producto no encontrado" };
    if (!branch) return { ok: false, error: "Sucursal no encontrada" };
  } catch {
    return { ok: false, error: "No tienes acceso a este producto o sucursal" };
  }

  const existing = await prisma.inventory.findUnique({
    where: { productId_branchId: { productId, branchId } },
  });

  const stockPrevio = existing?.stock ?? 0;
  let nuevoStock: number;
  // cantidadAplicada: igual a `cantidad` salvo en "salida" cuando el stock
  // disponible no alcanza — ahí es lo que de verdad se pudo descontar
  // (stockPrevio, nunca negativo), para que el llamador pueda avisar que no
  // se quitó la cantidad completa pedida.
  let cantidadAplicada = cantidad;
  if (tipo === "entrada") {
    nuevoStock = stockPrevio + cantidad;
  } else if (tipo === "salida") {
    nuevoStock = Math.max(0, stockPrevio - cantidad);
    cantidadAplicada = stockPrevio - nuevoStock;
  } else {
    nuevoStock = cantidad; // "ajuste" fija el valor absoluto
  }

  await prisma.inventory.upsert({
    where: { productId_branchId: { productId, branchId } },
    update: { stock: nuevoStock },
    create: { productId, branchId, stock: nuevoStock, minStock: existing?.minStock ?? 0 },
  });

  revalidatePath(`/${tenantSlug}/inventario`);
  revalidatePath(`/${tenantSlug}/dashboard`);

  return { ok: true, nuevoStock, cantidadAplicada };
}

/**
 * Captura rápida de stock (2026-10-10, a petición de Carlos): fija el stock
 * de VARIOS productos de UNA sucursal en un solo guardado. Cada `stock` es el
 * valor nuevo total (mismo significado que el tipo "ajuste" de
 * ajustarStock), no una suma. Mismas reglas de acceso que ajustarStock:
 * módulo "inventario", sucursal permitida para el actor, y producto y
 * sucursal verificados contra el tenant (findMany/findUnique de
 * getTenantPrisma filtran por tenantId).
 *
 * No es todo-o-nada: un producto inválido o ajeno no tumba a los demás. Los
 * válidos se guardan en una sola transacción y los que no se pudieron
 * aplicar vuelven en `fallidos` para que el empleado los vea sin perder el
 * resto de lo capturado. Igual que ajustarStock, no deja bitácora de
 * movimientos de inventario.
 */
export async function ajustarStockLote(params: {
  tenantSlug: string;
  branchId: string;
  cambios: { productId: string; stock: number }[];
}): Promise<
  | { ok: true; aplicados: number; fallidos: { productId: string; error: string }[] }
  | { ok: false; error: string }
> {
  const { tenantSlug, branchId, cambios } = params;

  if (!branchId) return { ok: false, error: "Selecciona una sucursal" };
  if (!Array.isArray(cambios) || cambios.length === 0) {
    return { ok: false, error: "No hay cambios que guardar" };
  }
  if (cambios.length > MAX_CAMBIOS_LOTE) {
    return { ok: false, error: `Máximo ${MAX_CAMBIOS_LOTE} productos por guardado — guarda y sigue con los demás.` };
  }

  const resuelto = await resolverActor(tenantSlug, "inventario");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  if (!puedeOperarSucursal(resuelto, branchId)) {
    return { ok: false, error: "No tienes acceso a esa sucursal" };
  }

  const db = getTenantPrisma(tenant.id);

  try {
    const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!branch) return { ok: false, error: "Sucursal no encontrada" };
  } catch {
    return { ok: false, error: "No tienes acceso a esa sucursal" };
  }

  // Si un producto viene repetido, gana el último valor.
  const porProducto = new Map<string, number>();
  for (const c of cambios) porProducto.set(c.productId, c.stock);

  const fallidos: { productId: string; error: string }[] = [];
  const candidatos: { productId: string; stock: number }[] = [];
  for (const [productId, stock] of porProducto) {
    if (!Number.isInteger(stock) || stock < 0 || stock > STOCK_MAXIMO) {
      fallidos.push({ productId, error: "Cantidad inválida" });
    } else {
      candidatos.push({ productId, stock });
    }
  }

  const existentes = await db.product.findMany({
    where: { id: { in: candidatos.map((c) => c.productId) } },
    select: { id: true },
  });
  const idsValidos = new Set(existentes.map((e) => e.id));
  const aplicar = candidatos.filter((c) => {
    if (idsValidos.has(c.productId)) return true;
    fallidos.push({ productId: c.productId, error: "Producto no encontrado" });
    return false;
  });

  if (aplicar.length > 0) {
    // minStock solo se fija al CREAR el registro de inventario (0); en los que
    // ya existen se conserva el que tenían, igual que ajustarStock.
    await prisma.$transaction(
      aplicar.map((c) =>
        prisma.inventory.upsert({
          where: { productId_branchId: { productId: c.productId, branchId } },
          update: { stock: c.stock },
          create: { productId: c.productId, branchId, stock: c.stock, minStock: 0 },
        })
      )
    );
    revalidatePath(`/${tenantSlug}/inventario`);
    revalidatePath(`/${tenantSlug}/dashboard`);
  }

  return { ok: true, aplicados: aplicar.length, fallidos };
}
