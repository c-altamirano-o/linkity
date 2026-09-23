import { redirect } from "next/navigation";

/**
 * 2026-09-23, a petición de Carlos (ver app/(auth)/[tenant]/page.tsx): el
 * link fijo "de tablet" por sucursal ahora es /[tenant]?sucursal=<branchId>
 * (ver "Copiar link de entrada" en /[tenant]/sucursales, SucursalesClient.tsx)
 * en vez de esta URL — se deja como redirección para no romper los links
 * que un negocio ya haya copiado y pegado en su mostrador antes de este
 * cambio.
 */
export default async function EntradaSucursalPageRedirect({
  params,
}: {
  params: Promise<{ tenant: string; branch: string }>;
}) {
  const { tenant: tenantSlug, branch: branchId } = await params;
  redirect(`/${tenantSlug}?sucursal=${branchId}`);
}
