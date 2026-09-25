"use server";

import { prisma, getTenantPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PaymentMethod, MixedPaymentMethod, SaleStatus, CashSessionStatus, RepairStatus } from "@prisma/client";
import { resolverActor, puedeOperarSucursal } from "@/lib/actor";

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
 * 2026-09-22, a petición de Carlos: SÍ exige que haya una CashSession OPEN
 * en la sucursal para poder vender (cualquier método de pago, no solo
 * efectivo) — reportó que pudo cobrar sin tener la caja abierta. Antes de
 * este cambio nada lo impedía, y esas ventas quedaban fuera del cuadre:
 * cerrarCajaAction solo suma las ventas con createdAt >= openedAt de la
 * sesión que se está cerrando, así que una venta hecha sin sesión abierta
 * nunca entraba al cálculo de efectivo esperado de ningún cierre.
 *
 * 2026-09-25, a petición explícita de Carlos ("en Recepción/Aduana el botón
 * de cobrar y entregar hace ahí mismo la operación, el error está en que lo
 * debe mandar al POS para su cobro e impresión del ticket correspondiente"):
 * un renglón del carrito ahora puede representar el cobro de una reparación
 * lista para entrega (repairId) en vez de un producto del catálogo
 * (productId) — ver el comentario largo en SaleItem, prisma/schema.prisma.
 * Esto REEMPLAZA por completo a cobrarYEntregarAction (reparaciones-actions.ts,
 * eliminada): antes ese cobro nunca generaba una Sale real, así que no
 * aparecía en ningún reporte/exportación de POS ni dejaba folio de venta —
 * vivía en una isla aparte. El monto de un renglón de reparación es el que
 * mandó el cajero (mismo criterio de confianza que ya tenía
 * cobrarYEntregarAction — a diferencia de un producto, una reparación no
 * tiene "precio de catálogo" fijo con el que validar), pero SIEMPRE se
 * valida que la reparación exista, sea de este tenant, y esté en un estatus
 * cobrable (SHOP_READY, o SHOP_RETURN cuando Tenant.cobrarEnDevolucion está
 * activo) — la venta completa se rechaza si no.
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

// Un renglón del carrito es UNO de dos casos, nunca ambos ni ninguno —
// productId (como siempre) o repairId con su monto (2026-09-25, ver el
// comentario largo arriba). "cantidad" en un renglón de reparación siempre
// debe ser 1 (una reparación no se "cobra x2").
export interface CrearVentaItem {
  productId?: string;
  repairId?: string;
  // Monto a cobrar por la reparación — solo aplica junto con repairId. Un
  // producto nunca manda su propio precio (crearVentaAction solo confía en
  // Product.price de la base de datos), pero una reparación no tiene precio
  // de catálogo: el monto lo captura el cajero, igual que ya hacía el modal
  // de "Cobrar y entregar" que este flujo reemplaza.
  monto?: number;
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
    // 2026-09-25: cada renglón es un producto O el cobro de una reparación,
    // nunca ambos ni ninguno — ver el comentario largo de CrearVentaItem.
    const esProducto = !!it.productId;
    const esReparacion = !!it.repairId;
    if (esProducto === esReparacion) {
      return { ok: false, error: "Renglón de carrito inválido" };
    }
    if (esReparacion) {
      if (it.cantidad !== 1) {
        return { ok: false, error: "El cobro de una reparación no admite cantidad distinta de 1" };
      }
      if (typeof it.monto !== "number" || !Number.isFinite(it.monto) || it.monto < 0) {
        return { ok: false, error: "Monto inválido para el cobro de la reparación" };
      }
    }
  }

  // resolverActor (lib/actor.ts) acepta tanto una cuenta real (Supabase
  // Auth) como una sesión de PIN de personal (M11) — Cajero y Gerente
  // tienen "pos" en su matriz de acceso (lib/roles.ts).
  const resuelto = await resolverActor(tenantSlug, "pos");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant, dbUser } = resuelto;

  // 2026-09-21, a petición de Carlos: un empleado de PIN solo puede vender
  // en SU sucursal.
  if (!puedeOperarSucursal(resuelto, branchId)) {
    return { ok: false, error: "No tienes acceso a esa sucursal" };
  }

  const db = getTenantPrisma(tenant.id);

  try {
    const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true, code: true } });
    if (!branch) return { ok: false, error: "Sucursal no encontrada" };

    const cajaAbierta = await db.cashSession.findFirst({
      where: { branchId, status: CashSessionStatus.OPEN },
      select: { id: true },
    });
    if (!cajaAbierta) {
      return { ok: false, error: "La caja de esta sucursal está cerrada. Ábrela antes de cobrar (módulo Caja)." };
    }

    if (customerId) {
      const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true } });
      if (!customer) return { ok: false, error: "Cliente no encontrado" };
    }

    const productIds = items.filter((i) => i.productId).map((i) => i.productId!);
    const products = productIds.length
      ? await db.product.findMany({
          where: { id: { in: productIds }, isActive: true },
          include: { inventory: { where: { branchId } } },
        })
      : [];
    if (products.length !== new Set(productIds).size) {
      return { ok: false, error: "Uno o más productos ya no están disponibles" };
    }

    // Reparaciones a cobrar (2026-09-25, ver el comentario largo arriba del
    // archivo) — se validan aquí, junto con los productos, ANTES de armar
    // los renglones: existencia, mismo tenant (getTenantPrisma ya lo filtra
    // solo), misma sucursal que la venta, y estatus cobrable. Mismo criterio
    // que cobrarYEntregarAction (reemplazada): SHOP_READY siempre; SHOP_RETURN
    // solo si el negocio activó "cobrar en devolución".
    const repairIds = items.filter((i) => i.repairId).map((i) => i.repairId!);
    const repairsRaw = repairIds.length
      ? await db.repair.findMany({
          where: { id: { in: repairIds } },
          select: { id: true, status: true, branchId: true, folio: true, publicToken: true },
        })
      : [];
    if (repairsRaw.length !== new Set(repairIds).size) {
      return { ok: false, error: "Una o más reparaciones no se encontraron" };
    }
    let cobraEnDevolucion: boolean | null = null;
    for (const r of repairsRaw) {
      if (r.branchId !== branchId) {
        return { ok: false, error: `La reparación ${r.folio} no pertenece a la sucursal seleccionada` };
      }
      if (r.status === RepairStatus.SHOP_READY) continue;
      if (r.status === RepairStatus.SHOP_RETURN) {
        if (cobraEnDevolucion === null) {
          const t = await prisma.tenant.findUnique({ where: { id: tenant.id }, select: { cobrarEnDevolucion: true } });
          cobraEnDevolucion = !!t?.cobrarEnDevolucion;
        }
        if (cobraEnDevolucion) continue;
      }
      return { ok: false, error: `La reparación ${r.folio} no está lista para cobro` };
    }

    // Product.price es el precio de lista que ve el cliente (ej. "Barba,
    // $80") y SIEMPRE incluye el IVA — así lo pidió Carlos explícitamente:
    // el cliente paga exactamente ese número, nunca $80 + IVA encima. Por
    // eso aquí NO se suma taxRate al precio: se desglosa hacia atrás
    // (precio final ÷ (1 + tasa)) solo para reportar cuánto de esa venta
    // corresponde a IVA — ese desglose es informativo/contable (Sale.tax,
    // Sale.subtotal), nunca cambia lo que el cliente paga (Sale.total).
    //
    // Se calcula línea por línea (no con un solo IVA global) porque cada
    // producto puede tener su propia taxRate — aunque hoy todos usan el
    // default de 16%, el modelo ya lo permite por producto. Restar el neto
    // del total de la línea (en vez de redondear el IVA aparte) garantiza
    // que subtotal + tax == total exacto, sin desfases de centavos.
    //
    // El renglón de una reparación NO desglosa IVA (tax: 0, subtotal ==
    // price) — mismo criterio que ya tenía cobrarYEntregarAction, que
    // reemplaza: el cobro final de una reparación es un monto negociado, no
    // un precio de catálogo con tasa conocida.
    let subtotal = 0;
    let tax = 0;
    let total = 0;
    type LineaProducto = {
      tipo: "producto"; productId: string; quantity: number; price: number; subtotal: number; tax: number; isService: boolean;
    };
    type LineaReparacion = {
      tipo: "reparacion"; repairId: string; price: number; subtotal: number; tax: 0; folio: string; publicToken: string;
    };
    const lineas: (LineaProducto | LineaReparacion)[] = [];
    for (const it of items) {
      if (it.productId) {
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
        const precio = Number(p.price); // precio final al cliente, ya incluye IVA
        const tasa = Number(p.taxRate);
        const lineaTotal = Math.round(precio * it.cantidad * 100) / 100;
        const lineaNeto = Math.round((lineaTotal / (1 + tasa / 100)) * 100) / 100;
        const lineaIva = Math.round((lineaTotal - lineaNeto) * 100) / 100;
        subtotal += lineaNeto;
        tax += lineaIva;
        total += lineaTotal;
        lineas.push({ tipo: "producto", productId: p.id, quantity: it.cantidad, price: precio, subtotal: lineaTotal, tax: lineaIva, isService });
      } else {
        const r = repairsRaw.find((rr) => rr.id === it.repairId)!;
        const precio = Math.round((it.monto ?? 0) * 100) / 100;
        subtotal += precio;
        total += precio;
        lineas.push({ tipo: "reparacion", repairId: r.id, price: precio, subtotal: precio, tax: 0, folio: r.folio, publicToken: r.publicToken });
      }
    }
    subtotal = Math.round(subtotal * 100) / 100;
    tax = Math.round(tax * 100) / 100;
    total = Math.round(total * 100) / 100;

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

    // Folio con sigla de sucursal (2026-09-22, a petición de Carlos: "ya sea
    // equipo o venta" — el mismo esquema que ya se aplicó al folio de
    // reparaciones, ver crearReparacionAction en reparaciones-actions.ts, y
    // el mismo motivo: "rastrear la fuente del ingreso" en una gestión
    // centralizada multi-sucursal). Compatibilidad: si la sucursal no tiene
    // código asignado (Branch.code null — negocio de una sola sucursal), se
    // mantiene la secuencia global V-1001, V-1002... de siempre.
    const prefijo = branch.code ? `V-${branch.code}-` : "V-";
    const patron = branch.code ? new RegExp(`^V-${branch.code}-(\\d+)$`) : /^V-(\d+)$/;
    // 2026-09-24, mismo bug real (y misma corrección) que crearReparacionAction
    // en reparaciones-actions.ts: tomar "la venta más reciente por createdAt"
    // y sumarle 1 falla si algún folio ya existente quedó con una fecha fuera
    // de orden respecto a su número (datos de ejemplo, importaciones,
    // correcciones manuales) — "más reciente por fecha" no es lo mismo que
    // "de folio más alto", y calcular un folio que ya existe truena con
    // Prisma ("Unique constraint failed") antes de registrar la venta. Ahora
    // se revisan TODOS los folios de este mismo prefijo y se toma el número
    // más alto entre todos, sin importar su fecha.
    const ventasExistentes = await db.sale.findMany({
      where: branch.code ? { branchId } : { branch: { code: null } },
      select: { folio: true },
    });
    let siguienteNum = 1001;
    for (const { folio: f } of ventasExistentes) {
      const m = f.match(patron);
      if (m) siguienteNum = Math.max(siguienteNum, parseInt(m[1], 10) + 1);
    }
    const folio = `${prefijo}${siguienteNum}`;

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
            ...(l.tipo === "producto" ? { productId: l.productId } : { repairId: l.repairId }),
            quantity: l.tipo === "producto" ? l.quantity : 1,
            price: l.price,
            discount: 0,
            subtotal: l.subtotal,
          },
        });
      }

      // 2026-09-25 — reemplaza lo que hacía cobrarYEntregarAction: la
      // reparación queda entregada y con su costo final registrado en la
      // MISMA transacción que crea la Sale real (antes eran dos escrituras
      // separadas y sin Sale de por medio). visibleCliente:true — es la
      // confirmación de su propio cobro/entrega, mismo criterio que ya usaba
      // cobrarYEntregarAction.
      for (const l of lineas) {
        if (l.tipo !== "reparacion") continue;
        await tx.repair.update({
          where: { id: l.repairId },
          data: { finalCost: l.price, status: RepairStatus.DELIVERED, deliveredAt: new Date() },
        });
        await tx.repairHistory.create({
          data: {
            repairId: l.repairId,
            status: RepairStatus.DELIVERED,
            notes: `Cobro registrado vía POS (venta ${folio}): ${l.price.toLocaleString("es-MX", {
              style: "currency",
              currency: "MXN",
            })} (${metodoPago}) — equipo entregado al cliente`,
            visibleCliente: true,
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
        if (l.tipo !== "producto" || l.isService) continue;
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
    // Reparaciones cobradas en esta venta (2026-09-25) — sus pantallas y su
    // página pública de seguimiento cambiaron de estatus.
    for (const l of lineas) {
      if (l.tipo !== "reparacion") continue;
      revalidatePath(`/${tenantSlug}/reparaciones`);
      revalidatePath(`/${tenantSlug}/aduana`);
      revalidatePath(`/rep/${l.publicToken}`);
    }

    return { ok: true, folio, total, cambio };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al crear venta:", err);
    return { ok: false, error: "No se pudo completar la venta" };
  }
}
