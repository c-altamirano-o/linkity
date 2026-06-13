"use client";

import { useState } from "react";
import {
  Search, Plus, Check, Edit, Clock, ExternalLink, Copy,
  RefreshCw, Wrench, Package, Stethoscope, Store, ArrowRight,
  Phone, CheckCircle, AlertCircle, User, ChevronLeft
} from "lucide-react";

const reparaciones = [
  { id:1, folio:"REP-0042", cliente:"Carlos Mendoza",  telefono:"614 123 4567", iniciales:"CM", marca:"Apple",   modelo:"iPhone 13 Pro",  falla:"Pantalla rota",    estado:"listo_tienda",      prioridad:"alta",   costoEstimado:1800, costoFinal:1800, fechaRecibido:"26 mayo 2026", fechaEstimada:"28 mayo 2026", tecnico:"Juan Pérez",  whatsappEnviado:true,  publicToken:"REP-0042-abc123", progreso:85,
    historial:[
      { texto:"Equipo trasladado a tienda — listo para entrega", tiempo:"28 mayo · 4:00 pm", tipo:"tienda" },
      { texto:"Reparación completada en taller",                  tiempo:"28 mayo · 2:00 pm", tipo:"reparacion" },
      { texto:"Reparación iniciada por técnico Juan",             tiempo:"26 mayo · 10:30 am",tipo:"reparacion" },
      { texto:"Diagnóstico completado — pantalla dañada",         tiempo:"26 mayo · 9:15 am", tipo:"diagnostico" },
      { texto:"WhatsApp enviado al cliente",                      tiempo:"26 mayo · 9:00 am", tipo:"whatsapp" },
      { texto:"Equipo recibido en taller",                        tiempo:"26 mayo · 8:45 am", tipo:"recibido" },
    ]},
  { id:2, folio:"REP-0041", cliente:"María González",  telefono:"614 234 5678", iniciales:"MG", marca:"Samsung", modelo:"S22",            falla:"No enciende",      estado:"listo_taller",      prioridad:"normal", costoEstimado:950,  costoFinal:950,  fechaRecibido:"27 mayo 2026", fechaEstimada:"29 mayo 2026", tecnico:"Juan Pérez",  whatsappEnviado:true,  publicToken:"REP-0041-def456", progreso:65,
    historial:[
      { texto:"Reparación completada — listo en taller", tiempo:"27 mayo · 3:00 pm", tipo:"reparacion" },
      { texto:"Diagnóstico completado — falla de batería",tiempo:"27 mayo · 11:00 am",tipo:"diagnostico" },
      { texto:"Equipo recibido en taller",                tiempo:"27 mayo · 10:30 am",tipo:"recibido" },
    ]},
  { id:3, folio:"REP-0040", cliente:"Roberto Díaz",    telefono:"614 345 6789", iniciales:"RD", marca:"Apple",   modelo:"iPhone 12",      falla:"Batería",          estado:"listo_tienda",      prioridad:"normal", costoEstimado:650,  costoFinal:650,  fechaRecibido:"25 mayo 2026", fechaEstimada:"27 mayo 2026", tecnico:"Juan Pérez",  whatsappEnviado:true,  publicToken:"REP-0040-ghi789", progreso:85,
    historial:[
      { texto:"Equipo trasladado a tienda — listo para entrega", tiempo:"27 mayo · 4:00 pm", tipo:"tienda" },
      { texto:"Reparación completada en taller",                  tiempo:"27 mayo · 2:00 pm", tipo:"reparacion" },
      { texto:"Equipo recibido en taller",                        tiempo:"25 mayo · 8:30 am", tipo:"recibido" },
    ]},
  { id:4, folio:"REP-0039", cliente:"Ana López",       telefono:"614 456 7890", iniciales:"AL", marca:"Xiaomi",  modelo:"11T",            falla:"Conector de carga",estado:"devolucion_tienda", prioridad:"baja",   costoEstimado:0,    costoFinal:0,    fechaRecibido:"28 mayo 2026", fechaEstimada:"30 mayo 2026", tecnico:"Juan Pérez",  whatsappEnviado:false, publicToken:"REP-0039-jkl012", progreso:70,
    historial:[
      { texto:"Equipo trasladado a tienda — devolución al cliente", tiempo:"28 mayo · 6:00 pm", tipo:"devolucion" },
      { texto:"No se pudo reparar — marcado para devolución",        tiempo:"28 mayo · 5:00 pm", tipo:"devolucion" },
      { texto:"Diagnóstico completado — daño irreparable",           tiempo:"28 mayo · 3:00 pm", tipo:"diagnostico" },
      { texto:"Equipo recibido en taller",                           tiempo:"28 mayo · 2:00 pm", tipo:"recibido" },
    ]},
  { id:5, folio:"REP-0038", cliente:"Jorge Pérez",     telefono:"614 567 8901", iniciales:"JP", marca:"Apple",   modelo:"iPhone 14",      falla:"Sin señal",        estado:"en_reparacion",     prioridad:"alta",   costoEstimado:1200, costoFinal:0,    fechaRecibido:"24 mayo 2026", fechaEstimada:"26 mayo 2026", tecnico:"Juan Pérez",  whatsappEnviado:true,  publicToken:"REP-0038-mno345", progreso:40,
    historial:[
      { texto:"Reparación iniciada", tiempo:"24 mayo · 11:00 am", tipo:"reparacion" },
      { texto:"Equipo recibido en taller", tiempo:"24 mayo · 10:00 am", tipo:"recibido" },
    ]},
];

