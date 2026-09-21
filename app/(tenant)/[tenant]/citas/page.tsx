import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
import { getCitasData } from "@/lib/citas-data";
import { getTenantLabels } from "@/lib/labels-server";
import CitasClient from "./CitasClient";

export default async function CitasPage({
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
        select: { id: true, name: true },
      },
    },
  });

  if (!tenant) notFound();

  // 2026-09-21, a petición de Carlos: un empleado de PIN solo ve/agenda
  // citas de SU sucursal (mismo criterio que caja/pos) — se recorta tanto
  // los datos (branchIdFiltro) como el selector de sucursal del formulario.
  const sesionPersonal = await verificarSesionPersonalVigente();
  const sucursalDeEmpleado = sesionPersonal && sesionPersonal.tenantId === tenant.id ? sesionPersonal.branchId : null;
  const branches = sucursalDeEmpleado
    ? tenant.branches.filter((b) => b.id === sucursalDeEmpleado)
    : tenant.branches;

  const [data, labels] = await Promise.all([
    getCitasData(tenant.id, sucursalDeEmpleado ?? undefined),
    getTenantLabels(tenant.id, tenant.businessType),
  ]);

  return (
    <CitasClient
      data={data}
      labels={labels}
      branches={branches}
      tenantSlug={tenantSlug}
    />
  );
}
