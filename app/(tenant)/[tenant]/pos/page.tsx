import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
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

  const branches = tenant.branches.map((b) => ({ id: b.id, name: b.name }));
  const branchInicial =
    branches.find((b) => b.id === userBranchId)?.id ?? branches[0]?.id ?? null;

  const [data, labels] = await Promise.all([
    getPosData(tenant.id, tenant.branches),
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
