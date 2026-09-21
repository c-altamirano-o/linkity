import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
import { getComprasData } from "@/lib/compras-data";
import { getTenantLabels } from "@/lib/labels-server";
import ComprasClient from "./ComprasClient";

export default async function ComprasPage({
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

  // 2026-09-21, a petición de Carlos: un empleado de PIN solo ve/registra
  // compras de SU sucursal (mismo criterio que Caja/POS/Citas/Reparaciones).
  const sesionPersonal = await verificarSesionPersonalVigente();
  const sucursalDeEmpleado = sesionPersonal && sesionPersonal.tenantId === tenant.id ? sesionPersonal.branchId : null;
  const branches = sucursalDeEmpleado
    ? tenant.branches.filter((b) => b.id === sucursalDeEmpleado)
    : tenant.branches;

  const [data, labels] = await Promise.all([
    getComprasData(tenant.id, sucursalDeEmpleado ?? undefined),
    getTenantLabels(tenant.id, tenant.businessType),
  ]);

  return (
    <ComprasClient
      data={data}
      labels={labels}
      branches={branches}
      tenantSlug={tenantSlug}
    />
  );
}
