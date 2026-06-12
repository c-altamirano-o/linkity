"use client";

import { ShoppingCart, Wrench, AlertTriangle, Clock, ArrowUpRight, ArrowDownRight, CheckCircle, RotateCcw, Receipt } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const ventasSemana = [
  { dia: "Lun", ventas: 4200, reparaciones: 1800 },
  { dia: "Mar", ventas: 3800, reparaciones: 2200 },
  { dia: "Mié", ventas: 5100, reparaciones: 1500 },
  { dia: "Jue", ventas: 4800, reparaciones: 2800 },
  { dia: "Vie", ventas: 6200, reparaciones: 3100 },
  { dia: "Sáb", ventas: 8400, reparaciones: 2400 },
  { dia: "Hoy", ventas: 3240, reparaciones: 1200 },
];

const ventasPorCategoria = [
  { name: "Celulares",    value: 58, color: "#4F46E5" },
  { name: "Accesorios",   value: 22, color: "#06B6D4" },
  { name: "Reparaciones", value: 15, color: "#10B981" },
  { name: "Refacciones",  value: 5,  color: "#F59E0B" },
];

const reparaciones = [
  { folio: "REP-0042", cliente: "Carlos Mendoza", equipo: "iPhone 13 Pro", estado: "en_reparacion", prioridad: "alta" },
  { folio: "REP-0041", cliente: "María González", equipo: "Samsung S22",   estado: "listo_taller",  prioridad: "normal" },
  { folio: "REP-0040", cliente: "Roberto Díaz",   equipo: "iPhone 12",     estado: "listo_tienda",  prioridad: "normal" },
  { folio: "REP-0039", cliente: "Ana López",      equipo: "Xiaomi 11T",    estado: "recibido",      prioridad: "baja" },
];

const alertas = [
  { tipo: "stock",      texto: "Pantalla iPhone 13 — Stock bajo (2 unidades)", color: "text-amber-600", bg: "bg-amber-50 border-amber-200", icon: AlertTriangle },
  { tipo: "reparacion", texto: "REP-0038 lleva 5 días sin actualización",       color: "text-red-600",   bg: "bg-red-50 border-red-200",     icon: Clock },
  { tipo: "stock",      texto: "Batería Samsung S22 — Agotado",                 color: "text-amber-600", bg: "bg-amber-50 border-amber-200", icon: AlertTriangle },
  { tipo: "stock",      texto: "Xiaomi Redmi Note 12 — Agotado",                color: "text-amber-600", bg: "bg-amber-50 border-amber-200", icon: AlertTriangle },
];

const estadoConfig: Record<string, { label: string; classes: string }> = {
  en_reparacion:     { label: "En reparación",    classes: "bg-purple-50 text-purple-700" },
  listo_taller:      { label: "Listo en Taller",  classes: "bg-emerald-50 text-emerald-700" },
  listo_tienda:      { label: "Listo en Tienda",  classes: "bg-cyan-50 text-cyan-700" },
  devolucion_taller: { label: "Dev. Taller",      classes: "bg-orange-50 text-orange-700" },
  devolucion_tienda: { label: "Dev. Tienda",      classes: "bg-red-50 text-red-600" },
  recibido:          { label: "Recibido",          classes: "bg-blue-50 text-blue-700" },
  entregado:         { label: "Entregado",         classes: "bg-slate-100 text-slate-500" },
};

