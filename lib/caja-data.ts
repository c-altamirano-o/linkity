import "server-only";

import { getTenantPrisma } from "@/lib/prisma";
import { PaymentMethod, MixedPaymentMethod, CashSessionStatus, MovementType } from "@prisma/client";

/**
 * Capa de datos reales del módulo Caja (M10). Sigue la misma convención que
 * el resto: se importa solo desde Server Components (page.tsx).
 *
 * Decisión de diseño clave: CashMovement (bitácora de ingresos/egresos
 * manuales) NO se usa para registrar el efecto en efectivo de una venta —
 * eso ya vive en Sale.paymentMethod/Sale.total (y en SaleMixedPayment para
 * el desglose de un pago mixto). Duplicarlo como CashMovement además de
 * Sale habría dejado dos fuentes de verdad para el mismo evento. En vez de
 * eso, el efectivo esperado de la sesión se calcula en vivo combinando
 * CashSession.openingCash + las ventas reales (solo la parte en efectivo)
 * + los movimientos manuales — ver efectivoDeVenta() abajo.
 *
 * Alcance no cubierto todavía: el cobro de una reparación (Repair.finalCost)
 * no genera ningún movimiento de caja porque el flujo de Reparaciones no
 * tiene un paso de "marcar como cobrada" — no hay un evento real del que
 * colgar un ingreso. Documentado también en caja-actions.ts.
 */

export type TipoMovimientoCaja = "apertura" | "venta" | "ingreso" | "egreso" | "cierre";

export interface MovimientoCaja {
  id: string;
  folio: string;
  fecha: string; // ISO
  concepto: string;
  metodo: string;
  tipo: TipoMovimientoCaja;
  monto: number; // negativo para egresos
}

export interface SesionCajaActual {
  id: string;
  branchId: string;
  aperturaMonto: number;
  abiertaPor: string;
  abiertaEn: string; // ISO
  ventasEfectivo: number;
  totalVentasDia: number;
  ingresosManual: number;
  egresosManual: number;
  efectivoEsperado: number;
  // 2026-09-24, a petición de Carlos ("se puede hacer que caja solo muestre
  // el total de operaciones realizadas, sin montos de dinero?"): conteos
  // puros (no son un peso ni se derivan de uno), así que a diferencia de los
  // campos de arriba NUNCA se redactan — redactarMontosCaja los deja pasar
  // tal cual para que un Cajero sin Role.verMontosCaja pueda ver "cuántas"
  // operaciones lleva su turno aunque no pueda ver "cuánto" dinero representan.
  numVentas: number;
  numIngresosManual: number;
  numEgresosManual: number;
}

export interface CajaData {
  sesionActual: SesionCajaActual | null;
  // Ventana amplia (igual que el "Top Ventas" de catalogo-data.ts) para que
  // el selector de período del panel de detalle filtre del lado del
  // cliente sin pedir otra vez al servidor.
  movimientos: MovimientoCaja[];
}

/**
 * Redacta los montos de una CajaData ya calculada — 2026-09-24, a petición
 * de Carlos ("revisando el módulo Caja por seguridad y evitar fraudes o
 * posibles robos... ni empleado de mostrador, cajera o técnico, debe
 * conocer el monto de las ventas del día"). Usado por caja/page.tsx cuando
 * el rol del empleado de PIN no tiene Role.verMontosCaja — a propósito NO
 * es un simple "ocultar en la UI": esta función corre en el servidor, así
 * que los montos reales nunca viajan al navegador de ese empleado (ni en
 * el HTML ni en la respuesta de un Server Component), no solo se esconden
 * con CSS.
 *
 * Revisión 2026-09-24 (misma fecha, respuesta posterior de Carlos): "se
 * puede hacer que caja solo muestre el total de operaciones realizadas,
 * sin montos de dinero? y que solo un administrador los pueda ver" — antes
 * `movimientos` se vaciaba por completo y el panel de Detalle se
 * reemplazaba entero por un aviso de "Sección restringida". Ahora se
 * conserva la lista completa de movimientos (folio, fecha, concepto,
 * método, tipo) para que ese empleado pueda ver CUÁNTAS operaciones se
 * hicieron — solo se le quita el campo `monto` a cada una (CUÁNTO dinero).
 * Los conteos de sesionActual (numVentas/numIngresosManual/numEgresosManual)
 * tampoco se tocan por la misma razón: son operaciones, no pesos.
 */
