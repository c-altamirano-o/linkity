import "server-only";

import { getTenantPrisma } from "@/lib/prisma";

/**
 * Capa de datos reales del módulo Facturación/CFDI (M14).
 *
 * Alcance importante y explícito: este módulo NO está conectado a un PAC
 * (Proveedor Autorizado de Certificación) real ni al SAT — timbrar una
 * factura aquí es una SIMULACIÓN (ver timbrarFacturaAction en
 * facturacion-actions.ts). Conectar un PAC real (ej. Facturama, SW
 * Sapien, Finkok) requiere credenciales/contrato con ese proveedor y está
 * fuera del alcance de "migrar el mockup a datos reales" — lo que sí se
 * logra aquí es que el flujo (generar factura desde una venta, timbrar,
 * cancelar) sea real contra la base de datos, en vez de un arreglo fijo.
 *
 * Toda factura nace de una Sale ya existente (Invoice.saleId, único) —
 * el mockup ya mostraba "Venta VTA-0088" junto a cada factura, así que se
 * respeta esa relación en vez de inventar facturación "suelta". Una venta
 * sin Sale.customerId (cliente de mostrador) no se puede facturar hasta
 * que se le asigne un cliente con RFC, porque Invoice.customerId es
 * obligatorio en el schema — igual que un CFDI real exige receptor.
 */

export type EstadoFactura = "PENDING" | "STAMPED" | "CANCELLED";

export interface FacturaUI {
  id: string;
  folio: string;
  uuid: string | null;
  status: EstadoFactura;
  total: number;
  createdAt: string; // ISO
  customerId: string;
  customerName: string;
  customerRfc: string | null;
  saleId: string | null;
  saleFolio: string | null;
  saleSubtotal: number | null;
  saleTax: number | null;
}

export interface VentaSinFacturarUI {
  id: string;
  folio: string;
  total: number;
  subtotal: number;
  tax: number;
  createdAt: string; // ISO
  customerId: string | null;
  customerName: string | null;
  customerRfc: string | null;
}

export interface ClienteOption {
  id: string;
  name: string;
  rfc: string | null;
}

export interface FacturacionData {
  facturas: FacturaUI[];
  ventasSinFacturar: VentaSinFacturarUI[];
  clientes: ClienteOption[];
}

export async function getFacturacionData(tenantId: string): Promise<FacturacionData> {
  // Invoice, Sale y Customer tienen tenantId propio → getTenantPrisma los
  // inyecta solo.
  const db = getTenantPrisma(tenantId);

  const [facturasRaw, ventasRaw, clientesRaw] = await Promise.all([
    db.invoice.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { name: true, rfc: true } },
        sale: { select: { folio: true, subtotal: true, tax: true } },
      },
    }),
    // Ventas COMPLETED que todavía no tienen una Invoice colgada — Invoice.saleId
    // es único, así que "sin factura" equivale a que ninguna Invoice la referencie.
    db.sale.findMany({
      where: { status: "COMPLETED", invoice: { is: null } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { customer: { select: { name: true, rfc: true } } },
    }),
    db.customer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, rfc: true },
    }),
  ]);

  const facturas: FacturaUI[] = facturasRaw.map((f) => ({
    id: f.id,
    folio: f.folio,
    uuid: f.uuid,
    status: f.status as EstadoFactura,
    total: Number(f.total),
    createdAt: f.createdAt.toISOString(),
    customerId: f.customerId,
    customerName: f.customer.name,
    customerRfc: f.customer.rfc,
    saleId: f.saleId,
    saleFolio: f.sale?.folio ?? null,
    saleSubtotal: f.sale ? Number(f.sale.subtotal) : null,
    saleTax: f.sale ? Number(f.sale.tax) : null,
  }));

  const ventasSinFacturar: VentaSinFacturarUI[] = ventasRaw.map((v) => ({
    id: v.id,
    folio: v.folio,
    total: Number(v.total),
    subtotal: Number(v.subtotal),
    tax: Number(v.tax),
    createdAt: v.createdAt.toISOString(),
    customerId: v.customerId,
    customerName: v.customer?.name ?? null,
    customerRfc: v.customer?.rfc ?? null,
  }));

  const clientes: ClienteOption[] = clientesRaw.map((c) => ({ id: c.id, name: c.name, rfc: c.rfc }));

  return { facturas, ventasSinFacturar, clientes };
}
