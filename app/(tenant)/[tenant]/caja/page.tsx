import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
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

  // La sucursal por default es la que viene en la URL (selector de
  // sucursal), o si no la del usuario logueado, o si no la primera activa —
  // mismo criterio que POS.
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

  const branches = tenant.branches;
  const branchActual =
    branches.find((b) => b.id === sucursal)?.id ??
    branches.find((b) => b.id === userBranchId)?.id ??
    branches[0]?.id ??
    null;

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
