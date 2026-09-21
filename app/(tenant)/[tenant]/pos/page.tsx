import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
import { getPosData } from "@/lib/pos-data";
import { getTenantLabels } from "@/lib/labels-server";
import POSClient from "./POSClient";

export default async function POSPage({
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

  // 2026-09-21, a petición de Carlos: un empleado de PIN queda FIJO en su
  // propia sucursal (mismo criterio que caja/page.tsx) — se recorta
  // "branches" a solo la suya, tanto para el selector como para el stock
  // por sucursal que arma getPosData a partir de esa lista.
  const sesionPersonal = await verificarSesionPersonalVigente();
  const sucursalDeEmpleado = sesionPersonal && sesionPersonal.tenantId === tenant.id ? sesionPersonal.branchId : null;

  // La sucursal inicial del selector es la del usuario que tiene la sesión
  // abierta (si tiene una asignada); si no, la primera sucursal activa.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userBranchId: string | null = null;
  if (user) {
    const dbUser = await prisma.user.findUnique({
      where: { supabaseId: user.id },
      select: { branchId: true },
    });
    userBranchId = dbUser?.branchId ?? null;
  }

  const branchesTenant = sucursalDeEmpleado
    ? tenant.branches.filter((b) => b.id === sucursalDeEmpleado)
    : tenant.branches;
  const branches = branchesTenant.map((b) => ({ id: b.id, name: b.name }));
  const branchInicial = sucursalDeEmpleado ??
    (branches.find((b) => b.id === userBranchId)?.id ?? branches[0]?.id ?? null);

  const [data, labels] = await Promise.all([
    getPosData(tenant.id, branchesTenant),
    getTenantLabels(tenant.id, tenant.businessType),
  ]);

  return (
    <POSClient
      data={data}
      labels={labels}
      branches={branches}
      branchInicial={branchInicial}
      tenantSlug={tenantSlug}
    />
  );
}
