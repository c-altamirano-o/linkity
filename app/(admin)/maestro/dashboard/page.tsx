import Link from "next/link";
import { Plus } from "lucide-react";
import { getMaestroData } from "@/lib/maestro-data";
import MaestroDashboardClient from "./MaestroDashboardClient";

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const PLAN_COLORS = ["bg-[#4F46E5]", "bg-cyan-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500"];

const formatFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

export default async function MaestroDashboard() {
  const data = await getMaestroData();

  const metrics = [
    { label: "Negocios activos", value: String(data.negociosActivos) },
    { label: "En periodo de prueba", value: String(data.enPrueba) },
    { label: "Ingresos MRR", value: formatMXN(data.mrr) },
    { label: "Suscripciones vencidas", value: String(data.suscripcionesVencidas), alert: data.suscripcionesVencidas > 0 },
  ];

  const totalPlanes = data.distribucionPlanes.reduce((s, p) => s + p.count, 0) || 1;

  return (
    <>
      {/* Topbar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-slate-800">Dashboard general</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/maestro/tenants/nuevo"
            className="flex items-center gap-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[12px] font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo negocio
          </Link>
          <div className="w-7 h-7 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-[11px] font-medium">
            A
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">

        {/* Metrics */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {metrics.map((m) => (
            <div key={m.label} className="bg-white border border-slate-200 rounded-lg p-3">
              <p className="text-[11px] text-slate-500 mb-1">{m.label}</p>
              <p className={`text-2xl font-medium ${m.alert ? "text-red-600" : "text-slate-800"}`}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Tenants table */}
        <p className="text-[13px] font-medium text-slate-700 mb-2">Negocios registrados</p>
        <MaestroDashboardClient tenants={data.tenants} />

        {/* Bottom row */}
        <div className="grid grid-cols-2 gap-4">

          {/* Recientes */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-[13px] font-medium text-slate-700 mb-3">Negocios recientes</p>
            {data.recientes.length === 0 ? (
              <p className="text-[12px] text-slate-400">Todavía no hay negocios registrados.</p>
            ) : (
              <div className="space-y-3">
                {data.recientes.map((r) => (
                  <div key={r.id} className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 bg-[#4F46E5]" />
                    <div>
                      <p className="text-[12px] text-slate-700">
                        {r.name}
                        {r.city ? ` — ${r.city}` : ""}
                      </p>
                      <p className="text-[11px] text-slate-400">Registrado el {formatFecha(r.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Plans */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-[13px] font-medium text-slate-700 mb-3">Distribución por plan</p>
            {data.distribucionPlanes.length === 0 ? (
              <p className="text-[12px] text-slate-400">Todavía no hay suscripciones registradas.</p>
            ) : (
              <div className="space-y-3">
                {data.distribucionPlanes.map((p, i) => (
                  <div key={p.plan} className="flex items-center gap-3">
                    <p className="text-[12px] text-slate-600 w-20 truncate" title={p.plan}>{p.plan}</p>
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${PLAN_COLORS[i % PLAN_COLORS.length]}`}
                        style={{ width: `${(p.count / totalPlanes) * 100}%` }}
                      />
                    </div>
                    <p className="text-[12px] font-medium text-slate-700 w-4">{p.count}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