const estadoConfig: Record<string,{label:string;badge:string;avatar:string}> = {
  recibido:          { label:"Recibido",             badge:"bg-blue-50 text-blue-700",      avatar:"bg-blue-50 text-blue-700" },
  en_reparacion:     { label:"En reparación",        badge:"bg-purple-50 text-purple-700",  avatar:"bg-purple-50 text-purple-700" },
  listo_taller:      { label:"Listo en Taller",      badge:"bg-emerald-50 text-emerald-700",avatar:"bg-emerald-50 text-emerald-700" },
  devolucion_taller: { label:"Devolución en Taller", badge:"bg-orange-50 text-orange-700",  avatar:"bg-orange-50 text-orange-700" },
  listo_tienda:      { label:"Listo en Tienda",      badge:"bg-cyan-50 text-cyan-700",      avatar:"bg-cyan-50 text-cyan-700" },
  devolucion_tienda: { label:"Devolución en Tienda", badge:"bg-red-50 text-red-600",        avatar:"bg-red-50 text-red-600" },
  entregado:         { label:"Entregado",             badge:"bg-slate-100 text-slate-500",   avatar:"bg-slate-100 text-slate-500" },
};

const prioridadConfig: Record<string,{label:string;classes:string;dot:string}> = {
  alta:   { label:"Alta",   classes:"bg-red-50 text-red-600",      dot:"text-red-500" },
  normal: { label:"Normal", classes:"bg-amber-50 text-amber-600",  dot:"text-amber-400" },
  baja:   { label:"Baja",   classes:"bg-slate-100 text-slate-500", dot:"text-slate-400" },
};

const historialIconos: Record<string,{icon:React.ElementType;bg:string;color:string}> = {
  reparacion:  { icon:Wrench,      bg:"bg-purple-50",  color:"text-purple-600" },
  diagnostico: { icon:Stethoscope, bg:"bg-blue-50",    color:"text-blue-600" },
  whatsapp:    { icon:RefreshCw,   bg:"bg-emerald-50", color:"text-emerald-600" },
  recibido:    { icon:Package,     bg:"bg-slate-100",  color:"text-slate-500" },
  tienda:      { icon:Store,       bg:"bg-cyan-50",    color:"text-cyan-600" },
  devolucion:  { icon:ArrowRight,  bg:"bg-orange-50",  color:"text-orange-600" },
};

const flujoSteps = [
  { key:"recibido",  label:"Recibido",  icon:Package },
  { key:"taller",    label:"Taller",    icon:Wrench },
  { key:"tienda",    label:"Tienda",    icon:Store },
  { key:"entregado", label:"Entregado", icon:Check },
];

