import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
import { getReparacionesData } from "@/lib/reparaciones-data";
import { getTenantLabels } from "@/lib/labels-server";
import TallerClient from "./TallerClient";

/**
 * "Taller" (2026-09-21, a petición de Carlos) — la vista del técnico
 * reparador: sus reparaciones pendientes, agregar piezas usadas y avanzar el
 * estatus. A propósito una página APARTE de /reparaciones (no la misma
 * página con un roleName distinto, como ya se hacía para Cajero) porque el
 * guard de ruta del layout (app/(tenant)/[tenant]/layout.tsx) gatea acceso
 * por el SEGMENTO de la URL contra los módulos permitidos del rol — un rol
 * con "taller" (no "reparaciones") solo puede entrar aquí. Ver el
 * comentario largo de "taller" en lib/roles.ts para el porqué completo.
 *
 * Reusa getReparacionesData tal cual (ya viene con el filtro por sucursal
 * de 2026-09-21) — el recorte real de qué puede HACER el técnico con esos
 * datos (nada de eliminar pieza, costo, cobro ni contacto al cliente) vive
 * en TallerClient (qué botones se ofrecen) y, lo que de verdad importa, en
 * cada Server Action de reparaciones-actions.ts (qué acepta el servidor).
 */
export default async function TallerPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, businessType: true },
  });

  if (!tenant) notFound();

  const sesionPersonal = await verificarSesionPersonalVigente();
  const sucursalDeEmpleado = sesionPersonal && sesionPersonal.tenantId === tenant.id ? sesionPersonal.branchId : null;

  const [data, labels] = await Promise.all([
    getReparacionesData(tenant.id, sucursalDeEmpleado ?? undefined),
    getTenantLabels(tenant.id, tenant.businessType),
  ]);

  return <TallerClient data={data} labels={labels} tenantSlug={tenantSlug} />;
}
