import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCatalogoArranque } from "@/lib/catalogo-arranque";
import { obtenerEstadoPasosBienvenida } from "@/lib/onboarding";
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

  // 2026-09-29: el cálculo de los 4 conteos + la comparación de tema ahora
  // vive en lib/onboarding.ts (obtenerEstadoPasosBienvenida), compartido con
  // TenantLayout.tsx (el atajo "Primeros pasos" del encabezado) — un solo
  // criterio para los dos, para no repetir el bug que ya pasó una vez
  // (Paso 1 comparando contra un default de tema que ya no era el real).
  const estado = await obtenerEstadoPasosBienvenida(tenant.id, tenant.themePreset);

  return (
    <BienvenidaClient
      tenantSlug={tenantSlug}
      businessName={tenant.name}
      personalizado={estado.personalizado}
      tieneCatalogo={estado.tieneCatalogo}
      tieneArranque={getCatalogoArranque(tenant.businessType).length > 0}
      tieneEquipo={estado.tieneEquipo}
      tieneCaja={estado.tieneCaja}
      tieneVenta={estado.tieneVenta}
    />
  );
}