const getStepIndex = (estado:string) => {
  if (estado==="recibido") return 0;
  if (estado==="en_reparacion") return 1;
  if (estado==="listo_taller"||estado==="devolucion_taller") return 2;
  if (estado==="listo_tienda"||estado==="devolucion_tienda") return 3;
  if (estado==="entregado") return 4;
  return 0;
};

const esDev = (estado:string) =>
  estado==="devolucion_taller"||estado==="devolucion_tienda";

const formatMXN = (n:number) =>
  n.toLocaleString("es-MX",{style:"currency",currency:"MXN",minimumFractionDigits:0});

type Rol = "admin"|"tecnico"|"tienda";

// ── Botón de acción por estado ───────────────────────────
function AccionBtn({ estado }:{ estado:string }) {
  if (estado==="recibido") return (
    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-xs font-medium transition-colors">
      <Wrench className="w-3 h-3" /> Iniciar reparación
    </button>
  );
  if (estado==="en_reparacion") return (
    <div className="flex gap-2 flex-wrap">
      <button className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-medium transition-colors">
        <Check className="w-3 h-3" /> Listo en Taller
      </button>
      <button className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-medium transition-colors">
        <ArrowRight className="w-3 h-3" /> Devolución Taller
      </button>
    </div>
  );
  if (estado==="listo_taller"||estado==="devolucion_taller") return (
    <button className={`flex items-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-xs font-medium transition-colors ${
      estado==="listo_taller"?"bg-cyan-500 hover:bg-cyan-600":"bg-orange-500 hover:bg-orange-600"
    }`}>
      <Store className="w-3 h-3" /> Trasladar a Tienda
    </button>
  );
  if (estado==="listo_tienda"||estado==="devolucion_tienda") return (
    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-lg text-xs font-medium transition-colors">
      <Check className="w-3 h-3" /> Marcar entregado
    </button>
  );
  return null;
}

