import "server-only";

import { prisma } from "@/lib/prisma";
import { obtenerCheckoutUrl } from "@/lib/config-plataforma";
import { obtenerEnlacesSuscripcion } from "@/lib/enlaces-suscripcion";
import { construirEnlaceCheckout } from "@/lib/enlaces-planes-puro";

/**
 * Enlaces de la landing: para cada plan comercial activo, su link de pago de
 * Hotmart (link del producto + código de oferta del plan). Nunca lanza: si la
 * base o la configuración fallan, la landing sigue mostrándose y los botones
 * caen al contacto.
 */
export interface EnlacesLanding {
  /** code del plan (BASICO, PRO, ENTERPRISE) → link de pago, o null si falta. */
  porPlan: Record<string, string | null>;
  /** Respaldo cuando un plan aún no tiene link de pago. */
  contactoHref: string | null;
}

export async function obtenerEnlacesLanding(): Promise<EnlacesLanding> {
  const porPlan: Record<string, string | null> = {};
  let contactoHref: string | null = null;
  try {
    contactoHref = (await obtenerEnlacesSuscripcion()).contactoHref;
    const [base, planes] = await Promise.all([
      obtenerCheckoutUrl(),
      prisma.commercialPlan.findMany({ where: { isActive: true }, select: { code: true, hotmartOfferCode: true } }),
    ]);
    for (const p of planes) porPlan[p.code] = construirEnlaceCheckout(base, p.hotmartOfferCode);
  } catch (err) {
    console.error("❌ No se pudieron armar los enlaces de pago de la landing:", err);
  }
  return { porPlan, contactoHref };
}
