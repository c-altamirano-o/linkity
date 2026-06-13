"use client";

import { useState } from "react";
import {
  Search, Plus, Edit, DollarSign, Clock,
  Wrench, ShoppingCart, ChevronLeft
} from "lucide-react";

type Esquema = 1|2|3|4|5|6;

const empleados = [
  {
    id:1, nombre:"Juan Pérez García", iniciales:"JP", puesto:"Técnico",   turno:"Matutino",
    avatarBg:"bg-purple-50",  avatarColor:"text-purple-700",  activo:true,
    ingreso:"15 enero 2025",  asistencia:96,  reparacionesSemana:8,
    esquema:1 as Esquema,
    config:{ base:3500, periodo:"Semanal", comisionRep:5, comisionVenta:2, cuotaFija:0,   tarifaHora:0 },
  },
  {
    id:2, nombre:"María López",        iniciales:"ML", puesto:"Cajera",    turno:"Matutino",
    avatarBg:"bg-emerald-50", avatarColor:"text-emerald-700", activo:true,
    ingreso:"3 marzo 2025",   asistencia:100, reparacionesSemana:0,
    esquema:2 as Esquema,
    config:{ base:0,    periodo:"Semanal", comisionRep:0, comisionVenta:8, cuotaFija:0,   tarifaHora:0 },
  },
  {
    id:3, nombre:"Carlos Ríos",        iniciales:"CR", puesto:"Técnico",   turno:"Vespertino",
    avatarBg:"bg-orange-50",  avatarColor:"text-orange-700",  activo:false,
    ingreso:"10 junio 2025",  asistencia:88,  reparacionesSemana:5,
    esquema:3 as Esquema,
    config:{ base:0,    periodo:"Semanal", comisionRep:0, comisionVenta:0, cuotaFija:150, tarifaHora:0 },
  },
  {
    id:4, nombre:"Ana Martínez",       iniciales:"AM", puesto:"Vendedora", turno:"Matutino",
    avatarBg:"bg-blue-50",    avatarColor:"text-blue-700",    activo:true,
    ingreso:"1 septiembre 2025", asistencia:94, reparacionesSemana:0,
    esquema:5 as Esquema,
    config:{ base:0,    periodo:"Semanal", comisionRep:0, comisionVenta:0, cuotaFija:0,   tarifaHora:45 },
  },
];

const esquemas = [
  { num:1, nombre:"Sueldo + Comisión %",  desc:"Base fija + % sobre ventas/reparaciones" },
  { num:2, nombre:"Solo comisión %",       desc:"Sin base, solo % de lo que produce" },
  { num:3, nombre:"Cuota fija por trabajo",desc:"Tarifa fija según tipo de reparación" },
  { num:4, nombre:"Sueldo + Cuota fija",   desc:"Base fija + tarifa por trabajo completado" },
  { num:5, nombre:"Por hora trabajada",    desc:"Tarifa por hora × horas registradas" },
  { num:6, nombre:"Mixto personalizado",   desc:"Combinación libre de base + % + cuota" },
];

const esquemaLabel: Record<Esquema,string> = {
  1:"Base + Comisión", 2:"Solo comisión", 3:"Cuota fija",
  4:"Base + Cuota",    5:"Por hora",       6:"Mixto",
};

const tabs = ["Perfil y nómina","Asistencia","Historial de pagos"];

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style:"currency", currency:"MXN", minimumFractionDigits:0 });

