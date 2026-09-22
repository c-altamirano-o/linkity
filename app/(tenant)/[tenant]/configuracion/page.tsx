import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MODULE_CATALOG } from "@/lib/modules-catalog";
import { modulosRecomendadosOff } from "@/lib/modulos-rubro";
import ConfiguracionClient from "./ConfiguracionClient";

export default async function ConfiguracionPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true, themePreset: true, businessType: true, logo: true, weekStartDay: true, phone: true,
      cobrarEnDevolucion: true,
    },
  });

  if (!tenant) notFound();

  // Módulos: mismo criterio "default abierto" que el guard del layout —
  // solo una fila explícita isActive:false cuenta como desactivada. Ver el
  // comentario largo en app/actions/modulos-tenant-actions.ts.
  const inactivos = await prisma.tenantModule.findMany({
    where: { tenantId: tenant.id, isActive: false },
    select: { module: { select: { code: true } } },
  });
  const codigosInactivos = new Set(inactivos.map((tm) => tm.module.code));

  const modulosPersonalizables = Object.entries(MODULE_CATALOG)
    .filter(([, info]) => !info.isCore)
    .map(([code, info]) => ({ code, name: info.name, activo: !codigosInactivos.has(code) }));

  const recomendadosOff = modulosRecomendadosOff(tenant.businessType);

  return (
    <ConfiguracionClient
      tenantSlug={tenantSlug}
      themePresetInicial={tenant.themePreset}
      businessTypeInicial={tenant.businessType}
      modulos={modulosPersonalizables}
      recomendadosOff={recomendadosOff}
      logoInicial={tenant.logo}
      weekStartDayInicial={tenant.weekStartDay}
      supportPhoneInicial={tenant.phone}
      cobrarEnDevolucionInicial={tenant.cobrarEnDevolucion}
    />
  );
}
