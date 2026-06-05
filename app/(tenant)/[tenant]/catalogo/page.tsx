"use client";

import { useState } from "react";
import { Search, Plus, SlidersHorizontal, Smartphone, Cpu, Wrench, TrendingUp, Building2, Calendar } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const categorias = {
  productos:   ["Celulares", "Accesorios", "Tablets", "Sin categoría"],
  refacciones: ["Pantallas", "Baterías", "Conectores"],
  servicios:   ["Reparaciones", "Diagnósticos"],
};

const productos = [
  { id: 1, nombre: "iPhone 14 128GB Negro", sku: "APL-IP14-128-BK", categoria: "Celulares", tipo: "productos", emoji: "📱", stock: 3, minStock: 2, precio: 12500, costo: 10000 },
  { id: 2, nombre: "Samsung Galaxy S23", sku: "SAM-S23-256-WH", categoria: "Celulares", tipo: "productos", emoji: "📱", stock: 5, minStock: 2, precio: 10800, costo: 8500 },
  { id: 3, nombre: "iPhone 13 Pro 256GB", sku: "APL-IP13P-256", categoria: "Celulares", tipo: "productos", emoji: "📱", stock: 1, minStock: 3, precio: 14200, costo: 11500 },
  { id: 4, nombre: "AirPods Pro 2da Gen", sku: "APL-APP2-WH", categoria: "Accesorios", tipo: "productos", emoji: "🎧", stock: 8, minStock: 3, precio: 4200, costo: 3200 },
  { id: 5, nombre: "Cargador USB-C 20W", sku: "ACC-CHG-20W", categoria: "Accesorios", tipo: "productos", emoji: "🔌", stock: 24, minStock: 5, precio: 280, costo: 150 },
  { id: 6, nombre: "Xiaomi Redmi Note 12", sku: "XIA-RN12-128", categoria: "Celulares", tipo: "productos", emoji: "📱", stock: 0, minStock: 2, precio: 3800, costo: 2900 },
  { id: 7, nombre: "Funda iPhone 14 MagSafe", sku: "ACC-CASE-IP14", categoria: "Accesorios", tipo: "productos", emoji: "📱", stock: 12, minStock: 4, precio: 350, costo: 180 },
  { id: 8, nombre: "Pantalla iPhone 13 Original", sku: "REF-SCR-IP13", categoria: "Pantallas", tipo: "refacciones", emoji: "🖥️", stock: 4, minStock: 2, precio: 1800, costo: 1200 },
  { id: 9, nombre: "Batería iPhone 12", sku: "REF-BAT-IP12", categoria: "Baterías", tipo: "refacciones", emoji: "🔋", stock: 6, minStock: 3, precio: 450, costo: 280 },
  { id: 10, nombre: "Batería Samsung S22", sku: "REF-BAT-S22", categoria: "Baterías", tipo: "refacciones", emoji: "🔋", stock: 0, minStock: 3, precio: 380, costo: 220 },
  { id: 11, nombre: "Conector carga iPhone", sku: "REF-CON-IPHG", categoria: "Conectores", tipo: "refacciones", emoji: "🔌", stock: 2, minStock: 4, precio: 320, costo: 180 },
  { id: 12, nombre: "Cambio de pantalla", sku: "SRV-SCR-001", categoria: "Reparaciones", tipo: "servicios", emoji: "🔧", stock: 999, precio: 800, costo: 0 },
  { id: 13, nombre: "Cambio de batería", sku: "SRV-BAT-001", categoria: "Reparaciones", tipo: "servicios", emoji: "🔋", stock: 999, precio: 350, costo: 0 },
  { id: 14, nombre: "Diagnóstico general", sku: "SRV-DIAG-001", categoria: "Diagnósticos", tipo: "servicios", emoji: "🔍", stock: 999, precio: 150, costo: 0 },
];

const topVentasData = [
  { nombre: "iPhone 14 128GB", corto: "iPhone 14", unidades: 8, total: 100000, categoria: "Celulares", color: "#4F46E5" },
  { nombre: "Samsung Galaxy S23", corto: "Samsung S23", unidades: 5, total: 54000, categoria: "Celulares", color: "#06B6D4" },
  { nombre: "AirPods Pro 2da Gen", corto: "AirPods Pro", unidades: 12, total: 50400, categoria: "Accesorios", color: "#8B5CF6" },
  { nombre: "Cambio de pantalla", corto: "Cambio pantalla", unidades: 18, total: 14400, categoria: "Servicios", color: "#10B981" },
  { nombre: "Cargador USB-C 20W", corto: "Cargador USB-C", unidades: 30, total: 8400, categoria: "Accesorios", color: "#F59E0B" },
];

const sucursales = ["Todas las sucursales", "Sucursal Principal", "Sucursal Norte", "Sucursal Plaza"];
const periodos   = ["Hoy", "Semana", "Mes", "Año", "Personalizado"];

