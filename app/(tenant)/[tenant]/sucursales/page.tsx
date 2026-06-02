"use client";

import { useState } from "react";
import { Plus, ArrowRight, Building2, Users, Package, DollarSign } from "lucide-react";

const sucursales = [
  {
    id: 1, nombre: "Sucursal Principal", direccion: "Av. Serdán 245, Centro",
    estado: "activa", principal: true, emoji: "🏪",
    avatarBg: "bg-purple-50",
    ventasHoy: 8240, reparaciones: 5, cajaActual: 12580, stockItems: 120,
    personal: [
      { iniciales: "JP", bg: "bg-purple-50", color: "text-purple-700" },
      { iniciales: "ML", bg: "bg-emerald-50", color: "text-emerald-700" },
      { iniciales: "AM", bg: "bg-blue-50", color: "text-blue-700" },
    ]
  },
  {
    id: 2, nombre: "Sucursal Norte", direccion: "Blvd. Independencia 890",
    estado: "activa", principal: false, emoji: "🏪",
    avatarBg: "bg-emerald-50",
    ventasHoy: 4100, reparaciones: 3, cajaActual: 6300, stockItems: 78,
    personal: [
      { iniciales: "CR", bg: "bg-orange-50", color: "text-orange-700" },
      { iniciales: "RG", bg: "bg-purple-50", color: "text-purple-700" },
    ]
  },
  {
    id: 3, nombre: "Sucursal Plaza", direccion: "Plaza Las Américas, Local 14",
    estado: "prueba", principal: false, emoji: "🏪",
    avatarBg: "bg-amber-50",
    ventasHoy: 1800, reparaciones: 1, cajaActual: 2800, stockItems: 45,
    personal: [
      { iniciales: "LM", bg: "bg-blue-50", color: "text-blue-700" },
    ]
  },
];

const productos = [
  "iPhone 14 128GB Negro",
  "Samsung Galaxy S23",
  "Batería iPhone 12",
  "Pantalla iPhone 13",
  "Cargador USB-C 20W",
];

const estadoConfig: Record<string, { label: string; classes: string }> = {
  activa:  { label: "Activa",    classes: "bg-emerald-50 text-emerald-700" },
  prueba:  { label: "En prueba", classes: "bg-amber-50 text-amber-600" },
  inactiva:{ label: "Inactiva",  classes: "bg-slate-100 text-slate-500" },
};

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const totalVentas = sucursales.reduce((s, suc) => s + suc.ventasHoy, 0);

