import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ConfiguracionClient from "./ConfiguracionClient";

export default async function ConfiguracionPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { themePreset: true, businessType: true },
  });

  if (!tenant) notFound();

  return (
    <ConfiguracionClient
      tenantSlug={tenantSlug}
      themePresetInicial={tenant.themePreset}
      businessTypeInicial={tenant.businessType}
    />
  );
}
