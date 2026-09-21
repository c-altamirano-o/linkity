import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
import { getCajaData } from "@/lib/caja-data";
import CajaClient from "./CajaClient";

export default async function CajaPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ sucursal?: string }>;
}) {
  const { tenant: tenantSlug } = await params;
  const { sucursal } = await searchParams;

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

  // 2026-09-21, a petición de Carlos: un empleado de PIN queda FIJO en su
  // propia sucursal (Staff.branchId, vía SesionPersonal.branchId) — el
  // servidor ignora por completo el parámetro ?sucursal= de la URL para
  // él, así nunca puede ver/operar la caja de otra sucursal solo cambiando
  // el link. Un administrador con cuenta real no tiene sesión de personal,
  // así que sigue eligiendo sucursal libremente, igual que siempre.
  const sesionPersonal = await verificarSesionPersonalVigente();
  const sucursalDeEmpleado = sesionPersonal && sesionPersonal.tenantId === tenant.id ? sesionPersonal.branchId : null;

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

  // Para un empleado de PIN, "branches" también se recorta a solo la suya —
  // así el selector de sucursal del cliente ni siquiera ofrece las demás.
  const branches = sucursalDeEmpleado
    ? tenant.branches.filter((b) => b.id === sucursalDeEmpleado)
    : tenant.branches;

  const branchActual = sucursalDeEmpleado ??
    (branches.find((b) => b.id === sucursal)?.id ??
    branches.find((b) => b.id === userBranchId)?.id ??
    branches[0]?.id ??
    null);

  if (!branchActual) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-8 text-center">
        Este negocio todavía no tiene sucursales activas, así que no hay una caja que mostrar.
      </div>
    );
  }

  const data = await getCajaData(tenant.id, branchActual);

  return (
    <CajaClient
      data={data}
      branches={branches}
      branchActual={branchActual}
      tenantSlug={tenantSlug}
      tenantName={tenant.name}
    />
  );
}
