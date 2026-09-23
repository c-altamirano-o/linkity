"use server";

import { prisma } from "@/lib/prisma";
import { verificarClaveNegocio, crearSesionGate } from "@/lib/staff-auth";

/**
 * Server Action de la "puerta" de /[tenant] (2026-09-23, a petición de
 * Carlos — ver el comentario largo en lib/staff-auth.ts y en
 * app/actions/tenant.ts, actualizarClaveAccesoNegocioAction). Verifica la
 * contraseña de acceso al negocio (Tenant.accessPasswordHash) y, si es
 * correcta, deja una cookie de "pase" en este navegador (crearSesionGate)
 * para no volver a pedirla en la próxima visita.
 *
 * Esto NO es login de nadie — ni administrador ni empleado. Es solo la
 * cortina antes de elegir cuál de los dos eres, pensada para que el link
 * del negocio (linkity-phi.vercel.app/<slug>) no sea usable por cualquiera
 * que se lo sepa o adivine.
 */

export type AccionAccesoNegocioResult = { ok: true } | { ok: false; error: string };

export async function verificarClaveAccesoNegocioAction(params: {
  tenantSlug: string;
  clave: string;
}): Promise<AccionAccesoNegocioResult> {
  const { tenantSlug, clave } = params;

  if (!clave) return { ok: false, error: "Escribe la contraseña de acceso" };

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, accessPasswordHash: true },
  });
  if (!tenant) return { ok: false, error: "Negocio no encontrado" };

  if (!tenant.accessPasswordHash) {
    // No debería pasar en condiciones normales — la página
    // app/(auth)/[tenant]/page.tsx ya salta este paso por completo cuando el
    // negocio no tiene contraseña de acceso configurada — pero por si acaso
    // se llega aquí de otra forma, no se deja pasar con ningún valor.
    return { ok: false, error: "Este negocio no tiene una puerta de acceso configurada" };
  }

  if (!verificarClaveNegocio(clave, tenant.accessPasswordHash)) {
    return { ok: false, error: "Contraseña incorrecta" };
  }

  await crearSesionGate(tenant.id, tenant.accessPasswordHash);
  return { ok: true };
}
