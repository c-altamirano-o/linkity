"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverActor } from "@/lib/actor";

/**
 * Logo propio de cada negocio (2026-09-17, tercer pendiente de la ronda de
 * personalización que abrió Carlos tras probar en producción — "mi logo
 * aparece, pero el cliente también quisiera ver el suyo"). El de Linkity en
 * el sidebar NO se toca (eso sigue siendo la marca de la plataforma); esto
 * es un logo aparte, propio de cada tenant, que se muestra en un área del
 * encabezado que antes estaba vacía (ver TenantShell.tsx).
 *
 * El campo `Tenant.logo` ya existía en el schema desde antes (nunca se
 * había usado) — no hizo falta ningún cambio de schema/`db push` para esto.
 *
 * Guardado en Supabase Storage, no en la base de datos: el bucket
 * "tenant-logos" se crea solo la primera vez que alguien sube un logo
 * (asegurarBucket) — Carlos no tiene que crear nada a mano en el dashboard
 * de Supabase. Es un bucket público (de solo lectura para cualquiera con la
 * URL, como cualquier logo en cualquier sitio web) — la escritura solo pasa
 * por esta Server Action, con el service role key, nunca expuesta al
 * navegador.
 *
 * Cada logo nuevo se sube con un nombre distinto (sufijo de timestamp) en
 * vez de sobreescribir el archivo anterior — así el navegador nunca
 * muestra una versión vieja en caché sin necesidad de lógica extra de
 * invalidación. El archivo anterior queda huérfano en el bucket (nunca se
 * borra); el peso de un logo es mínimo, así que no vale la pena la
 * complejidad de limpiarlo.
 *
 * Mismo guard que alternarModuloPropioAction (modulos-tenant-actions.ts):
 * resolverActor(tenantSlug, "configuracion") — "configuracion" no está en
 * la matriz de acceso de ningún rol de PIN (lib/roles.ts), así que un
 * empleado con sesión de personal nunca puede llegar aquí, solo el dueño/
 * gerente con cuenta real.
 */

const BUCKET_LOGOS = "tenant-logos";
const TIPOS_PERMITIDOS = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const EXT_POR_TIPO: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const TAMANO_MAXIMO = 2 * 1024 * 1024; // 2 MB

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

async function asegurarBucket(supabaseAdmin: SupabaseAdmin) {
  const { data: existente } = await supabaseAdmin.storage.getBucket(BUCKET_LOGOS);
  if (existente) return;

  // No se valida el error de creación a propósito: si dos subidas casi
  // simultáneas (poco probable, un solo admin por negocio) intentan crear
  // el bucket al mismo tiempo, la segunda falla con "already exists" — eso
  // no debe tumbar la subida del logo en sí, el upload de abajo funciona
  // igual una vez que el bucket existe.
  await supabaseAdmin.storage.createBucket(BUCKET_LOGOS, {
    public: true,
    fileSizeLimit: TAMANO_MAXIMO,
    allowedMimeTypes: TIPOS_PERMITIDOS,
  });
}

export async function subirLogoAction(
  tenantSlug: string,
  formData: FormData
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const resuelto = await resolverActor(tenantSlug, "configuracion");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  const archivo = formData.get("logo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona una imagen." };
  }
  if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
    return { ok: false, error: "Formato no soportado. Usa PNG, JPG, WEBP o SVG." };
  }
  if (archivo.size > TAMANO_MAXIMO) {
    return { ok: false, error: "La imagen no debe pesar más de 2 MB." };
  }

  const supabaseAdmin = createAdminClient();
  await asegurarBucket(supabaseAdmin);

  const ext = EXT_POR_TIPO[archivo.type] ?? "png";
  const ruta = `${resuelto.tenant.id}/logo-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await archivo.arrayBuffer());

  const { error: errorSubida } = await supabaseAdmin.storage
    .from(BUCKET_LOGOS)
    .upload(ruta, buffer, { contentType: archivo.type, upsert: false });

  if (errorSubida) {
    console.error("Error subiendo logo a Supabase Storage:", errorSubida);
    return { ok: false, error: "No se pudo subir la imagen. Intenta de nuevo." };
  }

  const { data: publica } = supabaseAdmin.storage.from(BUCKET_LOGOS).getPublicUrl(ruta);

  await prisma.tenant.update({
    where: { id: resuelto.tenant.id },
    data: { logo: publica.publicUrl },
  });

  revalidatePath("/", "layout");
  return { ok: true, url: publica.publicUrl };
}

export async function eliminarLogoAction(
  tenantSlug: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resuelto = await resolverActor(tenantSlug, "configuracion");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  // Solo se limpia la referencia en Tenant.logo — el archivo se queda en el
  // bucket (mismo criterio que al reemplazar un logo por otro, ver arriba).
  await prisma.tenant.update({
    where: { id: resuelto.tenant.id },
    data: { logo: null },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
