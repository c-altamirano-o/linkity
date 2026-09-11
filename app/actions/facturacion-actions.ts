"use server";

import { prisma, getTenantPrisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { InvoiceStatus, SaleStatus } from "@prisma/client";
import crypto from "crypto";

/**
 * Server Actions del módulo Facturación/CFDI (M14).
 *
 * IMPORTANTE — alcance real de "timbrar" aquí: este proyecto no tiene
 * contratado ningún PAC (Proveedor Autorizado de Certificación) real, así
 * que timbrarFacturaAction de abajo es una SIMULACIÓN: genera un UUID con
 * el formato de un Folio Fiscal real pero NUNCA se manda al SAT ni a un
 * PAC, y no produce XML/PDF reales (cfdiXml/cfdiPdf se quedan en null).
 * Es lo mismo que ya se documentó para marcarWhatsappEnviadoAction en
 * Reparaciones (no manda un WhatsApp real) — el flujo de estatus
 * (pendiente → timbrada → cancelada) es real contra la BD, la parte que
 * hablaría con el SAT no lo es. Conectar un PAC real es trabajo aparte
 * (requiere credenciales/contrato con ese proveedor) y no es parte de
 * "migrar el mockup a datos reales".
 */

type ResolverResult =
  | { ok: true; tenant: { id: string }; dbUser: { id: string; tenantId: string } }
  | { ok: false; error: string };

async function resolverTenantYUsuario(tenantSlug: string): Promise<ResolverResult> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
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

  return { ok: true, tenant, dbUser };
}

export interface CrearFacturaParams {
  tenantSlug: string;
  saleId: string;
  customerId?: string | null;
  clienteNuevo?: { name: string; rfc?: string; phone?: string } | null;
}

export type CrearFacturaResult = { ok: true; id: string; folio: string } | { ok: false; error: string };

export async function crearFacturaAction(params: CrearFacturaParams): Promise<CrearFacturaResult> {
  const { tenantSlug, saleId, customerId, clienteNuevo } = params;

  if (!customerId && !clienteNuevo?.name.trim()) {
    return { ok: false, error: "Selecciona o registra el cliente que recibirá el CFDI" };
  }

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const sale = await db.sale.findUnique({
      where: { id: saleId },
      select: { id: true, total: true, status: true },
    });
    if (!sale) return { ok: false, error: "Venta no encontrada" };
    if (sale.status !== SaleStatus.COMPLETED) {
      return { ok: false, error: "Solo se pueden facturar ventas completadas" };
    }

    const yaFacturada = await db.invoice.findFirst({ where: { saleId }, select: { id: true } });
    if (yaFacturada) return { ok: false, error: "Esta venta ya tiene una factura generada" };

    let finalCustomerId = customerId ?? null;
    if (finalCustomerId) {
      const cliente = await db.customer.findUnique({ where: { id: finalCustomerId }, select: { id: true } });
      if (!cliente) return { ok: false, error: "Cliente no encontrado" };
    } else if (clienteNuevo?.name.trim()) {
      const nuevoCliente = await db.customer.create({
        data: {
          tenantId: tenant.id,
          name: clienteNuevo.name.trim(),
          rfc: clienteNuevo.rfc?.trim().toUpperCase() || null,
          phone: clienteNuevo.phone?.trim() || null,
        },
      });
      finalCustomerId = nuevoCliente.id;
    }
    if (!finalCustomerId) return { ok: false, error: "Selecciona o registra el cliente que recibirá el CFDI" };

    // Folio secuencial F-0001, F-0002, ... — mismo prefijo que ya usó
    // prisma/seed.ts para la factura de ejemplo, en vez del "FAC-" solo
    // cosmético que traía el mockup.
    const ultima = await db.invoice.findFirst({
      orderBy: { createdAt: "desc" },
      select: { folio: true },
    });
    let siguienteNum = 1;
    const m = ultima?.folio.match(/^F-(\d+)$/);
    if (m) siguienteNum = parseInt(m[1], 10) + 1;
    const folio = `F-${String(siguienteNum).padStart(4, "0")}`;

    const factura = await db.invoice.create({
      data: {
        tenantId: tenant.id,
        customerId: finalCustomerId,
        saleId,
        folio,
        total: sale.total,
        status: InvoiceStatus.PENDING,
      },
    });

    revalidatePath(`/${tenantSlug}/facturacion`);
    return { ok: true, id: factura.id, folio: factura.folio };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al generar factura:", err);
    return { ok: false, error: "No se pudo generar la factura" };
  }
}

export type AccionFacturaResult = { ok: true } | { ok: false; error: string };

export async function timbrarFacturaAction(params: {
  tenantSlug: string;
  invoiceId: string;
}): Promise<AccionFacturaResult> {
  const { tenantSlug, invoiceId } = params;

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const factura = await db.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, status: true } });
    if (!factura) return { ok: false, error: "Factura no encontrada" };
    if (factura.status !== InvoiceStatus.PENDING) {
      return { ok: false, error: "Esta factura ya no está pendiente de timbrar" };
    }

    // Simulación (ver nota al inicio del archivo): UUID con formato real
    // de Folio Fiscal, pero nunca se envía a un PAC/SAT de verdad.
    await db.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.STAMPED, uuid: crypto.randomUUID().toUpperCase() },
    });

    revalidatePath(`/${tenantSlug}/facturacion`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al timbrar factura:", err);
    return { ok: false, error: "No se pudo timbrar la factura" };
  }
}

export async function cancelarFacturaAction(params: {
  tenantSlug: string;
  invoiceId: string;
}): Promise<AccionFacturaResult> {
  const { tenantSlug, invoiceId } = params;

  const resuelto = await resolverTenantYUsuario(tenantSlug);
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  const db = getTenantPrisma(tenant.id);

  try {
    const factura = await db.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, status: true } });
    if (!factura) return { ok: false, error: "Factura no encontrada" };
    if (factura.status === InvoiceStatus.CANCELLED) {
      return { ok: false, error: "Esta factura ya está cancelada" };
    }

    await db.invoice.update({ where: { id: invoiceId }, data: { status: InvoiceStatus.CANCELLED } });

    revalidatePath(`/${tenantSlug}/facturacion`);
    return { ok: true };
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("Acceso denegado")) {
      return { ok: false, error: "No tienes acceso a este recurso" };
    }
    console.error("Error al cancelar factura:", err);
    return { ok: false, error: "No se pudo cancelar la factura" };
  }
}
