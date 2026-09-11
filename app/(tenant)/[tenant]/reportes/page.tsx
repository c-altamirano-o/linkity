import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, ShoppingBag, Wrench, Users } from "lucide-react";

interface PageProps {
  params: Promise<{ tenant: string }>;
}

const mockMetrics = {
  totalProducts: 15,
  totalCustomers: 6,
  totalRepairs: 5,
};

export default async function ReportesPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params;
  const tenantName = tenantSlug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reportes Generales</h1>
        <p className="text-muted-foreground">
          Resumen analitico y metricas clave de operacion para {tenantName}.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Productos</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockMetrics.totalProducts}</div>
            <p className="text-xs text-muted-foreground">En catalogo activo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes Registrados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockMetrics.totalCustomers}</div>
            <p className="text-xs text-muted-foreground">Base de lealtad</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reparaciones Totales</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockMetrics.totalRepairs}</div>
            <p className="text-xs text-muted-foreground">Historial de taller</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rendimiento</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Activo</div>
            <p className="text-xs text-muted-foreground">Sincronizado con sucursal</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Analisis de Operaciones</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Este modulo esta preparado para integrar graficas detalladas de ventas, flujos de caja y reparaciones por estatus conforme a los requerimientos de tu operacion.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
