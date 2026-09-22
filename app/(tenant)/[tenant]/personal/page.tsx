import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPersonalData } from "@/lib/personal-data";
import { getTenantLabels } from "@/lib/labels-server";
import { listarRolesTenant } from "@/lib/roles-server";
import { puestosSugeridos } from "@/lib/puestos-rubro";
import PersonalClient from "./PersonalClient";

export default async function PersonalPage({
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
        select: { id: true, name: true },
      },
    },
  });

  if (!tenant) notFound();

  // roles: catálogo de roles asignables de este negocio (base + los que el
  // propio admin haya creado desde "Roles y permisos" — ver
  // lib/roles-server.ts). puestos: solo texto sugerido para el <datalist>
  // de "Puesto", no tiene ningún efecto en permisos (ver lib/puestos-rubro.ts).
  const [data, labels, roles, inactivos] = await Promise.all([
    getPersonalData(tenant.id),
    getTenantLabels(tenant.id, tenant.businessType),
    listarRolesTenant(tenant.id),
    // Mismo query que app/(tenant)/[tenant]/layout.tsx para el menú lateral
    // (ver el comentario largo ahí) — aquí alimenta el selector de casillas
    // de "Roles y permisos" (RolesManager.tsx) para que solo ofrezca
    // módulos que este negocio realmente tiene activos.
    prisma.tenantModule.findMany({
      where: { tenantId: tenant.id, isActive: false },
      select: { module: { select: { code: true } } },
    }),
  ]);
  const puestos = puestosSugeridos(tenant.businessType);
  const modulosInactivos = inactivos.map((tm) => tm.module.code);
  // "taller"/"aduana" (2026-09-22) no viven en lib/modules-catalog.ts — no
  // son una capacidad de negocio que se prenda/apague por su cuenta, son la
  // versión angosta de "Reparaciones" para un rol específico (ver el
  // comentario largo en lib/roles.ts y en RolesManager.tsx). Por eso nunca
  // aparecen en `inactivos` (no tienen fila TenantModule propia) y hay que
  // agregarlos aquí a mano cuando "reparaciones" está apagado para este
  // negocio, para que el selector de "Roles y permisos" los oculte igual.
  if (modulosInactivos.includes("reparaciones")) {
    modulosInactivos.push("taller", "aduana");
  }

  return (
    <PersonalClient
      data={data}
      labels={labels}
      branches={tenant.branches}
      tenantSlug={tenantSlug}
      roles={roles}
      puestosSugeridos={puestos}
      modulosInactivos={modulosInactivos}
    />
  );
}
