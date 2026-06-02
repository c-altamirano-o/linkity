"use client";

import { useState } from "react";
import { Search, Plus, Printer, Check, Building2, Package } from "lucide-react";

const compras = [
  {
    id: 1, folio: "OC-0012", proveedor: "Distribuidora Apple MX", proveedorIniciales: "DA",
    fecha: "28 mayo 2026", fechaRecibida: "28 mayo 2026", estado: "recibida", total: 45200,
    items: [
      { nombre: "iPhone 14 128GB Negro", sku: "APL-IP14-128-BK", cantidad: 3, costo: 10000 },
      { nombre: "iPhone 13 Pro 256GB", sku: "APL-IP13P-256", cantidad: 1, costo: 11500 },
      { nombre: "AirPods Pro 2da Gen", sku: "APL-APP2-WH", cantidad: 1, costo: 3200 },
      { nombre: "Cargador USB-C 20W", sku: "ACC-CHG-20W", cantidad: 5, costo: 100 },
    ]
  },
  {
    id: 2, folio: "OC-0011", proveedor: "Samsung Distribuciones", proveedorIniciales: "SD",
    fecha: "25 mayo 2026", fechaRecibida: "", estado: "pendiente", total: 32400,
    items: [
      { nombre: "Samsung Galaxy S23", sku: "SAM-S23-256-WH", cantidad: 3, costo: 8500 },
      { nombre: "Batería Samsung S22", sku: "REF-BAT-S22", cantidad: 5, costo: 220 },
    ]
  },
  {
    id: 3, folio: "OC-0010", proveedor: "Refacciones del Norte", proveedorIniciales: "RN",
    fecha: "20 mayo 2026", fechaRecibida: "21 mayo 2026", estado: "recibida", total: 12800,
    items: [
      { nombre: "Pantalla iPhone 13 Original", sku: "REF-SCR-IP13", cantidad: 4, costo: 1200 },
      { nombre: "Batería iPhone 12", sku: "REF-BAT-IP12", cantidad: 10, costo: 280 },
      { nombre: "Conector carga iPhone", sku: "REF-CON-IPHG", cantidad: 8, costo: 180 },
    ]
  },
  {
    id: 4, folio: "OC-0009", proveedor: "Accesorios Premium", proveedorIniciales: "AP",
    fecha: "15 mayo 2026", fechaRecibida: "", estado: "cancelada", total: 8500,
    items: [
      { nombre: "Funda iPhone 14 MagSafe", sku: "ACC-CASE-IP14", cantidad: 20, costo: 180 },
      { nombre: "Cable Lightning 2m", sku: "ACC-CBL-2M", cantidad: 30, costo: 80 },
    ]
  },
];

const estadoConfig: Record<string, { label: string; classes: string }> = {
  recibida:  { label: "Recibida",  classes: "bg-emerald-50 text-emerald-700" },
  pendiente: { label: "Pendiente", classes: "bg-orange-50 text-orange-700" },
  cancelada: { label: "Cancelada", classes: "bg-red-50 text-red-600" },
};

const provColors = [
  "bg-[#4F46E5]", "bg-cyan-500", "bg-emerald-500", "bg-amber-500",
];

const filtrosTabs = ["Todas", "Pendientes", "Recibidas", "Canceladas"];

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

