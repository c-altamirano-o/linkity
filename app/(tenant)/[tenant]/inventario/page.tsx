"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, FileDown, Plus, AlertTriangle, XCircle } from "lucide-react";

const inventarioInicial = [
  { id: 1, nombre: "iPhone 14 128GB Negro", sku: "APL-IP14-128-BK", categoria: "Celulares", tipo: "productos", emoji: "📱", stock: 3, minStock: 2, precio: 12500, costo: 10000 },
  { id: 2, nombre: "Samsung Galaxy S23", sku: "SAM-S23-256-WH", categoria: "Celulares", tipo: "productos", emoji: "📱", stock: 5, minStock: 2, precio: 10800, costo: 8500 },
  { id: 3, nombre: "iPhone 13 Pro 256GB", sku: "APL-IP13P-256", categoria: "Celulares", tipo: "productos", emoji: "📱", stock: 1, minStock: 3, precio: 14200, costo: 11500 },
  { id: 4, nombre: "Xiaomi Redmi Note 12", sku: "XIA-RN12-128", categoria: "Celulares", tipo: "productos", emoji: "📱", stock: 0, minStock: 2, precio: 3800, costo: 2900 },
  { id: 5, nombre: "AirPods Pro 2da Gen", sku: "APL-APP2-WH", categoria: "Accesorios", tipo: "productos", emoji: "🎧", stock: 8, minStock: 3, precio: 4200, costo: 3200 },
  { id: 6, nombre: "Cargador USB-C 20W", sku: "ACC-CHG-20W", categoria: "Accesorios", tipo: "productos", emoji: "🔌", stock: 24, minStock: 5, precio: 280, costo: 150 },
  { id: 7, nombre: "Funda iPhone 14 MagSafe", sku: "ACC-CASE-IP14", categoria: "Accesorios", tipo: "productos", emoji: "📱", stock: 12, minStock: 4, precio: 350, costo: 180 },
  { id: 8, nombre: "Pantalla iPhone 13 Original", sku: "REF-SCR-IP13", categoria: "Pantallas", tipo: "refacciones", emoji: "🖥️", stock: 4, minStock: 2, precio: 1800, costo: 1200 },
  { id: 9, nombre: "Batería iPhone 12", sku: "REF-BAT-IP12", categoria: "Baterías", tipo: "refacciones", emoji: "🔋", stock: 6, minStock: 3, precio: 450, costo: 280 },
  { id: 10, nombre: "Batería Samsung S22", sku: "REF-BAT-S22", categoria: "Baterías", tipo: "refacciones", emoji: "🔋", stock: 0, minStock: 3, precio: 380, costo: 220 },
  { id: 11, nombre: "Conector carga iPhone", sku: "REF-CON-IPHG", categoria: "Conectores", tipo: "refacciones", emoji: "🔌", stock: 2, minStock: 4, precio: 320, costo: 180 },
];

const catConfig: Record<string, string> = {
  Celulares:  "bg-purple-50 text-purple-700",
  Accesorios: "bg-slate-100 text-slate-600",
  Pantallas:  "bg-orange-50 text-orange-700",
  Baterías:   "bg-amber-50 text-amber-700",
  Conectores: "bg-blue-50 text-blue-700",
};

const filtrosTabs = ["Todos", "Productos", "Refacciones", "Stock bajo", "Agotados"];

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const getStockStatus = (stock: number, min: number) => {
  if (stock === 0) return "out";
  if (stock <= min) return "low";
  return "ok";
};

