import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getClientesData } from "@/lib/clientes-data";
import { getTenantLabels } from "@/lib/labels-server";
import ClientesClient from "./ClientesClient";

export default async function ClientesPage({
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

  const [clientes, labels] = await Promise.all([
    getClientesData(tenant.id),
    getTenantLabels(tenant.id, tenant.businessType),
  ]);

  return <ClientesClient clientes={clientes} labels={labels} tenantSlug={tenantSlug} />;
}
