import "server-only";

import { getTenantPrisma } from "@/lib/prisma";

/**
 * Capa de datos reales del módulo Clientes (M7). Antes de este cambio,
 * clientes/page.tsx era un mockup con un arreglo `clientes` fijo (Carlos
 * Mendoza, María González, ...) sin ningún query a Prisma. Sigue la misma
 * convención que lib/reparaciones-data.ts: los estados de Sale/Repair se
 * dejan como el valor crudo del enum — el texto que ve el usuario para el
 * estado de una reparación sale de lib/labels.ts (repair.status.*), que ya
 * lo personaliza por rubro; el estado de una venta es un texto fijo (no
 * varía por rubro) y se resuelve en el cliente.
 *
 * No existe ningún modelo de "garantía" en el schema (Warranty no existe) —
 * el mockup anterior mostraba "garantías activas" con datos inventados sin
 * ningún respaldo real, así que ese concepto no se reconstruye aquí. El
 * historial que sí es real es la unión de Sale + Repair del cliente,
 * ordenada por fecha.
 */

export type EstadoVentaCliente = "COMPLETED" | "CANCELLED" | "REFUNDED";
export type EstadoReparacionCliente =
  | "RECEIVED" | "DIAGNOSING" | "WAITING_PARTS" | "IN_REPAIR" | "READY"
  | "DELIVERED" | "CANCELLED" | "WORKSHOP_READY" | "WORKSHOP_RETURN"
  | "SHOP_READY" | "SHOP_RETURN";

export interface HistorialClienteItem {
  tipo: "venta" | "reparacion";
  id: string;
  folio: string;
  titulo: string;
  fecha: string; // ISO
  estado: EstadoVentaCliente | EstadoReparacionCliente;
  monto: number;
}

export interface ClienteUI {
  id: string;
  name: string;
  phone: string | null;
  phoneCountryCode: string;
  email: string | null;
  rfc: string | null;
  address: string | null;
  createdAt: string; // ISO
  visitas: number;
  totalGastado: number;
  reparaciones: number;
  reparacionesActivas: number;
  ultimaVisita: string | null; // ISO
  historial: HistorialClienteItem[];
}

const REPARACION_ENTREGADA_O_CANCELADA = new Set(["DELIVERED", "CANCELLED"]);

export async function getClientesData(tenantId: string): Promise<ClienteUI[]> {
  // Customer, Sale y Repair tienen tenantId propio → getTenantPrisma lo
  // inyecta solo en cada nivel del include.
  const db = getTenantPrisma(tenantId);

  const customers = await db.customer.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      sales: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          folio: true,
          total: true,
          status: true,
          createdAt: true,
          items: { select: { product: { select: { name: true } } } },
        },
      },
      repairs: {
        orderBy: { receivedAt: "desc" },
        select: {
          id: true,
          folio: true,
          deviceBrand: true,
          deviceModel: true,
          status: true,
          finalCost: true,
          estimatedCost: true,
          receivedAt: true,
        },
      },
    },
  });

  return customers.map((c) => {
    const ventasHist: HistorialClienteItem[] = c.sales.map((s) => {
      const nombres = s.items.map((it) => it.product.name);
      const titulo =
        nombres.length <= 2
          ? nombres.join(" + ") || "Venta"
          : `${nombres.slice(0, 2).join(" + ")} +${nombres.length - 2}`;
      return {
        tipo: "venta",
        id: s.id,
        folio: s.folio,
        titulo,
        fecha: s.createdAt.toISOString(),
        estado: s.status as EstadoVentaCliente,
        monto: Number(s.total),
      };
    });

    const reparacionesHist: HistorialClienteItem[] = c.repairs.map((r) => ({
      tipo: "reparacion",
      id: r.id,
      folio: r.folio,
      titulo: `${r.deviceBrand} ${r.deviceModel}`,
      fecha: r.receivedAt.toISOString(),
      estado: r.status as EstadoReparacionCliente,
      monto: r.finalCost != null ? Number(r.finalCost) : r.estimatedCost != null ? Number(r.estimatedCost) : 0,
    }));

    const historial = [...ventasHist, ...reparacionesHist].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

    const totalGastado =
      ventasHist.filter((v) => v.estado === "COMPLETED").reduce((s, v) => s + v.monto, 0) +
      reparacionesHist.filter((r) => r.estado === "DELIVERED").reduce((s, r) => s + r.monto, 0);

    const reparacionesActivas = c.repairs.filter((r) => !REPARACION_ENTREGADA_O_CANCELADA.has(r.status)).length;

    const fechas = [...c.sales.map((s) => s.createdAt.getTime()), ...c.repairs.map((r) => r.receivedAt.getTime())];
    const ultimaVisita = fechas.length ? new Date(Math.max(...fechas)).toISOString() : null;

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      phoneCountryCode: c.phoneCountryCode,
      email: c.email,
      rfc: c.rfc,
      address: c.address,
      createdAt: c.createdAt.toISOString(),
      visitas: c.sales.length + c.repairs.length,
      totalGastado,
      reparaciones: c.repairs.length,
      reparacionesActivas,
      ultimaVisita,
      historial,
    };
  });
}

/**
 * Redacta el gasto histórico de una lista de ClienteUI ya calculada —
 * 2026-09-24/25, mismo hueco que el resto de la auditoría de permisos:
 * esta pantalla no tenía NINGÚN chequeo de Role.verMontosCaja. A petición
 * explícita de Carlos (respuesta a la pregunta de "Total gastado"): se
 * oculta igual que el resto del dinero del negocio. `totalGastado` se pone
 * en 0 y el `monto` de cada renglón de `historial` también (son montos por
 * transacción — igual de sensibles que el agregado). `visitas`,
 * `reparaciones`, `reparacionesActivas`, `ultimaVisita` y todo lo demás en
 * `historial` (folio, título, fecha, estado) NO son dinero y se conservan
 * tal cual — un Cajero sigue viendo cuántas veces vino el cliente y qué
 * compró/reparó, solo no el monto.
 */
export function redactarMontosClientes(clientes: ClienteUI[]): ClienteUI[] {
  return clientes.map((c) => ({
    ...c,
    totalGastado: 0,
    historial: c.historial.map((h) => ({ ...h, monto: 0 })),
  }));
}
