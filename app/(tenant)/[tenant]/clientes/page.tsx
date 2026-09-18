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

  // Mismo query de "módulo apagado" que dashboard/page.tsx, reportes/page.tsx
  // y layout.tsx (2026-09-18) — la ficha de un cliente mostraba siempre la
  // tarjeta "Reparaciones" y la pestaña "Reparaciones" del historial aunque
  // el negocio (ej. una barbería) tuviera ese módulo apagado.
  // TenantModule usa llave compuesta (tenantId+moduleId, ver @@id en
  // schema.prisma) — no tiene columna `id` propia, así que el select no
  // puede pedirla.
  const reparacionesInactiva = await prisma.tenantModule.findFirst({
    where: { tenantId: tenant.id, isActive: false, module: { code: "reparaciones" } },
    select: { tenantId: true },
  });
  const reparacionesActiva = !reparacionesInactiva;

  const [clientes, labels] = await Promise.all([
    getClientesData(tenant.id),
    getTenantLabels(tenant.id, tenant.businessType),
  ]);

  return (
    <ClientesClient
      clientes={clientes}
      labels={labels}
      tenantSlug={tenantSlug}
      reparacionesActiva={reparacionesActiva}
    />
  );
}
