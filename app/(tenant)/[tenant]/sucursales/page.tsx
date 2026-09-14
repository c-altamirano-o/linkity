import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSucursalesData } from "@/lib/sucursales-data";
import SucursalesClient from "./SucursalesClient";

export default async function SucursalesPage({
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

  const data = await getSucursalesData(tenant.id);

  return <SucursalesClient data={data} tenantSlug={tenantSlug} />;
}
