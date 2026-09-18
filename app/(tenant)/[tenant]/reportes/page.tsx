import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getReportesData } from "@/lib/reportes-data";
import { getTenantLabels } from "@/lib/labels-server";
import { label } from "@/lib/labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, ShoppingBag, Wrench, Users, TrendingUp, TrendingDown } from "lucide-react";

interface PageProps {
  params: Promise<{ tenant: string }>;
}

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const METODO_TEXTO: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  MIXED: "Mixto",
};

export default async function ReportesPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, businessType: true, name: true },
  });

  if (!tenant) notFound();

  // Mismo query de "módulo apagado" que dashboard/page.tsx y
  // app/(tenant)/[tenant]/layout.tsx (2026-09-18) — Reportes mostraba
  // siempre las tarjetas "Reparaciones Totales" y "Reparaciones por
  // estatus" aunque el negocio (ej. una barbería) tuviera ese módulo
  // apagado.
  // TenantModule usa llave compuesta (tenantId+moduleId, ver @@id en
  // schema.prisma) — no tiene columna `id` propia, así que el select no
  // puede pedirla (esto tumbó el build: "Object literal may only specify
  // known properties, and 'id' does not exist in type 'TenantModuleSelect'").
  const reparacionesInactiva = await prisma.tenantModule.findFirst({
    where: { tenantId: tenant.id, isActive: false, module: { code: "reparaciones" } },
    select: { tenantId: true },
  });
  const reparacionesActiva = !reparacionesInactiva;

  const [reportes, labels] = await Promise.all([
    getReportesData(tenant.id, reparacionesActiva),
    getTenantLabels(tenant.id, tenant.businessType),
  ]);

  const tenantName = tenant.name;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reportes Generales</h1>
        <p className="text-muted-foreground">
          Resumen analítico y métricas clave de operación para {tenantName}.
        </p>
      </div>

      <div className={`grid gap-4 md:grid-cols-2 ${reportes.reparacionesActiva ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Productos</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reportes.totalProductos}</div>
            <p className="text-xs text-muted-foreground">En catálogo activo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes Registrados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reportes.totalClientes}</div>
            <p className="text-xs text-muted-foreground">Base de lealtad</p>
          </CardContent>
        </Card>

        {reportes.reparacionesActiva && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{label(labels, "entity.repair.plural")} Totales</CardTitle>
              <Wrench className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{reportes.totalReparaciones}</div>
              <p className="text-xs text-muted-foreground">{reportes.reparacionesActivas} activas ahora</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ventas del mes</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMXN(reportes.ventasMes)}</div>
            {reportes.crecimientoVentasPct === null ? (
              <p className="text-xs text-muted-foreground">Sin datos del mes anterior para comparar</p>
            ) : (
              <p className={`text-xs flex items-center gap-1 ${reportes.crecimientoVentasPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {reportes.crecimientoVentasPct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {reportes.crecimientoVentasPct >= 0 ? "+" : ""}{reportes.crecimientoVentasPct}% vs. mes anterior
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className={`grid gap-4 ${reportes.reparacionesActiva ? "md:grid-cols-2" : ""}`}>
        {reportes.reparacionesActiva && (
          <Card>
            <CardHeader>
              <CardTitle>{label(labels, "entity.repair.plural")} por estatus</CardTitle>
            </CardHeader>
            <CardContent>
              {reportes.reparacionesPorEstado.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Todavía no se ha recibido ninguna {label(labels, "entity.repair.singular").toLowerCase()}.
                </p>
              ) : (
                <div className="space-y-2">
                  {reportes.reparacionesPorEstado.map((r) => (
                    <div key={r.estado} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{label(labels, `repair.status.${r.estado}`)}</span>
                      <span className="font-medium">{r.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Ventas del mes por método de pago</CardTitle>
          </CardHeader>
          <CardContent>
            {reportes.ventasPorMetodo.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay ventas completadas este mes.</p>
            ) : (
              <div className="space-y-2">
                {reportes.ventasPorMetodo.map((v) => (
                  <div key={v.metodo} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{METODO_TEXTO[v.metodo] ?? v.metodo}</span>
                    <span className="font-medium">{formatMXN(v.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