export function redactarMontosCaja(data: CajaData): CajaData {
  return {
    sesionActual: data.sesionActual
      ? {
          id: data.sesionActual.id,
          branchId: data.sesionActual.branchId,
          aperturaMonto: 0,
          abiertaPor: data.sesionActual.abiertaPor,
          abiertaEn: data.sesionActual.abiertaEn,
          ventasEfectivo: 0,
          totalVentasDia: 0,
          ingresosManual: 0,
          egresosManual: 0,
          efectivoEsperado: 0,
          numVentas: data.sesionActual.numVentas,
          numIngresosManual: data.sesionActual.numIngresosManual,
          numEgresosManual: data.sesionActual.numEgresosManual,
        }
      : null,
    movimientos: data.movimientos.map((m) => ({ ...m, monto: 0 })),
  };
}

const METODO_LABEL: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  MIXED: "Mixto",
};

interface VentaParaEfectivo {
  paymentMethod: PaymentMethod;
  total: unknown;
  mixedPayments: { method: MixedPaymentMethod; amount: unknown }[];
}

/** Cuánto de una venta corresponde realmente a efectivo físico en caja. */
export function efectivoDeVenta(sale: VentaParaEfectivo): number {
  if (sale.paymentMethod === PaymentMethod.CASH) return Number(sale.total);
  if (sale.paymentMethod === PaymentMethod.MIXED) {
    return sale.mixedPayments
      .filter((p) => p.method === MixedPaymentMethod.CASH)
      .reduce((sum, p) => sum + Number(p.amount), 0);
  }
  return 0;
}

const VENTANA_DIAS = 400;

