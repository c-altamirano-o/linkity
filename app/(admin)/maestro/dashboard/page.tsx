import { 
  Building2, TrendingUp, CreditCard, AlertCircle,
  Plus, Settings
} from "lucide-react";

const metrics = [
  { label: "Negocios activos", value: "12", sub: "↑ 2 este mes", subColor: "text-emerald-500" },
  { label: "En periodo de prueba", value: "3", sub: "Vencen en 7 días", subColor: "text-cyan-500" },
  { label: "Ingresos MRR", value: "$4,200", sub: "↑ 12% vs mes ant.", subColor: "text-emerald-500" },
  { label: "Suscripciones vencidas", value: "2", sub: "Requieren atención", subColor: "text-red-500" },
];

const tenants = [
  { name: "Cell Express Delicias", city: "Cd. Delicias, Chih.", plan: "Pro", status: "active", modules: "8/14" },
  { name: "iRepair Chihuahua", city: "Chihuahua, Chih.", plan: "Básico", status: "trial", modules: "5/14" },
  { name: "PhoneFix Parral", city: "Hidalgo del Parral", plan: "Pro", status: "suspended", modules: "8/14" },
  { name: "Celular Plus Juárez", city: "Cd. Juárez, Chih.", plan: "Enterprise", status: "active", modules: "14/14" },
];

const activity = [
  { text: "Cell Express activó módulo Facturación CFDI", time: "Hace 2 horas", color: "bg-emerald-500" },
  { text: "Nuevo negocio registrado: iRepair Chihuahua", time: "Hace 1 día", color: "bg-[#4F46E5]" },
  { text: "PhoneFix Parral — suscripción vencida", time: "Hace 3 días", color: "bg-red-500" },
  { text: "Celular Plus renovó plan Enterprise", time: "Hace 5 días", color: "bg-cyan-500" },
];

const plans = [
  { name: "Enterprise", count: 3, total: 15, color: "bg-[#4F46E5]" },
  { name: "Pro", count: 7, total: 15, color: "bg-cyan-500" },
  { name: "Básico", count: 2, total: 15, color: "bg-emerald-500" },
  { name: "Prueba", count: 3, total: 15, color: "bg-amber-500" },
];

const statusConfig: Record<string, { label: string; classes: string }> = {
  active: { label: "Activo", classes: "bg-emerald-500/10 text-emerald-600" },
  trial: { label: "Prueba", classes: "bg-cyan-500/10 text-cyan-600" },
  suspended: { label: "Vencido", classes: "bg-red-500/10 text-red-600" },
};

export default function MaestroDashboard() {
  return (
    <>
      {/* Topbar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-slate-800">Dashboard general</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[12px] font-medium px-3 py-1.5 rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" />
            Nuevo negocio
          </button>
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
              <p className="text-2xl font-medium text-slate-800">{m.value}</p>
              <p className={`text-[11px] mt-1 ${m.subColor}`}>{m.sub}</p>
            </div>
          ))}
        </div>

        {/* Tenants table */}
        <p className="text-[13px] font-medium text-slate-700 mb-2">Negocios registrados</p>
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-5">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Negocio</th>
                <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Plan</th>
                <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Estado</th>
                <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Módulos</th>
                <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Acción</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.name} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5">
                    <p className="text-[12px] font-medium text-slate-800">{t.name}</p>
                    <p className="text-[11px] text-slate-400">{t.city}</p>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-slate-600">{t.plan}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusConfig[t.status].classes}`}>
                      {statusConfig[t.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-slate-600">{t.modules}</td>
                  <td className="px-4 py-2.5">
                    <button className="text-[11px] text-slate-500 border border-slate-200 hover:border-slate-300 px-2 py-1 rounded transition-colors flex items-center gap-1">
                      <Settings className="w-3 h-3" />
                      Gestionar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-2 gap-4">

          {/* Activity */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-[13px] font-medium text-slate-700 mb-3">Actividad reciente</p>
            <div className="space-y-3">
              {activity.map((a) => (
                <div key={a.text} className="flex items-start gap-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${a.color}`} />
                  <div>
                    <p className="text-[12px] text-slate-700">{a.text}</p>
                    <p className="text-[11px] text-slate-400">{a.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Plans */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-[13px] font-medium text-slate-700 mb-3">Distribución por plan</p>
            <div className="space-y-3">
              {plans.map((p) => (
                <div key={p.name} className="flex items-center gap-3">
                  <p className="text-[12px] text-slate-600 w-20">{p.name}</p>
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${p.color}`}
                      style={{ width: `${(p.count / p.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-[12px] font-medium text-slate-700 w-4">{p.count}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}