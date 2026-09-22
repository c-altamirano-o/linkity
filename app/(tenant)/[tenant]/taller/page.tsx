import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
import { getReparacionesData } from "@/lib/reparaciones-data";
import { getTenantLabels } from "@/lib/labels-server";
import { verTodoTallerParaRolPorNombre } from "@/lib/roles-server";
import TallerClient from "./TallerClient";

/**
 * "Taller" (2026-09-21, a petición de Carlos; corregido 2026-09-22) — la
 * vista de SOLO LECTURA del técnico reparador: sus reparaciones asignadas,
 * datos restringidos (sin contacto del cliente) y una alerta a Aduana/
 * Recepción/Tienda cuando necesita info o cotización. A propósito una
 * página APARTE de /reparaciones (no la misma página con un roleName
 * distinto, como ya se hacía para Cajero) porque el guard de ruta del
 * layout (app/(tenant)/[tenant]/layout.tsx) gatea acceso por el SEGMENTO de
 * la URL contra los módulos permitidos del rol — un rol con "taller" (no
 * "reparaciones" ni "aduana") solo puede entrar aquí. Ver el comentario
 * largo de "taller" en lib/roles.ts para el porqué completo.
 *
 * 2026-09-22: a diferencia de /reparaciones y /pos/citas/caja, aquí NO se
 * filtra por sucursal del empleado — el taller es CENTRAL (una sola
 * ubicación que recibe equipos de varias sucursales/tiendas, según el
 * modelo de Carlos), así que un técnico o el "Jefe de técnicos" debe poder
 * ver reparaciones recibidas en cualquier sucursal. El recorte real de qué
 * folios ve cada quien (solo los propios vs. todos) ya NO se hace por
 * sucursal sino por tecnicoAsignadoId (miStaffId) o por verTodoTaller —
 * ambos resueltos aquí y aplicados en TallerClient.
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
  const sesionValidaDeEsteTenant = sesionPersonal && sesionPersonal.tenantId === tenant.id ? sesionPersonal : null;

  const [data, labels, verTodoTaller] = await Promise.all([
    getReparacionesData(tenant.id, undefined),
    getTenantLabels(tenant.id, tenant.businessType),
    verTodoTallerParaRolPorNombre(tenant.id, sesionValidaDeEsteTenant?.roleName),
  ]);

  return (
    <TallerClient
      data={data}
      labels={labels}
      tenantSlug={tenantSlug}
      miStaffId={sesionValidaDeEsteTenant?.staffId ?? null}
      verTodoTaller={verTodoTaller}
    />
  );
}
