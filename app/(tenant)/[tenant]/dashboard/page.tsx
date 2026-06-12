"use client";

import { useState } from "react";
import { ShoppingCart, Wrench, AlertTriangle, Clock, ArrowUpRight, ArrowDownRight, CheckCircle, RotateCcw, Receipt, Building2, X, Phone, Settings } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// ── Datos ────────────────────────────────────────────────────
const ventasSemana = [
  { dia: "Lun", ventas: 4200, reparaciones: 1800, total: 6000 },
  { dia: "Mar", ventas: 3800, reparaciones: 2200, total: 6000 },
  { dia: "Mié", ventas: 5100, reparaciones: 1500, total: 6600 },
  { dia: "Jue", ventas: 4800, reparaciones: 2800, total: 7600 },
  { dia: "Vie", ventas: 6200, reparaciones: 3100, total: 9300 },
  { dia: "Sáb", ventas: 8400, reparaciones: 2400, total: 10800 },
  { dia: "Hoy", ventas: 3240, reparaciones: 1200, total: 4440 },
];

// Todas las categorías del catálogo del cliente (vendrán de BD en producción)
const todasLasCategorias = [
  { name: "Celulares",    value: 58, color: "#4F46E5" },
  { name: "Accesorios",   value: 22, color: "#06B6D4" },
  { name: "Reparaciones", value: 15, color: "#10B981" },
  { name: "Refacciones",  value: 5,  color: "#F59E0B" },
  { name: "Tablets",      value: 0,  color: "#8B5CF6" },
  { name: "Diagnósticos", value: 0,  color: "#EC4899" },
];

const coloresDisponibles = [
  "#4F46E5", "#06B6D4", "#10B981", "#F59E0B",
  "#EF4444", "#8B5CF6", "#EC4899", "#F97316",
  "#14B8A6", "#84CC16", "#2563EB", "#DC2626",
];

const reparacionesData = [
  { folio: "REP-0042", cliente: "Carlos Mendoza",  telefono: "614 123 4567", equipo: "iPhone 13 Pro",  estado: "en_reparacion", tecnico: "Juan Pérez",  prioridad: "alta" },
  { folio: "REP-0041", cliente: "María González",  telefono: "614 234 5678", equipo: "Samsung S22",    estado: "listo_taller",  tecnico: "Juan Pérez",  prioridad: "normal" },
  { folio: "REP-0040", cliente: "Roberto Díaz",    telefono: "614 345 6789", equipo: "iPhone 12",      estado: "listo_tienda",  tecnico: "Juan Pérez",  prioridad: "normal" },
  { folio: "REP-0039", cliente: "Ana López",       telefono: "614 456 7890", equipo: "Xiaomi 11T",     estado: "recibido",      tecnico: "Sin asignar", prioridad: "baja" },
  { folio: "REP-0038", cliente: "Jorge Pérez",     telefono: "614 567 8901", equipo: "iPhone 14",      estado: "en_reparacion", tecnico: "Juan Pérez",  prioridad: "alta" },
  { folio: "REP-0037", cliente: "Laura Soto",      telefono: "614 678 9012", equipo: "Motorola G84",   estado: "en_reparacion", tecnico: "Juan Pérez",  prioridad: "normal" },
  { folio: "REP-0036", cliente: "Pedro Ruiz",      telefono: "614 789 0123", equipo: "Samsung A54",    estado: "recibido",      tecnico: "Sin asignar", prioridad: "baja" },
  { folio: "REP-0035", cliente: "Diana Torres",    telefono: "614 890 1234", equipo: "iPhone 12 Mini", estado: "en_reparacion", tecnico: "Juan Pérez",  prioridad: "normal" },
];

