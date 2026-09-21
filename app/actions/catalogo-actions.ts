"use server";

import { prisma, getTenantPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCatalogoArranque } from "@/lib/catalogo-arranque";
import { resolverActor, type ActorResult } from "@/lib/actor";

/**
 * Server Actions del módulo Catálogo (M6). Antes de este cambio no existía
 * ningún actions.ts para este módulo — tanto el botón "Nuevo" del sidebar
 * como la tarjeta punteada "Agregar" eran decorativos, y no había forma de
 * editar un producto ya creado ni de dar de alta una categoría nueva desde
 * la UI (solo existían las que trajera el seed).
 *
 * Mismo criterio que en clientes-actions.ts / sucursales-actions.ts:
 * resolverTenantYUsuario duplicado localmente, retorno discriminado
 * {ok:true,...}|{ok:false,error}.
 *
 * Nota sobre Inventory (el stock por sucursal): un producto/refacción
 * recién creado (por cualquiera de las 3 formas de esta pantalla — alta
 * manual, catálogo de arranque, importación CSV/Excel) arranca con
 * existencia en cada sucursal activa del negocio, en vez de 0 (a petición
 * de Carlos, 2026-09-16 — mostrar "Agotado" apenas se da de alta un
 * producto resultaba confuso). La cantidad inicial es 1 por default, pero
 * en el alta manual el propio formulario deja capturarla (a petición de
 * Carlos, 2026-09-21 — antes el default de 1 quedaba oculto y había que ir
 * a Inventario después a corregirlo, "no veo lógica en crear un artículo y
 * después ir a otra ventana a darle existencias"). El catálogo de arranque
 * y la importación CSV/Excel siguen usando el default de 1 (no tienen un
 * campo por fila para esto todavía). Editar un producto ya existente sigue
 * sin tocar Inventory. Los servicios (type SERVICE) no llevan stock, así
 * que no reciben fila de Inventory. El movimiento real de stock de ahí en
 * adelante sigue el mismo camino de siempre: recibir una Compra lo
 * incrementa (compras-actions.ts), venderlo lo descuenta (pos-actions.ts),
 * y Inventario permite ajustarlo a mano (inventario-actions.ts).
 *
 * Nota sobre "existencia por sucursal": si el negocio tiene más de una
 * sucursal activa, la existencia capturada se replica igual en TODAS
 * (mismo criterio que ya existía) — no es un total repartido. Un negocio
 * con 2 sucursales y existencia inicial "1" termina con 1 en cada una (2
 * en total al sumarlas en Inventario), eso es esperado, no un bug.
 */

type ResolverResult = ActorResult;

// Delega en resolverActor (lib/actor.ts) — Gerente tiene "catalogo" en su
// matriz de acceso (lib/roles.ts), Cajero y Técnico no (ellos venden desde
// POS/Reparaciones, que traen su propio selector de productos, no
// necesitan la pantalla de gestión del catálogo).
async function resolverTenantYUsuario(tenantSlug: string): Promise<ResolverResult> {
  return resolverActor(tenantSlug, "catalogo");
}

const STOCK_INICIAL_DEFAULT = 1;

// Da de alta la fila de Inventory (stock inicial) de un producto recién
// creado en cada sucursal activa del tenant. No se llama para type
// SERVICE (los servicios no llevan stock) ni al editar un producto ya
// existente (ver nota arriba). `db` debe ser el mismo cliente escopado al
// tenant (getTenantPrisma) que ya se usó para crear el producto.
async function crearInventarioInicial(
  db: ReturnType<typeof getTenantPrisma>,
  productId: string,
  branchIds: string[],
  stock: number = STOCK_INICIAL_DEFAULT
): Promise<void> {
  if (branchIds.length === 0) return;
  await db.inventory.createMany({
    data: branchIds.map((branchId) => ({ productId, branchId, stock })),
  });
}

function manejarErrorAcceso(err: any, mensajeGenerico: string): { ok: false; error: string } {
  if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
    return { ok: false, error: "No tienes acceso a este recurso" };
  }
  console.error(mensajeGenerico, err);
  return { ok: false, error: mensajeGenerico };
}

export type TipoProductoInput = "PRODUCT" | "PART" | "SERVICE";

