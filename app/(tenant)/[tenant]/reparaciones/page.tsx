import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
import { getReparacionesData } from "@/lib/reparaciones-data";
import { getTenantLabels } from "@/lib/labels-server";
import { resolverActor } from "@/lib/actor";
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

  // roleName real (lib/actor.ts) — decide si esta página se ve como
  // mostrador (Cajero) o tablero completo (dueño, Gerente, Técnico). El
  // guard de acceso al módulo ya corrió en el layout; esta llamada extra es
  // solo para saber CUÁL vista mostrar, así que si por algo no resuelve
  // (no debería pasar, ya que el layout ya lo validó) se cae al tablero
  // completo — las acciones que sí mutan datos se siguen validando aparte
  // en cada Server Action.
  const [data, labels, actorInfo] = await Promise.all([
    getReparacionesData(tenant.id, sucursalDeEmpleado ?? undefined),
    getTenantLabels(tenant.id, tenant.businessType),
    resolverActor(tenantSlug, "reparaciones"),
  ]);

  return (
    <ReparacionesClient
      data={data}
      labels={labels}
      branches={branches}
      tenantSlug={tenantSlug}
      roleName={actorInfo.ok ? actorInfo.roleName : null}
      telefonoNegocio={tenant.phone}
    />
  );
}