const tipoConfig = {
  productos:   { label: "Productos",   icon: Smartphone, color: "text-purple-600", bg: "bg-purple-50", tab: "bg-purple-50 text-purple-700" },
  refacciones: { label: "Refacciones", icon: Cpu,        color: "text-orange-600", bg: "bg-orange-50", tab: "bg-orange-50 text-orange-700" },
  servicios:   { label: "Servicios",   icon: Wrench,     color: "text-emerald-600", bg: "bg-emerald-50", tab: "bg-emerald-50 text-emerald-700" },
};

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const stockBadge = (stock: number, tipo: string) => {
  if (tipo === "servicios") return <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600">Servicio</span>;
  if (stock === 0) return <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-red-50 text-red-600">Agotado</span>;
  if (stock <= 2) return <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600">Stock: {stock}</span>;
  return <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600">Stock: {stock}</span>;
};

const rankBadgeClass = (i: number) => {
  if (i === 0) return "bg-amber-50 text-amber-600";
  if (i === 1) return "bg-slate-100 text-slate-500";
  if (i === 2) return "bg-orange-50 text-orange-600";
  return "bg-slate-50 text-slate-400";
};

export default function CatalogoPage() {
  const [tipoActivo, setTipoActivo]     = useState<"productos" | "refacciones" | "servicios">("productos");
  const [categoriaActiva, setCategoriaActiva] = useState("Celulares");
  const [busqueda, setBusqueda]         = useState("");
  const [tabActivo, setTabActivo]       = useState<"catalogo" | "topventas">("catalogo");
  const [sucursal, setSucursal]         = useState("Todas las sucursales");
  const [periodo, setPeriodo]           = useState("Semana");
  const [fechaInicio, setFechaInicio]   = useState("");
  const [fechaFin, setFechaFin]         = useState("");

  const productosFiltrados = productos.filter((p) => {
    const matchTipo = p.tipo === tipoActivo;
    const matchCat  = categoriaActiva === "todos" || p.categoria === categoriaActiva;
    const matchSearch = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.sku.toLowerCase().includes(busqueda.toLowerCase());
    return matchTipo && matchCat && matchSearch;
  });

  const conteo    = (tipo: string) => productos.filter((p) => p.tipo === tipo).length;
  const conteoCat = (tipo: string, cat: string) => productos.filter((p) => p.tipo === tipo && p.categoria === cat).length;
  const totalTop  = topVentasData.reduce((s, p) => s + p.total, 0);

  const periodoLabel: Record<string, string> = {
    "Hoy": "hoy", "Semana": "esta semana", "Mes": "este mes", "Año": "este año",
    "Personalizado": fechaInicio && fechaFin ? `${fechaInicio} — ${fechaFin}` : "período personalizado",
  };

  return (
    <div className="flex h-full">

      {/* Sidebar categorías */}
      <div className="w-48 flex flex-col bg-white border-r border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between px-3 py-3 border-b border-slate-100">
          <span className="text-sm font-medium text-slate-800">Catálogo</span>
          <button className="flex items-center gap-1 bg-[#4F46E5] text-white text-[10px] font-medium px-2 py-1.5 rounded-lg">
            <Plus className="w-2.5 h-2.5" /> Nuevo
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {(Object.keys(categorias) as Array<keyof typeof categorias>).map((tipo) => {
            const cfg = tipoConfig[tipo];
            const Icono = cfg.icon;
            return (
              <div key={tipo} className="mb-3">
                <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg mb-1 cursor-pointer ${tipoActivo === tipo && tabActivo === "catalogo" ? cfg.bg : "bg-slate-50"}`}
                  onClick={() => { setTipoActivo(tipo); setCategoriaActiva(categorias[tipo][0]); setTabActivo("catalogo"); }}>
                  <Icono className={`w-3.5 h-3.5 ${cfg.color}`} />
                  <span className={`text-xs font-semibold ${tipoActivo === tipo && tabActivo === "catalogo" ? cfg.color : "text-slate-600"}`}>
                    {cfg.label}
                  </span>
                  <span className="ml-auto text-[9px] text-slate-400">{conteo(tipo)}</span>
                </div>
                {tipoActivo === tipo && tabActivo === "catalogo" && categorias[tipo].map((cat) => (
                  <div key={cat} onClick={() => setCategoriaActiva(cat)}
                    className={`flex items-center justify-between pl-6 pr-2 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
                      categoriaActiva === cat ? `${cfg.bg} ${cfg.color} font-medium` : "text-slate-500 hover:bg-slate-50"
                    }`}>
                    <span>{cat}</span>
                    <span className="text-[9px] text-slate-400">{conteoCat(tipo, cat)}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Tabs superiores */}
        <div className="flex bg-white border-b border-slate-200 px-4">
          {(Object.keys(tipoConfig) as Array<keyof typeof tipoConfig>).map((tipo) => {
            const cfg = tipoConfig[tipo];
            const Icono = cfg.icon;
            return (
              <button key={tipo}
                onClick={() => { setTipoActivo(tipo); setCategoriaActiva(categorias[tipo][0]); setTabActivo("catalogo"); }}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  tabActivo === "catalogo" && tipoActivo === tipo
                    ? "text-[#4F46E5] border-[#4F46E5]"
                    : "text-slate-400 border-transparent hover:text-slate-600"
                }`}>
                <Icono className="w-3 h-3" />
                {cfg.label}
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                  tabActivo === "catalogo" && tipoActivo === tipo
                    ? "bg-[#4F46E5]/10 text-[#4F46E5]"
                    : "bg-slate-100 text-slate-400"
                }`}>
                  {conteo(tipo)}
                </span>
              </button>
            );
          })}
          {/* Tab Top Ventas */}
          <button
            onClick={() => setTabActivo("topventas")}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ml-auto ${
              tabActivo === "topventas"
                ? "text-amber-600 border-amber-500"
                : "text-slate-400 border-transparent hover:text-slate-600"
            }`}>
            <TrendingUp className="w-3 h-3" />
            Top ventas
          </button>
        </div>

        {/* Contenido según tab */}
        {tabActivo === "catalogo" ? (

          /* Grid productos */
          <>
            <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre, SKU o código..."
                  className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
              </div>
              <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50 transition-colors">
                <SlidersHorizontal className="w-3 h-3" /> Filtros
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-3 gap-3 content-start xl:grid-cols-4">
              {productosFiltrados.map((p) => (
                <div key={p.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-[#4F46E5]/40 hover:shadow-sm transition-all cursor-pointer">
                  <div className="h-16 bg-slate-50 flex items-center justify-center text-2xl border-b border-slate-100">
                    {p.emoji}
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-medium text-slate-800 leading-tight mb-1 line-clamp-2">{p.nombre}</p>
                    <p className="text-[9px] text-slate-400 mb-2">{p.sku}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#4F46E5]">{formatMXN(p.precio)}</span>
                      {stockBadge(p.stock, p.tipo)}
                    </div>
                    {p.tipo !== "servicios" && p.costo && (
                      <p className="text-[9px] text-slate-400 mt-1">Costo: {formatMXN(p.costo)}</p>
                    )}
                  </div>
                </div>
              ))}
              <button className="flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-xl hover:border-[#4F46E5]/40 hover:bg-slate-50 transition-all min-h-[140px]">
                <Plus className="w-6 h-6 text-slate-300 mb-1" />
                <span className="text-[10px] text-slate-300">Agregar</span>
              </button>
            </div>
          </>

        ) : (

          /* Top Ventas */
          <div className="flex-1 overflow-y-auto p-4">

            {/* Barra de filtros */}
            <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-white border border-slate-200 rounded-xl">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-500">Sucursal:</span>
                <select value={sucursal} onChange={(e) => setSucursal(e.target.value)}
                  className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none focus:border-[#4F46E5]">
                  {sucursales.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>

              <div className="w-px h-5 bg-slate-200" />

              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-500">Período:</span>
                <div className="flex gap-1">
                  {periodos.map((p) => (
                    <button key={p} onClick={() => setPeriodo(p)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                        periodo === p ? "bg-[#4F46E5] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {periodo === "Personalizado" && (
                <div className="flex items-center gap-2 pl-2">
                  <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)}
                    className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#4F46E5]" />
                  <span className="text-xs text-slate-400">—</span>
                  <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)}
                    className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#4F46E5]" />
                </div>
              )}
            </div>

            {/* Contenido top ventas */}
            <div className="grid grid-cols-2 gap-4">

              {/* Gráfica de barras */}
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-sm font-medium text-slate-800 mb-1">Top 5 por ingresos</p>
                <p className="text-xs text-slate-400 mb-4 capitalize">{sucursal} · {periodoLabel[periodo]}</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={topVentasData} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 10 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="corto" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={80} />
                    <Tooltip
                      formatter={(v: any) => [formatMXN(Number(v)), "Ingresos"]}
                      labelFormatter={(label) => topVentasData.find(d => d.corto === label)?.nombre || label}
                    />
                    <Bar dataKey="total" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 10, fill: "#64748B", formatter: (v: number) => formatMXN(v) }}>
                      {topVentasData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Tabla ranking */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-sm font-medium text-slate-800">Ranking de productos</p>
                  <p className="text-xs text-slate-400 capitalize">{periodoLabel[periodo]}</p>
                </div>
                <div className="divide-y divide-slate-50">
                  {topVentasData.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${rankBadgeClass(i)}`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate">{item.nombre}</p>
                        <p className="text-[10px] text-slate-400">{item.categoria} · {item.unidades} unidades</p>
                      </div>
                      <span className="text-xs font-semibold text-[#4F46E5]">{formatMXN(item.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Barra resumen */}
            <div className="mt-3 flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
              <TrendingUp className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <p className="text-xs text-emerald-700">
                Mostrando datos de <strong>{sucursal}</strong> · {periodoLabel[periodo].charAt(0).toUpperCase() + periodoLabel[periodo].slice(1)} · Total generado: <strong>{formatMXN(totalTop)}</strong>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}