export interface DatosProducto {
  name: string;
  sku?: string | null;
  price: number;
  cost?: number | null;
  type: TipoProductoInput;
  categoryId?: string | null;
  emoji?: string | null;
}

function validarDatosProducto(datos: DatosProducto): string | null {
  if (!datos.name?.trim()) return "El nombre es obligatorio";
  if (!Number.isFinite(datos.price) || datos.price <= 0) return "El precio debe ser mayor a cero";
  if (datos.cost != null && (!Number.isFinite(datos.cost) || datos.cost < 0)) return "El costo no puede ser negativo";
  if (!["PRODUCT", "PART", "SERVICE"].includes(datos.type)) return "Tipo de producto inválido";
  return null;
}

export type AccionProductoResult = { ok: true; id: string } | { ok: false; error: string };

export async function crearProductoAction(
  params: { tenantSlug: string; stockInicial?: number } & DatosProducto
): Promise<AccionProductoResult> {
  const { tenantSlug, stockInicial, ...datos } = params;
  const errorValidacion = validarDatosProducto(datos);
  if (errorValidacion) return { ok: false, error: errorValidacion };
  if (stockInicial != null && (!Number.isFinite(stockInicial) || stockInicial < 0)) {
    return { ok: false, error: "La existencia inicial no puede ser negativa" };
  }

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    if (datos.sku?.trim()) {
      const existente = await db.product.findFirst({ where: { sku: datos.sku.trim() }, select: { id: true } });
      if (existente) return { ok: false, error: `Ya existe un producto con el SKU "${datos.sku.trim()}"` };
    }

    const nuevo = await db.product.create({
      data: {
        tenantId: tenant.id,
        name: datos.name.trim(),
        sku: datos.sku?.trim() || null,
        price: datos.price,
        cost: datos.cost ?? null,
        type: datos.type,
        categoryId: datos.categoryId || null,
        emoji: datos.emoji?.trim() || null,
      },
    });

    if (datos.type !== "SERVICE") {
      const sucursalesActivas = await db.branch.findMany({ where: { isActive: true }, select: { id: true } });
      await crearInventarioInicial(
        db,
        nuevo.id,
        sucursalesActivas.map((b) => b.id),
        stockInicial ?? STOCK_INICIAL_DEFAULT
      );
    }

    revalidatePath(`/${tenantSlug}/catalogo`);
    revalidatePath(`/${tenantSlug}/inventario`);
    return { ok: true, id: nuevo.id };
  } catch (err: any) {
    return manejarErrorAcceso(err, "No se pudo registrar el producto");
  }
}

export async function editarProductoAction(
  params: { tenantSlug: string; productId: string; isActive: boolean } & DatosProducto
): Promise<AccionProductoResult> {
  const { tenantSlug, productId, isActive, ...datos } = params;
  const errorValidacion = validarDatosProducto(datos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const existente = await db.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!existente) return { ok: false, error: "Producto no encontrado" };

    if (datos.sku?.trim()) {
      const duplicado = await db.product.findFirst({
        where: { sku: datos.sku.trim(), NOT: { id: productId } },
        select: { id: true },
      });
      if (duplicado) return { ok: false, error: `Ya existe otro producto con el SKU "${datos.sku.trim()}"` };
    }

    await db.product.update({
      where: { id: productId },
      data: {
        name: datos.name.trim(),
        sku: datos.sku?.trim() || null,
        price: datos.price,
        cost: datos.cost ?? null,
        type: datos.type,
        categoryId: datos.categoryId || null,
        emoji: datos.emoji?.trim() || null,
        isActive,
      },
    });

    revalidatePath(`/${tenantSlug}/catalogo`);
    revalidatePath(`/${tenantSlug}/inventario`);
    return { ok: true, id: productId };
  } catch (err: any) {
    return manejarErrorAcceso(err, "No se pudo actualizar el producto");
  }
}

export interface DatosCategoria {
  name: string;
  type: TipoProductoInput;
  color?: string | null;
}

export type AccionCategoriaResult = { ok: true; id: string } | { ok: false; error: string };

