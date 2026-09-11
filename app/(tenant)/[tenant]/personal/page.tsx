import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPersonalData } from "@/lib/personal-data";
import { getTenantLabels } from "@/lib/labels-server";
import PersonalClient from "./PersonalClient";

export default async function PersonalPage({
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
    getPersonalData(tenant.id),
    getTenantLabels(tenant.id, tenant.businessType),
  ]);

  return (
    <PersonalClient
      data={data}
      labels={labels}
      branches={tenant.branches}
      tenantSlug={tenantSlug}
    />
  );
}
