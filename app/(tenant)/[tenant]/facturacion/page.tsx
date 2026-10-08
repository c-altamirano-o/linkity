import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { tieneFeature, FUNCION_API_FACTURACION } from "@/lib/capacidades-comerciales";
import { getFacturacionData } from "@/lib/facturacion-data";
import { getTenantLabels } from "@/lib/labels-server";
import FacturacionClient from "./FacturacionClient";

export default async function FacturacionPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, businessType: true },
  });

  if (!tenant) notFound();

  // Facturación solo existe en los planes que incluyen API_FACTURACION (el
  // layout ya la oculta del menú; esto cubre la navegación dentro de la app,
  // donde el layout no se vuelve a evaluar).
  if (!(await tieneFeature(tenant.id, FUNCION_API_FACTURACION))) redirect(`/${tenantSlug}/dashboard`);

  const [data, labels] = await Promise.all([
    getFacturacionData(tenant.id),
    getTenantLabels(tenant.id, tenant.businessType),
  ]);

  return <FacturacionClient data={data} labels={labels} tenantSlug={tenantSlug} />;
}
