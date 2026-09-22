import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
import { getReparacionesData } from "@/lib/reparaciones-data";
import { getTenantLabels } from "@/lib/labels-server";
import ReparacionesClient from "./ReparacionesClient";

export default async function ReparacionesPage({
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

  // 2026-09-21, a petición de Carlos: un empleado de PIN solo ve/recibe
  // reparaciones de SU sucursal (mismo criterio que Caja/POS/Citas).
  const sesionPersonal = await verificarSesionPersonalVigente();
  const sucursalDeEmpleado = sesionPersonal && sesionPersonal.tenantId === tenant.id ? sesionPersonal.branchId : null;
  const branches = sucursalDeEmpleado
    ? tenant.branches.filter((b) => b.id === sucursalDeEmpleado)
    : tenant.branches;

  // 2026-09-22: ya no hace falta resolver el roleName aquí — desde la
  // corrección de Carlos, /reparaciones es SIEMPRE la vista de tienda (ver
  // el comentario en ReparacionesClient.tsx); el control de piezas, costo,
  // estatus y técnico vive en /aduana.
  const [data, labels] = await Promise.all([
    getReparacionesData(tenant.id, sucursalDeEmpleado ?? undefined),
    getTenantLabels(tenant.id, tenant.businessType),
  ]);

  return (
    <ReparacionesClient
      data={data}
      labels={labels}
      branches={branches}
      tenantSlug={tenantSlug}
      telefonoNegocio={tenant.phone}
    />
  );
}
