import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCatalogoData } from "@/lib/catalogo-data";
import { getTenantLabels } from "@/lib/labels-server";
import CatalogoClient from "./CatalogoClient";

export default async function CatalogoPage({
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
    getCatalogoData(tenant.id, tenant.branches),
    getTenantLabels(tenant.id, tenant.businessType),
  ]);

  const branches = tenant.branches.map((b) => ({ id: b.id, name: b.name }));

  return <CatalogoClient data={data} labels={labels} branches={branches} tenantSlug={tenantSlug} />;
}
