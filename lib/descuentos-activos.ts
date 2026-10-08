import "server-only";

import { getTenantPrisma } from "@/lib/prisma";

/**
 * Descuentos vigentes de un negocio, para el punto de venta. Antes vivía en
 * app/actions/discounts.ts ("use server"), o sea expuesta como Server Action
 * pública sin verificar sesión (ver nota allá). Aquí es una función normal
 * de servidor: SOLO se debe llamar con un tenantId ya resuelto y confiable
 * (la page de POS lo saca del slug de la URL tras validar la sesión), nunca
 * con un valor que venga directo del cliente.
 */

export async function getActiveDiscounts(tenantId: string) {
  try {
    const currentDate = new Date();
    const db = getTenantPrisma(tenantId);

    const discounts = await db.discount.findMany({
      where: {
        isActive: true,
        // Filtramos para asegurar que el descuento haya iniciado y no haya expirado
        OR: [
          { endsAt: null },
          { endsAt: { gte: currentDate } }
        ],
        AND: [
          {
            OR: [
              { startsAt: null },
              { startsAt: { lte: currentDate } }
            ]
          }
        ]
      },
      include: { products: true, categories: true },
      orderBy: { priority: 'desc' }
    });

    return { success: true, data: discounts };
  } catch (error) {
    console.error("Error al obtener descuentos:", error);
    return { success: false, error: "Hubo un error al cargar los descuentos activos." };
  }
}
