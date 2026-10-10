import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MODULE_CATALOG } from "@/lib/modules-catalog";
import { modulosRecomendadosOff } from "@/lib/modulos-rubro";
import { getEstadoTallerChecklist } from "@/lib/roles-server";
import { getTenantLabels } from "@/lib/labels-server";
import { VOCABULARIO_PERSONALIZABLE } from "@/lib/labels";
import ConfiguracionClient from "./ConfiguracionClient";

export default async function ConfiguracionPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true, themePreset: true, themeIntensity: true, themeIntensityFondo: true, themeCustomColors: true, businessType: true, logo: true, weekStartDay: true, phone: true,
      cobrarEnDevolucion: true, montoDevolucion: true, telefonoClienteObligatorio: true, cajaRapida: true, address: true, rfc: true, reciboMensajePie: true, reciboExtra: true, reciboFormato: true,
      reciboMostrarQR: true, reciboQrDestino: true, reciboQrUrl: true, reciboQrEtiqueta: true,
      // whatsappAccessToken SÍ se selecciona aquí (Server Component, nunca
      // sale de este proceso) pero se convierte a boolean antes de pasarlo
      // a ConfiguracionClient (ver abajo) — es sensible, el valor real
      // jamás debe llegar a un Client Component. whatsappPhoneNumberId no
      // es secreto, ese sí se pasa tal cual. whatsappNumeroManual tampoco es
      // secreto (ver el comentario en schema.prisma) — se pasa tal cual.
      whatsappPhoneNumberId: true, whatsappAccessToken: true, whatsappAppSecret: true, whatsappNumeroManual: true,
    },
  });

  if (!tenant) notFound();

  // Módulos: mismo criterio "default abierto" que el guard del layout —
  // solo una fila explícita isActive:false cuenta como desactivada. Ver el
  // comentario largo en app/actions/modulos-tenant-actions.ts.
  const inactivos = await prisma.tenantModule.findMany({
    where: { tenantId: tenant.id, isActive: false },
    select: { module: { select: { code: true } } },
  });
  const codigosInactivos = new Set(inactivos.map((tm) => tm.module.code));

  const modulosPersonalizables = Object.entries(MODULE_CATALOG)
    .filter(([, info]) => !info.isCore)
    .map(([code, info]) => ({ code, name: info.name, activo: !codigosInactivos.has(code) }));

  const recomendadosOff = modulosRecomendadosOff(tenant.businessType);
  const checklistTaller = await getEstadoTallerChecklist(tenant.id, tenant.businessType);
  const labelsResueltos = await getTenantLabels(tenant.id, tenant.businessType);
  const vocabularioActual = Object.fromEntries(VOCABULARIO_PERSONALIZABLE.map((c) => [c.key, labelsResueltos[c.key] ?? ""]));

  return (
    <ConfiguracionClient
      tenantSlug={tenantSlug}
      themePresetInicial={tenant.themePreset}
      themeIntensityInicial={tenant.themeIntensity}
      themeIntensityFondoInicial={tenant.themeIntensityFondo}
      themeCustomColorsInicial={tenant.themeCustomColors}
      businessTypeInicial={tenant.businessType}
      vocabularioActual={vocabularioActual}
      labels={labelsResueltos}
      reparacionesActivo={!codigosInactivos.has("reparaciones")}
      clinicoActivo={!codigosInactivos.has("expediente-clinico") && !recomendadosOff.includes("expediente-clinico")}
      modulos={modulosPersonalizables}
      recomendadosOff={recomendadosOff}
      logoInicial={tenant.logo}
      weekStartDayInicial={tenant.weekStartDay}
      supportPhoneInicial={tenant.phone}
      cobrarEnDevolucionInicial={tenant.cobrarEnDevolucion}
      montoDevolucionInicial={Number(tenant.montoDevolucion)}
      telefonoClienteObligatorioInicial={tenant.telefonoClienteObligatorio}
      cajaRapidaInicial={tenant.cajaRapida}
      direccionTicketInicial={tenant.address}
      rfcTicketInicial={tenant.rfc}
      mensajePieTicketInicial={tenant.reciboMensajePie}
      extraTicketInicial={tenant.reciboExtra}
      formatoTicketInicial={tenant.reciboFormato}
      mostrarQRTicketInicial={tenant.reciboMostrarQR}
      qrDestinoTicketInicial={tenant.reciboQrDestino}
      qrUrlTicketInicial={tenant.reciboQrUrl}
      qrEtiquetaTicketInicial={tenant.reciboQrEtiqueta}
      whatsappPhoneNumberIdInicial={tenant.whatsappPhoneNumberId}
      whatsappTieneTokenInicial={Boolean(tenant.whatsappAccessToken)}
      whatsappTieneAppSecretInicial={Boolean(tenant.whatsappAppSecret)}
      whatsappNumeroManualInicial={tenant.whatsappNumeroManual}
      checklistTaller={checklistTaller}
    />
  );
}