export default function SucursalesPage() {
  const [origen, setOrigen] = useState("Sucursal Principal");
  const [destino, setDestino] = useState("Sucursal Norte");
  const [producto, setProducto] = useState(productos[0]);
  const [cantidad, setCantidad] = useState("1");
  const [transferido, setTransferido] = useState(false);

  const handleTransferir = () => {
    setTransferido(true);
    setTimeout(() => setTransferido(false), 2000);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-semibold text-slate-800">Sucursales</h1>
          <p className="text-[11px] text-slate-400 mt-0.5">{sucursales.length} sucursales registradas</p>
        </div>
        <button className="flex items-center gap-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[11px] font-medium px-3 py-2 rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> Nueva sucursal
        </button>
      </div>

      {/* Tarjetas sucursales */}
      <div className="grid grid-cols-3 gap-4">
        {sucursales.map((suc) => (
          <div key={suc.id} className={`bg-white rounded-xl border overflow-hidden transition-all hover:shadow-sm ${
            suc.principal ? "border-[#4F46E5]" : "border-slate-200"
          }`}>
            {/* Header tarjeta */}
            <div className="flex items-start justify-between p-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${suc.avatarBg}`}>
                  {suc.emoji}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-[12px] font-semibold text-slate-800">{suc.nombre}</p>
                    {suc.principal && (
                      <span className="text-[9px] bg-[#4F46E5]/10 text-[#4F46E5] px-1.5 py-0.5 rounded-full font-medium">
                        Principal
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">{suc.direccion}</p>
                </div>
              </div>
              <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${estadoConfig[suc.estado].classes}`}>
                {estadoConfig[suc.estado].label}
              </span>
            </div>

            {/* Métricas */}
            <div className="grid grid-cols-2 gap-2 p-3">
              {[
                { icon: DollarSign, label: "Ventas hoy", value: formatMXN(suc.ventasHoy), color: "text-[#4F46E5]", bg: "bg-[#4F46E5]/10" },
                { icon: Building2, label: "Reparaciones", value: String(suc.reparaciones), color: "text-cyan-600", bg: "bg-cyan-50" },
                { icon: Package, label: "Caja actual", value: formatMXN(suc.cajaActual), color: "text-emerald-600", bg: "bg-emerald-50" },
                { icon: Package, label: "Stock items", value: String(suc.stockItems), color: "text-amber-600", bg: "bg-amber-50" },
              ].map((m) => (
                <div key={m.label} className="bg-slate-50 rounded-lg p-2">
                  <p className="text-[9px] text-slate-400 mb-1">{m.label}</p>
                  <p className={`text-[13px] font-semibold ${m.color}`}>{m.value}</p>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100">
              <div className="flex items-center gap-1">
                {suc.personal.map((p, i) => (
                  <div key={i} className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-semibold border-2 border-white ${p.bg} ${p.color}`}
                    style={{ marginLeft: i > 0 ? "-4px" : "0" }}>
                    {p.iniciales}
                  </div>
                ))}
                <span className="text-[10px] text-slate-400 ml-2">
                  {suc.personal.length} {suc.personal.length === 1 ? "empleado" : "empleados"}
                </span>
              </div>
              <button className="text-[10px] text-[#4F46E5] font-medium hover:underline">
                Ver detalle
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Transferencia */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <ArrowRight className="w-4 h-4 text-[#4F46E5]" />
          <h2 className="text-[12px] font-semibold text-slate-800">Transferir inventario entre sucursales</h2>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[10px] font-medium text-slate-400">ORIGEN</label>
            <select value={origen} onChange={(e) => setOrigen(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-[11px] bg-slate-50 focus:outline-none focus:border-[#4F46E5]">
              {sucursales.map((s) => <option key={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 mb-2.5 flex-shrink-0" />
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[10px] font-medium text-slate-400">DESTINO</label>
            <select value={destino} onChange={(e) => setDestino(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-[11px] bg-slate-50 focus:outline-none focus:border-[#4F46E5]">
              {sucursales.filter((s) => s.nombre !== origen).map((s) => <option key={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[10px] font-medium text-slate-400">PRODUCTO</label>
            <select value={producto} onChange={(e) => setProducto(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-[11px] bg-slate-50 focus:outline-none focus:border-[#4F46E5]">
              {productos.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-slate-400">CANT.</label>
            <input type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)}
              className="w-16 px-3 py-2 border border-slate-200 rounded-lg text-[11px] text-center bg-slate-50 focus:outline-none focus:border-[#4F46E5]" />
          </div>
          <button onClick={handleTransferir}
            className={`px-4 py-2 rounded-lg text-[11px] font-medium transition-colors mb-0.5 ${
              transferido
                ? "bg-emerald-500 text-white"
                : "bg-[#4F46E5] hover:bg-[#4338CA] text-white"
            }`}>
            {transferido ? "✓ Transferido" : "Transferir"}
          </button>
        </div>
      </div>

      {/* Comparativo */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-[12px] font-semibold text-slate-800">Comparativo de rendimiento — Hoy</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {["Sucursal", "Ventas hoy", "Rendimiento", "Reparaciones", "Personal activo"].map((h) => (
                <th key={h} className="text-left text-[10px] font-medium text-slate-400 px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sucursales.map((suc, i) => {
              const pct = Math.round((suc.ventasHoy / totalVentas) * 100);
              const colors = ["bg-[#4F46E5]", "bg-cyan-500", "bg-emerald-500"];
              return (
                <tr key={suc.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-slate-800">{suc.nombre}</span>
                      {suc.principal && (
                        <span className="text-[9px] bg-[#4F46E5]/10 text-[#4F46E5] px-1.5 py-0.5 rounded-full">Principal</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[11px] font-medium text-slate-800">{formatMXN(suc.ventasHoy)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${colors[i]}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-500">{pct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-slate-600">{suc.reparaciones}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {suc.personal.map((p, pi) => (
                        <div key={pi} className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-semibold ${p.bg} ${p.color}`}>
                          {p.iniciales}
                        </div>
                      ))}
                      <span className="text-[10px] text-slate-400 ml-1">{suc.personal.length}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}