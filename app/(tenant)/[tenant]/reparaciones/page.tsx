import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getReparacionesData } from "@/lib/reparaciones-data";
import { getTenantLabels } from "@/lib/labels-server";
import ReparacionesClient from "./ReparacionesClient";

export default async function ReparacionesPage({
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
    getReparacionesData(tenant.id),
    getTenantLabels(tenant.id, tenant.businessType),
  ]);

  return (
    <ReparacionesClient
      data={data}
      labels={labels}
      branches={tenant.branches}
      tenantSlug={tenantSlug}
    />
  );
}
