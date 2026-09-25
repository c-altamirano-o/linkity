import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
import { getReportesData, getReportesClinicosData } from "@/lib/reportes-data";
import { verTodoNegocioParaRolPorNombre, verMontosCajaParaRolPorNombre } from "@/lib/roles-server";
import { getTenantLabels } from "@/lib/labels-server";
import { label } from "@/lib/labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, ShoppingBag, Wrench, Users, TrendingUp, TrendingDown, Stethoscope, CalendarCheck } from "lucide-react";

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
  // Mismo query "módulo apagado" que arriba, para expediente-clinico (M17,
  // Fase 2, Tarea #42, 2026-09-21) — igual que en clientes/page.tsx.
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

  // 2026-09-21, a petición de Carlos: un empleado de PIN solo ve las cifras
  // de SU sucursal, no las del negocio completo — antes este reporte
  // siempre agregaba TODO el tenant sin importar quién lo pidiera (ver el
  // comentario largo en lib/reportes-data.ts). Un administrador no tiene
  // sesión de personal, así que sigue viendo el negocio completo.
  const sesionPersonal = await verificarSesionPersonalVigente();
  const sesionValida = sesionPersonal && sesionPersonal.tenantId === tenant.id ? sesionPersonal : null;
  // "Supervisor de Sucursales" (2026-09-24, a petición de Carlos: ver el
  // comentario largo junto a Role.verTodoNegocio, schema.prisma) — un rol
  // con este permiso ve el negocio completo aunque tenga sesión de
  // personal, igual que un administrador.
  const veTodoElNegocio = sesionValida ? await verTodoNegocioParaRolPorNombre(tenant.id, sesionValida.roleName) : false;
  const sucursalDeEmpleado = sesionValida && !veTodoElNegocio ? sesionValida.branchId : null;

  // 2026-09-24, a petición de Carlos (revisión de permisos) — hueco real:
  // esta pantalla ya recortaba por sucursal desde el 2026-09-21, pero
  // nunca tuvo el mismo candado anti-fraude de Role.verMontosCaja que ya
  // protegen Caja/Sucursales/Dashboard — cualquier empleado con el módulo
  // "reportes" veía "Ventas del mes", el desglose por método de pago y la
  // producción en pesos de cada doctor, sin importar su rol. A diferencia
  // de Caja/Sucursales (que redactan con un candado/"Oculto"), aquí Carlos
  // pidió NO hacer eso — cada tarjeta que es puramente dinero se omite por
  // completo cuando puedeVerMontos es false, en vez de mostrarla con un
  // valor redactado. Esta página es un Server Component puro (sin ningún
  // Client Component que reciba estos montos como prop), así que con solo
  // no incluir esa tarjeta en el árbol, el monto real ni siquiera llega al
  // navegador — no hace falta una función de redacción aparte como en
  // Dashboard.
  const puedeVerMontos = sesionValida ? await verMontosCajaParaRolPorNombre(tenant.id, sesionValida.roleName) : true;

  const [reportes, reportesClinicos, labels] = await Promise.all([
    getReportesData(tenant.id, reparacionesActiva, sucursalDeEmpleado ?? undefined),
    getReportesClinicosData(tenant.id, expedienteActiva, sucursalDeEmpleado ?? undefined),
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

        {puedeVerMontos && (
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
        )}
      </div>

      {(reportes.reparacionesActiva || puedeVerMontos) && (
      <div className={`grid gap-4 ${reportes.reparacionesActiva && puedeVerMontos ? "md:grid-cols-2" : ""}`}>
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

        {puedeVerMontos && (
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
        )}
      </div>
      )}

      {/* Reportes clínicos — M17, Fase 2, Tarea #42, 2026-09-21. Solo para
          rubros con expediente-clinico activo (dental/médico/veterinaria).
          Ver el comentario largo en getReportesClinicosData
          (lib/reportes-data.ts) sobre el alcance real de "citas por doctor"
          como proxy de ocupación de agenda. */}
      {reportesClinicos.activo && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Reportes clínicos</h2>
            <p className="text-sm text-muted-foreground">Producción, presupuestos y agenda del mes en curso.</p>
          </div>

          <div className={`grid gap-4 ${puedeVerMontos ? "md:grid-cols-2" : ""}`}>
            {puedeVerMontos && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Stethoscope className="h-4 w-4 text-muted-foreground" /> Producción por doctor este mes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {reportesClinicos.produccionPorDoctor.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Todavía no hay ventas ni fases de tratamiento pagadas este mes.</p>
                  ) : (
                    <div className="space-y-3">
                      {reportesClinicos.produccionPorDoctor.map((p) => (
                        <div key={p.doctorUserId} className="flex items-center justify-between text-sm">
                          <div>
                            <p className="font-medium">{p.doctor}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatMXN(p.ventas)} en ventas · {formatMXN(p.tratamientos)} en tratamientos
                            </p>
                          </div>
                          <span className="font-semibold">{formatMXN(p.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Tasa de aceptación de presupuestos</CardTitle>
              </CardHeader>
              <CardContent>
                {reportesClinicos.aceptacionPresupuestos.tasaAceptacionPct === null ? (
                  <p className="text-sm text-muted-foreground">
                    Todavía no hay fases de plan de tratamiento aceptadas o rechazadas para calcular una tasa.
                    {reportesClinicos.aceptacionPresupuestos.propuestos > 0 &&
                      ` (${reportesClinicos.aceptacionPresupuestos.propuestos} propuesta(s) pendiente(s) de decisión)`}
                  </p>
                ) : (
                  <>
                    <div className="text-3xl font-bold mb-1">{reportesClinicos.aceptacionPresupuestos.tasaAceptacionPct}%</div>
                    <p className="text-xs text-muted-foreground">
                      {reportesClinicos.aceptacionPresupuestos.aceptados} aceptada(s) · {reportesClinicos.aceptacionPresupuestos.rechazados} rechazada(s)
                      {reportesClinicos.aceptacionPresupuestos.propuestos > 0 &&
                        ` · ${reportesClinicos.aceptacionPresupuestos.propuestos} pendiente(s) de decisión`}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-muted-foreground" /> Citas por doctor este mes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {reportesClinicos.citasPorDoctor.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no hay citas completadas, canceladas o con inasistencia este mes.</p>
              ) : (
                <div className="space-y-2">
                  {reportesClinicos.citasPorDoctor.map((c) => (
                    <div key={c.doctorUserId} className="flex items-center justify-between text-sm">
                      <span className="font-medium">{c.doctor}</span>
                      <span className="text-muted-foreground">
                        {c.completadas} completada(s) · {c.noShow} inasistencia(s) · {c.canceladas} cancelada(s)
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                Proxy de ocupación de agenda a partir de citas realizadas — un % de ocupación real requeriría definir horario/capacidad por doctor, que Linkity todavía no modela.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
