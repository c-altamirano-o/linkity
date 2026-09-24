import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDashboardData, getVentasPorDia, hoyMx } from "@/lib/dashboard-data";
import { getTenantLabels } from "@/lib/labels-server";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
import { verTodoNegocioParaRolPorNombre } from "@/lib/roles-server";
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

  // 2026-09-24, corrigiendo un hueco real que Carlos encontró probando el
  // sistema como empleado (Andrea Zamora, rol "Asesor de Ventas" en el demo
  // de reparación de celulares): esta pantalla nunca aplicaba el mismo
  // recorte por sucursal que ya usan Reportes/Caja/Inventario desde el
  // 2026-09-21 — CUALQUIER empleado con PIN, sin importar su rol, veía el
  // Dashboard COMPLETO del negocio (las 5 sucursales, el switch "Vista
  // global/Por sucursal", montos de ventas de tiendas ajenas a la suya).
  // Mismo criterio que esos tres módulos: un administrador con cuenta real
  // sigue viendo todo, sin cambios; un empleado de PIN queda FIJO en su
  // propia sucursal salvo que su rol tenga Role.verTodoNegocio
  // ("Supervisor de Sucursales", ver el comentario largo en schema.prisma).
  const sesionPersonal = await verificarSesionPersonalVigente();
  const sesionValida = sesionPersonal && sesionPersonal.tenantId === tenant.id ? sesionPersonal : null;
  const veTodoElNegocio = sesionValida ? await verTodoNegocioParaRolPorNombre(tenant.id, sesionValida.roleName) : false;
  const sucursalDeEmpleado = sesionValida && !veTodoElNegocio ? sesionValida.branchId : null;

  // Un empleado fijo en su sucursal nunca ve las demás — ni en el selector
  // de "Por sucursal" ni en "Resumen por sucursal" (que se oculta solo con
  // que `branches` traiga una sola, ver data.multiSucursal en
  // lib/dashboard-data.ts). Se ignora por completo el ?sucursal= de la URL
  // para él (mismo criterio que caja/page.tsx) — nunca puede ver otra
  // sucursal solo cambiando el link.
  const branchesVisibles = sucursalDeEmpleado
    ? tenant.branches.filter((b) => b.id === sucursalDeEmpleado)
    : tenant.branches;

  // Se valida que el ?sucursal= de la URL sea de verdad una sucursal activa
  // de ESTE tenant (nunca se confía en el id tal cual) — un valor que no
  // coincida con ninguna simplemente cae de vuelta a la vista global, en
  // vez de mostrar un error.
  const branchIdFiltro = sucursalDeEmpleado ?? tenant.branches.find((b) => b.id === sucursal)?.id;

  const [data, labels, ventasPorDiaInicial] = await Promise.all([
    getDashboardData(tenant.id, branchesVisibles, tenant.weekStartDay, reparacionesActiva, branchIdFiltro, tenant.dashboardCategoriasConfig),
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
      branches={branchesVisibles}
      sucursalActualId={branchIdFiltro ?? null}
      // 2026-09-24, a petición de Carlos (revisión de permisos): "Configurar
      // categorías" cambia Tenant.dashboardCategoriasConfig, que es
      // COMPARTIDO por todo el negocio, no por empleado — antes cualquier
      // PIN con el módulo "dashboard" (prácticamente todos) podía alterar lo
      // que ve el resto del equipo (ver el mismo candado ya aplicado del
      // lado del servidor en guardarConfigCategoriasDashboardAction,
      // dashboard-actions.ts). Un administrador (sin sesión de personal) o
      // un Supervisor de Sucursales sí puede; un empleado normal ya ni ve el
      // botón de engrane.
      puedeConfigurarCategorias={!sesionValida || veTodoElNegocio}
    />
  );
}