export default function ComprasPage() {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("Todas");
  const [seleccionada, setSeleccionada] = useState(compras[0]);

  const comprasFiltradas = compras.filter((c) => {
    const matchSearch = c.folio.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.proveedor.toLowerCase().includes(busqueda.toLowerCase());
    const matchFiltro =
      filtro === "Todas" ? true :
      filtro === "Pendientes" ? c.estado === "pendiente" :
      filtro === "Recibidas" ? c.estado === "recibida" :
      filtro === "Canceladas" ? c.estado === "cancelada" : true;
    return matchSearch && matchFiltro;
  });

  const subtotal = seleccionada.items.reduce((s, i) => s + i.costo * i.cantidad, 0);

  return (
    <div className="flex h-full">

      {/* Lista */}
      <div className="w-72 flex flex-col bg-white border-r border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span className="text-[13px] font-medium text-slate-800">Compras</span>
          <button className="flex items-center gap-1 bg-[#4F46E5] text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg">
            <Plus className="w-3 h-3" /> Nueva
          </button>
        </div>

        <div className="px-3 py-2 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por folio o proveedor..."
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
          {comprasFiltradas.map((c, idx) => (
            <div key={c.id} onClick={() => setSeleccionada(c)}
              className={`px-3 py-3 border-b border-slate-50 cursor-pointer border-l-2 transition-all ${
                seleccionada.id === c.id
                  ? "bg-[#F5F3FF] border-l-[#4F46E5]"
                  : "hover:bg-slate-50 border-l-transparent"
              }`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-slate-800">{c.folio}</span>
                <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${estadoConfig[c.estado].classes}`}>
                  {estadoConfig[c.estado].label}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1.5">
                <Building2 className="w-3 h-3 text-slate-400" />
                {c.proveedor}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400">{c.fecha}</span>
                <span className="text-[12px] font-semibold text-slate-800">{formatMXN(c.total)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detalle */}
      <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">

        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[14px] font-semibold text-slate-800">
                {seleccionada.folio}
                <span className="text-[12px] font-normal text-slate-500 ml-2">— Orden de compra</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Creada el {seleccionada.fecha}
                {seleccionada.fechaRecibida && ` · Recibida el ${seleccionada.fechaRecibida}`}
              </p>
            </div>
            <div className="flex gap-2">
              <button className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-[11px] text-slate-600 hover:bg-slate-50">
                <Printer className="w-3 h-3" /> Imprimir
              </button>
              {seleccionada.estado === "pendiente" && (
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[11px] font-medium transition-colors">
                  <Check className="w-3 h-3" /> Marcar recibida
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Proveedor", value: seleccionada.proveedor, small: true },
              { label: "Productos", value: String(seleccionada.items.length), small: false },
              { label: "Total", value: formatMXN(seleccionada.total), color: "text-[#4F46E5]" },
            ].map((s) => (
              <div key={s.label} className="bg-slate-50 rounded-lg p-3">
                <p className="text-[9px] text-slate-400 mb-1">{s.label}</p>
                <p className={`font-semibold ${s.small ? "text-[12px]" : "text-[15px]"} ${s.color || "text-slate-800"}`}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">

          {/* Proveedor */}
          <p className="text-[10px] font-semibold text-slate-400 tracking-widest mb-2">PROVEEDOR</p>
          <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-3 mb-4">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[12px] font-semibold text-white flex-shrink-0 ${
              provColors[seleccionada.id % provColors.length]
            }`}>
              {seleccionada.proveedorIniciales}
            </div>
            <div className="flex-1">
              <p className="text-[12px] font-medium text-slate-800">{seleccionada.proveedor}</p>
              <p className="text-[10px] text-slate-400">614 800 0000 · contacto@proveedor.mx</p>
            </div>
            <button className="text-[10px] text-slate-500 border border-slate-200 px-2.5 py-1 rounded-lg hover:bg-slate-50 transition-colors">
              Ver perfil
            </button>
          </div>

          {/* Productos */}
          <p className="text-[10px] font-semibold text-slate-400 tracking-widest mb-2">PRODUCTOS COMPRADOS</p>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
            <div className="grid grid-cols-[1fr_60px_90px_90px] px-4 py-2 bg-slate-50 border-b border-slate-100">
              {["Producto", "Cant.", "Costo unit.", "Subtotal"].map((h) => (
                <p key={h} className="text-[10px] font-medium text-slate-400">{h}</p>
              ))}
            </div>
            {seleccionada.items.map((item, i) => (
              <div key={i} className="grid grid-cols-[1fr_60px_90px_90px] px-4 py-3 border-b border-slate-50 last:border-0 items-center hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-slate-100 rounded-md flex items-center justify-center flex-shrink-0">
                    <Package className="w-3 h-3 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-slate-800">{item.nombre}</p>
                    <p className="text-[9px] text-slate-400">{item.sku}</p>
                  </div>
                </div>
                <p className="text-[11px] text-slate-600 text-center">{item.cantidad}</p>
                <p className="text-[11px] text-slate-500">{formatMXN(item.costo)}</p>
                <p className="text-[11px] font-medium text-slate-800">{formatMXN(item.costo * item.cantidad)}</p>
              </div>
            ))}
          </div>

          {/* Totales */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-500">Subtotal</span>
                <span className="text-[11px] text-slate-700">{formatMXN(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-500">Descuento proveedor</span>
                <span className="text-[11px] text-emerald-600">-$0</span>
              </div>
              <div className="h-px bg-slate-100" />
              <div className="flex justify-between items-baseline">
                <span className="text-[13px] font-semibold text-slate-800">Total pagado</span>
                <span className="text-[16px] font-bold text-[#4F46E5]">{formatMXN(subtotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}