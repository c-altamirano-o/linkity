"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { resolverActor } from "@/lib/actor";
import { setTenantLabel } from "@/lib/labels-server";
import { ICONOS_CATALOGO, VOCABULARIO_PERSONALIZABLE, valorPorDefectoDeRubro } from "@/lib/labels";

/**
 * Guarda el vocabulario personalizado del negocio (2026-10-09, a petición de
 * Carlos: "Otro / Personalizar / Especificar" para que el vocabulario por
 * rubro nunca limite). Solo el administrador dueño (módulo "configuracion").
 *
 * Por cada key permitida: un texto vacío, o igual al default del rubro, BORRA
 * el override (así el negocio sigue el rubro si lo cambia más adelante); cualquier
 * otro valor válido lo guarda. Las keys que no estén en la lista de
 * VOCABULARIO_PERSONALIZABLE se ignoran.
 */
export async function guardarVocabularioAction(params: {
  tenantSlug: string;
  valores: Record<string, string>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resuelto = await resolverActor(params.tenantSlug, "configuracion");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const tenantId = resuelto.tenant.id;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { businessType: true } });
  const iconosValidos = new Set(ICONOS_CATALOGO.map((i) => i.value));

  const cambios: { key: string; valor: string | null }[] = [];
  for (const campo of VOCABULARIO_PERSONALIZABLE) {
    if (!(campo.key in params.valores)) continue;
    const valor = String(params.valores[campo.key] ?? "").replace(/\s+/g, " ").trim();
    if (valor.length > campo.max) return { ok: false, error: `"${campo.titulo}" no puede pasar de ${campo.max} caracteres.` };
    if (/[\u0000-\u001f<>]/.test(valor)) return { ok: false, error: `"${campo.titulo}" tiene caracteres no permitidos.` };
    if (campo.tipo === "icono" && valor && !iconosValidos.has(valor)) return { ok: false, error: "Ese ícono no es válido." };
    if (campo.tipo === "opciones" && valor && !(campo.opciones ?? []).some((o) => o.value === valor)) return { ok: false, error: `Valor no válido en "${campo.titulo}".` };
    const porDefecto = valorPorDefectoDeRubro(tenant?.businessType, campo.key);
    cambios.push({ key: campo.key, valor: !valor || valor === porDefecto ? null : valor });
  }

  try {
    for (const c of cambios) await setTenantLabel(tenantId, c.key, c.valor);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    console.error("Error al guardar el vocabulario:", err);
    return { ok: false, error: "No se pudo guardar el vocabulario." };
  }
}
