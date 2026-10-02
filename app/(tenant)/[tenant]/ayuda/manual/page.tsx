import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getTenantLabels } from "@/lib/labels-server";
import ManualAyudaClient from "./ManualAyudaClient";

// Manual de referencia ("Ayuda" → "Ver el manual completo", 2026-10-02 — ver
// el comentario largo en lib/ayuda-contenido.ts). A diferencia de /ayuda
// (Guía rápida), este NO filtra por rol — cualquiera con acceso a Ayuda
// puede profundizar en cualquier módulo, lo use su rol o no — así que no
// necesita resolver sesión de personal ni checklist de bienvenida, solo los
// módulos que el negocio tiene activos (no tiene caso documentar a fondo un
// módulo que este tenant ni siquiera usa) y los labels para los nombres
// reales por rubro.
export default async function ManualAyudaPage({
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

  const inactivos = await prisma.tenantModule.findMany({
    where: { tenantId: tenant.id, isActive: false },
    select: { module: { select: { code: true } } },
  });
  // Mismo artefacto del cliente de Prisma roto de este sandbox que en
  // ayuda/page.tsx — aquí hace falta ADEMÁS anotar el propio Set (sin esto,
  // tsc lo infiere como Set<unknown> pese a la anotación de `tm`).
  const modulosInactivos = new Set<string>(inactivos.map((tm: { module: { code: string } }) => tm.module.code));

  const labels = await getTenantLabels(tenant.id, tenant.businessType);

  return <ManualAyudaClient tenantSlug={tenantSlug} labels={labels} modulosInactivos={modulosInactivos} />;
}
