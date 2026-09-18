import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDashboardData, getVentasPorDia, hoyMx } from "@/lib/dashboard-data";
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

  // Mismo query de "módulos apagados" que app/(tenant)/[tenant]/layout.tsx
  // y configuracion/page.tsx (2026-09-18) — "default abierto": sin fila en
  // TenantModule, o fila con isActive:true, es módulo activo; solo una fila
  // explícita isActive:false lo apaga. Se necesita aquí porque el Dashboard
  // mostraba "Reparaciones activas", "dispositivos listos" y "devolución"
  // aun en negocios como una barbería que tienen Reparaciones apagado —
  // el guard de layout.tsx solo protege la RUTA /reparaciones, no las
  // tarjetas de resumen que el propio Dashboard arma con sus datos.
  // TenantModule usa llave compuesta (tenantId+moduleId, ver @@id en
  // schema.prisma) — no tiene columna `id` propia, así que el select no
  // puede pedirla (esto tumbó el build: "Object literal may only specify
  // known properties, and 'id' does not exist in type 'TenantModuleSelect'").
  const reparacionesInactiva = await prisma.tenantModule.findFirst({
    where: { tenantId: tenant.id, isActive: false, module: { code: "reparaciones" } },
    select: { tenantId: true },
  });
  const reparacionesActiva = !reparacionesInactiva;

  const [data, labels, ventasPorDiaInicial] = await Promise.all([
    getDashboardData(tenant.id, tenant.branches, tenant.weekStartDay, reparacionesActiva),
    getTenantLabels(tenant.id, tenant.businessType),
    getVentasPorDia(tenant.id, hoyMx()),
  ]);

  return (
    <DashboardClient
      data={data}
      labels={labels}
      tenantSlug={tenantSlug}
      ventasPorDiaInicial={ventasPorDiaInicial}
    />
  );
}
