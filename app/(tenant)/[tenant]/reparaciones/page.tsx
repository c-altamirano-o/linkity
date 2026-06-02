"use client";

import { useState } from "react";
import { Search, Plus, Check, Edit, Clock, User, ExternalLink, Copy, RefreshCw, Wrench, Package, Stethoscope } from "lucide-react";

const reparaciones = [
  {
    id: 1, folio: "REP-0042", cliente: "Carlos Mendoza", telefono: "614 123 4567",
    iniciales: "CM", marca: "Apple", modelo: "iPhone 13 Pro", falla: "Pantalla rota",
    estado: "reparando", prioridad: "alta", costoEstimado: 1800,
    fechaRecibido: "26 mayo 2026", fechaEstimada: "28 mayo 2026",
    tecnico: "Juan Pérez", whatsappEnviado: true, publicToken: "REP-0042-abc123",
    progreso: 60,
    historial: [
      { texto: "Reparación iniciada por técnico Juan", tiempo: "26 mayo · 10:30 am", tipo: "reparacion" },
      { texto: "Diagnóstico completado — pantalla dañada confirmada", tiempo: "26 mayo · 9:15 am", tipo: "diagnostico" },
      { texto: "WhatsApp enviado al cliente", tiempo: "26 mayo · 9:00 am", tipo: "whatsapp" },
      { texto: "Equipo recibido en taller", tiempo: "26 mayo · 8:45 am", tipo: "recibido" },
    ]
  },
  {
    id: 2, folio: "REP-0041", cliente: "María González", telefono: "614 234 5678",
    iniciales: "MG", marca: "Samsung", modelo: "S22", falla: "No enciende",
    estado: "diagnostico", prioridad: "normal", costoEstimado: 0,
    fechaRecibido: "27 mayo 2026", fechaEstimada: "29 mayo 2026",
    tecnico: "Juan Pérez", whatsappEnviado: true, publicToken: "REP-0041-def456",
    progreso: 30,
    historial: [
      { texto: "WhatsApp enviado al cliente", tiempo: "27 mayo · 11:00 am", tipo: "whatsapp" },
      { texto: "Equipo recibido en taller", tiempo: "27 mayo · 10:30 am", tipo: "recibido" },
    ]
  },
  {
    id: 3, folio: "REP-0040", cliente: "Roberto Díaz", telefono: "614 345 6789",
    iniciales: "RD", marca: "Apple", modelo: "iPhone 12", falla: "Batería",
    estado: "listo", prioridad: "normal", costoEstimado: 650,
    fechaRecibido: "25 mayo 2026", fechaEstimada: "27 mayo 2026",
    tecnico: "Juan Pérez", whatsappEnviado: true, publicToken: "REP-0040-ghi789",
    progreso: 85,
    historial: [
      { texto: "Reparación completada — listo para entrega", tiempo: "27 mayo · 3:00 pm", tipo: "reparacion" },
      { texto: "Batería reemplazada exitosamente", tiempo: "27 mayo · 2:00 pm", tipo: "reparacion" },
      { texto: "WhatsApp enviado al cliente", tiempo: "25 mayo · 9:00 am", tipo: "whatsapp" },
      { texto: "Equipo recibido en taller", tiempo: "25 mayo · 8:30 am", tipo: "recibido" },
    ]
  },
  {
    id: 4, folio: "REP-0039", cliente: "Ana López", telefono: "614 456 7890",
    iniciales: "AL", marca: "Xiaomi", modelo: "11T", falla: "Conector de carga",
    estado: "recibido", prioridad: "baja", costoEstimado: 400,
    fechaRecibido: "28 mayo 2026", fechaEstimada: "30 mayo 2026",
    tecnico: "Sin asignar", whatsappEnviado: false, publicToken: "REP-0039-jkl012",
    progreso: 10,
    historial: [
      { texto: "Equipo recibido en taller", tiempo: "28 mayo · 2:00 pm", tipo: "recibido" },
    ]
  },
];

const estadoConfig: Record<string, { label: string; badge: string; avatar: string }> = {
  recibido:    { label: "Recibido",      badge: "bg-blue-50 text-blue-700",     avatar: "bg-blue-50 text-blue-700" },
  diagnostico: { label: "Diagnóstico",   badge: "bg-orange-50 text-orange-700", avatar: "bg-orange-50 text-orange-700" },
  reparando:   { label: "En reparación", badge: "bg-purple-50 text-purple-700", avatar: "bg-purple-50 text-purple-700" },
  listo:       { label: "Listo",         badge: "bg-emerald-50 text-emerald-700", avatar: "bg-emerald-50 text-emerald-700" },
  entregado:   { label: "Entregado",     badge: "bg-slate-100 text-slate-500",  avatar: "bg-slate-100 text-slate-500" },
};

const prioridadConfig: Record<string, { label: string; classes: string; dot: string }> = {
  alta:   { label: "Alta",   classes: "bg-red-50 text-red-600",    dot: "text-red-500" },
  normal: { label: "Normal", classes: "bg-amber-50 text-amber-600", dot: "text-amber-400" },
  baja:   { label: "Baja",   classes: "bg-slate-100 text-slate-500", dot: "text-slate-400" },
};

