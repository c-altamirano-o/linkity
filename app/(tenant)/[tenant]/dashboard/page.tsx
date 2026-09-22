import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDashboardData, getVentasPorDia, hoyMx } from "@/lib/dashboard-data";
import { getTenantLabels } from "@/lib/labels-server";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  // "Vista por sucursal" (2026-09-22, a petición de Carlos: "en el
  // dashboard de administrador debe contener una vista global y una por
  // tienda") — mismo patrón que ya usa caja/page.tsx (?sucursal=<id>):
  // ausente = vista global (comportamiento de siempre); presente = todo el
  // Dashboard (tarjetas, gráficas, tablas, alertas) se acota a esa sola
  // sucursal, reutilizando el mismo layout — ver DashboardClient.tsx.
  searchParams: Promise<{ sucursal?: string }>;
}) {
  const { tenant: tenantSlug } = await params;
  const { sucursal } = await searchParams;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    include: {
      branches: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, isActive: true },
      },
    },
  });

  if (!tenant) notFound();

  // Mismo query de "módulos apagados" que app/(tenant)/[tenant]/layout.tsx
  // y configuracion/page.tsx (2026-09-18) — "default abierto": sin fila en
  // TenantModule, o fila con isActive:true, es módulo activo; solo una fila
  // explícita isActive:false lo apaga. Se necesita aquí porque el Dashboard
  // mostraba "Reparaciones activas", "dispositivos listos" y "devolución"
  // aun en negocios como una barbería que tienen Reparaciones apagado —
  // el guard de layout.tsx solo protege la RUTA /reparaciones, no las
  // tarjetas de resumen que el propio Dashboard arma con sus datos.
  // TenantModule usa llave compuesta (tenantId+moduleId, ver @@id en
  // schema.prisma) — no tiene columna `id` propia, así que el select no
  // puede pedirla (esto tumbó el build: "Object literal may only specify
  // known properties, and 'id' does not exist in type 'TenantModuleSelect'").
  const reparacionesInactiva = await prisma.tenantModule.findFirst({
    where: { tenantId: tenant.id, isActive: false, module: { code: "reparaciones" } },
    select: { tenantId: true },
  });
  const reparacionesActiva = !reparacionesInactiva;

  // Se valida que el ?sucursal= de la URL sea de verdad una sucursal activa
  // de ESTE tenant (nunca se confía en el id tal cual) — un valor que no
  // coincida con ninguna simplemente cae de vuelta a la vista global, en
  // vez de mostrar un error.
  const branchIdFiltro = tenant.branches.find((b) => b.id === sucursal)?.id;

  const [data, labels, ventasPorDiaInicial] = await Promise.all([
    getDashboardData(tenant.id, tenant.branches, tenant.weekStartDay, reparacionesActiva, branchIdFiltro, tenant.dashboardCategoriasConfig),
    getTenantLabels(tenant.id, tenant.businessType),
    getVentasPorDia(tenant.id, hoyMx(), branchIdFiltro),
  ]);

  return (
    <DashboardClient
      // 2026-09-22: se remonta el componente completo al cambiar de
      // sucursal (o volver a la vista global) — sin esto, el useState de
      // varios pedazos del Dashboard (config. de categorías, selector de
      // fecha de "ventas por día", etc.) se quedaría con los valores de la
      // sucursal anterior tras la navegación, porque Next.js reutiliza la
      // misma instancia del client component cuando solo cambia el
      // searchParam de la misma ruta.
      key={branchIdFiltro ?? "global"}
      data={data}
      labels={labels}
      tenantSlug={tenantSlug}
      ventasPorDiaInicial={ventasPorDiaInicial}
      branches={tenant.branches}
      sucursalActualId={branchIdFiltro ?? null}
    />
  );
}
