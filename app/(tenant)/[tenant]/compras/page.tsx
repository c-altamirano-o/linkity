import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getComprasData } from "@/lib/compras-data";
import { getTenantLabels } from "@/lib/labels-server";
import ComprasClient from "./ComprasClient";

export default async function ComprasPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    include: {
      branches: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
      },
    },
  });

  if (!tenant) notFound();

  const [data, labels] = await Promise.all([
    getComprasData(tenant.id),
    getTenantLabels(tenant.id, tenant.businessType),
  ]);

  return (
    <ComprasClient
      data={data}
      labels={labels}
      branches={tenant.branches}
      tenantSlug={tenantSlug}
    />
  );
}