const ventasHoy = [
  { folio: "VTA-0089", hora: "2:45 pm",  articulos: "Cargador USB-C 20W",        count: 1, metodo: "Efectivo",      total: 280 },
  { folio: "VTA-0088", hora: "12:10 pm", articulos: "iPhone 14 + Funda + Cable", count: 3, metodo: "Mixto",         total: 13080 },
  { folio: "VTA-0087", hora: "11:30 am", articulos: "AirPods Pro",               count: 1, metodo: "Tarjeta",       total: 4200 },
  { folio: "VTA-0086", hora: "10:15 am", articulos: "Funda iPhone + Cargador",   count: 2, metodo: "Efectivo",      total: 430 },
  { folio: "VTA-0085", hora: "9:40 am",  articulos: "Samsung S23",               count: 1, metodo: "Tarjeta",       total: 10800 },
  { folio: "VTA-0084", hora: "9:15 am",  articulos: "Batería iPhone 12",         count: 1, metodo: "Efectivo",      total: 450 },
  { folio: "VTA-0083", hora: "8:50 am",  articulos: "Cable Lightning 2m x2",     count: 2, metodo: "Transferencia", total: 360 },
];

const equiposListos = [
  { folio: "REP-0040", cliente: "Roberto Díaz",  telefono: "614 345 6789", equipo: "iPhone 12",   falla: "Batería",  costo: 650,  espera: "Hace 2 hrs" },
  { folio: "REP-0033", cliente: "Elena Vargas",  telefono: "614 456 7890", equipo: "Samsung A53", falla: "Pantalla", costo: 1200, espera: "Hace 5 hrs" },
  { folio: "REP-0031", cliente: "Marco Silva",   telefono: "614 567 8901", equipo: "iPhone 11",   falla: "Conector", costo: 380,  espera: "Ayer" },
];

const equiposDev = [
  { folio: "REP-0039", cliente: "Ana López",  telefono: "614 456 7890", equipo: "Xiaomi 11T",   razon: "Daño irreparable en placa",     espera: "Hace 1 día" },
  { folio: "REP-0029", cliente: "Luis Mora",  telefono: "614 678 9012", equipo: "Motorola G73", razon: "Sin refacciones disponibles",   espera: "Hace 2 días" },
];

const alertas = [
  { texto: "Pantalla iPhone 13 — Stock bajo (2 unidades)", color: "text-amber-600", bg: "bg-amber-50 border-amber-200", icon: AlertTriangle },
  { texto: "REP-0038 lleva 5 días sin actualización",       color: "text-red-600",   bg: "bg-red-50 border-red-200",     icon: Clock },
  { texto: "Batería Samsung S22 — Agotado",                 color: "text-amber-600", bg: "bg-amber-50 border-amber-200", icon: AlertTriangle },
  { texto: "Xiaomi Redmi Note 12 — Agotado",                color: "text-amber-600", bg: "bg-amber-50 border-amber-200", icon: AlertTriangle },
];

const sucursales = [
  { id: 1, nombre: "Sucursal Principal", estado: "activa", color: "border-t-[#4F46E5]",  ventasDia: 8240, ticketsVenta: 12, ticketsRep: 5, equiposRecibidos: 5, repActivas: 8, listosEntrega: 3, devoluciones: 1, vsAyer: 12 },
  { id: 2, nombre: "Sucursal Norte",     estado: "activa", color: "border-t-cyan-500",    ventasDia: 4100, ticketsVenta: 7,  ticketsRep: 3, equiposRecibidos: 3, repActivas: 4, listosEntrega: 2, devoluciones: 0, vsAyer: 5 },
  { id: 3, nombre: "Sucursal Plaza",     estado: "prueba", color: "border-t-emerald-500", ventasDia: 1800, ticketsVenta: 3,  ticketsRep: 1, equiposRecibidos: 1, repActivas: 1, listosEntrega: 0, devoluciones: 0, vsAyer: 0 },
];

