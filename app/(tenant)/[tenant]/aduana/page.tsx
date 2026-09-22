import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getReparacionesData } from "@/lib/reparaciones-data";
import { getTenantLabels } from "@/lib/labels-server";
import AduanaClient from "./AduanaClient";

/**
 * "Aduana" / Recepción del taller (2026-09-22, corrección explícita de
 * Carlos con el ejemplo hipotético "Fix Expres") — módulo APARTE de
 * "reparaciones" y "taller" (ver el comentario largo de "aduana" en
 * lib/roles.ts) porque el guard de ruta del layout
 * (app/(tenant)/[tenant]/layout.tsx) gatea acceso por el SEGMENTO de la URL
 * contra los módulos permitidos del rol — un rol con "aduana" es el ÚNICO
 * que puede asignar técnico, cambiar el estatus del equipo y ajustar
 * costo/piezas cotizadas.
 *
 * Sin filtro de sucursal a propósito (a diferencia de /reparaciones,
 * /pos, /citas, /caja) — el taller es una ubicación CENTRAL que recibe
 * equipos de varias sucursales/tiendas, así que Recepción/Aduana debe ver y
 * operar todos los folios del negocio, sin importar en qué sucursal se
 * recibió el equipo.
 */
export default async function AduanaPage({
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

  const [data, labels] = await Promise.all([
    getReparacionesData(tenant.id, undefined),
    getTenantLabels(tenant.id, tenant.businessType),
  ]);

  return <AduanaClient data={data} labels={labels} tenantSlug={tenantSlug} />;
}