const historialIconos: Record<string, { icon: React.ElementType; bg: string; color: string }> = {
  reparacion:  { icon: Wrench,       bg: "bg-purple-50", color: "text-purple-600" },
  diagnostico: { icon: Stethoscope,  bg: "bg-blue-50",   color: "text-blue-600" },
  whatsapp:    { icon: RefreshCw,    bg: "bg-emerald-50", color: "text-emerald-600" },
  recibido:    { icon: Package,      bg: "bg-slate-100", color: "text-slate-500" },
};

const flujoEstados = ["recibido", "diagnostico", "reparando", "listo", "entregado"];
const flujoLabels  = ["Recibido", "Diagnóstico", "En reparación", "Listo", "Entregado"];
const flujoIconos  = [Package, Stethoscope, Wrench, Check, ExternalLink];

const filtrosTabs = ["Todas", "Recibidas", "En taller", "Listas", "Entregadas"];
const filtrosMap: Record<string, string[]> = {
  "Todas": [], "Recibidas": ["recibido"],
  "En taller": ["diagnostico", "reparando"],
  "Listas": ["listo"], "Entregadas": ["entregado"],
};

export default function ReparacionesPage() {
  const [busqueda, setBusqueda]       = useState("");
  const [filtro, setFiltro]           = useState("Todas");
  const [seleccionada, setSeleccionada] = useState(reparaciones[0]);
  const [copiado, setCopiado]         = useState(false);

  const filtradas = reparaciones.filter((r) => {
    const matchFiltro  = filtrosMap[filtro].length === 0 || filtrosMap[filtro].includes(r.estado);
    const matchSearch  = r.folio.toLowerCase().includes(busqueda.toLowerCase()) ||
                         r.cliente.toLowerCase().includes(busqueda.toLowerCase());
    return matchFiltro && matchSearch;
  });

  const estadoIdx = flujoEstados.indexOf(seleccionada.estado);

  const copiarLink = () => {
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="flex h-full">

      {/* ── Lista ── */}
      <div className="w-72 flex flex-col bg-white border-r border-slate-200 flex-shrink-0">

        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span className="text-[13px] font-medium text-slate-800">Reparaciones</span>
          <button className="flex items-center gap-1 bg-[#4F46E5] text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg">
            <Plus className="w-3 h-3" /> Nueva
          </button>
        </div>

        <div className="px-3 py-2 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar folio o cliente..."
              className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-[11px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
          </div>
        </div>

        <div className="flex gap-1 px-3 py-2 border-b border-slate-100 overflow-x-auto">
          {filtrosTabs.map((tab) => (
            <button key={tab} onClick={() => setFiltro(tab)}
              className={`px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors ${
                filtro === tab ? "bg-[#4F46E5] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}>
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtradas.map((rep) => (
            <div key={rep.id} onClick={() => setSeleccionada(rep)}
              className={`px-3 py-3 border-b border-slate-50 cursor-pointer transition-all border-l-2 ${
                seleccionada.id === rep.id
                  ? "bg-[#F5F3FF] border-l-[#4F46E5]"
                  : "hover:bg-slate-50 border-l-transparent"
              }`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${estadoConfig[rep.estado].avatar}`}>
                  {rep.iniciales}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-slate-800">{rep.folio}</p>
                  <p className="text-[10px] text-slate-500 truncate">{rep.modelo} · {rep.falla}</p>
                </div>
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${estadoConfig[rep.estado].badge}`}>
                  {estadoConfig[rep.estado].label}
                </span>
              </div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                  <Clock className="w-2.5 h-2.5" /> {rep.fechaRecibido}
                </div>
                <span className={`text-[10px] font-medium ${prioridadConfig[rep.prioridad].dot}`}>
                  ● {prioridadConfig[rep.prioridad].label}
                </span>
              </div>
              <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#4F46E5] to-[#06B6D4] transition-all"
                  style={{ width: `${rep.progreso}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Detalle ── */}
      <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">

        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-5 py-3">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[12px] font-semibold flex-shrink-0 ${estadoConfig[seleccionada.estado].avatar}`}>
                {seleccionada.iniciales}
              </div>
              <div>
                <p className="text-[14px] font-semibold text-slate-800">
                  {seleccionada.folio}
                  <span className="text-[12px] font-normal text-slate-500 ml-2">
                    — {seleccionada.marca} {seleccionada.modelo}
                  </span>
                </p>
                <p className="text-[11px] text-slate-400">
                  {seleccionada.cliente} · {seleccionada.telefono} · Recibido {seleccionada.fechaRecibido}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-[11px] text-slate-600 hover:bg-slate-50">
                <Edit className="w-3 h-3" /> Editar
              </button>
              {seleccionada.estado !== "entregado" && seleccionada.estado !== "listo" && (
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[11px]">
                  <Check className="w-3 h-3" /> Marcar listo
                </button>
              )}
              {seleccionada.estado === "listo" && (
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-lg text-[11px]">
                  <Check className="w-3 h-3" /> Marcar entregado
                </button>
              )}
            </div>
          </div>

          {/* Stepper */}
          <div className="flex items-center">
            {flujoEstados.map((estado, i) => {
              const Icono = flujoIconos[i];
              return (
                <div key={estado} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all ${
                      i < estadoIdx ? "bg-[#4F46E5] border-[#4F46E5]" :
                      i === estadoIdx ? "bg-white border-[#4F46E5]" :
                      "bg-white border-slate-200"
                    }`}>
                      {i < estadoIdx
                        ? <Check className="w-3 h-3 text-white" />
                        : <Icono className={`w-3 h-3 ${i === estadoIdx ? "text-[#4F46E5]" : "text-slate-300"}`} />
                      }
                    </div>
                    <span className={`text-[9px] mt-1 whitespace-nowrap ${
                      i <= estadoIdx ? "text-[#4F46E5] font-medium" : "text-slate-400"
                    }`}>
                      {flujoLabels[i]}
                    </span>
                  </div>
                  {i < flujoEstados.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-1 mb-3.5 transition-all ${i < estadoIdx ? "bg-[#4F46E5]" : "bg-slate-200"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3 content-start">

          {/* Detalles equipo */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-slate-400 tracking-widest mb-3">DETALLES DEL EQUIPO</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Marca / Modelo", value: `${seleccionada.marca} ${seleccionada.modelo}` },
                { label: "Falla reportada", value: seleccionada.falla },
                { label: "Costo estimado", value: seleccionada.costoEstimado > 0 ? `$${seleccionada.costoEstimado.toLocaleString()}` : "Por definir", color: "text-[#4F46E5]" },
                { label: "Fecha estimada", value: seleccionada.fechaEstimada },
                { label: "Técnico asignado", value: seleccionada.tecnico },
                { label: "Prioridad", value: prioridadConfig[seleccionada.prioridad].label, badge: prioridadConfig[seleccionada.prioridad].classes },
              ].map((f) => (
                <div key={f.label} className="bg-slate-50 rounded-lg p-2.5">
                  <p className="text-[9px] text-slate-400 mb-0.5">{f.label}</p>
                  {f.badge
                    ? <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${f.badge}`}>{f.value}</span>
                    : <p className={`text-[11px] font-medium ${f.color || "text-slate-800"}`}>{f.value}</p>
                  }
                </div>
              ))}
            </div>
          </div>

          {/* Historial */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-slate-400 tracking-widest mb-3">HISTORIAL</p>
            <div className="space-y-3">
              {seleccionada.historial.map((h, i) => {
                const cfg = historialIconos[h.tipo];
                const Icono = cfg.icon;
                return (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                      <Icono className={`w-3 h-3 ${cfg.color}`} />
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-700">{h.texto}</p>
                      <p className="text-[10px] text-slate-400">{h.tiempo}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* WhatsApp */}
          <div className="col-span-2 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-[#25D366] rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-white text-[11px] font-bold">W</span>
              </div>
              <div className="flex-1">
                <p className="text-[12px] font-medium text-emerald-700">
                  {seleccionada.whatsappEnviado
                    ? `Mensaje enviado a ${seleccionada.cliente}`
                    : "WhatsApp no enviado aún"}
                </p>
                {seleccionada.whatsappEnviado && (
                  <p className="text-[10px] text-emerald-500">Hoy · 9:00 am · Entregado</p>
                )}
              </div>
              {seleccionada.whatsappEnviado && (
                <button className="px-3 py-1.5 bg-[#25D366] hover:bg-[#22c35e] text-white text-[11px] font-medium rounded-lg transition-colors">
                  Reenviar
                </button>
              )}
            </div>
            {seleccionada.whatsappEnviado ? (
              <>
                <div className="bg-[#DCF8C6] rounded-lg p-3 text-[12px] text-slate-800 leading-relaxed mb-2 max-w-lg">
                  Hola {seleccionada.cliente.split(" ")[0]} 👋, tu <strong>{seleccionada.modelo}</strong> está siendo
                  atendido. Puedes ver el estado en tiempo real aquí:
                </div>
                <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 max-w-lg border border-emerald-200">
                  <ExternalLink className="w-3 h-3 text-[#4F46E5] flex-shrink-0" />
                  <span className="text-[11px] text-[#4F46E5] flex-1">
                    linkity.mx/rep/{seleccionada.publicToken}
                  </span>
                  <button onClick={copiarLink} className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors">
                    <Copy className="w-3 h-3" />
                    {copiado ? "¡Copiado!" : "Copiar"}
                  </button>
                </div>
              </>
            ) : (
              <button className="w-full max-w-xs py-2 bg-[#25D366] hover:bg-[#22c35e] text-white text-[12px] font-medium rounded-lg transition-colors">
                Enviar notificación WhatsApp
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}