const estadoConfig: Record<string, { label: string; classes: string }> = {
  en_reparacion:     { label: "En reparación",   classes: "bg-purple-50 text-purple-700" },
  listo_taller:      { label: "Listo en Taller", classes: "bg-emerald-50 text-emerald-700" },
  listo_tienda:      { label: "Listo en Tienda", classes: "bg-cyan-50 text-cyan-700" },
  devolucion_taller: { label: "Dev. Taller",     classes: "bg-orange-50 text-orange-700" },
  devolucion_tienda: { label: "Dev. Tienda",     classes: "bg-red-50 text-red-600" },
  recibido:          { label: "Recibido",         classes: "bg-blue-50 text-blue-700" },
  entregado:         { label: "Entregado",        classes: "bg-slate-100 text-slate-500" },
};

const metodoBadge: Record<string, string> = {
  "Efectivo":      "bg-purple-50 text-purple-700",
  "Tarjeta":       "bg-blue-50 text-blue-700",
  "Transferencia": "bg-emerald-50 text-emerald-700",
  "Mixto":         "bg-amber-50 text-amber-700",
};

const prioridadDot: Record<string, string> = {
  alta: "bg-red-500", normal: "bg-amber-400", baja: "bg-slate-300",
};

type ModalType = "ventas" | "tickets" | "reparaciones" | "listos" | "devoluciones" | null;

