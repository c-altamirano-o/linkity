"use client";

import { useState } from "react";
import { Search, Plus, SlidersHorizontal, Smartphone, Cpu, Wrench } from "lucide-react";

const categorias = {
  productos: ["Celulares", "Accesorios", "Tablets", "Sin categoría"],
  refacciones: ["Pantallas", "Baterías", "Conectores"],
  servicios: ["Reparaciones", "Diagnósticos"],
};

const productos = [
  { id: 1, nombre: "iPhone 14 128GB Negro", sku: "APL-IP14-128-BK", precio: 12500, costo: 10000, stock: 3, tipo: "productos", categoria: "Celulares", emoji: "📱", activo: true },
  { id: 2, nombre: "Samsung Galaxy S23", sku: "SAM-S23-256-WH", precio: 10800, costo: 8500, stock: 5, tipo: "productos", categoria: "Celulares", emoji: "📱", activo: true },
  { id: 3, nombre: "iPhone 13 Pro 256GB", sku: "APL-IP13P-256", precio: 14200, costo: 11500, stock: 1, tipo: "productos", categoria: "Celulares", emoji: "📱", activo: true },
  { id: 4, nombre: "AirPods Pro 2da Gen", sku: "APL-APP2-WH", precio: 4200, costo: 3200, stock: 8, tipo: "productos", categoria: "Accesorios", emoji: "🎧", activo: true },
  { id: 5, nombre: "Cargador USB-C 20W", sku: "ACC-CHG-20W", precio: 280, costo: 150, stock: 24, tipo: "productos", categoria: "Accesorios", emoji: "🔌", activo: true },
  { id: 6, nombre: "Xiaomi Redmi Note 12", sku: "XIA-RN12-128", precio: 3800, costo: 2900, stock: 0, tipo: "productos", categoria: "Celulares", emoji: "📱", activo: true },
  { id: 7, nombre: "Funda iPhone 14 MagSafe", sku: "ACC-CASE-IP14", precio: 350, costo: 180, stock: 12, tipo: "productos", categoria: "Accesorios", emoji: "📱", activo: true },
  { id: 8, nombre: "Pantalla iPhone 13 Original", sku: "REF-SCR-IP13", precio: 1800, costo: 1200, stock: 4, tipo: "refacciones", categoria: "Pantallas", emoji: "🖥️", activo: true },
  { id: 9, nombre: "Batería iPhone 12", sku: "REF-BAT-IP12", precio: 450, costo: 280, stock: 6, tipo: "refacciones", categoria: "Baterías", emoji: "🔋", activo: true },
  { id: 10, nombre: "Batería Samsung S22", sku: "REF-BAT-S22", precio: 380, costo: 220, stock: 0, tipo: "refacciones", categoria: "Baterías", emoji: "🔋", activo: true },
  { id: 11, nombre: "Conector carga iPhone", sku: "REF-CON-IPHG", precio: 320, costo: 180, stock: 9, tipo: "refacciones", categoria: "Conectores", emoji: "🔌", activo: true },
  { id: 12, nombre: "Cambio de pantalla", sku: "SRV-SCR-001", precio: 800, costo: 0, stock: 999, tipo: "servicios", categoria: "Reparaciones", emoji: "🔧", activo: true },
  { id: 13, nombre: "Cambio de batería", sku: "SRV-BAT-001", precio: 350, costo: 0, stock: 999, tipo: "servicios", categoria: "Reparaciones", emoji: "🔋", activo: true },
  { id: 14, nombre: "Diagnóstico general", sku: "SRV-DIAG-001", precio: 150, costo: 0, stock: 999, tipo: "servicios", categoria: "Diagnósticos", emoji: "🔍", activo: true },
];

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

