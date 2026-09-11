"use server";

import { prisma, getTenantPrisma } from "@/lib/prisma";

/**
 * NOTA: igual que updateThemePreset/updateBusinessType en app/actions/tenant.ts,
 * ambas funciones reciben el SLUG del tenant (no su id de BD) y lo resuelven
 * aquí adentro — es la misma convención que usa el resto de la app (cada
 * page.tsx resuelve tenant.id a partir del slug de la URL una sola vez).
 *
 * Antes, createCustomerAction hacía `prisma.tenant.upsert({ where: { slug:
 * tenantId }, create: { id: tenantId, ... } })` tratando tenantId como si
 * fuera intercambiable con slug Y forzando ese mismo valor como id. Eso
 * "funcionaba" en la prueba porque TENANT_A/TENANT_B no existían todavía y
 * usaban el mismo string en los tres campos — pero con un tenant real (id
 * cuid distinto del slug) el upsert no encontraba nada por slug y el create
 * intentaba insertar una fila nueva con un id que ya pertenece a otra fila
 * → error de llave duplicada. Ahora nunca se fuerza el id manualmente: se
 * deja que Prisma lo genere, y todo lo demás usa tenant.id ya resuelto.
 */

export async function getCustomersAction(tenantSlug: string) {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true },
    });
    if (!tenant) return { success: true, data: [] };

    const db = getTenantPrisma(tenant.id);

    // La extensión inyectará automáticamente: where: { tenantId }
    const customers = await db.customer.findMany({
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: customers };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function createCustomerAction(tenantSlug: string, name: string) {
  try {
    // Resuelve (o crea, solo para pruebas) el tenant por slug. Nunca se fija
    // el id a mano — así nunca puede chocar con el cuid real de un tenant
    // existente.
    const tenant = await prisma.tenant.upsert({
      where: { slug: tenantSlug },
      update: {},
      create: {
        name: `Empresa ${tenantSlug}`,
        slug: tenantSlug,
      },
    });

    // Usar la extensión segura para crear el cliente
    const db = getTenantPrisma(tenant.id);

    const newCustomer = await db.customer.create({
      // tenantId es redundante en tiempo de ejecución (getTenantPrisma ya
      // lo inyecta en create), pero el tipo generado de
      // CustomerCreateInput lo exige como campo requerido — TypeScript no
      // sabe que la extensión lo va a sobreescribir, así que hay que
      // escribirlo explícito para que compile.
      data: {
        tenantId: tenant.id,
        name,
        metadata: {
          origen: "Prueba de Aislamiento RLS",
          etiqueta: "Nuevo",
        },
      },
    });

    return { success: true, data: newCustomer };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}