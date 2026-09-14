import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getInventarioData } from "@/lib/inventario-data";
import { getTenantLabels } from "@/lib/labels-server";
import InventarioClient from "./InventarioClient";

export default async function InventarioPage({
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

  const [{ productos }, labels] = await Promise.all([
    getInventarioData(tenant.id, tenant.branches),
    getTenantLabels(tenant.id, tenant.businessType),
  ]);

  const branches = tenant.branches.map((b) => ({ id: b.id, name: b.name }));

  return (
    <InventarioClient
      productos={productos}
      labels={labels}
      branches={branches}
      tenantSlug={tenantSlug}
      tenantName={tenant.name}
    />
  );
}
