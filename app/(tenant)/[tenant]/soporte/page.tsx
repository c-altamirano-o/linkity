import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getTicketsData } from "@/lib/soporte-data";
import SoporteClient from "./SoporteClient";

export default async function SoportePage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true },
  });

  if (!tenant) notFound();

  const tickets = await getTicketsData(tenant.id);

  return <SoporteClient tickets={tickets} tenantSlug={tenantSlug} />;
}
