import "server-only";

import { getTenantPrisma } from "@/lib/prisma";
import { DEFAULT_LABELS, VERTICAL_LABEL_DEFAULTS, type LabelDictionary } from "@/lib/labels";

/**
 * Parte de la capa de labels que sí toca base de datos. Solo se importa
 * desde Server Components (page.tsx) o Server Actions — el `import
 * "server-only"` de arriba hace que el build truene con un mensaje claro
 * si algún día alguien lo importa por error desde un Client Component,
 * en vez del error críptico de "Can't resolve 'dns'".
 */

/**
 * Trae y resuelve el diccionario completo de labels de un tenant,
 * ya mezclado con los defaults de su rubro y los genéricos.
 *
 * Pensado para llamarse una vez por request (ej. en el page.tsx de cada
 * módulo) y pasar el resultado hacia abajo como prop, en vez de hacer una
 * consulta por cada texto.
 */
export async function getTenantLabels(
  tenantId: string,
  businessType?: string | null
): Promise<LabelDictionary> {
  const db = getTenantPrisma(tenantId);
  const overrides = await db.tenantLabel.findMany({
    select: { key: true, value: true },
  });

  const verticalDefaults =
    (businessType && VERTICAL_LABEL_DEFAULTS[businessType]) || {};

  const merged: LabelDictionary = {
    ...DEFAULT_LABELS,
    ...verticalDefaults,
  };

  for (const { key, value } of overrides) {
    merged[key] = value;
  }

  return merged;
}

/**
 * Guarda (o quita, pasando value=null) la personalización de una key
 * para un tenant. No toca DEFAULT_LABELS ni VERTICAL_LABEL_DEFAULTS —
 * solo el override puntual de ese tenant.
 */
export async function setTenantLabel(
  tenantId: string,
  key: string,
  value: string | null
) {
  const db = getTenantPrisma(tenantId);

  if (value === null) {
    await db.tenantLabel.deleteMany({ where: { key } });
    return;
  }

  await db.tenantLabel.upsert({
    where: { tenantId_key: { tenantId, key } },
    update: { value },
    // tenantId aquí es redundante en tiempo de ejecución (getTenantPrisma
    // ya lo inyecta en la rama create), pero TypeScript no sabe que la
    // extensión hace eso — el tipo generado de TenantLabelCreateInput
    // exige tenantId como campo requerido, así que hay que escribirlo
    // explícito para que compile.
    create: { tenantId, key, value },
  });
}