type CatConfig = { name: string; value: number; color: string; visible: boolean };

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm">
        <p className="text-xs font-medium text-slate-600 mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.name} className="text-xs" style={{ color: p.color }}>
            {p.name === "ventas" ? "Ventas" : p.name === "reparaciones" ? "Reparaciones" : "Total"}
            : {formatMXN(p.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function TenantDashboard() {
  const [modalAbierto,           setModalAbierto]           = useState<ModalType>(null);
  const [configurandoCategorias, setConfigurandoCategorias] = useState(false);

  // Estado de categorías — visible y color personalizables
  const [categoriasConfig, setCategoriasConfig] = useState<CatConfig[]>(
    todasLasCategorias.map((c) => ({ ...c, visible: c.value > 0 }))
  );
  // Copia temporal mientras se edita
  const [catTemp, setCatTemp] = useState<CatConfig[]>([]);

  const totalSemana    = ventasSemana.reduce((s, d) => s + d.ventas + d.reparaciones, 0);
  const promedioVentas = Math.round(ventasSemana.reduce((s, d) => s + d.ventas, 0) / ventasSemana.length);
  const multiSucursal  = sucursales.length > 1;
  const totalVentasHoy = ventasHoy.reduce((s, v) => s + v.total, 0);
  const ticketPromedio = Math.round(totalVentasHoy / ventasHoy.length);

  const categoriasVisibles = categoriasConfig.filter((c) => c.visible);
  const totalVisibles      = categoriasVisibles.length;

  // Abrir configurador con copia temporal
  const abrirConfig = () => {
    setCatTemp(categoriasConfig.map((c) => ({ ...c })));
    setConfigurandoCategorias(true);
  };

  const toggleCategoria = (name: string) => {
    setCatTemp((prev) => {
      const cat = prev.find((c) => c.name === name)!;
      const visibles = prev.filter((c) => c.visible).length;
      if (!cat.visible && visibles >= 6) return prev; // máximo 6
      return prev.map((c) => c.name === name ? { ...c, visible: !c.visible } : c);
    });
  };

  const cambiarColor = (name: string, color: string) => {
    setCatTemp((prev) => prev.map((c) => c.name === name ? { ...c, color } : c));
  };

  const guardarConfig = () => {
    setCategoriasConfig(catTemp);
    setConfigurandoCategorias(false);
  };

  // ── Modal detalle ─────────────────────────────────────────
  const renderModal = () => {
    if (!modalAbierto) return null;

    const configs: Record<NonNullable<ModalType>, {
      titulo: string; iconBg: string; iconColor: string; icon: React.ElementType;
      stats: { label: string; value: string; color: string }[];
      content: React.ReactNode;
    }> = {
      ventas: {
        titulo: "Ventas del día", iconBg: "bg-[#4F46E5]/10", iconColor: "text-[#4F46E5]", icon: ShoppingCart,
        stats: [
          { label: "Total ventas",    value: formatMXN(totalVentasHoy),       color: "text-[#4F46E5]" },
          { label: "Num. de ventas",  value: String(ventasHoy.length),         color: "text-slate-800" },
          { label: "Ticket promedio", value: formatMXN(ticketPromedio),        color: "text-slate-800" },
        ],
        content: <TablaVentas />,
      },
      tickets: {
        titulo: "Total de tickets", iconBg: "bg-cyan-50", iconColor: "text-cyan-600", icon: Receipt,
        stats: [
          { label: "Tickets hoy",     value: String(ventasHoy.length),         color: "text-cyan-600" },
          { label: "Monto total",     value: formatMXN(totalVentasHoy),        color: "text-[#4F46E5]" },
          { label: "Ticket promedio", value: formatMXN(ticketPromedio),        color: "text-slate-800" },
        ],
        content: <TablaVentas />,
      },
      reparaciones: {
        titulo: "Reparaciones activas", iconBg: "bg-amber-50", iconColor: "text-amber-600", icon: Wrench,
        stats: [
          { label: "Total activas",  value: String(reparacionesData.length),                                          color: "text-amber-600" },
          { label: "En reparación",  value: String(reparacionesData.filter(r => r.estado === "en_reparacion").length), color: "text-purple-600" },
          { label: "Prioridad alta", value: String(reparacionesData.filter(r => r.prioridad === "alta").length),       color: "text-red-600" },
        ],
        content: (
          <>
            <div className="grid grid-cols-[90px_1fr_100px_80px] px-4 py-2 bg-slate-50 border-b border-slate-100 sticky top-0">
              {["Folio", "Cliente · Equipo", "Estado", "Técnico"].map((h) => (
                <p key={h} className="text-[10px] font-medium text-slate-400">{h}</p>
              ))}
            </div>
            {reparacionesData.map((r) => (
              <div key={r.folio} className="grid grid-cols-[90px_1fr_100px_80px] px-4 py-3 border-b border-slate-50 hover:bg-slate-50 items-center">
                <div>
                  <p className="text-xs font-semibold text-[#4F46E5]">{r.folio}</p>
                  <div className={`w-1.5 h-1.5 rounded-full mt-1 ${prioridadDot[r.prioridad]}`} />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-800">{r.cliente}</p>
                  <p className="text-[10px] text-slate-400">{r.equipo}</p>
                </div>
                <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full w-fit ${estadoConfig[r.estado]?.classes}`}>
                  {estadoConfig[r.estado]?.label}
                </span>
                <p className="text-[10px] text-slate-500 truncate">{r.tecnico}</p>
              </div>
            ))}
          </>
        ),
      },
      listos: {
        titulo: "Equipos listos para entregar", iconBg: "bg-emerald-50", iconColor: "text-emerald-600", icon: CheckCircle,
        stats: [
          { label: "Equipos listos",      value: String(equiposListos.length),                            color: "text-emerald-600" },
          { label: "Tiempo máx. espera",  value: "Ayer",                                                  color: "text-amber-600" },
          { label: "Total a cobrar",      value: formatMXN(equiposListos.reduce((s, e) => s + e.costo, 0)), color: "text-[#4F46E5]" },
        ],
        content: (
          <>
            <div className="grid grid-cols-[90px_1fr_100px_80px] px-4 py-2 bg-slate-50 border-b border-slate-100 sticky top-0">
              {["Folio", "Cliente · Equipo", "Costo", "Espera"].map((h) => (
                <p key={h} className="text-[10px] font-medium text-slate-400">{h}</p>
              ))}
            </div>
            {equiposListos.map((e) => (
              <div key={e.folio} className="grid grid-cols-[90px_1fr_100px_80px] px-4 py-3 border-b border-slate-50 hover:bg-slate-50 items-center">
                <div>
                  <p className="text-xs font-semibold text-[#4F46E5]">{e.folio}</p>
                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Listo</span>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-800">{e.cliente}</p>
                  <p className="text-[10px] text-slate-400">{e.equipo} · {e.falla}</p>
                  <p className="text-[10px] text-[#4F46E5] flex items-center gap-1 mt-0.5">
                    <Phone className="w-2.5 h-2.5" /> {e.telefono}
                  </p>
                </div>
                <p className="text-xs font-semibold text-emerald-600">{formatMXN(e.costo)}</p>
                <p className="text-[10px] text-slate-400">{e.espera}</p>
              </div>
            ))}
          </>
        ),
      },
      devoluciones: {
        titulo: "Equipos en devolución", iconBg: "bg-red-50", iconColor: "text-red-500", icon: RotateCcw,
        stats: [
          { label: "Equipos a devolver",  value: String(equiposDev.length), color: "text-red-600" },
          { label: "Más antiguo",         value: "Hace 2 días",             color: "text-amber-600" },
          { label: "Requieren contacto",  value: String(equiposDev.length), color: "text-slate-800" },
        ],
        content: (
          <>
            <div className="grid grid-cols-[90px_1fr_1fr] px-4 py-2 bg-slate-50 border-b border-slate-100 sticky top-0">
              {["Folio", "Cliente · Equipo", "Razón · Espera"].map((h) => (
                <p key={h} className="text-[10px] font-medium text-slate-400">{h}</p>
              ))}
            </div>
            {equiposDev.map((e) => (
              <div key={e.folio} className="grid grid-cols-[90px_1fr_1fr] px-4 py-3 border-b border-slate-50 hover:bg-slate-50 items-start">
                <div>
                  <p className="text-xs font-semibold text-[#4F46E5]">{e.folio}</p>
                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">Devolución</span>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-800">{e.cliente}</p>
                  <p className="text-[10px] text-slate-400">{e.equipo}</p>
                  <p className="text-[10px] text-[#4F46E5] flex items-center gap-1 mt-0.5">
                    <Phone className="w-2.5 h-2.5" /> {e.telefono}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-600">{e.razon}</p>
                  <p className="text-[10px] text-amber-500 mt-0.5">{e.espera}</p>
                </div>
              </div>
            ))}
          </>
        ),
      },
    };

    const cfg = configs[modalAbierto];
    const IconoModal = cfg.icon;

    return (
      <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4"
        onClick={() => setModalAbierto(null)}>
        <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl"
          onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${cfg.iconBg}`}>
                <IconoModal className={`w-4 h-4 ${cfg.iconColor}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{cfg.titulo}</p>
                <p className="text-[10px] text-slate-400">28 mayo 2026 · Actualizado al momento</p>
              </div>
            </div>
            <button onClick={() => setModalAbierto(null)}
              className="w-7 h-7 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center transition-colors">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 px-5 py-3 border-b border-slate-100 flex-shrink-0">
            {cfg.stats.map((s) => (
              <div key={s.label} className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-[9px] text-slate-400 mb-1">{s.label}</p>
                <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">{cfg.content}</div>
        </div>
      </div>
    );
  };

  // ── Tabla ventas (reutilizada en ventas y tickets) ────────
  function TablaVentas() {
    return (
      <>
        <div className="grid grid-cols-[80px_1fr_90px_75px] px-4 py-2 bg-slate-50 border-b border-slate-100 sticky top-0">
          {["Folio · Hora", "Artículos", "Método", "Total"].map((h, i) => (
            <p key={h} className={`text-[10px] font-medium text-slate-400 ${i === 3 ? "text-right" : ""}`}>{h}</p>
          ))}
        </div>
        {ventasHoy.map((v) => (
          <div key={v.folio} className="grid grid-cols-[80px_1fr_90px_75px] px-4 py-3 border-b border-slate-50 hover:bg-slate-50 items-center">
            <div>
              <p className="text-xs font-semibold text-[#4F46E5]">{v.folio}</p>
              <p className="text-[10px] text-slate-400">{v.hora}</p>
            </div>
            <div>
              <p className="text-xs text-slate-800">{v.articulos}</p>
              <p className="text-[10px] text-slate-400">{v.count} {v.count === 1 ? "artículo" : "artículos"}</p>
            </div>
            <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full w-fit ${metodoBadge[v.metodo]}`}>{v.metodo}</span>
            <p className="text-xs font-semibold text-slate-800 text-right">{formatMXN(v.total)}</p>
          </div>
        ))}
      </>
    );
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Buenos días 👋</h1>
          <p className="text-xs text-slate-400 mt-0.5">Miércoles 28 de mayo, 2026</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Total semana</p>
          <p className="text-base font-bold text-slate-800">{formatMXN(totalSemana)}</p>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-5 gap-3">
        {([
          { label: "Ventas del día",       value: "$3,240", sub: "+18% vs ayer",        positive: true,  icon: ShoppingCart, iconBg: "bg-[#4F46E5]/10", iconColor: "text-[#4F46E5]", modal: "ventas"       as ModalType, btnColor: "text-[#4F46E5] bg-[#4F46E5]/10" },
          { label: "Total de tickets",     value: "24",     sub: "Transacciones hoy",   positive: true,  icon: Receipt,      iconBg: "bg-cyan-50",       iconColor: "text-cyan-600",  modal: "tickets"      as ModalType, btnColor: "text-cyan-600 bg-cyan-50" },
          { label: "Reparaciones activas", value: "8",      sub: "En proceso",          positive: true,  icon: Wrench,       iconBg: "bg-amber-50",      iconColor: "text-amber-600", modal: "reparaciones" as ModalType, btnColor: "text-amber-600 bg-amber-50" },
          { label: "Equipos listos",       value: "3",      sub: "Pendientes entregar", positive: true,  icon: CheckCircle,  iconBg: "bg-emerald-50",    iconColor: "text-emerald-600",modal: "listos"      as ModalType, btnColor: "text-emerald-600 bg-emerald-50" },
          { label: "Equipos devolución",   value: "2",      sub: "Sin reparación",      positive: false, icon: RotateCcw,    iconBg: "bg-red-50",        iconColor: "text-red-500",   modal: "devoluciones" as ModalType, btnColor: "text-red-600 bg-red-50" },
        ] as const).map((m) => (
          <div key={m.label} className="bg-white border border-slate-200 rounded-xl p-3.5 hover:border-slate-300 transition-colors">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-xs text-slate-500">{m.label}</p>
              <div className={`w-7 h-7 rounded-lg ${m.iconBg} flex items-center justify-center`}>
                <m.icon className={`w-3.5 h-3.5 ${m.iconColor}`} />
              </div>
            </div>
            <p className="text-[22px] font-semibold text-slate-800 leading-none mb-1">{m.value}</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {m.positive ? <ArrowUpRight className="w-3 h-3 text-emerald-500" /> : <ArrowDownRight className="w-3 h-3 text-red-500" />}
                <p className={`text-[10px] ${m.positive ? "text-emerald-500" : "text-red-500"}`}>{m.sub}</p>
              </div>
              <button onClick={() => setModalAbierto(m.modal)}
                className={`text-[9px] font-medium px-2 py-0.5 rounded-full hover:opacity-80 transition-opacity ${m.btnColor}`}>
                Ver →
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-slate-800">Ventas de la semana</p>
              <p className="text-xs text-slate-400">Promedio diario: {formatMXN(promedioVentas)}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#4F46E5]" /><span className="text-xs text-slate-500">Ventas</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#06B6D4]" /><span className="text-xs text-slate-500">Reparaciones</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-0 border-t-2 border-dashed border-emerald-500" /><span className="text-xs text-slate-500">Total</span></div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={ventasSemana} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#4F46E5" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorRep" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#06B6D4" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10B981" stopOpacity={0.10} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="ventas"       stroke="#4F46E5" strokeWidth={2} fill="url(#colorVentas)" />
              <Area type="monotone" dataKey="reparaciones" stroke="#06B6D4" strokeWidth={2} fill="url(#colorRep)" />
              <Area type="monotone" dataKey="total"        stroke="#10B981" strokeWidth={2} strokeDasharray="5 3" fill="url(#colorTotal)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart con botón configurar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-slate-800">Ventas por categoría</p>
            <button onClick={abrirConfig}
              className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
              title="Configurar categorías">
              <Settings className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>
          <p className="text-xs text-slate-400 mb-3">Este mes</p>
          <ResponsiveContainer width="100%" height={120}>
            <PieChart>
              <Pie data={categoriasVisibles} cx="50%" cy="50%" innerRadius={35} outerRadius={55}
                dataKey="value" paddingAngle={3}>
                {categoriasVisibles.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(value) => [`${value}%`, ""]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {categoriasVisibles.map((cat) => (
              <div key={cat.name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                  <span className="text-xs text-slate-600">{cat.name}</span>
                </div>
                <span className="text-xs font-medium text-slate-700">{cat.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reparaciones + Alertas */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-medium text-slate-800">Reparaciones activas</p>
            <button onClick={() => setModalAbierto("reparaciones")} className="text-xs text-[#4F46E5] hover:underline">Ver todas</button>
          </div>
          <div className="divide-y divide-slate-50">
            {reparacionesData.slice(0, 4).map((r) => (
              <div key={r.folio} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${prioridadDot[r.prioridad]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 truncate">{r.equipo}</p>
                  <p className="text-[10px] text-slate-400">{r.cliente}</p>
                </div>
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${estadoConfig[r.estado]?.classes}`}>
                  {estadoConfig[r.estado]?.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-medium text-slate-800">Alertas</p>
          </div>
          <div className="p-3 space-y-2">
            {alertas.map((a, i) => (
              <div key={i} className={`flex items-start gap-2 p-2 rounded-lg border ${a.bg}`}>
                <a.icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${a.color}`} />
                <p className={`text-xs leading-tight ${a.color}`}>{a.texto}</p>
              </div>
            ))}
          </div>
          <div className="px-3 pb-3">
            <p className="text-xs font-medium text-slate-400 mb-2">Accesos rápidos</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: "Nueva venta",      color: "bg-[#4F46E5]" },
                { label: "Nueva reparación", color: "bg-cyan-500" },
                { label: "Abrir caja",       color: "bg-emerald-500" },
                { label: "Nuevo cliente",    color: "bg-amber-500" },
              ].map((btn) => (
                <button key={btn.label} className={`${btn.color} hover:opacity-90 text-white text-xs font-medium py-1.5 px-2 rounded-lg`}>
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Grid sucursales */}
      {multiSucursal && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#4F46E5]" />
              <p className="text-sm font-medium text-slate-800">Resumen por sucursal</p>
            </div>
            <span className="text-xs text-slate-400">Hoy · 28 mayo 2026</span>
          </div>
          <div className={`grid gap-0 divide-x divide-slate-100 ${sucursales.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
            {sucursales.map((suc) => (
              <div key={suc.id} className={`border-t-2 ${suc.color}`}>
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-800">🏪 {suc.nombre}</p>
                  <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${suc.estado === "activa" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-600"}`}>
                    {suc.estado === "activa" ? "Activa" : "En prueba"}
                  </span>
                </div>
                <div className="grid grid-cols-2 divide-x divide-y divide-slate-100">
                  {[
                    { label: "Ventas del día",    value: formatMXN(suc.ventasDia),  color: "text-[#4F46E5]", sub: suc.vsAyer > 0 ? `↑ ${suc.vsAyer}% vs ayer` : "Primer día" },
                    { label: "Equipos recibidos", value: String(suc.equiposRecibidos), color: "text-slate-800", sub: "Hoy" },
                    { label: "Listos entrega",    value: String(suc.listosEntrega), color: suc.listosEntrega > 0 ? "text-emerald-600" : "text-slate-400", sub: "En tienda" },
                    { label: "Devoluciones",      value: String(suc.devoluciones),  color: suc.devoluciones > 0 ? "text-amber-600" : "text-slate-400", sub: "Pendientes" },
                    { label: "Rep. activas",      value: String(suc.repActivas),    color: "text-slate-800", sub: "En proceso" },
                    { label: "Ticket promedio",   value: formatMXN(Math.round(suc.ventasDia / (suc.ticketsVenta || 1))), color: "text-[#4F46E5]", sub: "Por venta" },
                  ].map((m) => (
                    <div key={m.label} className="px-3 py-2.5">
                      <p className="text-[9px] text-slate-400 mb-0.5">{m.label}</p>
                      <p className={`text-sm font-semibold ${m.color}`}>{m.value}</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">{m.sub}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-t border-slate-100">
                  <div className="flex gap-2">
                    <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">{suc.ticketsVenta} ventas</span>
                    <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-orange-50 text-orange-700">{suc.ticketsRep} reparaciones</span>
                  </div>
                  <span className="text-[10px] text-slate-500">Total: <span className="font-semibold text-slate-700">{formatMXN(suc.ventasDia)}</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal detalle */}
      {renderModal()}

      {/* Modal configurar categorías */}
      {configurandoCategorias && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4"
          onClick={() => setConfigurandoCategorias(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}>

            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#4F46E5]" />
                <p className="text-sm font-semibold text-slate-800">Configurar categorías visibles</p>
              </div>
              <button onClick={() => setConfigurandoCategorias(false)}
                className="w-7 h-7 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="px-5 py-2 border-b border-slate-100 flex-shrink-0">
              <p className="text-xs text-slate-400">
                Selecciona hasta 6 categorías · {catTemp.filter(c => c.visible).length} de 6 seleccionadas
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
              {catTemp.map((cat) => {
                const visibles = catTemp.filter(c => c.visible).length;
                const disabled = !cat.visible && visibles >= 6;
                return (
                  <div key={cat.name}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      cat.visible ? "border-[#4F46E5] bg-[#4F46E5]/5" : "border-slate-200 bg-white"
                    } ${disabled ? "opacity-40" : "cursor-pointer"}`}
                    onClick={() => !disabled && toggleCategoria(cat.name)}>

                    {/* Checkbox */}
                    <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                      cat.visible ? "bg-[#4F46E5] border-[#4F46E5]" : "border-slate-300"
                    }`}>
                      {cat.visible && <span className="text-white text-[9px] font-bold">✓</span>}
                    </div>

                    {/* Color dot */}
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: cat.color }} />

                    {/* Nombre */}
                    <span className="text-xs font-medium text-slate-800 flex-1">{cat.name}</span>

                    {/* Porcentaje */}
                    <span className="text-[10px] text-slate-400 w-8 text-right">{cat.value}%</span>

                    {/* Paleta de colores */}
                    {cat.visible && (
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        {coloresDisponibles.slice(0, 6).map((color) => (
                          <button key={color} onClick={() => cambiarColor(cat.name, color)}
                            className={`w-4 h-4 rounded-full border-2 transition-all ${
                              cat.color === color ? "border-slate-800 scale-110" : "border-transparent"
                            }`}
                            style={{ background: color }} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 flex-shrink-0">
              <button onClick={() => setConfigurandoCategorias(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={guardarConfig}
                className="px-5 py-2 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-lg text-xs font-medium transition-colors">
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}