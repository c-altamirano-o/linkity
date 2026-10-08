"use server";

import { getTenantPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { resolverActor, type ActorResult } from "@/lib/actor";

/**
 * Server Actions del módulo de Descuentos (M18 — admin, 2026-10-01).
 *
 * getActiveDiscounts ya existía (Carlos la escribió a mano junto con todo el
 * cálculo de descuentos en POS) — se deja tal cual su firma/comportamiento
 * (la sigue llamando pos/page.tsx), solo se migra de `prisma` a
 * `getTenantPrisma` para que quede protegida por el mismo filtro automático
 * que el resto del proyecto (ver el comentario largo en lib/prisma.ts sobre
 * por qué "Discount" se agregó a esa lista) — no cambia qué regresa, nada más
 * cierra la misma clase de hueco de aislamiento multi-tenant que ya se había
 * encontrado antes con Appointment.
 *
 * Todo lo demás en este archivo es NUEVO: antes de esto no existía ninguna
 * forma de crear/editar/borrar un Discount desde la UI — Carlos solo podía
 * insertarlos a mano en la base de datos. Mismo criterio que
 * catalogo-actions.ts/clientes-actions.ts: resolverActor("configuracion")
 * al inicio de cada acción (Configuración ya es una sección que los roles
 * base NO le dan a Cajero/Técnico y ni siquiera a Gerente por default — ver
 * ROLES_DESCRIPCION_BASE en lib/roles.ts), retorno discriminado
 * {ok:true,...}|{ok:false,error}.
 */

type ResolverResult = ActorResult;

async function resolverTenantYUsuario(tenantSlug: string): Promise<ResolverResult> {
  return resolverActor(tenantSlug, "configuracion");
}

function manejarErrorAcceso(err: any, mensajeGenerico: string): { ok: false; error: string } {
  if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
    return { ok: false, error: "No tienes acceso a este recurso" };
  }
  console.error(mensajeGenerico, err);
  return { ok: false, error: mensajeGenerico };
}

// getActiveDiscounts se movió a lib/descuentos-activos.ts (2026-10-08): aquí
// todo lo exportado es una Server Action que cualquiera puede invocar por
// POST, y esta recibía el tenantId desde el cliente SIN verificar sesión —
// permitía leer los descuentos de cualquier negocio. Ahora solo la llama
// el servidor (pos/page.tsx) con el tenant ya resuelto.

export type TipoDescuentoInput = "SEASONAL" | "CUSTOMER" | "ONE_TIME";
export type TipoValorInput = "PERCENTAGE" | "FIXED";
export type AlcanceDescuentoInput = "SALE" | "PRODUCT" | "CATEGORY";

export interface DatosDescuento {
  name: string;
  code?: string | null;
  type: TipoDescuentoInput;
  valueType: TipoValorInput;
  scope: AlcanceDescuentoInput;
  value: number;
  minPurchase?: number | null;
  maxDiscount?: number | null;
  startsAt?: string | null; // ISO, de un <input type="date">
  endsAt?: string | null;
  usageLimit?: number | null;
  oncePerCustomer?: boolean;
  accumulable?: boolean;
  priority?: number;
  isActive?: boolean;
  // Solo tiene sentido cuando type === "CUSTOMER", pero no se fuerza en el
  // servidor — un admin podría querer, por ejemplo, un ONE_TIME atado a un
  // cliente puntual. Ver el comentario largo en pos-actions.ts/POSClient.tsx
  // sobre por qué esto SÍ se respeta ahora al cobrar (antes no se filtraba).
  customerId?: string | null;
  // Solo se usan cuando scope === "PRODUCT" / "CATEGORY" respectivamente —
  // se ignoran (y no se guarda ninguna fila de unión) para cualquier otro
  // scope, aunque vengan no vacíos por un remanente del formulario.
  productIds?: string[];
  categoryIds?: string[];
}

