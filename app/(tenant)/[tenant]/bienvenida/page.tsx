import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCatalogoArranque } from "@/lib/catalogo-arranque";
import BienvenidaClient from "./BienvenidaClient";

export default async function BienvenidaPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true, businessType: true, themePreset: true },
  });

  if (!tenant) notFound();

  // Los 4 conteos vienen de datos reales (nunca una bandera fabricada) para
  // que el checklist de BienvenidaClient sepa qué pasos ya están hechos,
  // incluso si el negocio los completó desde el menú normal en vez de
  // seguir el flujo lineal de esta pantalla.
  const [productCount, staffCount, cashSessionCount, saleCount] = await Promise.all([
    prisma.product.count({ where: { tenantId: tenant.id } }),
    prisma.staff.count({ where: { tenantId: tenant.id } }),
    prisma.cashSession.count({ where: { tenantId: tenant.id } }),
    prisma.sale.count({ where: { tenantId: tenant.id } }),
  ]);

  return (
    <BienvenidaClient
      tenantSlug={tenantSlug}
      businessName={tenant.name}
      personalizado={tenant.themePreset !== "NEUTRAL_TECH"}
      tieneCatalogo={productCount > 0}
      tieneArranque={getCatalogoArranque(tenant.businessType).length > 0}
      tieneEquipo={staffCount > 0}
      tieneCaja={cashSessionCount > 0}
      tieneVenta={saleCount > 0}
    />
  );
}
