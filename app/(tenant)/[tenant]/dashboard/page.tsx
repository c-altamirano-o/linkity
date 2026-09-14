import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDashboardData } from "@/lib/dashboard-data";
import { getTenantLabels } from "@/lib/labels-server";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage({
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
        select: { id: true, name: true, isActive: true },
      },
    },
  });

  if (!tenant) notFound();

  const [data, labels] = await Promise.all([
    getDashboardData(tenant.id, tenant.branches),
    getTenantLabels(tenant.id, tenant.businessType),
  ]);

  return <DashboardClient data={data} labels={labels} tenantSlug={tenantSlug} />;
}
