"use server";

import { prisma } from "@/lib/prisma";

export async function getActiveDiscounts(tenantId: string) {
  try {
    const currentDate = new Date();

    const discounts = await prisma.discount.findMany({
      where: {
        tenantId: tenantId,
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
      include: {
        products: true,
        categories: true,
      },
      orderBy: {
        priority: 'desc'
      }
    });

    return { success: true, data: discounts };
  } catch (error) {
    console.error("Error al obtener descuentos:", error);
    return { success: false, error: "Hubo un error al cargar los descuentos activos." };
  }
}