export default function InventarioPage() {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("Todos");
  const [modalAjuste, setModalAjuste] = useState<typeof inventarioInicial[0] | null>(null);
  const [ajusteCantidad, setAjusteCantidad] = useState("");
  const [ajusteTipo, setAjusteTipo] = useState<"entrada" | "salida" | "ajuste">("entrada");

  const productosFiltrados = inventarioInicial.filter((p) => {
    const matchSearch = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.sku.toLowerCase().includes(busqueda.toLowerCase());
    const status = getStockStatus(p.stock, p.minStock);
    const matchFiltro =
      filtro === "Todos" ? true :
      filtro === "Productos" ? p.tipo === "productos" :
      filtro === "Refacciones" ? p.tipo === "refacciones" :
      filtro === "Stock bajo" ? status === "low" :
      filtro === "Agotados" ? status === "out" : true;
    return matchSearch && matchFiltro;
  });

  const totalProductos = inventarioInicial.length;
  const valorInventario = inventarioInicial.reduce((s, p) => s + p.costo * p.stock, 0);
  const stockBajo = inventarioInicial.filter((p) => getStockStatus(p.stock, p.minStock) === "low").length;
  const agotados = inventarioInicial.filter((p) => p.stock === 0).length;

  return (
    <div className="flex flex-col h-full">

      {/* Topbar */}
      <div className="bg-white border-b border-slate-200 px-5 py-2.5 flex items-center gap-3">
        <span className="text-[13px] font-medium text-slate-800 flex-1">Inventario</span>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
          <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto o SKU..."
            className="w-56 pl-7 pr-3 py-2 border border-slate-200 rounded-lg text-[11px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
        </div>
        <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-[11px] text-slate-600 hover:bg-slate-50">
          <SlidersHorizontal className="w-3 h-3" /> Filtros
        </button>
        <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-[11px] text-slate-600 hover:bg-slate-50">
          <FileDown className="w-3 h-3" /> Exportar
        </button>
        <button className="flex items-center gap-1.5 px-3 py-2 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-lg text-[11px] font-medium transition-colors">
          <Plus className="w-3 h-3" /> Ajuste de stock
        </button>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-4 gap-3 px-5 py-3 bg-white border-b border-slate-200">
        {[
          { label: "Total productos", value: totalProductos, sub: "En catálogo", color: "text-slate-800", subColor: "text-slate-400" },
          { label: "Valor del inventario", value: formatMXN(valorInventario), sub: "Precio de costo", color: "text-slate-800", subColor: "text-slate-400" },
          { label: "Stock bajo", value: stockBajo, sub: "Requieren surtir", color: "text-amber-600", subColor: "text-amber-500", icon: AlertTriangle },
          { label: "Agotados", value: agotados, sub: "Sin stock", color: "text-red-600", subColor: "text-red-400", icon: XCircle },
        ].map((m) => (
          <div key={m.label} className="bg-slate-50 rounded-lg p-3">
            <p className="text-[10px] text-slate-400 mb-1">{m.label}</p>
            <div className="flex items-center gap-1.5">
              {m.icon && <m.icon className={`w-4 h-4 ${m.color}`} />}
              <p className={`text-[18px] font-semibold ${m.color}`}>{m.value}</p>
            </div>
            <p className={`text-[10px] mt-0.5 ${m.subColor}`}>{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 px-5 py-2 bg-white border-b border-slate-100">
        {filtrosTabs.map((tab) => (
          <button key={tab} onClick={() => setFiltro(tab)}
            className={`px-3 py-1 rounded-full text-[10px] font-medium transition-colors ${
              filtro === tab ? "bg-[#4F46E5] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-white border-b border-slate-200 z-10">
            <tr>
              {["Producto", "Categoría", "Stock actual", "Stock mínimo", "Precio venta", "Costo", "Acción"].map((h) => (
                <th key={h} className="text-left text-[10px] font-medium text-slate-400 px-4 py-2.5 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {productosFiltrados.map((p) => {
              const status = getStockStatus(p.stock, p.minStock);
              const rowBg = status === "out" ? "bg-red-50/50" : status === "low" ? "bg-amber-50/50" : "";
              const pct = p.minStock > 0 ? Math.min((p.stock / (p.minStock * 3)) * 100, 100) : 100;
              return (
                <tr key={p.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${rowBg}`}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center text-sm flex-shrink-0">
                        {p.emoji}
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-slate-800">{p.nombre}</p>
                        <p className="text-[9px] text-slate-400">{p.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${catConfig[p.categoria] || "bg-slate-100 text-slate-500"}`}>
                      {p.categoria}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${
                          status === "out" ? "bg-red-500" :
                          status === "low" ? "bg-amber-500" : "bg-emerald-500"
                        }`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`text-[11px] font-medium ${
                        status === "out" ? "text-red-600" :
                        status === "low" ? "text-amber-600" : "text-slate-800"
                      }`}>
                        {p.stock}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-slate-500">{p.minStock}</td>
                  <td className="px-4 py-2.5 text-[11px] font-medium text-slate-800">{formatMXN(p.precio)}</td>
                  <td className="px-4 py-2.5 text-[11px] text-slate-500">{formatMXN(p.costo)}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => { setModalAjuste(p); setAjusteCantidad(""); }}
                      className={`text-[10px] px-2.5 py-1 rounded-lg border transition-colors ${
                        status === "out"
                          ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
                          : status === "low"
                          ? "bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100"
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}>
                      {status !== "ok" ? "Surtir" : "Ajustar"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal ajuste */}
      {modalAjuste && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-5 w-80 shadow-xl">
            <h2 className="text-[14px] font-semibold text-slate-800 mb-1">Ajuste de stock</h2>
            <p className="text-[11px] text-slate-400 mb-4">{modalAjuste.nombre}</p>

            <div className="flex items-center justify-between bg-slate-50 rounded-lg p-3 mb-4">
              <span className="text-[11px] text-slate-500">Stock actual</span>
              <span className="text-[14px] font-semibold text-slate-800">{modalAjuste.stock}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              {(["entrada", "salida", "ajuste"] as const).map((tipo) => (
                <button key={tipo} onClick={() => setAjusteTipo(tipo)}
                  className={`py-2 rounded-lg text-[11px] font-medium capitalize transition-colors ${
                    ajusteTipo === tipo
                      ? tipo === "entrada" ? "bg-emerald-500 text-white"
                        : tipo === "salida" ? "bg-red-500 text-white"
                        : "bg-[#4F46E5] text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}>
                  {tipo === "entrada" ? "Entrada" : tipo === "salida" ? "Salida" : "Ajuste"}
                </button>
              ))}
            </div>

            <div className="mb-4">
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Cantidad</label>
              <input type="number" value={ajusteCantidad} onChange={(e) => setAjusteCantidad(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setModalAjuste(null)}
                className="flex-1 py-2 border border-slate-200 rounded-lg text-[12px] text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={() => setModalAjuste(null)}
                className="flex-1 py-2 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-lg text-[12px] font-medium transition-colors">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}