export async function getCajaData(tenantId: string, branchId: string): Promise<CajaData> {
  // CashSession y Sale tienen tenantId propio → getTenantPrisma lo inyecta solo.
  const db = getTenantPrisma(tenantId);

  const desde = new Date();
  desde.setDate(desde.getDate() - VENTANA_DIAS);

  const [sesionRaw, sesionesRaw, ventasRaw] = await Promise.all([
    db.cashSession.findFirst({
      where: { branchId, status: CashSessionStatus.OPEN },
      orderBy: { openedAt: "desc" },
      include: { user: { select: { name: true } }, movements: { orderBy: { createdAt: "asc" } } },
    }),
    db.cashSession.findMany({
      where: { branchId, openedAt: { gte: desde } },
      orderBy: { openedAt: "asc" },
      include: {
        movements: { orderBy: { createdAt: "asc" } },
        // 2026-09-22, cambio de turno: closedBy es opcional (sesiones
        // cerradas antes de este cambio no lo tienen) — de ahí el `?.` al
        // leerlo abajo.
        closedBy: { select: { name: true } },
      },
    }),
    db.sale.findMany({
      where: { branchId, createdAt: { gte: desde } },
      include: {
        // product/repair — 2026-09-25: un SaleItem ahora puede representar
        // el cobro de una reparación (repairId) en vez de un producto del
        // catálogo (productId) — ver el comentario largo en SaleItem,
        // prisma/schema.prisma. Se incluye repair.folio para el "concepto"
        // de abajo cuando product viene null.
        items: { include: { product: { select: { name: true } }, repair: { select: { folio: true } } } },
        mixedPayments: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // ── Movimientos unificados para el panel de detalle ──────────────────
  const movimientos: MovimientoCaja[] = [];

  sesionesRaw.forEach((sesion, i) => {
    movimientos.push({
      id: `apertura-${sesion.id}`,
      folio: `APT-${String(i + 1).padStart(4, "0")}`,
      fecha: sesion.openedAt.toISOString(),
      concepto: "Apertura de caja",
      metodo: "Efectivo",
      tipo: "apertura",
      monto: Number(sesion.openingCash),
    });

    let numIngreso = 0;
    let numEgreso = 0;
    sesion.movements.forEach((mov) => {
      const esIngreso = mov.type === MovementType.INCOME;
      if (esIngreso) numIngreso++;
      else numEgreso++;
      movimientos.push({
        id: mov.id,
        folio: esIngreso ? `ING-${String(numIngreso).padStart(4, "0")}` : `EGR-${String(numEgreso).padStart(4, "0")}`,
        fecha: mov.createdAt.toISOString(),
        concepto: mov.concept,
        metodo: "Efectivo",
        tipo: esIngreso ? "ingreso" : "egreso",
        monto: esIngreso ? Number(mov.amount) : -Number(mov.amount),
      });
    });

    // 2026-09-22, a petición de Carlos ("cambio de turno"): antes el cierre
    // de una sesión no dejaba NINGÚN rastro en el historial de movimientos
    // — solo se veía la apertura siguiente, sin poder saber quién cerró,
    // cuándo, ni con qué diferencia. `monto` aquí es la diferencia
    // (contado − esperado), no el efectivo contado, para poder ver de un
    // vistazo si ese cierre cuadró o no (mismo criterio de color que ya
    // usa el modal de cerrar caja en CajaClient.tsx).
    if (sesion.status === CashSessionStatus.CLOSED && sesion.closedAt) {
      const cerrador = sesion.closedBy?.name ?? "—";
      movimientos.push({
        id: `cierre-${sesion.id}`,
        folio: `CIE-${String(i + 1).padStart(4, "0")}`,
        fecha: sesion.closedAt.toISOString(),
        concepto: `Cierre de caja — cerró: ${cerrador}`,
        metodo: "Efectivo",
        tipo: "cierre",
        monto: sesion.difference !== null ? Number(sesion.difference) : 0,
      });
    }
  });

  for (const venta of ventasRaw) {
    // 2026-09-25: el primer renglón puede ser el cobro de una reparación
    // (product null, repair no) en vez de un producto — ver el include de
    // arriba.
    const primer = venta.items[0];
    const primerItem = primer?.product?.name ?? (primer?.repair ? `Reparación ${primer.repair.folio}` : "Producto");
    const concepto = venta.items.length > 1 ? `${primerItem} + ${venta.items.length - 1} más` : primerItem;
    movimientos.push({
      id: venta.id,
      folio: venta.folio,
      fecha: venta.createdAt.toISOString(),
      concepto,
      metodo: METODO_LABEL[venta.paymentMethod],
      tipo: "venta",
      monto: Number(venta.total),
    });
  }

  movimientos.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  // ── Sesión actual (panel de control de caja) ─────────────────────────
  let sesionActual: SesionCajaActual | null = null;
  if (sesionRaw) {
    const ventasSesion = ventasRaw.filter((v) => v.createdAt >= sesionRaw.openedAt);
    const ventasEfectivo = ventasSesion.reduce((s, v) => s + efectivoDeVenta(v), 0);
    const totalVentasDia = ventasSesion.reduce((s, v) => s + Number(v.total), 0);
    const ingresosManual = sesionRaw.movements
      .filter((m) => m.type === MovementType.INCOME)
      .reduce((s, m) => s + Number(m.amount), 0);
    const egresosManual = sesionRaw.movements
      .filter((m) => m.type === MovementType.EXPENSE)
      .reduce((s, m) => s + Number(m.amount), 0);
    const aperturaMonto = Number(sesionRaw.openingCash);

    sesionActual = {
      id: sesionRaw.id,
      branchId: sesionRaw.branchId,
      aperturaMonto,
      abiertaPor: sesionRaw.user.name,
      abiertaEn: sesionRaw.openedAt.toISOString(),
      ventasEfectivo,
      totalVentasDia,
      ingresosManual,
      egresosManual,
      efectivoEsperado: aperturaMonto + ventasEfectivo + ingresosManual - egresosManual,
      // Conteos puros — ver el comentario de redactarMontosCaja arriba.
      numVentas: ventasSesion.length,
      numIngresosManual: sesionRaw.movements.filter((m) => m.type === MovementType.INCOME).length,
      numEgresosManual: sesionRaw.movements.filter((m) => m.type === MovementType.EXPENSE).length,
    };
  }

  return { sesionActual, movimientos };
}