function validarDatosDescuento(datos: DatosDescuento): string | null {
  if (!datos.name?.trim()) return "El nombre es obligatorio";
  if (!["SEASONAL", "CUSTOMER", "ONE_TIME"].includes(datos.type)) return "Tipo de descuento inválido";
  if (!["PERCENTAGE", "FIXED"].includes(datos.valueType)) return "Tipo de valor inválido";
  if (!["SALE", "PRODUCT", "CATEGORY"].includes(datos.scope)) return "Alcance inválido";

  if (!Number.isFinite(datos.value) || datos.value <= 0) return "El valor del descuento debe ser mayor a cero";
  if (datos.valueType === "PERCENTAGE" && datos.value > 100) return "Un descuento en porcentaje no puede ser mayor a 100%";

  if (datos.minPurchase != null && (!Number.isFinite(datos.minPurchase) || datos.minPurchase < 0)) {
    return "La compra mínima no puede ser negativa";
  }
  if (datos.maxDiscount != null && (!Number.isFinite(datos.maxDiscount) || datos.maxDiscount <= 0)) {
    return "El tope máximo de descuento debe ser mayor a cero";
  }
  if (datos.usageLimit != null && (!Number.isInteger(datos.usageLimit) || datos.usageLimit <= 0)) {
    return "El límite de usos debe ser un número entero mayor a cero";
  }
  if (datos.priority != null && !Number.isInteger(datos.priority)) {
    return "La prioridad debe ser un número entero";
  }

  if (datos.startsAt && datos.endsAt) {
    const inicio = new Date(datos.startsAt);
    const fin = new Date(datos.endsAt);
    if (Number.isFinite(inicio.getTime()) && Number.isFinite(fin.getTime()) && fin < inicio) {
      return "La fecha de término no puede ser anterior a la fecha de inicio";
    }
  }

  if ((datos.scope === "PRODUCT") && (!datos.productIds || datos.productIds.length === 0)) {
    return "Elige al menos un producto para un descuento por producto";
  }
  if ((datos.scope === "CATEGORY") && (!datos.categoryIds || datos.categoryIds.length === 0)) {
    return "Elige al menos una categoría para un descuento por categoría";
  }

  return null;
}

// Catálogo liviano (solo id+name, sin montos ni stock) para los selectores
// de producto/categoría/cliente del formulario — a propósito un query propio
// y más angosto que getCatalogoData()/getClientesData() (esas traen mucho
// más de lo que este formulario necesita).
export type AccionCatalogoDescuentosResult =
  | { ok: true; productos: { id: string; name: string; categoryName: string }[]; categorias: { id: string; name: string }[]; clientes: { id: string; name: string; phone: string | null }[] }
  | { ok: false; error: string };

export async function obtenerCatalogoParaDescuentosAction(
  tenantSlug: string
): Promise<AccionCatalogoDescuentosResult> {
  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const [productosRaw, categorias, clientes] = await Promise.all([
      db.product.findMany({
        where: { isActive: true },
        select: { id: true, name: true, category: { select: { name: true } } },
        orderBy: { name: "asc" },
      }),
      db.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      db.customer.findMany({ select: { id: true, name: true, phone: true }, orderBy: { name: "asc" } }),
    ]);

    const productos = productosRaw.map((p) => ({ id: p.id, name: p.name, categoryName: p.category?.name ?? "Sin categoría" }));

    return { ok: true, productos, categorias, clientes };
  } catch (err: any) {
    return manejarErrorAcceso(err, "No se pudo cargar el catálogo para el formulario de descuentos");
  }
}

export type AccionListarDescuentosResult =
  | {
      ok: true;
      descuentos: {
        id: string;
        name: string;
        code: string | null;
        type: TipoDescuentoInput;
        valueType: TipoValorInput;
        scope: AlcanceDescuentoInput;
        value: number;
        minPurchase: number | null;
        maxDiscount: number | null;
        startsAt: string | null;
        endsAt: string | null;
        usageLimit: number | null;
        usageCount: number;
        oncePerCustomer: boolean;
        accumulable: boolean;
        priority: number;
        isActive: boolean;
        customerId: string | null;
        customerName: string | null;
        productIds: string[];
        categoryIds: string[];
      }[];
    }
  | { ok: false; error: string };

