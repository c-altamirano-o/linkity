import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
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

  // 2026-09-21, a petición de Carlos: un empleado de PIN solo ve/ajusta el
  // stock de SU sucursal — se recorta la lista de sucursales que arma el
  // desglose por sucursal en getInventarioData (mismo criterio que POS).
  const sesionPersonal = await verificarSesionPersonalVigente();
  const sucursalDeEmpleado = sesionPersonal && sesionPersonal.tenantId === tenant.id ? sesionPersonal.branchId : null;
  const branchesTenant = sucursalDeEmpleado
    ? tenant.branches.filter((b) => b.id === sucursalDeEmpleado)
    : tenant.branches;

  const [{ productos }, labels] = await Promise.all([
    getInventarioData(tenant.id, branchesTenant),
    getTenantLabels(tenant.id, tenant.businessType),
  ]);

  const branches = branchesTenant.map((b) => ({ id: b.id, name: b.name }));

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
