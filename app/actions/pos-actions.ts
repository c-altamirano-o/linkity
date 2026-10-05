// ruta: C:\linkity\app\actions\pos-actions.ts
"use server";

import { prisma, getTenantPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PaymentMethod, MixedPaymentMethod, SaleStatus, CashSessionStatus, RepairStatus } from "@prisma/client";
import { resolverActor, puedeOperarSucursal } from "@/lib/actor";
import { ESTADO_CLIENTE_TEXTO } from "@/lib/reparaciones-data";
import { avisarWhatsappReparacion } from "@/lib/whatsapp-tenant";

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
  // Solo "efectivo" — para validar y guardar el cambio. 2026-09-30, a
  // petición de Carlos ("que no sea obligatorio poner la cantidad con la
  // que paga el cliente, ya que muchos no lo hacen"): `undefined` ya NO se
  // trata como "recibió $0" (que antes rechazaba la venta casi siempre) —
  // significa "el cajero no especificó, se asume pago exacto", ver el
  // bloque de "efectivo" más abajo.
  montoRecibido?: number;
  mixto?: { efectivo: number; tarjeta: number; transferencia: number };
}

export type CrearVentaResult =
  | { ok: true; folio: string; total: number; cambio: number; sucursal: string | null; atendioPor: string | null }
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
      // 2026-10-05, hallazgo de auditoría ("el monto de una reparación es
      // editable sin mínimo real y nada impedía cobrarla en $0 por
      // accidente"): A PROPÓSITO se sigue aceptando monto === 0 aquí — $0 es
      // un caso legítimo real (una devolución sin cargo; Tenant.montoDevolucion
      // arranca en $0 por default, ver schema.prisma, y una reparación de
      // garantía tampoco tiene costo), así que el servidor no puede
      // rechazarlo sin romper ese flujo. El candado contra el descuido
      // (campo editado/borrado sin querer) vive del lado del cliente:
      // POSClient.tsx exige una casilla de confirmación explícita
      // ("confirmaReparacionSinCobro") antes de habilitar "Cobrar" cuando
      // el monto de la reparación es $0 — este endpoint sigue validando
      // solo que el monto sea un número real y no negativo.
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
    // branch.name/usuarioActual.name — 2026-09-29, a petición de Carlos
    // ("quiero... el nombre de quien atendió y la sucursal donde se
    // compró" en el rediseño del ticket) — se resuelven aquí, junto con la
    // validación de sucursal, para no hacer un segundo viaje a la base solo
    // por esto; van al ticket vía CrearVentaResult, nunca se guardan en
    // Sale (que ya tiene branchId/userId — esto es solo para mostrar el
    // NOMBRE, no un dato nuevo del modelo).
    const [branch, usuarioActual] = await Promise.all([
      db.branch.findUnique({ where: { id: branchId }, select: { id: true, code: true, name: true } }),
      db.user.findUnique({ where: { id: dbUser.id }, select: { name: true } }),
    ]);
    if (!branch) return { ok: false, error: "Sucursal no encontrada" };

    const cajaAbierta = await db.cashSession.findFirst({
      where: { branchId, status: CashSessionStatus.OPEN },
      select: { id: true },
    });
    if (!cajaAbierta) {
      return { ok: false, error: "La caja de esta sucursal está cerrada. Ábrela antes de cobrar (módulo Caja)." };
    }

    let isWholesaler = false;
    if (customerId) {
      const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true, isWholesaler: true } });
      if (!customer) return { ok: false, error: "Cliente no encontrado" };
      isWholesaler = customer.isWholesaler;
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

    // Consultamos los descuentos activos en la base de datos para recalcularlos seguros
    //
    // 2026-10-01: el `where` original no filtraba por `customerId` en
    // absoluto — un descuento con Discount.customerId apuntando a UN cliente
    // específico se aplicaba igual a CUALQUIER venta, tuviera o no
    // seleccionado a ese cliente (o a otro distinto). Ahora: los descuentos
    // generales (customerId null) siempre califican; uno con customerId
    // asignado SOLO califica si esta venta trae exactamente ese cliente
    // seleccionado — si no hay cliente en la venta, ningún descuento
    // "de cliente" puede aplicar.
    const activeDiscounts = await db.discount.findMany({
      where: {
        tenantId: tenant.id,
        isActive: true,
        OR: customerId ? [{ customerId: null }, { customerId }] : [{ customerId: null }],
      },
      include: { products: true, categories: true },
      orderBy: { priority: 'desc' }
    });

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
          select: { id: true, status: true, branchId: true, folio: true, publicToken: true, customerId: true },
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

    let subtotalBruto = 0;
    type LineaProducto = {
      tipo: "producto"; productId: string; categoryId: string | null; quantity: number; price: number; subtotal: number; tax: number; isService: boolean; discountLine: number;
    };
    type LineaReparacion = {
      tipo: "reparacion"; repairId: string; price: number; subtotal: number; tax: 0; folio: string; publicToken: string; customerId: string; discountLine: 0;
    };
    const lineasPreparadas: (LineaProducto | LineaReparacion)[] = [];

    // PRIMERA PASADA: Armar líneas con sus precios (sin descuentos ni IVA aún)
    for (const it of items) {
      if (it.productId) {
        const p = products.find((pr) => pr.id === it.productId)!;
        const isService = (p.type as string) === "SERVICE";
        if (!isService) {
          const stockActual = p.inventory[0]?.stock ?? 0;
          if (stockActual < it.cantidad) {
            return { ok: false, error: `Stock insuficiente de "${p.name}" (disponible: ${stockActual})` };
          }
        }
        
        const precioNormal = Number(p.price);
        const precioMayoreo = p.wholesalePrice != null ? Number(p.wholesalePrice) : 0;
        const precioFinal = isWholesaler && precioMayoreo > 0 ? precioMayoreo : precioNormal;
        
        const lineaBruto = Math.round(precioFinal * it.cantidad * 100) / 100;
        subtotalBruto += lineaBruto;

        lineasPreparadas.push({ 
          tipo: "producto", 
          productId: p.id, 
          categoryId: p.categoryId, 
          quantity: it.cantidad, 
          price: precioFinal, 
          subtotal: lineaBruto, 
          tax: 0, 
          isService,
          discountLine: 0
        });
      } else {
        const r = repairsRaw.find((rr) => rr.id === it.repairId)!;
        const precio = Math.round((it.monto ?? 0) * 100) / 100;
        subtotalBruto += precio;
        
        lineasPreparadas.push({ 
          tipo: "reparacion", 
          repairId: r.id, 
          price: precio, 
          subtotal: precio, 
          tax: 0, 
          folio: r.folio, 
          publicToken: r.publicToken, 
          customerId: r.customerId,
          discountLine: 0
        });
      }
    }

    // CALCULAR DESCUENTOS EN EL SERVIDOR
    //
    // 2026-10-01, corrigiendo dos bugs reales de la primera versión (Carlos
    // los encontró al pedirme que revisara sus cambios manuales):
    //
    // (a) "no acumulable" solo cortaba el ciclo para alcance "Venta
    //     completa" (dependía de `descuentoIteracion`, una variable que
    //     SOLO se llenaba en esa rama) — un descuento de Producto o
    //     Categoría marcado como no acumulable nunca detenía el ciclo, así
    //     que sí terminaba combinándose con el siguiente descuento aunque
    //     dijera que no debía.
    //
    // (b) el monto descontado se repartía con una sola `proporcionDescuento`
    //     aplicada a TODAS las líneas por igual, sin importar si esa línea
    //     en particular calificaba para el descuento — un descuento de
    //     categoría "Accesorios" también le quitaba una rebanada a un
    //     producto de otra categoría en el mismo carrito. El total cobrado
    //     salía bien, pero el desglose (y por lo tanto el IVA) por renglón
    //     quedaba mal atribuido.
    //
    // Ahora cada línea de producto acumula su PROPIO `discountLine` según
    // qué descuentos de verdad le aplican — un descuento de Producto/
    // Categoría solo resta de las líneas que calificaron (repartido entre
    // ELLAS, proporcional a su peso dentro de ese subconjunto); uno de
    // Venta completa sí reparte entre todas las líneas de producto. Las
    // reparaciones nunca reciben descuento en este flujo (ver el comentario
    // de `discountLine: 0` en LineaReparacion, arriba) — si el carrito es
    // puro reparaciones, un descuento de "Venta completa" simplemente no
    // tiene base sobre la que aplicar y no hace nada.
    const lineasProducto = lineasPreparadas.filter((l): l is LineaProducto => l.tipo === "producto");
    const subtotalProductosBruto = lineasProducto.reduce((s, l) => s + l.subtotal, 0);

    if (activeDiscounts.length > 0 && subtotalBruto > 0) {
      for (const desc of activeDiscounts) {
        if (desc.minPurchase && subtotalBruto < Number(desc.minPurchase)) continue;

        let montoAplicado = 0;

        if (desc.scope === "SALE" && subtotalProductosBruto > 0) {
          // El % se calcula sobre el total del carrito (reparaciones
          // incluidas — así se compara contra minPurchase de forma
          // intuitiva), pero nunca puede restar más de lo que las propias
          // líneas de producto pueden absorber.
          let monto = desc.valueType === "PERCENTAGE"
            ? subtotalBruto * (Number(desc.value) / 100)
            : Number(desc.value);
          if (desc.maxDiscount && monto > Number(desc.maxDiscount)) monto = Number(desc.maxDiscount);
          monto = Math.min(monto, subtotalProductosBruto);

          if (monto > 0) {
            for (const l of lineasProducto) {
              l.discountLine += Math.round((monto * (l.subtotal / subtotalProductosBruto)) * 100) / 100;
            }
            montoAplicado = monto;
          }
        } else if (desc.scope === "PRODUCT" || desc.scope === "CATEGORY") {
          const isProduct = desc.scope === "PRODUCT";
          const idsAplicables = isProduct
            ? desc.products.map((p) => p.productId)
            : desc.categories.map((c) => c.categoryId);

          const lineasAplicables = lineasProducto.filter((l) =>
            isProduct ? idsAplicables.includes(l.productId) : idsAplicables.includes(l.categoryId || "")
          );
          const sumAplicable = lineasAplicables.reduce((s, l) => s + l.subtotal, 0);

          if (sumAplicable > 0) {
            let monto = desc.valueType === "PERCENTAGE"
              ? sumAplicable * (Number(desc.value) / 100)
              : Number(desc.value);
            if (desc.maxDiscount && monto > Number(desc.maxDiscount)) monto = Number(desc.maxDiscount);
            monto = Math.min(monto, sumAplicable);

            if (monto > 0) {
              for (const l of lineasAplicables) {
                l.discountLine += Math.round((monto * (l.subtotal / sumAplicable)) * 100) / 100;
              }
              montoAplicado = monto;
            }
          }
        }

        if (!desc.accumulable && montoAplicado > 0) break;
      }
    }

    // SEGUNDA PASADA: aplicar el descuento ya atribuido línea por línea y
    // desglosar el IVA sobre el monto que de verdad se cobra por línea.
    let subtotalFinal = 0;
    let taxFinal = 0;
    let totalFinal = 0;

    for (const l of lineasPreparadas) {
      if (l.tipo === "producto") {
        const p = products.find((pr) => pr.id === l.productId)!;
        const tasa = Number(p.taxRate);

        // Tope defensivo: una línea nunca puede terminar "regalada" más
        // allá de su propio subtotal, aunque se hayan acumulado varios
        // descuentos encima (accumulable: true).
        l.discountLine = Math.round(Math.min(l.discountLine, l.subtotal) * 100) / 100;
        const subtotalConDescuento = Math.round((l.subtotal - l.discountLine) * 100) / 100;

        const lineaNeto = Math.round((subtotalConDescuento / (1 + tasa / 100)) * 100) / 100;
        l.tax = Math.round((subtotalConDescuento - lineaNeto) * 100) / 100;

        subtotalFinal += lineaNeto;
        taxFinal += l.tax;
        totalFinal += subtotalConDescuento;
      } else {
        // Reparaciones no llevan IVA y actualmente no se les aplica descuento en este flujo
        subtotalFinal += l.subtotal;
        totalFinal += l.subtotal;
      }
    }

    const subtotal = Math.round(subtotalFinal * 100) / 100;
    const tax = Math.round(taxFinal * 100) / 100;
    const total = Math.round(totalFinal * 100) / 100;
    // Suma real de lo aplicado por línea DESPUÉS del tope defensivo de
    // arriba — así Sale.discount siempre cuadra exacto con la suma de
    // SaleItem.discount, incluso en el caso raro de varios descuentos
    // acumulables que juntos hubieran superado el subtotal de una línea.
    const dbDiscount = Math.round(lineasProducto.reduce((s, l) => s + l.discountLine, 0) * 100) / 100;

    let cambio = 0;
    let metadata: { montoRecibido: number; cambio: number } | undefined;

    if (metodoPago === "efectivo") {
      // 2026-09-30: `montoRecibido` ausente (el cajero dejó el campo en
      // blanco) se asume pago exacto — nunca $0. Antes, en blanco llegaba
      // como 0 desde el cliente y esto rechazaba la venta casi siempre
      // ("El monto recibido es menor al total"), así que en la práctica
      // era obligatorio teclearlo. Cuando SÍ viene un monto explícito y no
      // alcanza, la venta se sigue rechazando — esa validación real no
      // cambió. `metadata` solo se guarda cuando el cajero de verdad
      // escribió un monto: si se asumió el pago exacto, no hay ningún dato
      // real que registrar (nunca se inventa un "recibido" para el cuadre).
      const seEspecifico = montoRecibido !== undefined;
      const recibido = seEspecifico ? montoRecibido : total;
      if (recibido < total) return { ok: false, error: "El monto recibido es menor al total" };
      cambio = Math.round((recibido - total) * 100) / 100;
      metadata = seEspecifico ? { montoRecibido: recibido, cambio } : undefined;
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
          discount: dbDiscount,
          total,
          paymentMethod: METODO_A_ENUM[metodoPago],
          status: SaleStatus.COMPLETED,
          ...(metadata ? { metadata } : {}),
        },
      });

      for (const l of lineasPreparadas) {
        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            ...(l.tipo === "producto" ? { productId: l.productId } : { repairId: l.repairId }),
            quantity: l.tipo === "producto" ? l.quantity : 1,
            price: l.price,
            discount: l.discountLine,
            subtotal: l.subtotal - l.discountLine,
          },
        });
      }

      // 2026-09-25 — reemplaza lo que hacía cobrarYEntregarAction: la
      // reparación queda entregada y con su costo final registrado en la
      // MISMA transacción que crea la Sale real (antes eran dos escrituras
      // separadas y sin Sale de por medio). visibleCliente:true — es la
      // confirmación de su propio cobro/entrega, mismo criterio que ya usaba
      // cobrarYEntregarAction.
      for (const l of lineasPreparadas) {
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

      for (const l of lineasPreparadas) {
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
    for (const l of lineasPreparadas) {
      if (l.tipo !== "reparacion") continue;
      revalidatePath(`/${tenantSlug}/reparaciones`);
      revalidatePath(`/${tenantSlug}/aduana`);
      revalidatePath(`/rep/${l.publicToken}`);
    }

    // WhatsApp automático de entrega vía POS (2026-09-29, a petición de
    // Carlos: "también cada cambio de estatus") — mejor esfuerzo, nunca
    // lanza, la venta ya se guardó arriba de todas formas.
    for (const l of lineasPreparadas) {
      if (l.tipo !== "reparacion") continue;
      await avisarWhatsappReparacion({
        db,
        tenantId: tenant.id,
        customerId: l.customerId,
        folio: l.folio,
        publicToken: l.publicToken,
        estadoTexto: ESTADO_CLIENTE_TEXTO.DELIVERED,
      });
    }

    return { ok: true, folio, total, cambio, sucursal: branch.name, atendioPor: usuarioActual?.name ?? null };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al crear venta:", err);
    return { ok: false, error: "No se pudo completar la venta" };
  }
}