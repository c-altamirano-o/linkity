import "server-only";

import { prisma } from "@/lib/prisma";

export interface PruebaUsadaUI {
  id: string;
  emailCanonico: string;
  emailOriginal: string;
  tenantSlug: string | null;
  createdAt: string; // ISO
  negocioExiste: boolean;
}

/** Registro de correos que ya usaron su prueba gratis (política: una por persona). */
export async function getPruebasUsadas(): Promise<PruebaUsadaUI[]> {
  const filas = await prisma.pruebaGratisUsada.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  const slugs = filas.map((f) => f.tenantSlug).filter((s): s is string => !!s);
  const existentes = await prisma.tenant.findMany({ where: { slug: { in: slugs } }, select: { slug: true } });
  const vivos = new Set(existentes.map((t) => t.slug));
  return filas.map((f) => ({
    id: f.id,
    emailCanonico: f.emailCanonico,
    emailOriginal: f.emailOriginal,
    tenantSlug: f.tenantSlug,
    createdAt: f.createdAt.toISOString(),
    negocioExiste: !!f.tenantSlug && vivos.has(f.tenantSlug),
  }));
}
