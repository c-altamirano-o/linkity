import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { THEME_PRESETS, TENANT_THEME_ROOT_ID } from "@/lib/theme-presets";
import EntradaClient from "../EntradaClient";

/**
 * Pantalla real de "entrada por PIN" (2026-09-21, a petición de Carlos) —
 * a diferencia de la anterior versión de /entrada/[tenant] (que ahora es
 * solo un selector de sucursal, ver ese page.tsx), esta SÍ filtra la lista
 * de personal a la sucursal de la URL: para un negocio de varias
 * sucursales, cada una tiene su propio link para pegar en su tablet/mostrador
 * (ver el botón "Copiar link de entrada" en /[tenant]/sucursales), y en esa
 * pantalla solo aparece SU personal, nunca el de las demás.
 *
 * La validación que de verdad importa (que el PIN de un empleado solo
 * abra sesión si branchId coincide con el suyo) vive en
 * iniciarSesionPersonalAction (acceso-personal-actions.ts) — este filtro de
 * aquí es nada más para que la lista que se ve tenga sentido.
 */
export default async function EntradaSucursalPage({
  params,
}: {
  params: Promise<{ tenant: string; branch: string }>;
}) {
  const { tenant: tenantSlug, branch: branchId } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      name: true,
      themePreset: true,
      branches: {
        where: { id: branchId, isActive: true },
        select: { id: true, name: true },
      },
      staff: {
        where: { isActive: true, pinHash: { not: null }, roleId: { not: null }, branchId },
        select: { id: true, name: true, position: true },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!tenant) notFound();
  const sucursal = tenant.branches[0];
  if (!sucursal) notFound();

  const activePreset = THEME_PRESETS[tenant.themePreset as keyof typeof THEME_PRESETS] || THEME_PRESETS.NEUTRAL_TECH;

  return (
    <div id={TENANT_THEME_ROOT_ID} style={activePreset as React.CSSProperties}>
      <EntradaClient
        tenantSlug={tenantSlug}
        branchId={sucursal.id}
        businessName={tenant.name}
        branchName={sucursal.name}
        empleados={tenant.staff}
      />
    </div>
  );
}
