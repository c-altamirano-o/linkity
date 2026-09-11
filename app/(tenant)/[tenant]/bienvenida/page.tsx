import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import BienvenidaClient from "./BienvenidaClient";

export default async function BienvenidaPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { name: true, businessType: true },
  });

  if (!tenant) notFound();

  return <BienvenidaClient tenantSlug={tenantSlug} businessName={tenant.name} />;
}
