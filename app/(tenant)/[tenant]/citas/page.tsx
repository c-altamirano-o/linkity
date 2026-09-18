import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCitasData } from "@/lib/citas-data";
import { getTenantLabels } from "@/lib/labels-server";
import CitasClient from "./CitasClient";

export default async function CitasPage({
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
    getCitasData(tenant.id),
    getTenantLabels(tenant.id, tenant.businessType),
  ]);

  return (
    <CitasClient
      data={data}
      labels={labels}
      branches={tenant.branches}
      tenantSlug={tenantSlug}
    />
  );
}
