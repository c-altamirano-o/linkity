import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolverAdminNegocio, obtenerDatosAjuste, sincronizarExceso } from "@/lib/exceso-plan";
import AjustePlanClient from "@/components/tenant/AjustePlanClient";

/**
 * /[tenant]/ajustar-plan — pantalla para elegir qué sucursales y empleados
 * conservar cuando el negocio excede su plan (Paso 5, 2026-10-08). Mientras
 * corren los 7 días de gracia se llega aquí desde el banner; pasado el plazo,
 * [tenant]/layout.tsx muestra este mismo componente en vez de todo el panel.
 *
 * Solo el administrador con cuenta real puede verla (resolverAdminNegocio).
 * Si ya no hay exceso, regresa al panel.
 */
export default async function AjustarPlanPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;

  const admin = await resolverAdminNegocio(tenant);
  if (!admin.ok) redirect(`/${tenant}/dashboard`);

  const sub = await prisma.subscription.findUnique({
    where: { tenantId: admin.tenantId },
    select: { status: true, excesoDetectadoAt: true },
  });
  const estado = await sincronizarExceso(admin.tenantId, {
    status: sub?.status ?? admin.status,
    excesoDetectadoAt: sub?.excesoDetectadoAt ?? null,
  });
  if (!estado.activo) redirect(`/${tenant}/dashboard`);

  const datos = await obtenerDatosAjuste(admin.tenantId, estado);
  return <AjustePlanClient tenantSlug={tenant} datos={datos} modo="pagina" />;
}