export default function CatalogoPage() {
  const [tipoActivo, setTipoActivo] = useState<"productos" | "refacciones" | "servicios">("productos");
  const [categoriaActiva, setCategoriaActiva] = useState("Celulares");
  const [busqueda, setBusqueda] = useState("");

  const productosFiltrados = productos.filter((p) => {
    const matchTipo = p.tipo === tipoActivo;
    const matchCat = categoriaActiva === "todos" || p.categoria === categoriaActiva;
    const matchSearch = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.sku.toLowerCase().includes(busqueda.toLowerCase());
    return matchTipo && matchCat && matchSearch;
  });

  const conteo = (tipo: string) => productos.filter((p) => p.tipo === tipo).length;
  const conteoCat = (tipo: string, cat: string) => productos.filter((p) => p.tipo === tipo && p.categoria === cat).length;

  return (
    <div className="flex h-full">

      {/* Sidebar categorías */}
      <div className="w-48 flex flex-col bg-white border-r border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-between px-3 py-3 border-b border-slate-100">
          <span className="text-[13px] font-medium text-slate-800">Catálogo</span>
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
                <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg mb-1 cursor-pointer ${tipoActivo === tipo ? cfg.bg : "bg-slate-50"}`}
                  onClick={() => { setTipoActivo(tipo); setCategoriaActiva(categorias[tipo][0]); }}>
                  <Icono className={`w-3.5 h-3.5 ${cfg.color}`} />
                  <span className={`text-[11px] font-semibold ${tipoActivo === tipo ? cfg.color : "text-slate-600"}`}>
                    {cfg.label}
                  </span>
                  <span className="ml-auto text-[9px] text-slate-400">{conteo(tipo)}</span>
                </div>
                {tipoActivo === tipo && categorias[tipo].map((cat) => (
                  <div key={cat} onClick={() => setCategoriaActiva(cat)}
                    className={`flex items-center justify-between pl-6 pr-2 py-1.5 rounded-lg cursor-pointer text-[11px] transition-colors ${
                      categoriaActiva === cat
                        ? `${cfg.bg} ${cfg.color} font-medium`
                        : "text-slate-500 hover:bg-slate-50"
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

        {/* Topbar */}
        <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, SKU o código..."
              className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-lg text-[11px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
          </div>
          <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-[11px] text-slate-600 hover:bg-slate-50 transition-colors">
            <SlidersHorizontal className="w-3 h-3" /> Filtros
          </button>
        </div>

        {/* Tabs tipo */}
        <div className="flex gap-2 px-4 py-2 border-b border-slate-100 bg-white">
          {(Object.keys(tipoConfig) as Array<keyof typeof tipoConfig>).map((tipo) => {
            const cfg = tipoConfig[tipo];
            const Icono = cfg.icon;
            return (
              <button key={tipo} onClick={() => { setTipoActivo(tipo); setCategoriaActiva(categorias[tipo][0]); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
                  tipoActivo === tipo ? cfg.tab : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}>
                <Icono className="w-3 h-3" />
                {cfg.label}
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${tipoActivo === tipo ? "bg-white/60" : "bg-white text-slate-400"}`}>
                  {conteo(tipo)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Grid productos */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-3 gap-3 content-start xl:grid-cols-4">
          {productosFiltrados.map((p) => (
            <div key={p.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-[#4F46E5]/40 hover:shadow-sm transition-all cursor-pointer">
              <div className="h-16 bg-slate-50 flex items-center justify-center text-2xl border-b border-slate-100">
                {p.emoji}
              </div>
              <div className="p-3">
                <p className="text-[11px] font-medium text-slate-800 leading-tight mb-1 line-clamp-2">{p.nombre}</p>
                <p className="text-[9px] text-slate-400 mb-2">{p.sku}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold text-[#4F46E5]">{formatMXN(p.precio)}</span>
                  {stockBadge(p.stock, p.tipo)}
                </div>
                {p.tipo !== "servicios" && (
                  <p className="text-[9px] text-slate-400 mt-1">Costo: {formatMXN(p.costo)}</p>
                )}
              </div>
            </div>
          ))}

          {/* Agregar nuevo */}
          <button className="flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-xl hover:border-[#4F46E5]/40 hover:bg-slate-50 transition-all min-h-[140px]">
            <Plus className="w-6 h-6 text-slate-300 mb-1" />
            <span className="text-[10px] text-slate-300">Agregar</span>
          </button>
        </div>
      </div>
    </div>
  );
}