const prioridadDot: Record<string, string> = {
  alta: "bg-red-500", normal: "bg-amber-400", baja: "bg-slate-300",
};

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm">
        <p className="text-xs font-medium text-slate-600 mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.name} className="text-xs" style={{ color: p.color }}>
            {p.name === "ventas" ? "Ventas" : "Reparaciones"}: {formatMXN(p.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function TenantDashboard() {
  const totalSemana   = ventasSemana.reduce((s, d) => s + d.ventas + d.reparaciones, 0);
  const promedioVentas = Math.round(ventasSemana.reduce((s, d) => s + d.ventas, 0) / ventasSemana.length);

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Buenos días 👋</h1>
          <p className="text-xs text-slate-400 mt-0.5">Miércoles 28 de mayo, 2026</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Total semana</p>
          <p className="text-base font-bold text-slate-800">{formatMXN(totalSemana)}</p>
        </div>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Ventas del día",        value: "$3,240", sub: "+18% vs ayer",        positive: true,  icon: ShoppingCart, iconBg: "bg-[#4F46E5]/10", iconColor: "text-[#4F46E5]" },
          { label: "Total de tickets",      value: "24",     sub: "Transacciones hoy",   positive: true,  icon: Receipt,      iconBg: "bg-cyan-50",       iconColor: "text-cyan-600" },
          { label: "Reparaciones activas",  value: "8",      sub: "En proceso",          positive: true,  icon: Wrench,       iconBg: "bg-amber-50",      iconColor: "text-amber-600" },
          { label: "Equipos listos",        value: "3",      sub: "Pendientes entregar", positive: true,  icon: CheckCircle,  iconBg: "bg-emerald-50",    iconColor: "text-emerald-600" },
          { label: "Equipos devolución",    value: "2",      sub: "Sin reparación",      positive: false, icon: RotateCcw,    iconBg: "bg-red-50",        iconColor: "text-red-500" },
        ].map((m) => (
          <div key={m.label} className="bg-white border border-slate-200 rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-xs text-slate-500">{m.label}</p>
              <div className={`w-7 h-7 rounded-lg ${m.iconBg} flex items-center justify-center`}>
                <m.icon className={`w-3.5 h-3.5 ${m.iconColor}`} />
              </div>
            </div>
            <p className="text-[22px] font-semibold text-slate-800 leading-none mb-1">{m.value}</p>
            <div className="flex items-center gap-1">
              {m.positive
                ? <ArrowUpRight className="w-3 h-3 text-emerald-500" />
                : <ArrowDownRight className="w-3 h-3 text-red-500" />
              }
              <p className={`text-[10px] ${m.positive ? "text-emerald-500" : "text-red-500"}`}>{m.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Gráfica principal + Pie */}
      <div className="grid grid-cols-3 gap-4">

        <div className="col-span-2 bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-slate-800">Ventas de la semana</p>
              <p className="text-xs text-slate-400">Promedio diario: {formatMXN(promedioVentas)}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#4F46E5]" />
                <span className="text-xs text-slate-500">Ventas</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#06B6D4]" />
                <span className="text-xs text-slate-500">Reparaciones</span>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={ventasSemana} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#4F46E5" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorRep" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#06B6D4" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="ventas"       stroke="#4F46E5" strokeWidth={2} fill="url(#colorVentas)" />
              <Area type="monotone" dataKey="reparaciones" stroke="#06B6D4" strokeWidth={2} fill="url(#colorRep)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-sm font-medium text-slate-800 mb-1">Ventas por categoría</p>
          <p className="text-xs text-slate-400 mb-3">Este mes</p>
          <ResponsiveContainer width="100%" height={120}>
            <PieChart>
              <Pie data={ventasPorCategoria} cx="50%" cy="50%" innerRadius={35} outerRadius={55}
                dataKey="value" paddingAngle={3}>
                {ventasPorCategoria.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [`${value}%`, ""]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {ventasPorCategoria.map((cat) => (
              <div key={cat.name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: cat.color }} />
                  <span className="text-xs text-slate-600">{cat.name}</span>
                </div>
                <span className="text-xs font-medium text-slate-700">{cat.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reparaciones + Alertas */}
      <div className="grid grid-cols-2 gap-4">

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-medium text-slate-800">Reparaciones activas</p>
            <button className="text-xs text-[#4F46E5] hover:underline">Ver todas</button>
          </div>
          <div className="divide-y divide-slate-50">
            {reparaciones.map((r) => (
              <div key={r.folio} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${prioridadDot[r.prioridad]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 truncate">{r.equipo}</p>
                  <p className="text-[10px] text-slate-400">{r.cliente}</p>
                </div>
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${estadoConfig[r.estado]?.classes}`}>
                  {estadoConfig[r.estado]?.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-medium text-slate-800">Alertas</p>
          </div>
          <div className="p-3 space-y-2">
            {alertas.map((a, i) => (
              <div key={i} className={`flex items-start gap-2 p-2 rounded-lg border ${a.bg}`}>
                <a.icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${a.color}`} />
                <p className={`text-xs leading-tight ${a.color}`}>{a.texto}</p>
              </div>
            ))}
          </div>
          <div className="px-3 pb-3">
            <p className="text-xs font-medium text-slate-400 mb-2">Accesos rápidos</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: "Nueva venta",      color: "bg-[#4F46E5]" },
                { label: "Nueva reparación", color: "bg-cyan-500" },
                { label: "Abrir caja",       color: "bg-emerald-500" },
                { label: "Nuevo cliente",    color: "bg-amber-500" },
              ].map((btn) => (
                <button key={btn.label}
                  className={`${btn.color} hover:opacity-90 text-white text-xs font-medium py-1.5 px-2 rounded-lg transition-opacity`}>
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}