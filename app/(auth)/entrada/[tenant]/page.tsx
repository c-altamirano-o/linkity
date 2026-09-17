import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { THEME_PRESETS, TENANT_THEME_ROOT_ID } from "@/lib/theme-presets";
import EntradaClient from "./EntradaClient";

/**
 * Pantalla de "entrada por PIN" para personal (M11) — vive fuera de
 * app/(tenant)/[tenant]/ a propósito: ese layout exige una sesión de
 * Supabase Auth para renderizar cualquier ruta hija (ver el guard al
 * inicio de app/(tenant)/[tenant]/layout.tsx), y esta pantalla es
 * justamente la que se usa SIN ninguna sesión todavía — vive junto a
 * /login, /register y /primer-acceso en app/(auth)/, el grupo de rutas
 * que sí es accesible sin autenticar.
 *
 * Solo expone lo mínimo necesario para elegir quién eres (nombre, puesto)
 * — nunca email/teléfono/PIN — mismo criterio de "no exponer de más" que
 * ya se sigue en el resto del proyecto.
 */
export default async function EntradaPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      name: true,
      themePreset: true,
      staff: {
        where: { isActive: true, pinHash: { not: null }, roleId: { not: null } },
        select: { id: true, name: true, position: true },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!tenant) notFound();

  const activePreset = THEME_PRESETS[tenant.themePreset as keyof typeof THEME_PRESETS] || THEME_PRESETS.NEUTRAL_TECH;

  return (
    <div id={TENANT_THEME_ROOT_ID} style={activePreset as React.CSSProperties}>
      <EntradaClient
        tenantSlug={tenantSlug}
        businessName={tenant.name}
        empleados={tenant.staff}
      />
    </div>
  );
}