const calcularNomina = (emp: typeof empleados[0]) => {
  const { esquema, config, reparacionesSemana } = emp;
  const ventasSemana = 14300;
  const repSemana    = reparacionesSemana * 800;
  const horasSemana  = 48;
  switch (esquema) {
    case 1: return { total: config.base + (repSemana*config.comisionRep/100) + (ventasSemana*config.comisionVenta/100),
      desglose:[ {label:"Sueldo base",monto:config.base}, {label:"Com. reparaciones",monto:repSemana*config.comisionRep/100}, {label:"Com. ventas",monto:ventasSemana*config.comisionVenta/100} ] };
    case 2: return { total: (repSemana*config.comisionRep/100) + (ventasSemana*config.comisionVenta/100),
      desglose:[ {label:"Com. reparaciones",monto:repSemana*config.comisionRep/100}, {label:"Com. ventas",monto:ventasSemana*config.comisionVenta/100} ] };
    case 3: return { total: reparacionesSemana*config.cuotaFija,
      desglose:[ {label:`${reparacionesSemana} trabajos × ${formatMXN(config.cuotaFija)}`,monto:reparacionesSemana*config.cuotaFija} ] };
    case 4: return { total: config.base + (reparacionesSemana*config.cuotaFija),
      desglose:[ {label:"Sueldo base",monto:config.base}, {label:`${reparacionesSemana} trabajos × ${formatMXN(config.cuotaFija)}`,monto:reparacionesSemana*config.cuotaFija} ] };
    case 5: return { total: horasSemana*config.tarifaHora,
      desglose:[ {label:`${horasSemana} hrs × ${formatMXN(config.tarifaHora)}/hr`,monto:horasSemana*config.tarifaHora} ] };
    case 6: return { total: config.base + (repSemana*config.comisionRep/100) + (reparacionesSemana*config.cuotaFija),
      desglose:[ {label:"Sueldo base",monto:config.base}, {label:"Com. reparaciones",monto:repSemana*config.comisionRep/100}, {label:"Cuota por trabajo",monto:reparacionesSemana*config.cuotaFija} ] };
    default: return { total:0, desglose:[] };
  }
};

