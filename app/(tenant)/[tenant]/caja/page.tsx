import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
import { getCajaData, redactarMontosCaja } from "@/lib/caja-data";
import { verMontosCajaParaRolPorNombre } from "@/lib/roles-server";
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

  // 2026-09-24, a petición de Carlos (seguridad anti-fraude, ver el
  // comentario largo en Role.verMontosCaja, schema.prisma): un
  // administrador con cuenta real ve montos siempre, sin excepción — un
  // empleado de PIN solo si su rol tiene marcado "puede ver montos de
  // Caja". Se decide y se redacta AQUÍ, en el servidor, antes de que
  // CajaData llegue al cliente — CajaClient.tsx nunca recibe los montos
  // reales si este empleado no debe verlos, no es un simple "ocultar en
  // pantalla".
  const puedeVerMontos = sucursalDeEmpleado
    ? await verMontosCajaParaRolPorNombre(tenant.id, sesionPersonal!.roleName)
    : true;

  const dataCompleta = await getCajaData(tenant.id, branchActual);
  const data = puedeVerMontos ? dataCompleta : redactarMontosCaja(dataCompleta);

  return (
    <CajaClient
      data={data}
      branches={branches}
      branchActual={branchActual}
      tenantSlug={tenantSlug}
      tenantName={tenant.name}
      puedeVerMontos={puedeVerMontos}
    />
  );
}