export async function crearCategoriaAction(
  params: { tenantSlug: string } & DatosCategoria
): Promise<AccionCategoriaResult> {
  const { tenantSlug, ...datos } = params;
  if (!datos.name?.trim()) return { ok: false, error: "El nombre de la categoría es obligatorio" };
  if (!["PRODUCT", "PART", "SERVICE"].includes(datos.type)) return { ok: false, error: "Tipo de categoría inválido" };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const nueva = await db.category.create({
      data: {
        tenantId: tenant.id,
        name: datos.name.trim(),
        type: datos.type,
        color: datos.color?.trim() || null,
      },
    });

    revalidatePath(`/${tenantSlug}/catalogo`);
    return { ok: true, id: nueva.id };
  } catch (err: any) {
    return manejarErrorAcceso(err, "No se pudo crear la categoría");
  }
}

/**
 * Onboarding: carga de un lote de productos/servicios de ejemplo según el
 * rubro del negocio (lib/catalogo-arranque.ts). Pensada para un negocio
 * recién registrado que todavía no tiene nada que vender — por eso exige
 * que el catálogo esté vacío (mismo criterio que el resto del proyecto de
 * no fabricar/duplicar datos): si ya tiene productos, no hace nada y
 * regresa error en vez de mezclar ejemplos con su catálogo real.
 *
 * Las categorías se reutilizan por nombre+tipo si el negocio ya las tenía
 * (poco probable con catálogo vacío, pero no cuesta nada ser defensivo);
 * si no existen, se crean junto con los productos.
 */
export type AccionCatalogoArranqueResult = { ok: true; creados: number } | { ok: false; error: string };

export async function cargarCatalogoArranqueAction(
  params: { tenantSlug: string }
): Promise<AccionCatalogoArranqueResult> {
  const { tenantSlug } = params;

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const totalProductos = await db.product.count();
    if (totalProductos > 0) {
      return { ok: false, error: "Tu catálogo ya tiene productos — esto es solo para arrancar desde cero." };
    }

    const tenantRow = await prisma.tenant.findUnique({ where: { id: tenant.id }, select: { businessType: true } });
    const items = getCatalogoArranque(tenantRow?.businessType ?? null);
    if (items.length === 0) {
      return { ok: false, error: "Todavía no hay un catálogo de ejemplo preparado para tu giro." };
    }

    const categoriaCache = new Map<string, string>();
    const sucursalesActivas = await db.branch.findMany({ where: { isActive: true }, select: { id: true } });
    const branchIds = sucursalesActivas.map((b) => b.id);

    for (const item of items) {
      const cacheKey = `${item.categoryName}::${item.categoryType}`;
      let categoryId = categoriaCache.get(cacheKey);

      if (!categoryId) {
        const existente = await db.category.findFirst({
          where: { name: item.categoryName, type: item.categoryType },
          select: { id: true },
        });
        if (existente) {
          categoryId = existente.id;
        } else {
          const nueva = await db.category.create({
            data: { tenantId: tenant.id, name: item.categoryName, type: item.categoryType },
          });
          categoryId = nueva.id;
        }
        categoriaCache.set(cacheKey, categoryId);
      }

      const nuevo = await db.product.create({
        data: {
          tenantId: tenant.id,
          categoryId,
          name: item.name,
          type: item.type,
          price: item.price,
          cost: item.cost ?? null,
          emoji: item.emoji ?? null,
        },
      });

      if (item.type !== "SERVICE") {
        await crearInventarioInicial(db, nuevo.id, branchIds);
      }
    }

    revalidatePath(`/${tenantSlug}/catalogo`);
    revalidatePath(`/${tenantSlug}/inventario`);
    revalidatePath(`/${tenantSlug}/bienvenida`);
    return { ok: true, creados: items.length };
  } catch (err: any) {
    return manejarErrorAcceso(err, "No se pudo cargar el catálogo de ejemplo");
  }
}

/**
 * Importación masiva desde CSV/Excel (para un negocio que migra de otro
 * sistema y ya tiene su catálogo armado). El parseo del archivo sucede en
 * el cliente (CatalogoClient.tsx) — aquí solo se reciben filas ya
 * estructuradas y se valida/crea una por una, sin tronar el lote completo
 * por una fila mala: cada fila inválida o duplicada se omite y se reporta,
 * el resto sí se crea. Igual que cargarCatalogoArranqueAction, las
 * categorías se resuelven por nombre+tipo (se crean si no existen).
 */