export async function listarDescuentosAction(tenantSlug: string): Promise<AccionListarDescuentosResult> {
  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const filas = await db.discount.findMany({
      include: {
        products: true,
        categories: true,
        customer: { select: { name: true } },
      },
      orderBy: [{ priority: "desc" }, { name: "asc" }],
    });

    const descuentos = filas.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      type: d.type as TipoDescuentoInput,
      valueType: d.valueType as TipoValorInput,
      scope: d.scope as AlcanceDescuentoInput,
      value: Number(d.value),
      minPurchase: d.minPurchase != null ? Number(d.minPurchase) : null,
      maxDiscount: d.maxDiscount != null ? Number(d.maxDiscount) : null,
      startsAt: d.startsAt ? d.startsAt.toISOString() : null,
      endsAt: d.endsAt ? d.endsAt.toISOString() : null,
      usageLimit: d.usageLimit,
      usageCount: d.usageCount,
      oncePerCustomer: d.oncePerCustomer,
      accumulable: d.accumulable,
      priority: d.priority,
      isActive: d.isActive,
      customerId: d.customerId,
      customerName: d.customer?.name ?? null,
      productIds: d.products.map((p) => p.productId),
      categoryIds: d.categories.map((c) => c.categoryId),
    }));

    return { ok: true, descuentos };
  } catch (err: any) {
    return manejarErrorAcceso(err, "No se pudieron cargar los descuentos") as AccionListarDescuentosResult;
  }
}

export type AccionDescuentoResult = { ok: true; id: string } | { ok: false; error: string };

// Arma el `data` compartido entre create/update a partir de DatosDescuento
// ya validado — evita repetir la misma lista larga de campos dos veces.
function datosParaGuardar(datos: DatosDescuento) {
  return {
    name: datos.name.trim(),
    code: datos.code?.trim() || null,
    type: datos.type,
    valueType: datos.valueType,
    scope: datos.scope,
    value: datos.value,
    minPurchase: datos.minPurchase ?? null,
    maxDiscount: datos.maxDiscount ?? null,
    startsAt: datos.startsAt ? new Date(datos.startsAt) : null,
    endsAt: datos.endsAt ? new Date(datos.endsAt) : null,
    usageLimit: datos.usageLimit ?? null,
    oncePerCustomer: datos.oncePerCustomer ?? false,
    accumulable: datos.accumulable ?? false,
    priority: datos.priority ?? 0,
    isActive: datos.isActive ?? true,
    customerId: datos.type === "CUSTOMER" ? (datos.customerId || null) : null,
  };
}

export async function crearDescuentoAction(
  params: { tenantSlug: string } & DatosDescuento
): Promise<AccionDescuentoResult> {
  const { tenantSlug, ...datos } = params;
  const errorValidacion = validarDatosDescuento(datos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    if (datos.code?.trim()) {
      const existente = await db.discount.findFirst({ where: { code: datos.code.trim() }, select: { id: true } });
      if (existente) return { ok: false, error: `Ya existe un descuento con el código "${datos.code.trim()}"` };
    }

    // tenantId se incluye a mano aquí (igual que crearProductoAction/
    // crearCategoriaAction en catalogo-actions.ts) aunque getTenantPrisma ya
    // lo vuelva a inyectar en tiempo de ejecución (ver el comentario largo en
    // lib/prisma.ts) — esa inyección pasa DENTRO del extends, después de que
    // TypeScript ya revisó la llamada, así que el tipo generado de
    // DiscountCreateInput/DiscountUncheckedCreateInput de todos modos exige
    // tenantId en el objeto que se escribe aquí o el build truena (como le
    // pasó a Carlos: "Property 'tenantId' is missing").
    const nuevo = await db.discount.create({ data: { ...datosParaGuardar(datos), tenantId: tenant.id } });

    if (datos.scope === "PRODUCT" && datos.productIds?.length) {
      await db.discountProduct.createMany({
        data: datos.productIds.map((productId) => ({ discountId: nuevo.id, productId })),
      });
    } else if (datos.scope === "CATEGORY" && datos.categoryIds?.length) {
      await db.discountCategory.createMany({
        data: datos.categoryIds.map((categoryId) => ({ discountId: nuevo.id, categoryId })),
      });
    }

    revalidatePath(`/${tenantSlug}/configuracion/descuentos`);
    revalidatePath(`/${tenantSlug}/pos`);
    return { ok: true, id: nuevo.id };
  } catch (err: any) {
    return manejarErrorAcceso(err, "No se pudo crear el descuento");
  }
}