// ── VISTA TIENDA ─────────────────────────────────────────
function VistaTienda() {
  const [busqueda,     setBusqueda]     = useState("");
  const [filtro,       setFiltro]       = useState("Pendientes");
  const [seleccionada, setSeleccionada] = useState(
    reparaciones.find(r=>r.estado==="listo_tienda"||r.estado==="devolucion_tienda")||reparaciones[0]
  );
  const [mostrarDetalle, setMostrarDetalle] = useState(false);

  const tiendaReps = reparaciones.filter(r => {
    const esTienda   = r.estado==="listo_tienda"||r.estado==="devolucion_tienda";
    const esEntregado= r.estado==="entregado";
    const match      = r.cliente.toLowerCase().includes(busqueda.toLowerCase())||
                       r.folio.toLowerCase().includes(busqueda.toLowerCase())||
                       r.telefono.includes(busqueda);
    if (!match) return false;
    if (filtro==="Pendientes")     return esTienda;
    if (filtro==="Entregados hoy") return esEntregado;
    return true;
  });

  const totalListos       = reparaciones.filter(r=>r.estado==="listo_tienda").length;
  const totalDevoluciones = reparaciones.filter(r=>r.estado==="devolucion_tienda").length;
  const isDev             = seleccionada.estado==="devolucion_tienda";

  return (
    <div className="flex h-full">

      {/* Lista tienda — oculta en móvil cuando se ve el detalle */}
      <div className={`
        ${mostrarDetalle ? "hidden md:flex" : "flex"}
        w-full md:w-72 flex-col bg-white border-r border-slate-200 flex-shrink-0
      `}>
        <div className="px-3 py-2 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <input type="text" value={busqueda} onChange={e=>setBusqueda(e.target.value)}
              placeholder="Cliente, folio o teléfono..."
              className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 px-3 py-2 border-b border-slate-100">
          {[
            { label:"Listos",      value:totalListos,       color:"text-emerald-600" },
            { label:"Devoluciones",value:totalDevoluciones, color:"text-amber-600" },
            { label:"Entregados",  value:8,                 color:"text-slate-400" },
          ].map(s=>(
            <div key={s.label} className="bg-slate-50 rounded-lg py-2 text-center">
              <p className={`text-base font-semibold ${s.color}`}>{s.value}</p>
              <p className="text-[9px] text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-1 px-3 py-2 border-b border-slate-100">
          {["Pendientes","Entregados hoy","Todo"].map(tab=>(
            <button key={tab} onClick={()=>setFiltro(tab)}
              className={`px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors ${
                filtro===tab?"bg-[#4F46E5] text-white":"bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}>
              {tab}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {tiendaReps.length===0
            ? <div className="text-center py-8 text-slate-400 text-xs">Sin equipos pendientes</div>
            : tiendaReps.map(rep=>(
              <div key={rep.id}
                onClick={()=>{ setSeleccionada(rep); setMostrarDetalle(true); }}
                className={`p-3 rounded-xl border mb-2 cursor-pointer transition-all ${
                  seleccionada.id===rep.id?"bg-[#F5F3FF] border-[#4F46E5]":"bg-white border-slate-200 hover:border-slate-300"
                } ${rep.estado==="listo_tienda"?"border-l-2 border-l-emerald-500":"border-l-2 border-l-amber-400"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${estadoConfig[rep.estado].avatar}`}>
                    {rep.iniciales}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800">{rep.cliente}</p>
                    <p className="text-[10px] text-slate-500 truncate">{rep.modelo} · {rep.falla}</p>
                  </div>
                  <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${estadoConfig[rep.estado].badge}`}>
                    {rep.estado==="listo_tienda"?"Listo":"Devolución"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" /> {rep.folio}
                  </span>
                  <span className="text-[10px] text-[#4F46E5] flex items-center gap-1">
                    <Phone className="w-2.5 h-2.5" /> {rep.telefono}
                  </span>
                </div>
              </div>
            ))
          }
        </div>
      </div>

      {/* Detalle tienda — pantalla completa en móvil */}
      <div className={`
        ${mostrarDetalle ? "flex" : "hidden md:flex"}
        flex-1 flex-col bg-slate-50 overflow-hidden
      `}>
        <div className="bg-white border-b border-slate-200 px-4 sm:px-5 py-3">
          {/* Botón volver - solo móvil */}
          <button onClick={()=>setMostrarDetalle(false)}
            className="md:hidden flex items-center gap-1 text-[#4F46E5] text-xs font-medium mb-3">
            <ChevronLeft className="w-4 h-4" /> Volver a la lista
          </button>

          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-semibold flex-shrink-0 ${estadoConfig[seleccionada.estado].avatar}`}>
                {seleccionada.iniciales}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{seleccionada.cliente}</p>
                <p className="text-xs text-slate-400">{seleccionada.folio} · {seleccionada.telefono}</p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366] hover:bg-[#22c35e] text-white rounded-lg text-xs font-medium transition-colors">
                <Phone className="w-3 h-3" /> Avisar
              </button>
              {(seleccionada.estado==="listo_tienda"||seleccionada.estado==="devolucion_tienda") && (
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-lg text-xs font-medium transition-colors">
                  <CheckCircle className="w-3 h-3" /> Entregar
                </button>
              )}
            </div>
          </div>

          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
            isDev?"bg-amber-50 border-amber-200":"bg-emerald-50 border-emerald-200"
          }`}>
            {isDev
              ? <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              : <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            }
            <div>
              <p className={`text-xs font-semibold ${isDev?"text-amber-700":"text-emerald-700"}`}>
                {isDev?"Equipo para devolver al cliente":"Equipo listo para entregar"}
              </p>
              <p className={`text-[10px] mt-0.5 ${isDev?"text-amber-600":"text-emerald-600"}`}>
                {seleccionada.modelo} ·{" "}
                {isDev?"No fue posible realizar la reparación":`Reparación completada · Costo: ${formatMXN(seleccionada.costoFinal)}`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-slate-400 tracking-widest mb-3">DATOS DEL EQUIPO</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label:"Equipo",     value:`${seleccionada.marca} ${seleccionada.modelo}` },
                { label:"Falla",      value:seleccionada.falla },
                { label:"Costo final",value:seleccionada.costoFinal>0?formatMXN(seleccionada.costoFinal):isDev?"Sin cargo":"Por definir", color:isDev?"text-amber-600":"text-[#4F46E5]" },
                { label:"Técnico",    value:seleccionada.tecnico },
              ].map(f=>(
                <div key={f.label} className="bg-slate-50 rounded-lg p-2.5">
                  <p className="text-[9px] text-slate-400 mb-0.5">{f.label}</p>
                  <p className={`text-xs font-medium ${f.color||"text-slate-800"}`}>{f.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-slate-400 tracking-widest mb-3">HISTORIAL</p>
            <div className="space-y-3">
              {seleccionada.historial.slice(0,4).map((h,i)=>{
                const cfg  = historialIconos[h.tipo]||historialIconos.recibido;
                const Icon = cfg.icon;
                return (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                      <Icon className={`w-3 h-3 ${cfg.color}`} />
                    </div>
                    <div>
                      <p className="text-xs text-slate-700">{h.texto}</p>
                      <p className="text-[10px] text-slate-400">{h.tiempo}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── VISTA ADMIN / TÉCNICO ─────────────────────────────────
function VistaAdmin() {
  const [busqueda,       setBusqueda]       = useState("");
  const [filtro,         setFiltro]         = useState("Todas");
  const [seleccionada,   setSeleccionada]   = useState(reparaciones[0]);
  const [copiado,        setCopiado]        = useState(false);
  const [mostrarDetalle, setMostrarDetalle] = useState(false);

  const filtrosMap: Record<string,string[]> = {
    "Todas":      [],
    "Recibidas":  ["recibido","en_reparacion"],
    "En taller":  ["listo_taller","devolucion_taller"],
    "En tienda":  ["listo_tienda","devolucion_tienda"],
    "Entregadas": ["entregado"],
  };

  const filtradas = reparaciones.filter(r=>{
    const ok1 = filtrosMap[filtro].length===0||filtrosMap[filtro].includes(r.estado);
    const ok2 = r.folio.toLowerCase().includes(busqueda.toLowerCase())||
                r.cliente.toLowerCase().includes(busqueda.toLowerCase());
    return ok1&&ok2;
  });

  const stepIdx   = getStepIndex(seleccionada.estado);
  const devolucion= esDev(seleccionada.estado);
  const copiarLink= ()=>{ setCopiado(true); setTimeout(()=>setCopiado(false),2000); };

  return (
    <div className="flex h-full">

      {/* Lista — oculta en móvil cuando se muestra el detalle */}
      <div className={`
        ${mostrarDetalle?"hidden md:flex":"flex"}
        w-full md:w-72 flex-col bg-white border-r border-slate-200 flex-shrink-0
      `}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span className="text-sm font-medium text-slate-800">Reparaciones</span>
          <button className="flex items-center gap-1 bg-[#4F46E5] text-white text-xs font-medium px-2.5 py-1.5 rounded-lg">
            <Plus className="w-3 h-3" /> Nueva
          </button>
        </div>

        <div className="px-3 py-2 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <input type="text" value={busqueda} onChange={e=>setBusqueda(e.target.value)}
              placeholder="Buscar folio o cliente..."
              className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
          </div>
        </div>

        <div className="flex gap-1 px-3 py-2 border-b border-slate-100 overflow-x-auto">
          {Object.keys(filtrosMap).map(tab=>(
            <button key={tab} onClick={()=>setFiltro(tab)}
              className={`px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors ${
                filtro===tab?"bg-[#4F46E5] text-white":"bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}>
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtradas.map(rep=>(
            <div key={rep.id}
              onClick={()=>{ setSeleccionada(rep); setMostrarDetalle(true); }}
              className={`px-3 py-3 border-b border-slate-50 cursor-pointer transition-all border-l-2 ${
                seleccionada.id===rep.id?"bg-[#F5F3FF] border-l-[#4F46E5]":"hover:bg-slate-50 border-l-transparent"
              }`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${estadoConfig[rep.estado].avatar}`}>
                  {rep.iniciales}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800">{rep.folio}</p>
                  <p className="text-[10px] text-slate-500 truncate">{rep.modelo} · {rep.falla}</p>
                </div>
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${estadoConfig[rep.estado].badge}`}>
                  {estadoConfig[rep.estado].label}
                </span>
              </div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-slate-400">{rep.fechaRecibido}</span>
                <span className={`text-[10px] font-medium ${prioridadConfig[rep.prioridad].dot}`}>
                  ● {prioridadConfig[rep.prioridad].label}
                </span>
              </div>
              <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${esDev(rep.estado)?"bg-orange-400":"bg-gradient-to-r from-[#4F46E5] to-[#06B6D4]"}`}
                  style={{width:`${rep.progreso}%`}} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detalle — pantalla completa en móvil */}
      <div className={`
        ${mostrarDetalle?"flex":"hidden md:flex"}
        flex-1 flex-col bg-slate-50 overflow-hidden
      `}>
        <div className="bg-white border-b border-slate-200 px-4 sm:px-5 py-3">

          {/* Botón volver - solo móvil */}
          <button onClick={()=>setMostrarDetalle(false)}
            className="md:hidden flex items-center gap-1 text-[#4F46E5] text-xs font-medium mb-3">
            <ChevronLeft className="w-4 h-4" /> Volver a la lista
          </button>

          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-xs font-semibold flex-shrink-0 ${estadoConfig[seleccionada.estado].avatar}`}>
                {seleccionada.iniciales}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {seleccionada.folio}
                  <span className="text-xs font-normal text-slate-500 ml-1 hidden sm:inline">— {seleccionada.marca} {seleccionada.modelo}</span>
                </p>
                <p className="text-xs text-slate-400 truncate max-w-[200px] sm:max-w-none">{seleccionada.cliente} · {seleccionada.telefono}</p>
              </div>
            </div>
            <div className="flex gap-1.5 sm:gap-2 items-center flex-wrap justify-end">
              <button className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50">
                <Edit className="w-3 h-3" /> <span className="hidden sm:inline">Editar</span>
              </button>
              <AccionBtn estado={seleccionada.estado} />
            </div>
          </div>

          {/* Stepper */}
          <div className="flex items-center">
            {flujoSteps.map((step,i)=>{
              const Icon       = step.icon;
              const isDone     = i<stepIdx;
              const isCurrent  = i===stepIdx;
              const isDevStep  = devolucion&&(isCurrent||isDone)&&i>=1;
              const stepColor  = isDevStep?"bg-orange-500 border-orange-500":"bg-[#4F46E5] border-[#4F46E5]";
              const lineColor  = isDevStep?"bg-orange-400":"bg-[#4F46E5]";
              const labelColor = isCurrent?(devolucion?"text-orange-500":"text-[#4F46E5]"):isDone?"text-[#4F46E5]":"text-slate-400";
              return (
                <div key={step.key} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center border-2 transition-all ${
                      isDone?stepColor:isCurrent?`bg-white ${devolucion?"border-orange-500":"border-[#4F46E5]"}`:"bg-white border-slate-200"
                    }`}>
                      {isDone?<Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />:<Icon className={`w-2.5 h-2.5 sm:w-3 sm:h-3 ${isCurrent?(devolucion?"text-orange-500":"text-[#4F46E5]"):"text-slate-300"}`} />}
                    </div>
                    <div className="flex flex-col items-center mt-1">
                      <span className={`text-[8px] sm:text-[9px] whitespace-nowrap font-medium ${labelColor}`}>{step.label}</span>
                      {(step.key==="taller"||step.key==="tienda")&&isCurrent&&(
                        <span className={`text-[7px] sm:text-[8px] font-semibold ${devolucion?"text-orange-500":"text-emerald-500"}`}>
                          {devolucion?"Dev.":"Listo"}
                        </span>
                      )}
                    </div>
                  </div>
                  {i<flujoSteps.length-1&&(
                    <div className={`flex-1 h-0.5 mx-1 mb-5 transition-all ${i<stepIdx?lineColor:"bg-slate-200"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-slate-400 tracking-widest mb-3">DETALLES DEL EQUIPO</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label:"Marca / Modelo", value:`${seleccionada.marca} ${seleccionada.modelo}` },
                { label:"Falla reportada", value:seleccionada.falla },
                { label:"Costo estimado", value:seleccionada.costoEstimado>0?formatMXN(seleccionada.costoEstimado):"Por definir", color:"text-[#4F46E5]" },
                { label:"Fecha estimada", value:seleccionada.fechaEstimada },
                { label:"Técnico",        value:seleccionada.tecnico },
                { label:"Prioridad",      value:prioridadConfig[seleccionada.prioridad].label, badge:prioridadConfig[seleccionada.prioridad].classes },
              ].map(f=>(
                <div key={f.label} className="bg-slate-50 rounded-lg p-2.5">
                  <p className="text-[9px] text-slate-400 mb-0.5">{f.label}</p>
                  {f.badge
                    ? <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${f.badge}`}>{f.value}</span>
                    : <p className={`text-xs font-medium ${f.color||"text-slate-800"}`}>{f.value}</p>
                  }
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-slate-400 tracking-widest mb-3">HISTORIAL</p>
            <div className="space-y-3">
              {seleccionada.historial.map((h,i)=>{
                const cfg  = historialIconos[h.tipo]||historialIconos.recibido;
                const Icon = cfg.icon;
                return (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                      <Icon className={`w-3 h-3 ${cfg.color}`} />
                    </div>
                    <div>
                      <p className="text-xs text-slate-700">{h.texto}</p>
                      <p className="text-[10px] text-slate-400">{h.tiempo}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="sm:col-span-2 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-[#25D366] rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">W</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-emerald-700 truncate">
                  {seleccionada.whatsappEnviado?`Mensaje enviado a ${seleccionada.cliente}`:"WhatsApp no enviado aún"}
                </p>
                {seleccionada.whatsappEnviado&&<p className="text-[10px] text-emerald-500">Hoy · 9:00 am · Entregado</p>}
              </div>
              {seleccionada.whatsappEnviado&&(
                <button className="px-3 py-1.5 bg-[#25D366] hover:bg-[#22c35e] text-white text-xs font-medium rounded-lg flex-shrink-0">Reenviar</button>
              )}
            </div>
            {seleccionada.whatsappEnviado?(
              <>
                <div className="bg-[#DCF8C6] rounded-lg p-3 text-xs text-slate-800 leading-relaxed mb-2">
                  Hola {seleccionada.cliente.split(" ")[0]} 👋, tu <strong>{seleccionada.modelo}</strong> está siendo atendido. Puedes ver el estado aquí:
                </div>
                <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-emerald-200">
                  <ExternalLink className="w-3 h-3 text-[#4F46E5] flex-shrink-0" />
                  <span className="text-xs text-[#4F46E5] flex-1 truncate">linkity.mx/rep/{seleccionada.publicToken}</span>
                  <button onClick={copiarLink} className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1 flex-shrink-0">
                    <Copy className="w-3 h-3" /> {copiado?"¡Copiado!":"Copiar"}
                  </button>
                </div>
              </>
            ):(
              <button className="w-full max-w-xs py-2 bg-[#25D366] hover:bg-[#22c35e] text-white text-xs font-medium rounded-lg">
                Enviar notificación WhatsApp
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── COMPONENTE PRINCIPAL ──────────────────────────────────
export default function ReparacionesPage() {
  const [rolDemo, setRolDemo] = useState<Rol>("admin");

  return (
    <div className="flex flex-col h-full">
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex items-center gap-3 overflow-x-auto">
        <span className="text-[10px] text-amber-700 font-medium flex items-center gap-1 whitespace-nowrap">
          <User className="w-3 h-3" /> Simulador de rol:
        </span>
        <div className="flex gap-1">
          {(["admin","tecnico","tienda"] as Rol[]).map(r=>(
            <button key={r} onClick={()=>setRolDemo(r)}
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium capitalize transition-colors whitespace-nowrap ${
                rolDemo===r?"bg-amber-500 text-white":"bg-white text-amber-600 border border-amber-300"
              }`}>
              {r==="admin"?"Administrador":r==="tecnico"?"Técnico":"Tienda"}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-amber-500 ml-auto whitespace-nowrap">Esta barra desaparece con auth real</span>
      </div>
      <div className="flex-1 overflow-hidden">
        {rolDemo==="tienda"?<VistaTienda />:<VistaAdmin />}
      </div>
    </div>
  );
}