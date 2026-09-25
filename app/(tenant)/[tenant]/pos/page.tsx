import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
import { getPosData } from "@/lib/pos-data";
import { getRepairParaCobro, type RepairParaCobro } from "@/lib/reparaciones-data";
import { getTenantLabels } from "@/lib/labels-server";
import POSClient from "./POSClient";

export default async function POSPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  // ?repairId=... (2026-09-25) — "Cobrar y entregar" en Reparaciones ahora
  // manda aquí en vez de cobrar aparte (ver el comentario largo en
  // pos-actions.ts). Se resuelve más abajo, junto a getPosData, para
  // precargar el carrito con esa reparación.
  searchParams: Promise<{ repairId?: string }>;
}) {
  const { tenant: tenantSlug } = await params;
  const { repairId } = await searchParams;

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

  // 2026-09-25 — si venimos de "Cobrar y entregar" en Reparaciones, se
  // resuelve la reparación aquí (server) en vez de mandarle al cliente el
  // repairId pelón: vuelve a validar estatus cobrable y, de paso, que la
  // sucursal de la reparación esté dentro de las que este usuario puede
  // operar (branches ya viene recortado a la sucursal del empleado de PIN,
  // si aplica) — si no, se convierte en el mismo error que POSClient ya
  // sabe mostrar, en vez de dejarlo precargar una sucursal a la que no
  // tiene acceso.
  let repairParaCobro: RepairParaCobro | null = null;
  if (repairId) {
    const resuelto = await getRepairParaCobro(tenant.id, repairId);
    repairParaCobro =
      resuelto.ok && !branches.some((b) => b.id === resuelto.branchId)
        ? { ok: false, error: "No tienes acceso a la sucursal de esa reparación" }
        : resuelto;
  }

  const branchInicial =
    repairParaCobro?.ok
      ? repairParaCobro.branchId
      : sucursalDeEmpleado ?? (branches.find((b) => b.id === userBranchId)?.id ?? branches[0]?.id ?? null);

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
      repairParaCobro={repairParaCobro}
    />
  );
}
