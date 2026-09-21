"use client";

import type { MaestroReportesData } from "@/lib/maestro-reportes-data";

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const PLAN_COLORS = ["bg-[#4F46E5]", "bg-cyan-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500"];

export default function ReportesClient({ data }: { data: MaestroReportesData }) {
  const maxAltas = Math.max(1, ...data.altasPorMes.map((m) => m.count));
  const totalPlanes = data.ingresosPorPlan.reduce((s, p) => s + p.negocios, 0) || 1;

  return (
    <div className="space-y-4">
      {/* Métricas principales */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-[12.5px] text-slate-500 mb-1">Negocios totales</p>
          <p className="text-2xl font-medium text-slate-800">{data.totalNegocios}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-[12.5px] text-slate-500 mb-1">MRR actual</p>
          <p className="text-2xl font-medium text-slate-800">{formatMXN(data.mrrActual)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-[12.5px] text-slate-500 mb-1">Ingreso promedio / negocio activo</p>
          <p className="text-2xl font-medium text-slate-800">{formatMXN(data.arpu)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-[12.5px] text-slate-500 mb-1">Suspendidos / cancelados</p>
          <p className="text-2xl font-medium text-slate-800">{data.estados.suspendidos + data.estados.cancelados}</p>
        </div>
      </div>

      {/* Altas por mes */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <p className="text-[14.5px] font-medium text-slate-700 mb-1">Negocios nuevos por mes</p>
        <p className="text-[12.5px] text-slate-400 mb-4">Últimos 12 meses, según fecha de alta real de cada negocio</p>
        <div className="flex items-end gap-2 h-32">
          {data.altasPorMes.map((m) => (
            <div key={m.mes} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="w-full flex items-end justify-center h-24">
                <div
                  className="w-full max-w-[22px] bg-[#4F46E5] rounded-t"
                  style={{ height: `${(m.count / maxAltas) * 100}%`, minHeight: m.count > 0 ? "4px" : "0" }}
                  title={`${m.count} negocio${m.count === 1 ? "" : "s"}`}
                />
              </div>
              <p className="text-[11.5px] text-slate-500">{m.count}</p>
              <p className="text-[10.5px] text-slate-400">{m.mes}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Ingresos por plan */}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-[14.5px] font-medium text-slate-700 mb-3">MRR por plan</p>
          {data.ingresosPorPlan.length === 0 ? (
            <p className="text-[13.5px] text-slate-400">Todavía no hay suscripciones activas.</p>
          ) : (
            <div className="space-y-3">
              {data.ingresosPorPlan.map((p, i) => (
                <div key={p.plan} className="flex items-center gap-3">
                  <p className="text-[13.5px] text-slate-600 w-20 truncate" title={p.plan}>{p.plan}</p>
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${PLAN_COLORS[i % PLAN_COLORS.length]}`}
                      style={{ width: `${(p.negocios / totalPlanes) * 100}%` }}
                    />
                  </div>
                  <p className="text-[13.5px] font-medium text-slate-700 w-20 text-right">{formatMXN(p.mrr)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Estados */}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-[14.5px] font-medium text-slate-700 mb-3">Estado actual de tus negocios</p>
          <dl className="space-y-2 text-[13.5px]">
            <div className="flex justify-between">
              <dt className="text-slate-500">Activos</dt>
              <dd className="font-medium text-emerald-600">{data.estados.activos}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">En periodo de prueba</dt>
              <dd className="font-medium text-cyan-600">{data.estados.enPrueba}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Suspendidos</dt>
              <dd className="font-medium text-slate-600">{data.estados.suspendidos}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Cancelados</dt>
              <dd className="font-medium text-slate-400">{data.estados.cancelados}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Sin suscripción</dt>
              <dd className="font-medium text-slate-400">{data.estados.sinSuscripcion}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
