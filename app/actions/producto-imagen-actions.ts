"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolverActor } from "@/lib/actor";

/**
 * Foto propia de cada producto (2026-09-28, a petición de Carlos: "que el
 * usuario pueda reemplazar los íconos existentes por una foto de su
 * producto"). Calcado casi al pie de la letra de app/actions/logo-actions.ts
 * (logo del negocio) — mismo patrón ya probado en producción, solo cambia
 * el bucket y a qué campo se guarda la URL (Product.image en vez de
 * Tenant.logo). El ícono/emoji del producto NUNCA se borra al subir una
 * foto — <ProductoIcono> (lib/catalogo-iconos.tsx) solo le da prioridad
 * visual mientras la foto exista, así que quitar la foto regresa al ícono
 * de siempre sin que el usuario tenga que volver a elegirlo.
 *
 * Guardado en Supabase Storage, no en la base de datos: el bucket
 * "product-images" se crea solo la primera vez que alguien sube una foto
 * (asegurarBucket). Es un bucket público de solo lectura (como cualquier
 * imagen de producto en cualquier tienda en línea) — la escritura solo pasa
 * por esta Server Action, con el service role key, nunca expuesta al
 * navegador.
 *
 * A diferencia del logo (una sola URL por negocio, se sube desde
 * Configuración con el negocio ya existente), aquí la foto se sube ANTES de
 * guardar el producto — el modal de Catálogo la sube de inmediato al elegir
 * el archivo y guarda la URL resultante en el estado del formulario
 * (form.image), igual que ya hace con el campo `emoji`, así funciona igual
 * para un producto nuevo (sin id todavía) que para uno existente. La ruta en
 * el bucket usa tenantId + timestamp, nunca el id del producto, por eso no
 * hace falta que el producto ya exista para subir su foto. No existe una
 * acción aparte para "quitar" la foto de un producto ya guardado: el modal
 * solo limpia form.image en el cliente y el Guardar normal
 * (editarProductoAction, catalogo-actions.ts) persiste `image: null` igual
 * que cualquier otro cambio de campo — mismo criterio que `emoji`.
 *
 * Cada foto nueva se sube con un nombre distinto (sufijo de timestamp) en
 * vez de sobreescribir el archivo anterior — mismo motivo que el logo: el
 * navegador nunca muestra una versión vieja en caché sin lógica extra de
 * invalidación. El archivo anterior queda huérfano en el bucket si el
 * usuario reemplaza o quita la foto (nunca se borra) — el peso de una foto
 * de producto es mínimo, no vale la pena la complejidad de limpiarlo.
 */

const BUCKET_FOTOS_PRODUCTO = "product-images";
const TIPOS_PERMITIDOS = ["image/png", "image/jpeg", "image/webp"];
const EXT_POR_TIPO: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const TAMANO_MAXIMO = 4 * 1024 * 1024; // 4 MB — fotos de producto reales, más peso que un logo/ícono

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

async function asegurarBucket(supabaseAdmin: SupabaseAdmin) {
  const { data: existente } = await supabaseAdmin.storage.getBucket(BUCKET_FOTOS_PRODUCTO);
  if (existente) return;

  // No se valida el error de creación a propósito (mismo criterio que
  // asegurarBucket en logo-actions.ts): si dos subidas casi simultáneas
  // intentan crear el bucket al mismo tiempo, la segunda falla con
  // "already exists" — no debe tumbar la subida en sí.
  await supabaseAdmin.storage.createBucket(BUCKET_FOTOS_PRODUCTO, {
    public: true,
    fileSizeLimit: TAMANO_MAXIMO,
    allowedMimeTypes: TIPOS_PERMITIDOS,
  });
}

export async function subirFotoProductoAction(
  tenantSlug: string,
  formData: FormData
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const resuelto = await resolverActor(tenantSlug, "catalogo");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  const archivo = formData.get("foto");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona una imagen." };
  }
  if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
    return { ok: false, error: "Formato no soportado. Usa PNG, JPG o WEBP." };
  }
  if (archivo.size > TAMANO_MAXIMO) {
    return { ok: false, error: "La imagen no debe pesar más de 4 MB." };
  }

  const supabaseAdmin = createAdminClient();
  await asegurarBucket(supabaseAdmin);

  const ext = EXT_POR_TIPO[archivo.type] ?? "jpg";
  const ruta = `${resuelto.tenant.id}/producto-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await archivo.arrayBuffer());

  const { error: errorSubida } = await supabaseAdmin.storage
    .from(BUCKET_FOTOS_PRODUCTO)
    .upload(ruta, buffer, { contentType: archivo.type, upsert: false });

  if (errorSubida) {
    console.error("Error subiendo foto de producto a Supabase Storage:", errorSubida);
    return { ok: false, error: "No se pudo subir la imagen. Intenta de nuevo." };
  }

  const { data: publica } = supabaseAdmin.storage.from(BUCKET_FOTOS_PRODUCTO).getPublicUrl(ruta);
  return { ok: true, url: publica.publicUrl };
}
