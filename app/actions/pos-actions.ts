"use server";

import { prisma, getTenantPrisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { PaymentMethod, MixedPaymentMethod, SaleStatus } from "@prisma/client";

/**
 * Server Action que persiste una venta real de POS: crea Sale + SaleItem(s)
 * (+ SaleMixedPayment cuando el método es "mixto"), descuenta Inventory de
 * los productos/refacciones vendidos (los servicios no llevan stock), y
 * valida todo contra la base de datos — nunca confía en los precios,
 * impuestos o stock que manda el cliente, solo en el id de cada producto.
 *
 * Nota: a diferencia de Caja, esto todavía NO crea un CashMovement — esa
 * integración natural (registrar el ingreso en la sesión de caja abierta)
 * se deja para cuando se migre el módulo de Caja, igual que ajustarStock
 * en Inventario tampoco deja bitácora todavía.
 *
 * Nota de concurrencia: el folio secuencial (V-1001, V-1002, ...) y el
 * descuento de stock siguen el mismo patrón "revisar y luego actuar" que
 * getTenantPrisma documenta como limitación conocida — suficiente para el
 * volumen de tráfico de esta app, no una garantía atómica a nivel de BD.
 */

export type MetodoPago = "efectivo" | "tarjeta" | "transferencia" | "mixto";

// Se usan los enums reales de Prisma (no strings sueltos): seed.ts ya
// establece esa convención (PaymentMethod.CARD, SaleStatus.COMPLETED,
// etc.) porque los campos generados por Prisma para estos modelos son
// enums de TypeScript, no un union de literales de texto — un string
// suelto ahí no compila aunque el valor en runtime sea idéntico.
const METODO_A_ENUM: Record<MetodoPago, PaymentMethod> = {
  efectivo: PaymentMethod.CASH,
  tarjeta: PaymentMethod.CARD,
  transferencia: PaymentMethod.TRANSFER,
  mixto: PaymentMethod.MIXED,
};

export interface CrearVentaItem {
  productId: string;
  cantidad: number;
}

export interface CrearVentaParams {
  tenantSlug: string;
  branchId: string;
  customerId: string | null;
  items: CrearVentaItem[];
  metodoPago: MetodoPago;
  montoRecibido?: number; // solo "efectivo" — para validar y guardar el cambio
  mixto?: { efectivo: number; tarjeta: number; transferencia: number };
}

export type CrearVentaResult =
  | { ok: true; folio: string; total: number; cambio: number }
  | { ok: false; error: string };

export async function crearVentaAction(params: CrearVentaParams): Promise<CrearVentaResult> {
  const { tenantSlug, branchId, customerId, items, metodoPago, montoRecibido, mixto } = params;

  if (!branchId) return { ok: false, error: "Selecciona una sucursal" };
  if (!items || items.length === 0) return { ok: false, error: "El carrito está vacío" };
  for (const it of items) {
    if (!Number.isInteger(it.cantidad) || it.cantidad <= 0) {
      return { ok: false, error: "Cantidad inválida en el carrito" };
    }
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true },
  });
  if (!tenant) return { ok: false, error: "Negocio no encontrado" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión no válida, vuelve a iniciar sesión" };

  const dbUser = await prisma.user.findUnique({
    where: { supabaseId: user.id },
    select: { id: true, tenantId: true },
  });
  if (!dbUser || dbUser.tenantId !== tenant.id) {
    return { ok: false, error: "No tienes acceso a este negocio" };
  }

  const db = getTenantPrisma(tenant.id);

  try {
    const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!branch) return { ok: false, error: "Sucursal no encontrada" };

    if (customerId) {
      const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true } });
      if (!customer) return { ok: false, error: "Cliente no encontrado" };
    }

    const productIds = items.map((i) => i.productId);
    const products = await db.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      include: { inventory: { where: { branchId } } },
    });
    if (products.length !== new Set(productIds).size) {
      return { ok: false, error: "Uno o más productos ya no están disponibles" };
    }

    let subtotal = 0;
    let tax = 0;
    const lineas: { productId: string; quantity: number; price: number; subtotal: number; isService: boolean }[] = [];
    for (const it of items) {
      const p = products.find((pr) => pr.id === it.productId)!;
      // Cast a string: comparar el enum de Prisma (ProductType) directo
      // contra un literal de texto puede marcarse en TS como "comparación
      // sin traslape" (mismo tipo de error que ya se corrigió en seed.ts).
      const isService = (p.type as string) === "SERVICE";
      if (!isService) {
        const stockActual = p.inventory[0]?.stock ?? 0;
        if (stockActual < it.cantidad) {
          return { ok: false, error: `Stock insuficiente de "${p.name}" (disponible: ${stockActual})` };
        }
      }
      const precio = Number(p.price);
      const lineaSubtotal = precio * it.cantidad;
      subtotal += lineaSubtotal;
      tax += lineaSubtotal * (Number(p.taxRate) / 100);
      lineas.push({ productId: p.id, quantity: it.cantidad, price: precio, subtotal: lineaSubtotal, isService });
    }
    subtotal = Math.round(subtotal * 100) / 100;
    tax = Math.round(tax * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    let cambio = 0;
    let metadata: { montoRecibido: number; cambio: number } | undefined;

    if (metodoPago === "efectivo") {
      const recibido = montoRecibido ?? 0;
      if (recibido < total) return { ok: false, error: "El monto recibido es menor al total" };
      cambio = Math.round((recibido - total) * 100) / 100;
      metadata = { montoRecibido: recibido, cambio };
    } else if (metodoPago === "mixto") {
      const efec = mixto?.efectivo ?? 0;
      const tarj = mixto?.tarjeta ?? 0;
      const trans = mixto?.transferencia ?? 0;
      const cubierto = efec + tarj + trans;
      if (cubierto < total) return { ok: false, error: "El desglose de pago no cubre el total" };
      cambio = Math.round((cubierto - total) * 100) / 100;
    }

    const ultimaVenta = await db.sale.findFirst({
      orderBy: { createdAt: "desc" },
      select: { folio: true },
    });
    let siguienteNum = 1001;
    const m = ultimaVenta?.folio.match(/^V-(\d+)$/);
    if (m) siguienteNum = parseInt(m[1], 10) + 1;
    const folio = `V-${siguienteNum}`;

    await db.$transaction(async (tx: any) => {
      const sale = await tx.sale.create({
        data: {
          tenantId: tenant.id,
          branchId,
          customerId,
          userId: dbUser.id,
          folio,
          subtotal,
          tax,
          discount: 0,
          total,
          paymentMethod: METODO_A_ENUM[metodoPago],
          status: SaleStatus.COMPLETED,
          ...(metadata ? { metadata } : {}),
        },
      });

      for (const l of lineas) {
        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            productId: l.productId,
            quantity: l.quantity,
            price: l.price,
            discount: 0,
            subtotal: l.subtotal,
          },
        });
      }

      if (metodoPago === "mixto") {
        const splits: { method: MixedPaymentMethod; amount: number }[] = [
          { method: MixedPaymentMethod.CASH, amount: mixto?.efectivo ?? 0 },
          { method: MixedPaymentMethod.CARD, amount: mixto?.tarjeta ?? 0 },
          { method: MixedPaymentMethod.TRANSFER, amount: mixto?.transferencia ?? 0 },
        ].filter((s) => s.amount > 0);
        for (const s of splits) {
          await tx.saleMixedPayment.create({ data: { saleId: sale.id, method: s.method, amount: s.amount } });
        }
      }

      for (const l of lineas) {
        if (l.isService) continue;
        await tx.inventory.upsert({
          where: { productId_branchId: { productId: l.productId, branchId } },
          update: { stock: { decrement: l.quantity } },
          create: { productId: l.productId, branchId, stock: 0, minStock: 0 },
        });
      }
    });

    revalidatePath(`/${tenantSlug}/pos`);
    revalidatePath(`/${tenantSlug}/inventario`);
    revalidatePath(`/${tenantSlug}/dashboard`);
    revalidatePath(`/${tenantSlug}/catalogo`);

    return { ok: true, folio, total, cambio };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al crear venta:", err);
    return { ok: false, error: "No se pudo completar la venta" };
  }
}