export async function actualizarDescuentoAction(
  params: { tenantSlug: string; discountId: string } & DatosDescuento
): Promise<AccionDescuentoResult> {
  const { tenantSlug, discountId, ...datos } = params;
  const errorValidacion = validarDatosDescuento(datos);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const existente = await db.discount.findUnique({ where: { id: discountId }, select: { id: true } });
    if (!existente) return { ok: false, error: "Descuento no encontrado" };

    if (datos.code?.trim()) {
      const duplicado = await db.discount.findFirst({
        where: { code: datos.code.trim(), NOT: { id: discountId } },
        select: { id: true },
      });
      if (duplicado) return { ok: false, error: `Ya existe otro descuento con el código "${datos.code.trim()}"` };
    }

    await db.discount.update({ where: { id: discountId }, data: datosParaGuardar(datos) });

    // Reemplazo completo de las filas de unión — más simple y suficientemente
    // barato aquí (un descuento rara vez tiene más que un puñado de productos
    // o categorías) que calcular un diff añadir/quitar.
    await db.discountProduct.deleteMany({ where: { discountId } });
    await db.discountCategory.deleteMany({ where: { discountId } });

    if (datos.scope === "PRODUCT" && datos.productIds?.length) {
      await db.discountProduct.createMany({
        data: datos.productIds.map((productId) => ({ discountId, productId })),
      });
    } else if (datos.scope === "CATEGORY" && datos.categoryIds?.length) {
      await db.discountCategory.createMany({
        data: datos.categoryIds.map((categoryId) => ({ discountId, categoryId })),
      });
    }

    revalidatePath(`/${tenantSlug}/configuracion/descuentos`);
    revalidatePath(`/${tenantSlug}/pos`);
    return { ok: true, id: discountId };
  } catch (err: any) {
    return manejarErrorAcceso(err, "No se pudo actualizar el descuento");
  }
}

export type AccionSimpleResult = { ok: true } | { ok: false; error: string };

export async function alternarActivoDescuentoAction(
  params: { tenantSlug: string; discountId: string; activo: boolean }
): Promise<AccionSimpleResult> {
  const { tenantSlug, discountId, activo } = params;

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const existente = await db.discount.findUnique({ where: { id: discountId }, select: { id: true } });
    if (!existente) return { ok: false, error: "Descuento no encontrado" };

    await db.discount.update({ where: { id: discountId }, data: { isActive: activo } });

    revalidatePath(`/${tenantSlug}/configuracion/descuentos`);
    revalidatePath(`/${tenantSlug}/pos`);
    return { ok: true };
  } catch (err: any) {
    return manejarErrorAcceso(err, "No se pudo cambiar el estatus del descuento");
  }
}

/**
 * Borrado DEFINITIVO. A diferencia de Product (eliminarProductoAction,
 * catalogo-actions.ts), un Discount NUNCA queda referenciado por una venta
 * pasada — Sale.discount/SaleItem.discount solo guardan el MONTO ya
 * calculado (un Decimal), no una relación hacia la fila Discount que lo
 * generó (ver el comentario largo en pos-actions.ts sobre `dbDiscount`) —
 * así que no existe el mismo riesgo de romper historial y no hace falta un
 * equivalente a "archivar": borrar siempre es seguro. DiscountProduct/
 * DiscountCategory se van solos por onDelete: Cascade (prisma/schema.prisma).
 */
export async function eliminarDescuentoAction(
  params: { tenantSlug: string; discountId: string }
): Promise<AccionSimpleResult> {
  const { tenantSlug, discountId } = params;

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const existente = await db.discount.findUnique({ where: { id: discountId }, select: { id: true } });
    if (!existente) return { ok: false, error: "Descuento no encontrado" };

    await db.discount.delete({ where: { id: discountId } });

    revalidatePath(`/${tenantSlug}/configuracion/descuentos`);
    revalidatePath(`/${tenantSlug}/pos`);
    return { ok: true };
  } catch (err: any) {
    return manejarErrorAcceso(err, "No se pudo eliminar el descuento");
  }
}
