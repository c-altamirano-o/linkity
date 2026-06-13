"use client";

import { useState } from "react";
import {
  Search, Plus, Edit, ShoppingCart, Shield,
  Wrench, Phone, ChevronLeft
} from "lucide-react";

const clientes = [
  {
    id:1, nombre:"Carlos Mendoza",  telefono:"614 123 4567",
    iniciales:"CM", visitas:8,  totalGastado:28450,
    reparaciones:4, reparacionesActivas:1,
    garantiasActivas:2, ultimaVisita:"26 may",
    avatarBg:"bg-purple-50", avatarColor:"text-purple-700",
    historial:[
      { tipo:"reparacion", titulo:"iPhone 13 Pro · Pantalla rota",       folio:"REP-0042", fecha:"26 mayo 2026", estado:"reparando",   monto:1800 },
      { tipo:"venta",      titulo:"iPhone 14 128GB + Funda + Cargador",  folio:"VTA-0088", fecha:"15 mayo 2026", estado:"pagado",      monto:13080 },
      { tipo:"reparacion", titulo:"iPhone 12 · Batería",                 folio:"REP-0031", fecha:"3 abril 2026", estado:"entregado",   monto:650 },
      { tipo:"venta",      titulo:"AirPods Pro + Cable Lightning",       folio:"VTA-0065", fecha:"12 marzo 2026",estado:"pagado",      monto:4380 },
    ],
    garantias:[
      { producto:"iPhone 14",    vence:"15 jun 2026" },
      { producto:"AirPods Pro",  vence:"30 jun 2026" },
    ]
  },
  {
    id:2, nombre:"María González",  telefono:"614 234 5678",
    iniciales:"MG", visitas:3,  totalGastado:8600,
    reparaciones:1, reparacionesActivas:1,
    garantiasActivas:0, ultimaVisita:"27 may",
    avatarBg:"bg-orange-50", avatarColor:"text-orange-700",
    historial:[
      { tipo:"reparacion", titulo:"Samsung S22 · No enciende", folio:"REP-0041", fecha:"27 mayo 2026", estado:"diagnostico", monto:0 },
      { tipo:"venta",      titulo:"Funda Samsung S22",          folio:"VTA-0082", fecha:"10 mayo 2026", estado:"pagado",      monto:150 },
    ],
    garantias:[]
  },
  {
    id:3, nombre:"Roberto Díaz",    telefono:"614 345 6789",
    iniciales:"RD", visitas:12, totalGastado:45200,
    reparaciones:6, reparacionesActivas:0,
    garantiasActivas:1, ultimaVisita:"25 may",
    avatarBg:"bg-emerald-50", avatarColor:"text-emerald-700",
    historial:[
      { tipo:"reparacion", titulo:"iPhone 12 · Batería",         folio:"REP-0040", fecha:"25 mayo 2026", estado:"listo",   monto:650 },
      { tipo:"venta",      titulo:"Samsung S23 + Cargador",      folio:"VTA-0079", fecha:"2 mayo 2026",  estado:"pagado",  monto:11200 },
    ],
    garantias:[
      { producto:"Samsung S23", vence:"2 nov 2026" },
    ]
  },
  {
    id:4, nombre:"Ana López",       telefono:"614 456 7890",
    iniciales:"AL", visitas:1,  totalGastado:400,
    reparaciones:1, reparacionesActivas:1,
    garantiasActivas:0, ultimaVisita:"28 may",
    avatarBg:"bg-blue-50", avatarColor:"text-blue-700",
    historial:[
      { tipo:"reparacion", titulo:"Xiaomi 11T · Conector de carga", folio:"REP-0039", fecha:"28 mayo 2026", estado:"recibido", monto:400 },
    ],
    garantias:[]
  },
];

