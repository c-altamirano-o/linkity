import { redirect } from "next/navigation";

/**
 * 2026-09-23, a petición de Carlos (ver app/(auth)/[tenant]/page.tsx): el
 * link que se reparte para entrar a un negocio ahora es la raíz del tenant
 * (/[tenant]), no /entrada/[tenant] — esta ruta se deja solo como
 * redirección, por si algún link viejo ya repartido/guardado en un
 * marcador todavía apunta aquí.
 */
export default async function EntradaSelectorPageRedirect({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;
  redirect(`/${tenantSlug}`);
}
