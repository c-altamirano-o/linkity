import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAsistenciaData } from "@/lib/asistencia-data";
import AsistenciaClient from "./AsistenciaClient";

// Panel de Asistencia por login (2026-09-16) — exclusivo del administrador
// (ver el comentario en lib/roles.ts sobre por qué "asistencia" no aparece
// en la matriz de acceso de ningún rol de PIN). Mismo patrón
// page.tsx→lib/<modulo>-data.ts→<Modulo>Client.tsx que el resto del
// proyecto.
export default async function AsistenciaPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, weekStartDay: true } });
  if (!tenant) notFound();

  const { registros, branches } = await getAsistenciaData(tenant.id);

  return (
    <AsistenciaClient
      registros={registros}
      branches={branches}
      tenantSlug={tenantSlug}
      weekStartDay={tenant.weekStartDay}
    />
  );
}
