import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getClientesData } from "@/lib/clientes-data";
import { getExpedientesData } from "@/lib/expediente-data";
import { getPlanesTratamientoData } from "@/lib/tratamiento-data";
import { getConsentimientosData } from "@/lib/consentimiento-data";
import { PLANTILLAS_CONSENTIMIENTO } from "@/lib/consentimiento-templates";
import { getTenantLabels } from "@/lib/labels-server";
import ClientesClient from "./ClientesClient";

export default async function ClientesPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, businessType: true },
  });

  if (!tenant) notFound();

  // Sucursales activas — igual que citas/page.tsx, hacen falta para el
  // selector de sucursal al crear un Plan de Tratamiento (M17, Fase 2).
  const branches = await prisma.branch.findMany({
    where: { tenantId: tenant.id, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  // Mismo query de "módulo apagado" que dashboard/page.tsx, reportes/page.tsx
  // y layout.tsx (2026-09-18) — la ficha de un cliente mostraba siempre la
  // tarjeta "Reparaciones" y la pestaña "Reparaciones" del historial aunque
  // el negocio (ej. una barbería) tuviera ese módulo apagado.
  // TenantModule usa llave compuesta (tenantId+moduleId, ver @@id en
  // schema.prisma) — no tiene columna `id` propia, así que el select no
  // puede pedirla.
  // Mismo query que reparacionesInactiva de abajo, para el módulo Expediente
  // Clínico (M16, 2026-09-18) — embebido en esta misma pantalla, así que la
  // pestaña correspondiente en ClientesClient.tsx se oculta igual que la de
  // Reparaciones cuando el negocio lo tiene apagado.
  const [reparacionesInactiva, expedienteInactivo] = await Promise.all([
    prisma.tenantModule.findFirst({
      where: { tenantId: tenant.id, isActive: false, module: { code: "reparaciones" } },
      select: { tenantId: true },
    }),
    prisma.tenantModule.findFirst({
      where: { tenantId: tenant.id, isActive: false, module: { code: "expediente-clinico" } },
      select: { tenantId: true },
    }),
  ]);
  const reparacionesActiva = !reparacionesInactiva;
  const expedienteActiva = !expedienteInactivo;

  const [clientes, expedientes, planesTratamiento, consentimientos, labels] = await Promise.all([
    getClientesData(tenant.id),
    expedienteActiva ? getExpedientesData(tenant.id) : Promise.resolve({}),
    // Plan de Tratamiento (M17, Fase 2) vive bajo el mismo módulo
    // expediente-clinico — mismo criterio "apagado = no se consulta ni se
    // manda al cliente" que expedientes arriba.
    expedienteActiva
      ? getPlanesTratamientoData(tenant.id)
      : Promise.resolve({ planes: {}, doctores: [] }),
    // Consentimiento Informado (M17, Fase 2) — mismo criterio.
    expedienteActiva ? getConsentimientosData(tenant.id) : Promise.resolve({}),
    getTenantLabels(tenant.id, tenant.businessType),
  ]);

  return (
    <ClientesClient
      clientes={clientes}
      labels={labels}
      tenantSlug={tenantSlug}
      reparacionesActiva={reparacionesActiva}
      expedienteActiva={expedienteActiva}
      // El odontograma solo aplica a un consultorio dental (dientes) — ver
      // el comentario largo en schema.prisma (M16).
      odontogramaActivo={tenant.businessType === "consultorio_dental"}
      expedientes={expedientes}
      planesTratamiento={planesTratamiento.planes}
      doctores={planesTratamiento.doctores}
      branches={branches}
      consentimientos={consentimientos}
      plantillasConsentimiento={PLANTILLAS_CONSENTIMIENTO[tenant.businessType] ?? []}
    />
  );
}