export default function PersonalPage() {
  const [busqueda,        setBusqueda]        = useState("");
  const [seleccionado,    setSeleccionado]    = useState(empleados[0]);
  const [tabActivo,       setTabActivo]       = useState("Perfil y nómina");
  const [esquemaEditando, setEsquemaEditando] = useState(false);
  const [mostrarDetalle,  setMostrarDetalle]  = useState(false);

  const empleadosFiltrados = empleados.filter(e =>
    e.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  const nomina = calcularNomina(seleccionado);

  return (
    <div className="flex h-full">

      {/* ── Lista empleados ──────────────────────────────── */}
      <div className={`
        ${mostrarDetalle ? "hidden md:flex" : "flex"}
        w-full md:w-56 flex-col bg-white border-r border-slate-200 flex-shrink-0
      `}>
        <div className="flex items-center justify-between px-3 py-3 border-b border-slate-100">
          <span className="text-sm font-medium text-slate-800">Personal</span>
          <button className="flex items-center gap-1 bg-[#4F46E5] text-white text-[10px] font-medium px-2 py-1.5 rounded-lg">
            <Plus className="w-2.5 h-2.5" /> Nuevo
          </button>
        </div>

        <div className="px-3 py-2 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar empleado..."
              className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {empleadosFiltrados.map(e => (
            <div key={e.id}
              onClick={() => { setSeleccionado(e); setMostrarDetalle(true); }}
              className={`flex items-center gap-2 px-3 py-2.5 border-b border-slate-50 cursor-pointer border-l-2 transition-all ${
                seleccionado.id===e.id ? "bg-[#F5F3FF] border-l-[#4F46E5]" : "hover:bg-slate-50 border-l-transparent"
              }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${e.avatarBg} ${e.avatarColor}`}>
                {e.iniciales}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800 truncate">{e.nombre}</p>
                <p className="text-[9px] text-slate-400">{e.puesto} · {esquemaLabel[e.esquema]}</p>
              </div>
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${e.activo?"bg-emerald-500":"bg-amber-400"}`} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Detalle empleado ─────────────────────────────── */}
      <div className={`
        ${mostrarDetalle ? "flex" : "hidden md:flex"}
        flex-1 flex-col bg-slate-50 overflow-hidden
      `}>

        {/* Tabs con botón volver en móvil */}
        <div className="flex bg-white border-b border-slate-200 px-2 sm:px-4 overflow-x-auto">
          {/* Botón volver — solo móvil */}
          <button onClick={() => setMostrarDetalle(false)}
            className="md:hidden flex items-center gap-1 text-[#4F46E5] text-xs font-medium mr-2 flex-shrink-0 py-3">
            <ChevronLeft className="w-4 h-4" />
          </button>

          {tabs.map(tab => (
            <button key={tab} onClick={() => setTabActivo(tab)}
              className={`px-3 sm:px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                tabActivo===tab ? "text-[#4F46E5] border-[#4F46E5]" : "text-slate-400 border-transparent hover:text-slate-600"
              }`}>
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">

          {/* ── Tab: Perfil y nómina ───────────────────────── */}
          {tabActivo==="Perfil y nómina" && (
            <div className="space-y-3 sm:space-y-4">

              {/* Perfil */}
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-sm font-semibold flex-shrink-0 ${seleccionado.avatarBg} ${seleccionado.avatarColor}`}>
                    {seleccionado.iniciales}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{seleccionado.nombre}</p>
                    <p className="text-xs text-slate-400 truncate">{seleccionado.puesto} · Turno {seleccionado.turno} · Ingresó {seleccionado.ingreso}</p>
                  </div>
                  <button className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50 flex-shrink-0">
                    <Edit className="w-3 h-3" />
                    <span className="hidden sm:inline">Editar</span>
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {[
                    { label:"Asistencia mes",  value:`${seleccionado.asistencia}%`,    sub:"Este mes" },
                    { label:"Trabajos semana", value:String(seleccionado.reparacionesSemana), sub:"Completados" },
                    { label:"A pagar",         value:formatMXN(nomina.total),          sub:"Esta semana", color:"text-[#4F46E5]" },
                  ].map(s => (
                    <div key={s.label} className="bg-slate-50 rounded-lg p-2.5 sm:p-3">
                      <p className="text-[9px] text-slate-400 mb-1">{s.label}</p>
                      <p className={`text-sm sm:text-[15px] font-semibold ${s.color||"text-slate-800"}`}>{s.value}</p>
                      <p className="text-[9px] text-slate-400">{s.sub}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Esquema de pago */}
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-slate-800">Esquema de pago</p>
                  <button onClick={() => setEsquemaEditando(!esquemaEditando)}
                    className="text-[10px] text-[#4F46E5] font-medium hover:underline">
                    {esquemaEditando ? "Cerrar" : "Cambiar esquema"}
                  </button>
                </div>

                {esquemaEditando && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                    {esquemas.map(es => (
                      <div key={es.num}
                        onClick={() => setSeleccionado({...seleccionado, esquema:es.num as Esquema})}
                        className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                          seleccionado.esquema===es.num
                            ? "border-[#4F46E5] bg-[#4F46E5]/5"
                            : "border-slate-200 hover:border-slate-300"
                        }`}>
                        <p className="text-[9px] font-semibold text-slate-400 mb-0.5">ESQUEMA {es.num}</p>
                        <p className={`text-xs font-medium ${seleccionado.esquema===es.num?"text-[#4F46E5]":"text-slate-700"}`}>
                          {es.nombre}
                        </p>
                        <p className="text-[9px] text-slate-400 mt-0.5">{es.desc}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Configuración dinámica */}
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[10px] font-medium text-slate-500 mb-3">
                    ⚙️ Configuración — {esquemas.find(e=>e.num===seleccionado.esquema)?.nombre}
                  </p>
                  <div className="space-y-3">
                    {[1,4,6].includes(seleccionado.esquema) && (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <DollarSign className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          <span className="text-xs text-slate-600 truncate">Sueldo base</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <select className="text-xs border border-slate-200 rounded px-2 py-1 bg-white">
                            <option>Semanal</option>
                            <option>Quincenal</option>
                            <option>Mensual</option>
                          </select>
                          <input type="number" defaultValue={seleccionado.config.base}
                            className="w-20 text-right text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-[#4F46E5]" />
                        </div>
                      </div>
                    )}
                    {[1,2,6].includes(seleccionado.esquema) && (
                      <>
                        {[
                          { icon:Wrench,       label:"Comisión reparaciones", val:seleccionado.config.comisionRep },
                          { icon:ShoppingCart, label:"Comisión ventas",       val:seleccionado.config.comisionVenta },
                        ].map(f => (
                          <div key={f.label} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <f.icon className="w-3 h-3 text-slate-400 flex-shrink-0" />
                              <span className="text-xs text-slate-600 truncate">{f.label}</span>
                            </div>
                            <input type="number" defaultValue={f.val} placeholder="%"
                              className="w-20 text-right text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-[#4F46E5] flex-shrink-0" />
                          </div>
                        ))}
                      </>
                    )}
                    {[3,4,6].includes(seleccionado.esquema) && (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Wrench className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          <span className="text-xs text-slate-600 truncate">Cuota fija por trabajo</span>
                        </div>
                        <input type="number" defaultValue={seleccionado.config.cuotaFija}
                          className="w-20 text-right text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-[#4F46E5] flex-shrink-0" />
                      </div>
                    )}
                    {seleccionado.esquema===5 && (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Clock className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          <span className="text-xs text-slate-600">Tarifa por hora</span>
                        </div>
                        <input type="number" defaultValue={seleccionado.config.tarifaHora}
                          className="w-20 text-right text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-[#4F46E5] flex-shrink-0" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Preview nómina — flex-col en móvil */}
              <div className="bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="text-white">
                  <p className="text-[10px] text-white/60 mb-1">Total a pagar esta semana</p>
                  <p className="text-2xl sm:text-[24px] font-bold">{formatMXN(nomina.total)}</p>
                  <p className="text-[10px] text-white/50 mt-1">28 mayo 2026</p>
                </div>
                <div className="sm:text-right space-y-1">
                  {nomina.desglose.map((d,i) => (
                    <p key={i} className={`text-[10px] ${d.monto>0?"text-emerald-300":"text-white/50"}`}>
                      {d.label}: {formatMXN(d.monto)}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Asistencia ────────────────────────────── */}
          {tabActivo==="Asistencia" && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-800 mb-4">Asistencia — Mayo 2026</p>
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(d => (
                  <div key={d} className="text-center text-[9px] font-medium text-slate-400 mb-1">{d}</div>
                ))}
                {Array.from({length:31},(_,i) => i+1).map(day => {
                  const isToday   = day===28;
                  const isWeekend = [4,5,11,12,18,19,25,26].includes(day);
                  const isAbsent  = [7].includes(day);
                  return (
                    <div key={day} className={`w-full aspect-square rounded-lg flex items-center justify-center text-[9px] sm:text-[10px] font-medium ${
                      isToday   ? "bg-[#4F46E5] text-white" :
                      isWeekend ? "bg-slate-50 text-slate-300" :
                      isAbsent  ? "bg-red-50 text-red-500" :
                      day<=28   ? "bg-emerald-50 text-emerald-600" :
                                  "bg-slate-50 text-slate-300"
                    }`}>
                      {day}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-3 mt-4">
                {[
                  { color:"bg-emerald-50 text-emerald-600", label:"Presente" },
                  { color:"bg-red-50 text-red-500",         label:"Ausente" },
                  { color:"bg-[#4F46E5] text-white",        label:"Hoy" },
                  { color:"bg-slate-50 text-slate-300",     label:"Descanso" },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className={`w-4 h-4 rounded ${l.color} text-[8px] flex items-center justify-center font-medium`}>1</div>
                    <span className="text-[10px] text-slate-500">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tab: Historial de pagos ─────────────────────── */}
          {tabActivo==="Historial de pagos" && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {["Periodo","Esquema","Base","Comisiones/Extras","Total","Estado"].map(h => (
                        <th key={h} className="text-left text-[10px] font-medium text-slate-400 px-3 sm:px-4 py-2.5 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { periodo:"21-27 mayo",    esquema:"Base + Comisión", base:3500, extras:680, total:4180 },
                      { periodo:"14-20 mayo",    esquema:"Base + Comisión", base:3500, extras:520, total:4020 },
                      { periodo:"7-13 mayo",     esquema:"Base + Comisión", base:3500, extras:390, total:3890 },
                      { periodo:"30 abr-6 may",  esquema:"Base + Comisión", base:3500, extras:740, total:4240 },
                    ].map((p,i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="px-3 sm:px-4 py-2.5 text-xs text-slate-700">{p.periodo}</td>
                        <td className="px-3 sm:px-4 py-2.5 text-xs text-slate-500">{p.esquema}</td>
                        <td className="px-3 sm:px-4 py-2.5 text-xs text-slate-600">{formatMXN(p.base)}</td>
                        <td className="px-3 sm:px-4 py-2.5 text-xs text-emerald-600">+{formatMXN(p.extras)}</td>
                        <td className="px-3 sm:px-4 py-2.5 text-xs font-semibold text-slate-800">{formatMXN(p.total)}</td>
                        <td className="px-3 sm:px-4 py-2.5">
                          <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Pagado</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}