const estadoConfig: Record<string,{label:string;classes:string}> = {
  reparando:   { label:"En reparación", classes:"bg-purple-50 text-purple-700" },
  diagnostico: { label:"Diagnóstico",   classes:"bg-orange-50 text-orange-700" },
  listo:       { label:"Listo",         classes:"bg-emerald-50 text-emerald-700" },
  entregado:   { label:"Entregado",     classes:"bg-slate-100 text-slate-500" },
  recibido:    { label:"Recibido",      classes:"bg-blue-50 text-blue-700" },
  pagado:      { label:"Pagado",        classes:"bg-emerald-50 text-emerald-700" },
};

const filtrosTabs = ["Todo","Compras","Reparaciones","Garantías"];

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style:"currency", currency:"MXN", minimumFractionDigits:0 });

export default function ClientesPage() {
  const [busqueda,       setBusqueda]       = useState("");
  const [seleccionado,   setSeleccionado]   = useState(clientes[0]);
  const [filtroHistorial,setFiltroHistorial]= useState("Todo");
  const [mostrarDetalle, setMostrarDetalle] = useState(false);

  const clientesFiltrados = clientes.filter(c =>
    c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.telefono.includes(busqueda)
  );

  const historialFiltrado = seleccionado.historial.filter(h => {
    if (filtroHistorial==="Todo")          return true;
    if (filtroHistorial==="Compras")       return h.tipo==="venta";
    if (filtroHistorial==="Reparaciones")  return h.tipo==="reparacion";
    if (filtroHistorial==="Garantías")     return false;
    return true;
  });

  return (
    <div className="flex h-full">

      {/* ── Lista clientes ───────────────────────────────── */}
      <div className={`
        ${mostrarDetalle ? "hidden md:flex" : "flex"}
        w-full md:w-72 flex-col bg-white border-r border-slate-200 flex-shrink-0
      `}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span className="text-sm font-medium text-slate-800">Clientes</span>
          <button className="flex items-center gap-1 bg-[#4F46E5] text-white text-xs font-medium px-2.5 py-1.5 rounded-lg">
            <Plus className="w-3 h-3" /> Nuevo
          </button>
        </div>

        <div className="px-3 py-2 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Nombre, teléfono o equipo..."
              className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {clientesFiltrados.map(c => (
            <div key={c.id}
              onClick={() => { setSeleccionado(c); setMostrarDetalle(true); }}
              className={`flex items-center gap-3 px-3 py-3 border-b border-slate-50 cursor-pointer border-l-2 transition-all ${
                seleccionado.id===c.id
                  ? "bg-[#F5F3FF] border-l-[#4F46E5]"
                  : "hover:bg-slate-50 border-l-transparent"
              }`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${c.avatarBg} ${c.avatarColor}`}>
                {c.iniciales}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800">{c.nombre}</p>
                <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                  <Phone className="w-2.5 h-2.5 flex-shrink-0" />
                  <span className="truncate">{c.telefono}</span>
                  <span className="text-slate-300 flex-shrink-0">·</span>
                  <span className="flex-shrink-0">{c.visitas} {c.visitas===1?"visita":"visitas"}</span>
                </div>
              </div>
              {c.garantiasActivas > 0 && (
                <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-3 h-3 text-amber-600" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Detalle cliente ──────────────────────────────── */}
      <div className={`
        ${mostrarDetalle ? "flex" : "hidden md:flex"}
        flex-1 flex-col bg-slate-50 overflow-hidden
      `}>

        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-4 sm:px-5 py-4">

          {/* Botón volver — solo móvil */}
          <button onClick={() => setMostrarDetalle(false)}
            className="md:hidden flex items-center gap-1 text-[#4F46E5] text-xs font-medium mb-3">
            <ChevronLeft className="w-4 h-4" /> Volver a clientes
          </button>

          <div className="flex items-start justify-between mb-4 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-sm font-semibold flex-shrink-0 ${seleccionado.avatarBg} ${seleccionado.avatarColor}`}>
                {seleccionado.iniciales}
              </div>
              <div className="min-w-0">
                <p className="text-sm sm:text-[15px] font-semibold text-slate-800">{seleccionado.nombre}</p>
                <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                  <Phone className="w-3 h-3 flex-shrink-0" />
                  <span>{seleccionado.telefono}</span>
                </div>
              </div>
            </div>
            {/* Botones de acción — se envuelven en móvil */}
            <div className="flex gap-1.5 sm:gap-2 flex-wrap justify-end flex-shrink-0">
              <button className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50">
                <Edit className="w-3 h-3" />
                <span className="hidden sm:inline">Editar</span>
              </button>
              <button className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 bg-[#25D366] hover:bg-[#22c35e] text-white rounded-lg text-xs font-medium transition-colors">
                <span className="text-xs font-bold">W</span>
                <span className="hidden sm:inline">WhatsApp</span>
              </button>
              <button className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-lg text-xs font-medium transition-colors">
                <ShoppingCart className="w-3 h-3" />
                <span className="hidden sm:inline">Nueva venta</span>
              </button>
            </div>
          </div>

          {/* Stats — 2×2 en móvil, 4 en línea en desktop */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {[
              { label:"Total gastado",    value:formatMXN(seleccionado.totalGastado), sub:`${seleccionado.visitas} visitas` },
              { label:"Reparaciones",     value:String(seleccionado.reparaciones),    sub:seleccionado.reparacionesActivas>0?`${seleccionado.reparacionesActivas} activa`:"Sin activas" },
              { label:"Garantías activas",value:String(seleccionado.garantiasActivas),sub:seleccionado.garantiasActivas>0?"Ver detalles":"Sin garantías", warning:seleccionado.garantiasActivas>0 },
              { label:"Última visita",    value:seleccionado.ultimaVisita,            sub:"Hace pocos días" },
            ].map(s => (
              <div key={s.label} className={`rounded-lg p-2.5 sm:p-3 ${s.warning?"bg-amber-50":"bg-slate-50"}`}>
                <p className="text-[9px] sm:text-[10px] text-slate-400 mb-1">{s.label}</p>
                <p className={`text-base sm:text-[15px] font-semibold ${s.warning?"text-amber-600":"text-slate-800"}`}>{s.value}</p>
                <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">

          {/* Banner garantías */}
          {seleccionado.garantiasActivas > 0 && (
            <div className="flex items-start sm:items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
              <Shield className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5 sm:mt-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-amber-800">
                  {seleccionado.garantiasActivas} garantía{seleccionado.garantiasActivas>1?"s":""} activa{seleccionado.garantiasActivas>1?"s":""}
                </p>
                <p className="text-[10px] text-amber-600 mt-0.5 truncate">
                  {seleccionado.garantias.map(g=>`${g.producto} · vence ${g.vence}`).join(" · ")}
                </p>
              </div>
            </div>
          )}

          {/* Filtros historial — scroll horizontal en móvil */}
          <div className="flex gap-2 mb-3 overflow-x-auto">
            {filtrosTabs.map(tab => (
              <button key={tab} onClick={() => setFiltroHistorial(tab)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                  filtroHistorial===tab
                    ? "bg-[#4F46E5] text-white"
                    : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}>
                {tab}
              </button>
            ))}
          </div>

          <p className="text-[10px] font-semibold text-slate-400 tracking-widest mb-3">HISTORIAL</p>

          <div className="space-y-2">
            {historialFiltrado.length===0
              ? <div className="text-center py-8 text-slate-400 text-xs">Sin registros en esta categoría</div>
              : historialFiltrado.map((h,i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    h.tipo==="reparacion" ? "bg-purple-50" : "bg-emerald-50"
                  }`}>
                    {h.tipo==="reparacion"
                      ? <Wrench className="w-4 h-4 text-purple-600" />
                      : <ShoppingCart className="w-4 h-4 text-emerald-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-800 truncate">{h.titulo}</p>
                    <p className="text-[10px] text-slate-400">{h.folio} · {h.fecha}</p>
                  </div>
                  <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${estadoConfig[h.estado]?.classes}`}>
                    {estadoConfig[h.estado]?.label}
                  </span>
                  <span className="text-xs font-semibold text-slate-800 min-w-[60px] text-right flex-shrink-0">
                    {h.monto>0 ? formatMXN(h.monto) : "Por definir"}
                  </span>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  );
}