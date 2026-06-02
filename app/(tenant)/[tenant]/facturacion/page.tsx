"use client";

import { useState } from "react";
import { Search, Download, XCircle, FileText, CheckCircle, Clock, AlertCircle } from "lucide-react";

const facturas = [
  {
    id: 1, folio: "FAC-0089", uuid: "6E7A8B9C-1234-5678-ABCD-EF0123456789",
    cliente: "Carlos Mendoza", rfc: "MENC850101ABC",
    venta: "VTA-0088", fecha: "28 mayo 2026",
    subtotal: 11276, iva: 1804, total: 13080,
    estado: "timbrada", tipo: "Ingreso",
  },
  {
    id: 2, folio: "FAC-0088", uuid: "5D6E7F8A-1234-5678-ABCD-EF0123456789",
    cliente: "Roberto Díaz", rfc: "DIAR900215XYZ",
    venta: "VTA-0085", fecha: "27 mayo 2026",
    subtotal: 3621, iva: 579, total: 4200,
    estado: "timbrada", tipo: "Ingreso",
  },
  {
    id: 3, folio: "FAC-0087", uuid: "4C5D6E7F-1234-5678-ABCD-EF0123456789",
    cliente: "Ana López", rfc: "LOAA950320DEF",
    venta: "VTA-0082", fecha: "26 mayo 2026",
    subtotal: 241, iva: 39, total: 280,
    estado: "pendiente", tipo: "Ingreso",
  },
  {
    id: 4, folio: "FAC-0086", uuid: "3B4C5D6E-1234-5678-ABCD-EF0123456789",
    cliente: "Jorge Pérez", rfc: "PEJJ880430GHI",
    venta: "VTA-0079", fecha: "25 mayo 2026",
    subtotal: 9655, iva: 1545, total: 11200,
    estado: "cancelada", tipo: "Ingreso",
  },
  {
    id: 5, folio: "FAC-0085", uuid: "2A3B4C5D-1234-5678-ABCD-EF0123456789",
    cliente: "María González", rfc: "GOMA920115JKL",
    venta: "VTA-0076", fecha: "24 mayo 2026",
    subtotal: 129, iva: 21, total: 150,
    estado: "timbrada", tipo: "Ingreso",
  },
];

const estadoConfig: Record<string, { label: string; classes: string; icon: React.ElementType }> = {
  timbrada:  { label: "Timbrada",  classes: "bg-emerald-50 text-emerald-700", icon: CheckCircle },
  pendiente: { label: "Pendiente", classes: "bg-amber-50 text-amber-600",    icon: Clock },
  cancelada: { label: "Cancelada", classes: "bg-red-50 text-red-600",        icon: XCircle },
};

const filtrosTabs = ["Todas", "Timbradas", "Pendientes", "Canceladas"];

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