export interface FilaImportacion {
  fila: number; // número de fila en el archivo original, para el reporte
  name: string;
  type: TipoProductoInput;
  price: number;
  cost?: number | null;
  sku?: string | null;
  categoryName?: string | null;
}

export type AccionImportarResult =
  | { ok: true; creados: number; omitidos: { fila: number; motivo: string }[] }
  | { ok: false; error: string };

const MAX_FILAS_IMPORTACION = 500;

export async function importarProductosAction(
  params: { tenantSlug: string; filas: FilaImportacion[] }
): Promise<AccionImportarResult> {
  const { tenantSlug, filas } = params;

  if (!Array.isArray(filas) || filas.length === 0) {
    return { ok: false, error: "No hay filas para importar" };
  }
  if (filas.length > MAX_FILAS_IMPORTACION) {
    return { ok: false, error: `Máximo ${MAX_FILAS_IMPORTACION} filas por archivo — divide tu importación en lotes más chicos.` };
  }

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  const omitidos: { fila: number; motivo: string }[] = [];
  let creados = 0;
  const categoriaCache = new Map<string, string>();
  // Evita crear dos productos con el mismo SKU dentro del propio archivo
  // (además de la verificación contra los que ya existen en BD).
  const skusEnLote = new Set<string>();
  const sucursalesActivas = await db.branch.findMany({ where: { isActive: true }, select: { id: true } });
  const branchIds = sucursalesActivas.map((b) => b.id);

  try {
    for (const fila of filas) {
      const nombre = fila.name?.trim();
      if (!nombre) {
        omitidos.push({ fila: fila.fila, motivo: "Falta el nombre" });
        continue;
      }
      if (!["PRODUCT", "PART", "SERVICE"].includes(fila.type)) {
        omitidos.push({ fila: fila.fila, motivo: "Tipo inválido (usa Producto, Refacción o Servicio)" });
        continue;
      }
      if (!Number.isFinite(fila.price) || fila.price <= 0) {
        omitidos.push({ fila: fila.fila, motivo: "Precio inválido" });
        continue;
      }
      if (fila.cost != null && (!Number.isFinite(fila.cost) || fila.cost < 0)) {
        omitidos.push({ fila: fila.fila, motivo: "Costo inválido" });
        continue;
      }

      const sku = fila.sku?.trim() || null;
      if (sku) {
        if (skusEnLote.has(sku)) {
          omitidos.push({ fila: fila.fila, motivo: `SKU "${sku}" repetido en el archivo` });
          continue;
        }
        const existente = await db.product.findFirst({ where: { sku }, select: { id: true } });
        if (existente) {
          omitidos.push({ fila: fila.fila, motivo: `Ya existe un producto con el SKU "${sku}"` });
          continue;
        }
        skusEnLote.add(sku);
      }

      let categoryId: string | null = null;
      const categoryName = fila.categoryName?.trim();
      if (categoryName) {
        const cacheKey = `${categoryName}::${fila.type}`;
        categoryId = categoriaCache.get(cacheKey) ?? null;
        if (!categoryId) {
          const existenteCat = await db.category.findFirst({
            where: { name: categoryName, type: fila.type },
            select: { id: true },
          });
          if (existenteCat) {
            categoryId = existenteCat.id;
          } else {
            const nuevaCat = await db.category.create({
              data: { tenantId: tenant.id, name: categoryName, type: fila.type },
            });
            categoryId = nuevaCat.id;
          }
          categoriaCache.set(cacheKey, categoryId);
        }
      }

      const nuevo = await db.product.create({
        data: {
          tenantId: tenant.id,
          categoryId,
          name: nombre,
          sku,
          type: fila.type,
          price: fila.price,
          cost: fila.cost ?? null,
        },
      });

      if (fila.type !== "SERVICE") {
        await crearInventarioInicial(db, nuevo.id, branchIds);
      }

      creados++;
    }

    if (creados > 0) {
      revalidatePath(`/${tenantSlug}/catalogo`);
      revalidatePath(`/${tenantSlug}/inventario`);
    }

    return { ok: true, creados, omitidos };
  } catch (err: any) {
    return manejarErrorAcceso(err, "No se pudo completar la importación") as AccionImportarResult;
  }
}
