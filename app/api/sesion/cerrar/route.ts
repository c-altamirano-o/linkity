import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Cierra la sesión del administrador (Supabase Auth) y lo manda a la puerta de
 * su negocio. Lo usa el layout del tenant cuando la sesión es de un día
 * anterior (2026-10-09, a petición de Carlos: "si se olvidan cerrar sesión, el
 * SaaS tiene que cerrarla al cambiar de fecha"): un Server Component no puede
 * borrar cookies, un Route Handler sí.
 *
 * El slug solo se usa si tiene forma de slug, para que nadie pueda convertir
 * esta ruta en una redirección hacia otro sitio.
 */
export async function GET(request: NextRequest) {
  const tenant = request.nextUrl.searchParams.get("tenant") ?? "";
  const destino = /^[a-z0-9-]{1,80}$/.test(tenant) ? `/${tenant}` : "/login";

  const supabase = await createClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL(destino, request.url));
}
