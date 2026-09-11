import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
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

  const [data, labels] = await Promise.all([
    getFacturacionData(tenant.id),
    getTenantLabels(tenant.id, tenant.businessType),
  ]);

  return <FacturacionClient data={data} labels={labels} tenantSlug={tenantSlug} />;
}