export default function FacturacionPage() {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("Todas");
  const [seleccionada, setSeleccionada] = useState(facturas[0]);

  const facturasFiltradas = facturas.filter((f) => {
    const matchSearch =
      f.folio.toLowerCase().includes(busqueda.toLowerCase()) ||
      f.cliente.toLowerCase().includes(busqueda.toLowerCase()) ||
      f.rfc.toLowerCase().includes(busqueda.toLowerCase());
    const matchFiltro =
      filtro === "Todas" ? true :
      filtro === "Timbradas" ? f.estado === "timbrada" :
      filtro === "Pendientes" ? f.estado === "pendiente" :
      filtro === "Canceladas" ? f.estado === "cancelada" : true;
    return matchSearch && matchFiltro;
  });

  const totalMes = facturas
    .filter((f) => f.estado === "timbrada")
    .reduce((s, f) => s + f.total, 0);

  const totalTimbradas = facturas.filter((f) => f.estado === "timbrada").length;
  const totalPendientes = facturas.filter((f) => f.estado === "pendiente").length;
  const totalCanceladas = facturas.filter((f) => f.estado === "cancelada").length;

  return (
    <div className="flex h-full">

      {/* Lista */}
      <div className="w-72 flex flex-col bg-white border-r border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span className="text-[13px] font-medium text-slate-800">Facturación CFDI</span>
        </div>

        {/* Métricas rápidas */}
        <div className="grid grid-cols-3 gap-2 p-3 border-b border-slate-100">
          {[
            { label: "Timbradas", value: totalTimbradas, color: "text-emerald-600" },
            { label: "Pendientes", value: totalPendientes, color: "text-amber-600" },
            { label: "Canceladas", value: totalCanceladas, color: "text-red-500" },
          ].map((m) => (
            <div key={m.label} className="bg-slate-50 rounded-lg p-2 text-center">
              <p className={`text-[16px] font-semibold ${m.color}`}>{m.value}</p>
              <p className="text-[9px] text-slate-400">{m.label}</p>
            </div>
          ))}
        </div>

        <div className="px-3 py-2 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Folio, cliente o RFC..."
              className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-[11px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
          </div>
        </div>

        <div className="flex gap-1.5 px-3 py-2 border-b border-slate-100 overflow-x-auto">
          {filtrosTabs.map((tab) => (
            <button key={tab} onClick={() => setFiltro(tab)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors ${
                filtro === tab ? "bg-[#4F46E5] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}>
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {facturasFiltradas.map((f) => {
            const cfg = estadoConfig[f.estado];
            const Icono = cfg.icon;
            return (
              <div key={f.id} onClick={() => setSeleccionada(f)}
                className={`px-3 py-3 border-b border-slate-50 cursor-pointer border-l-2 transition-all ${
                  seleccionada.id === f.id
                    ? "bg-[#F5F3FF] border-l-[#4F46E5]"
                    : "hover:bg-slate-50 border-l-transparent"
                }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-slate-800">{f.folio}</span>
                  <span className={`flex items-center gap-1 text-[9px] font-medium px-2 py-0.5 rounded-full ${cfg.classes}`}>
                    <Icono className="w-2.5 h-2.5" />
                    {cfg.label}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-0.5">{f.cliente}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">{f.fecha}</span>
                  <span className="text-[12px] font-semibold text-slate-800">{formatMXN(f.total)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detalle */}
      <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">

        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <p className="text-[14px] font-semibold text-slate-800">{seleccionada.folio}</p>
                <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${estadoConfig[seleccionada.estado].classes}`}>
                  {seleccionada.estado === "timbrada" && <CheckCircle className="w-3 h-3" />}
                  {seleccionada.estado === "pendiente" && <Clock className="w-3 h-3" />}
                  {seleccionada.estado === "cancelada" && <XCircle className="w-3 h-3" />}
                  {estadoConfig[seleccionada.estado].label}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {seleccionada.fecha} · Venta {seleccionada.venta} · {seleccionada.tipo}
              </p>
            </div>
            <div className="flex gap-2">
              {seleccionada.estado === "timbrada" && (
                <>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-[11px] text-slate-600 hover:bg-slate-50">
                    <Download className="w-3 h-3" /> XML
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-[11px] text-slate-600 hover:bg-slate-50">
                    <Download className="w-3 h-3" /> PDF
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-[11px] transition-colors">
                    <XCircle className="w-3 h-3" /> Cancelar
                  </button>
                </>
              )}
              {seleccionada.estado === "pendiente" && (
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-lg text-[11px] font-medium transition-colors">
                  <FileText className="w-3 h-3" /> Timbrar ahora
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Subtotal", value: formatMXN(seleccionada.subtotal) },
              { label: "IVA (16%)", value: formatMXN(seleccionada.iva) },
              { label: "Total", value: formatMXN(seleccionada.total), color: "text-[#4F46E5]" },
              { label: "Tipo", value: seleccionada.tipo },
            ].map((s) => (
              <div key={s.label} className="bg-slate-50 rounded-lg p-3">
                <p className="text-[9px] text-slate-400 mb-1">{s.label}</p>
                <p className={`text-[14px] font-semibold ${s.color || "text-slate-800"}`}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Datos del receptor */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-slate-400 tracking-widest mb-3">DATOS DEL RECEPTOR</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Nombre / Razón social", value: seleccionada.cliente },
                { label: "RFC", value: seleccionada.rfc },
                { label: "Uso de CFDI", value: "G03 - Gastos en general" },
                { label: "Método de pago", value: "PUE - Pago en una sola exhibición" },
              ].map((field) => (
                <div key={field.label} className="bg-slate-50 rounded-lg p-2.5">
                  <p className="text-[9px] text-slate-400 mb-0.5">{field.label}</p>
                  <p className="text-[11px] font-medium text-slate-800">{field.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* UUID */}
          {seleccionada.estado === "timbrada" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <p className="text-[11px] font-semibold text-emerald-700">Factura timbrada ante el SAT</p>
              </div>
              <div className="bg-white rounded-lg p-2.5 border border-emerald-200">
                <p className="text-[9px] text-slate-400 mb-0.5">UUID (Folio Fiscal)</p>
                <p className="text-[10px] font-mono text-slate-700">{seleccionada.uuid}</p>
              </div>
            </div>
          )}

          {seleccionada.estado === "pendiente" && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <p className="text-[11px] font-semibold text-amber-700">Factura pendiente de timbrar</p>
              </div>
              <p className="text-[11px] text-amber-600">
                Esta factura aún no ha sido enviada al SAT. Haz clic en "Timbrar ahora" para procesarla.
              </p>
            </div>
          )}

          {seleccionada.estado === "cancelada" && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-4 h-4 text-red-500" />
                <p className="text-[11px] font-semibold text-red-600">Factura cancelada</p>
              </div>
              <p className="text-[11px] text-red-500">
                Esta factura fue cancelada ante el SAT y ya no tiene validez fiscal.
              </p>
            </div>
          )}

          {/* Resumen mes */}
          <div className="bg-gradient-to-r from-[#0F172A] to-[#1E293B] rounded-xl p-4 flex items-center justify-between">
            <div className="text-white">
              <p className="text-[10px] text-white/50 mb-1">Total facturado — Mayo 2026</p>
              <p className="text-[22px] font-bold">{formatMXN(totalMes)}</p>
              <p className="text-[10px] text-white/40 mt-1">{totalTimbradas} facturas timbradas</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-white/50 mb-1">IVA trasladado</p>
              <p className="text-[16px] font-semibold text-cyan-400">
                {formatMXN(facturas.filter(f => f.estado === "timbrada").reduce((s, f) => s + f.iva, 0))}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}