"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingCart, Wrench, AlertTriangle, Clock, ArrowUpRight, ArrowDownRight,
  CheckCircle, RotateCcw, Receipt, Building2, X, Phone, Settings,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import type { RepairStatus, Priority } from "@prisma/client";
import { label, type LabelDictionary } from "@/lib/labels";
import type {
  DashboardData, RepairRow, CategoriaVenta,
} from "@/lib/dashboard-data";

// ── Config de presentación (claves = valores reales del enum) ───────────────
const estadoConfig: Record<RepairStatus, { label: string; classes: string }> = {
  RECEIVED:        { label: "Recibido",         classes: "bg-blue-50 text-blue-700" },
  DIAGNOSING:      { label: "En diagnóstico",   classes: "bg-purple-50 text-purple-700" },
  WAITING_PARTS:   { label: "Esperando refacciones", classes: "bg-orange-50 text-orange-700" },
  IN_REPAIR:       { label: "En reparación",    classes: "bg-purple-50 text-purple-700" },
  READY:           { label: "Listo",            classes: "bg-emerald-50 text-emerald-700" },
  DELIVERED:       { label: "Entregado",        classes: "bg-muted text-muted-foreground" },
  CANCELLED:       { label: "Cancelado",        classes: "bg-muted text-muted-foreground" },
  WORKSHOP_READY:  { label: "Listo en Taller",  classes: "bg-emerald-50 text-emerald-700" },
  WORKSHOP_RETURN: { label: "Dev. Taller",      classes: "bg-orange-50 text-orange-700" },
  SHOP_READY:      { label: "Listo en Tienda",  classes: "bg-cyan-50 text-cyan-700" },
  SHOP_RETURN:     { label: "Dev. Tienda",      classes: "bg-red-50 text-red-600" },
};

const metodoBadge: Record<string, string> = {
  "Efectivo":      "bg-purple-50 text-purple-700",
  "Tarjeta":       "bg-blue-50 text-blue-700",
  "Transferencia": "bg-emerald-50 text-emerald-700",
  "Mixto":         "bg-amber-50 text-amber-700",
};

const prioridadDot: Record<Priority, string> = {
  LOW: "bg-slate-300", NORMAL: "bg-amber-400", HIGH: "bg-red-500", URGENT: "bg-red-600",
};

const alertaEstilo: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
  stock_bajo:   { color: "text-amber-600", bg: "bg-amber-50 border-amber-200", icon: AlertTriangle },
  agotado:      { color: "text-red-600",   bg: "bg-red-50 border-red-200",     icon: AlertTriangle },
  repair_stale: { color: "text-red-600",   bg: "bg-red-50 border-red-200",     icon: Clock },
};

const coloresDisponibles = [
  "var(--primary)", "#06B6D4", "#10B981", "#F59E0B",
  "#EF4444", "#8B5CF6", "#EC4899", "#F97316",
  "#14B8A6", "#84CC16", "#2563EB", "#DC2626",
];

type ModalType = "ventas" | "tickets" | "reparaciones" | "listos" | "devoluciones" | null;
type CatConfig = CategoriaVenta & { visible: boolean };

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const CustomTooltip = ({ active, payload, label: lbl }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-card border border-border rounded-lg p-2 shadow-sm">
        <p className="text-xs font-medium text-muted-foreground mb-1">{lbl}</p>
        {payload.map((p: any) => (
          <p key={p.name} className="text-xs" style={{ color: p.color }}>
            {p.name === "ventas" ? "Ventas" : p.name === "reparaciones" ? "Reparaciones" : "Total"}: {formatMXN(p.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-8 px-4">
      <p className="text-xs text-muted-foreground text-center">{text}</p>
    </div>
  );
}

export default function DashboardClient({
  data,
  labels,
  tenantSlug,
}: {
  data: DashboardData;
  labels: LabelDictionary;
  tenantSlug: string;
}) {
  const router = useRouter();
  const t = (key: string) => label(labels, key);

  const [modalAbierto, setModalAbierto] = useState<ModalType>(null);
  const [configurandoCategorias, setConfigurandoCategorias] = useState(false);
  const [categoriasConfig, setCategoriasConfig] = useState<CatConfig[]>(
    data.categorias.map((c, i) => ({ ...c, visible: i < 6 }))
  );
  const [catTemp, setCatTemp] = useState<CatConfig[]>([]);
  const [saludo, setSaludo] = useState("Hola");
  const [fechaHoy, setFechaHoy] = useState("");

  useEffect(() => {
    const hora = new Date().getHours();
    setSaludo(hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches");
    setFechaHoy(
      new Intl.DateTimeFormat("es-MX", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
        timeZone: "America/Mexico_City",
      }).format(new Date())
    );
  }, []);

  const categoriasVisibles = categoriasConfig.filter((c) => c.visible);

  const abrirConfig = () => {
    setCatTemp(categoriasConfig.map((c) => ({ ...c })));
    setConfigurandoCategorias(true);
  };

  const toggleCategoria = (name: string) => {
    setCatTemp((prev) => {
      const cat = prev.find((c) => c.name === name)!;
      const visibles = prev.filter((c) => c.visible).length;
      if (!cat.visible && visibles >= 6) return prev;
      return prev.map((c) => (c.name === name ? { ...c, visible: !c.visible } : c));
    });
  };

  const cambiarColor = (name: string, color: string) =>
    setCatTemp((prev) => prev.map((c) => (c.name === name ? { ...c, color } : c)));

  const guardarConfig = () => { setCategoriasConfig(catTemp); setConfigurandoCategorias(false); };

  // ── Tabla ventas reutilizable ────────────────────────
  function TablaVentas() {
    if (data.ventasHoy.length === 0) {
      return <EmptyState text="Aún no hay ventas registradas hoy." />;
    }
    return (
      <>
        <div className="grid grid-cols-[70px_1fr_80px_65px] sm:grid-cols-[80px_1fr_90px_75px] px-4 py-2 bg-muted/50 border-b border-border sticky top-0">
          {["Folio · Hora", "Artículos", "Método", "Total"].map((h, i) => (
            <p key={h} className={`text-[10px] font-medium text-muted-foreground ${i === 3 ? "text-right" : ""}`}>{h}</p>
          ))}
        </div>
        {data.ventasHoy.map((v) => (
          <div key={v.id} className="grid grid-cols-[70px_1fr_80px_65px] sm:grid-cols-[80px_1fr_90px_75px] px-4 py-3 border-b border-border/60 hover:bg-muted/40 items-center">
            <div>
              <p className="text-xs font-semibold text-primary">{v.folio}</p>
              <p className="text-[10px] text-muted-foreground">{v.hora}</p>
            </div>
            <div>
              <p className="text-xs text-foreground truncate">{v.articulos}</p>
              <p className="text-[10px] text-muted-foreground">{v.count} {v.count === 1 ? "artículo" : "artículos"}</p>
            </div>
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full w-fit ${metodoBadge[v.metodo]}`}>{v.metodo}</span>
            <p className="text-xs font-semibold text-foreground text-right">{formatMXN(v.total)}</p>
          </div>
        ))}
      </>
    );
  }

  function TablaReparaciones({ rows, emptyText }: { rows: RepairRow[]; emptyText: string }) {
    if (rows.length === 0) return <EmptyState text={emptyText} />;
    return (
      <>
        <div className="grid grid-cols-[80px_1fr_90px_75px] px-4 py-2 bg-muted/50 border-b border-border sticky top-0">
          {["Folio", "Cliente · Equipo", "Estado", "Técnico"].map((h) => (
            <p key={h} className="text-[10px] font-medium text-muted-foreground">{h}</p>
          ))}
        </div>
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-[80px_1fr_90px_75px] px-4 py-3 border-b border-border/60 hover:bg-muted/40 items-center">
            <div>
              <p className="text-xs font-semibold text-primary">{r.folio}</p>
              <div className={`w-1.5 h-1.5 rounded-full mt-1 ${prioridadDot[r.prioridad]}`} />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">{r.cliente}</p>
              <p className="text-[10px] text-muted-foreground">{r.equipo}</p>
            </div>
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full w-fit ${estadoConfig[r.status].classes}`}>
              {estadoConfig[r.status].label}
            </span>
            <p className="text-[10px] text-muted-foreground truncate">{r.tecnico}</p>
          </div>
        ))}
      </>
    );
  }

  function TablaListos({ rows }: { rows: RepairRow[] }) {
    if (rows.length === 0) return <EmptyState text="No hay equipos listos para entregar por ahora." />;
    return (
      <>
        <div className="grid grid-cols-[80px_1fr_90px_70px] px-4 py-2 bg-muted/50 border-b border-border sticky top-0">
          {["Folio", "Cliente · Equipo", "Costo", "Espera"].map((h) => (
            <p key={h} className="text-[10px] font-medium text-muted-foreground">{h}</p>
          ))}
        </div>
        {rows.map((e) => (
          <div key={e.id} className="grid grid-cols-[80px_1fr_90px_70px] px-4 py-3 border-b border-border/60 hover:bg-muted/40 items-center">
            <div>
              <p className="text-xs font-semibold text-primary">{e.folio}</p>
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Listo</span>
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">{e.cliente}</p>
              <p className="text-[10px] text-muted-foreground">{e.equipo} · {e.falla ?? "Sin detalle"}</p>
              <p className="text-[10px] text-primary flex items-center gap-1 mt-0.5">
                <Phone className="w-2.5 h-2.5" /> {e.telefono}
              </p>
            </div>
            <p className="text-xs font-semibold text-emerald-600">{e.costo != null ? formatMXN(e.costo) : "—"}</p>
            <p className="text-[10px] text-muted-foreground">{e.espera}</p>
          </div>
        ))}
      </>
    );
  }

  function TablaDevoluciones({ rows }: { rows: RepairRow[] }) {
    if (rows.length === 0) return <EmptyState text="No hay equipos en devolución." />;
    return (
      <>
        <div className="grid grid-cols-[80px_1fr_1fr] px-4 py-2 bg-muted/50 border-b border-border sticky top-0">
          {["Folio", "Cliente · Equipo", "Razón · Espera"].map((h) => (
            <p key={h} className="text-[10px] font-medium text-muted-foreground">{h}</p>
          ))}
        </div>
        {rows.map((e) => (
          <div key={e.id} className="grid grid-cols-[80px_1fr_1fr] px-4 py-3 border-b border-border/60 hover:bg-muted/40 items-start">
            <div>
              <p className="text-xs font-semibold text-primary">{e.folio}</p>
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">Devolución</span>
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">{e.cliente}</p>
              <p className="text-[10px] text-muted-foreground">{e.equipo}</p>
              <p className="text-[10px] text-primary flex items-center gap-1 mt-0.5">
                <Phone className="w-2.5 h-2.5" /> {e.telefono}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">{e.razon ?? "Sin motivo especificado"}</p>
              <p className="text-[10px] text-amber-500 mt-0.5">{e.espera}</p>
            </div>
          </div>
        ))}
      </>
    );
  }

  // ── Modal detalle ────────────────────────────────────
  const renderModal = () => {
    if (!modalAbierto) return null;

    const configs: Record<NonNullable<ModalType>, {
      titulo: string; iconBg: string; iconColor: string; icon: React.ElementType;
      stats: { label: string; value: string; color: string }[];
      content: React.ReactNode;
    }> = {
      ventas: {
        titulo: "Ventas del día", iconBg: "bg-primary/10", iconColor: "text-primary", icon: ShoppingCart,
        stats: [
          { label: "Total ventas", value: formatMXN(data.totalVentasHoy), color: "text-primary" },
          { label: "Num. de ventas", value: String(data.numVentasHoy), color: "text-foreground" },
          { label: "Ticket promedio", value: formatMXN(data.ticketPromedio), color: "text-foreground" },
        ],
        content: <TablaVentas />,
      },
      tickets: {
        titulo: "Total de tickets", iconBg: "bg-cyan-50", iconColor: "text-cyan-600", icon: Receipt,
        stats: [
          { label: "Tickets hoy", value: String(data.numVentasHoy), color: "text-cyan-600" },
          { label: "Monto total", value: formatMXN(data.totalVentasHoy), color: "text-primary" },
          { label: "Ticket promedio", value: formatMXN(data.ticketPromedio), color: "text-foreground" },
        ],
        content: <TablaVentas />,
      },
      reparaciones: {
        titulo: `${t("entity.repair.plural")} activas`, iconBg: "bg-amber-50", iconColor: "text-amber-600", icon: Wrench,
        stats: [
          { label: "Total activas", value: String(data.reparacionesActivas.length), color: "text-amber-600" },
          { label: "Prioridad alta", value: String(data.reparacionesActivas.filter((r) => r.prioridad === "HIGH" || r.prioridad === "URGENT").length), color: "text-red-600" },
          { label: "Listos p/ entregar", value: String(data.equiposListos.length), color: "text-emerald-600" },
        ],
        content: <TablaReparaciones rows={data.reparacionesActivas} emptyText={`No hay ${t("entity.repair.plural").toLowerCase()} activas por ahora.`} />,
      },
      listos: {
        titulo: "Equipos listos para entregar", iconBg: "bg-emerald-50", iconColor: "text-emerald-600", icon: CheckCircle,
        stats: [
          { label: "Equipos listos", value: String(data.equiposListos.length), color: "text-emerald-600" },
          { label: "Total a cobrar", value: formatMXN(data.equiposListos.reduce((s, e) => s + (e.costo ?? 0), 0)), color: "text-primary" },
          { label: "Con espera > 1 día", value: String(data.equiposListos.filter((e) => e.espera.includes("día")).length), color: "text-amber-600" },
        ],
        content: <TablaListos rows={data.equiposListos} />,
      },
      devoluciones: {
        titulo: "Equipos en devolución", iconBg: "bg-red-50", iconColor: "text-red-500", icon: RotateCcw,
        stats: [
          { label: "Equipos a devolver", value: String(data.equiposDevolucion.length), color: "text-red-600" },
          { label: "Requieren contacto", value: String(data.equiposDevolucion.length), color: "text-foreground" },
          { label: "Total activas", value: String(data.reparacionesActivas.length), color: "text-amber-600" },
        ],
        content: <TablaDevoluciones rows={data.equiposDevolucion} />,
      },
    };

    const cfg = configs[modalAbierto];
    const IconoMdl = cfg.icon;
    return (
      <div className="fixed inset-0 bg-slate-900/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
        onClick={() => setModalAbierto(null)}>
        <div className="bg-card rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[90vh] sm:max-h-[80vh] flex flex-col shadow-2xl"
          onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.iconBg}`}>
                <IconoMdl className={`w-4 h-4 ${cfg.iconColor}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{cfg.titulo}</p>
                <p className="text-[10px] text-muted-foreground">{fechaHoy} · Actualizado al momento</p>
              </div>
            </div>
            <button onClick={() => setModalAbierto(null)}
              className="w-7 h-7 bg-muted hover:bg-muted/70 rounded-lg flex items-center justify-center flex-shrink-0">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 px-4 sm:px-5 py-3 border-b border-border flex-shrink-0">
            {cfg.stats.map((s) => (
              <div key={s.label} className="bg-muted/50 rounded-xl p-2 sm:p-3 text-center">
                <p className="text-[9px] text-muted-foreground mb-1">{s.label}</p>
                <p className={`text-sm sm:text-base font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">{cfg.content}</div>
        </div>
      </div>
    );
  };

  const metricas = [
    { label: "Ventas del día", value: formatMXN(data.totalVentasHoy), sub: data.numVentasHoy > 0 ? `${data.numVentasHoy} ${data.numVentasHoy === 1 ? "venta" : "ventas"} hoy` : "Sin ventas aún", positive: true, icon: ShoppingCart, iconBg: "bg-primary/10", iconColor: "text-primary", modal: "ventas" as ModalType, btnColor: "text-primary bg-primary/10" },
    { label: "Total de tickets", value: String(data.numVentasHoy), sub: "Transacciones hoy", positive: true, icon: Receipt, iconBg: "bg-cyan-50", iconColor: "text-cyan-600", modal: "tickets" as ModalType, btnColor: "text-cyan-600 bg-cyan-50" },
    { label: `${t("entity.repair.plural")} activas`, value: String(data.reparacionesActivasCount), sub: "En proceso", positive: true, icon: Wrench, iconBg: "bg-amber-50", iconColor: "text-amber-600", modal: "reparaciones" as ModalType, btnColor: "text-amber-600 bg-amber-50" },
    { label: `${t("entity.repair.asset")}s listos`, value: String(data.equiposListosCount), sub: "Pendientes entregar", positive: true, icon: CheckCircle, iconBg: "bg-emerald-50", iconColor: "text-emerald-600", modal: "listos" as ModalType, btnColor: "text-emerald-600 bg-emerald-50" },
    { label: `${t("entity.repair.asset")}s devolución`, value: String(data.equiposDevolucionCount), sub: "Sin reparación", positive: false, icon: RotateCcw, iconBg: "bg-red-50", iconColor: "text-red-500", modal: "devoluciones" as ModalType, btnColor: "text-red-600 bg-red-50" },
  ];

  return (
    <div className="p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-y-auto h-full">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base sm:text-lg font-semibold text-foreground">{saludo} 👋</h1>
          <p className="text-xs text-muted-foreground mt-0.5 capitalize">{fechaHoy}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">Total semana</p>
          <p className="text-sm sm:text-base font-bold text-foreground">{formatMXN(data.totalSemana)}</p>
        </div>
      </div>

      {/* ── Métricas 5 fichas ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3">
        {metricas.map((m) => (
          <div key={m.label} className="bg-card border border-border rounded-xl p-3 hover:border-primary/30 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">{m.label}</p>
              <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg ${m.iconBg} flex items-center justify-center flex-shrink-0`}>
                <m.icon className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${m.iconColor}`} />
              </div>
            </div>
            <p className="text-xl sm:text-[22px] font-semibold text-foreground leading-none mb-1">{m.value}</p>
            <div className="flex items-center justify-between flex-wrap gap-1">
              <div className="flex items-center gap-1">
                {m.positive
                  ? <ArrowUpRight className="w-3 h-3 text-emerald-500" />
                  : <ArrowDownRight className="w-3 h-3 text-red-500" />}
                <p className={`text-[9px] sm:text-[10px] ${m.positive ? "text-emerald-500" : "text-red-500"}`}>{m.sub}</p>
              </div>
              <button onClick={() => setModalAbierto(m.modal)}
                className={`text-[9px] font-medium px-2 py-0.5 rounded-full hover:opacity-80 transition-opacity ${m.btnColor}`}>
                Ver →
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Gráficas: área + pie ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">

        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-foreground">Ventas de la semana</p>
              <p className="text-xs text-muted-foreground">Promedio diario: {formatMXN(data.promedioVentasSemana)}</p>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-primary" /><span className="text-[10px] sm:text-xs text-muted-foreground">Ventas</span></div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#06B6D4]" /><span className="text-[10px] sm:text-xs text-muted-foreground">Rep.</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-0 border-t-2 border-dashed border-emerald-500" /><span className="text-[10px] sm:text-xs text-muted-foreground">Total</span></div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={data.ventasSemana} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="cV" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cR" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cT" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.10} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="dia" tick={{ fontSize: 9, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={36} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="ventas" stroke="var(--primary)" strokeWidth={2} fill="url(#cV)" />
              <Area type="monotone" dataKey="reparaciones" stroke="#06B6D4" strokeWidth={2} fill="url(#cR)" />
              <Area type="monotone" dataKey="total" stroke="#10B981" strokeWidth={2} strokeDasharray="5 3" fill="url(#cT)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-foreground">Ventas por categoría</p>
            <button onClick={abrirConfig} disabled={categoriasConfig.length === 0}
              className="w-6 h-6 rounded-lg bg-muted hover:bg-muted/70 flex items-center justify-center transition-colors disabled:opacity-40">
              <Settings className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-2">Este mes</p>
          {categoriasVisibles.length === 0 ? (
            <EmptyState text="Aún no hay ventas registradas este mes." />
          ) : (
            <div className="flex flex-col sm:block">
              <ResponsiveContainer width="100%" height={110}>
                <PieChart>
                  <Pie data={categoriasVisibles} cx="50%" cy="50%" innerRadius={30} outerRadius={48}
                    dataKey="value" paddingAngle={3}>
                    {categoriasVisibles.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v}%`, ""]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 sm:grid-cols-1 gap-1 mt-1">
                {categoriasVisibles.map((cat) => (
                  <div key={cat.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                      <span className="text-[10px] sm:text-xs text-muted-foreground truncate">{cat.name}</span>
                    </div>
                    <span className="text-[10px] sm:text-xs font-medium text-foreground ml-1">{cat.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Reparaciones + Alertas ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-medium text-foreground">{t("entity.repair.plural")} activas</p>
            <button onClick={() => setModalAbierto("reparaciones")} className="text-xs text-primary hover:underline">Ver todas</button>
          </div>
          <div className="divide-y divide-border/60">
            {data.reparacionesActivas.length === 0 ? (
              <EmptyState text={`No hay ${t("entity.repair.plural").toLowerCase()} activas por ahora.`} />
            ) : (
              data.reparacionesActivas.slice(0, 4).map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${prioridadDot[r.prioridad]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{r.equipo}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{r.cliente}</p>
                  </div>
                  <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${estadoConfig[r.status].classes}`}>
                    {estadoConfig[r.status].label}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium text-foreground">Alertas</p>
          </div>
          <div className="p-3 space-y-2">
            {data.alertas.length === 0 ? (
              <EmptyState text="Sin alertas por ahora." />
            ) : (
              data.alertas.map((a) => {
                const estilo = alertaEstilo[a.tipo];
                const Icono = estilo.icon;
                return (
                  <div key={a.id} className={`flex items-start gap-2 p-2 rounded-lg border ${estilo.bg}`}>
                    <Icono className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${estilo.color}`} />
                    <p className={`text-xs leading-tight ${estilo.color}`}>{a.texto}</p>
                  </div>
                );
              })
            )}
          </div>
          <div className="px-3 pb-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Accesos rápidos</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: "Nueva venta", color: "bg-primary", href: `/${tenantSlug}/pos` },
                { label: `Nueva ${t("entity.repair.singular").toLowerCase()}`, color: "bg-cyan-500", href: `/${tenantSlug}/reparaciones` },
                { label: "Abrir caja", color: "bg-emerald-500", href: `/${tenantSlug}/caja` },
                { label: "Nuevo cliente", color: "bg-amber-500", href: `/${tenantSlug}/clientes` },
              ].map((btn) => (
                <button key={btn.label} onClick={() => router.push(btn.href)}
                  className={`${btn.color} hover:opacity-90 text-white text-xs font-medium py-1.5 px-2 rounded-lg`}>
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Grid sucursales ─────────────────────────────────────────────── */}
      {data.multiSucursal && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Resumen por sucursal</p>
            </div>
            <span className="text-xs text-muted-foreground hidden sm:block capitalize">Hoy · {fechaHoy}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
            {data.sucursales.map((suc, i) => {
              const borderColors = ["border-t-primary", "border-t-cyan-500", "border-t-emerald-500", "border-t-amber-500", "border-t-purple-500"];
              return (
                <div key={suc.id} className={`border-t-2 ${borderColors[i % borderColors.length]}`}>
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                    <p className="text-xs font-semibold text-foreground">🏢 {suc.nombre}</p>
                    <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${suc.estado === "activa" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-600"}`}>
                      {suc.estado === "activa" ? "Activa" : "En prueba"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-2 divide-x divide-y divide-border">
                    {[
                      { label: "Ventas del día", value: formatMXN(suc.ventasDia), color: "text-primary", sub: suc.vsAyer != null ? `${suc.vsAyer >= 0 ? "↑" : "↓"} ${Math.abs(suc.vsAyer)}% vs ayer` : "Sin datos de ayer" },
                      { label: "Equipos recibidos", value: String(suc.equiposRecibidos), color: "text-foreground", sub: "Hoy" },
                      { label: "Listos entrega", value: String(suc.listosEntrega), color: suc.listosEntrega > 0 ? "text-emerald-600" : "text-muted-foreground", sub: "En tienda" },
                      { label: "Devoluciones", value: String(suc.devoluciones), color: suc.devoluciones > 0 ? "text-amber-600" : "text-muted-foreground", sub: "Pendientes" },
                      { label: "Rep. activas", value: String(suc.repActivas), color: "text-foreground", sub: "En proceso" },
                      { label: "Ticket promedio", value: formatMXN(suc.ticketsVenta > 0 ? Math.round(suc.ventasDia / suc.ticketsVenta) : 0), color: "text-primary", sub: "Por venta" },
                    ].map((m) => (
                      <div key={m.label} className="px-3 py-2.5">
                        <p className="text-[9px] text-muted-foreground mb-0.5">{m.label}</p>
                        <p className={`text-sm font-semibold ${m.color}`}>{m.value}</p>
                        <p className="text-[9px] text-muted-foreground mt-0.5">{m.sub}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-t border-border">
                    <div className="flex gap-2">
                      <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">{suc.ticketsVenta} ventas</span>
                      <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-orange-50 text-orange-700">{suc.ticketsRep} {t("entity.repair.plural").toLowerCase()}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">Total: <span className="font-semibold text-foreground">{formatMXN(suc.ventasDia)}</span></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal detalle */}
      {renderModal()}

      {/* Modal configurar categorías */}
      {configurandoCategorias && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={() => setConfigurandoCategorias(false)}>
          <div className="bg-card rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Configurar categorías</p>
              </div>
              <button onClick={() => setConfigurandoCategorias(false)}
                className="w-7 h-7 bg-muted hover:bg-muted/70 rounded-lg flex items-center justify-center">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-5 py-2 border-b border-border flex-shrink-0">
              <p className="text-xs text-muted-foreground">
                Selecciona hasta 6 categorías · {catTemp.filter((c) => c.visible).length} de 6 seleccionadas
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
              {catTemp.map((cat) => {
                const visibles = catTemp.filter((c) => c.visible).length;
                const disabled = !cat.visible && visibles >= 6;
                return (
                  <div key={cat.name}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      cat.visible ? "border-primary bg-primary/5" : "border-border bg-card"
                    } ${disabled ? "opacity-40" : "cursor-pointer"}`}
                    onClick={() => !disabled && toggleCategoria(cat.name)}>
                    <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                      cat.visible ? "bg-primary border-primary" : "border-border"
                    }`}>
                      {cat.visible && <span className="text-white text-[9px] font-bold">✓</span>}
                    </div>
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                    <span className="text-xs font-medium text-foreground flex-1">{cat.name}</span>
                    <span className="text-[10px] text-muted-foreground w-8 text-right">{cat.value}%</span>
                    {cat.visible && (
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        {coloresDisponibles.slice(0, 6).map((color) => (
                          <button key={color} onClick={() => cambiarColor(cat.name, color)}
                            className={`w-4 h-4 rounded-full border-2 transition-all ${
                              cat.color === color ? "border-foreground scale-110" : "border-transparent"
                            }`}
                            style={{ background: color }} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-t border-border flex-shrink-0">
              <button onClick={() => setConfigurandoCategorias(false)}
                className="px-4 py-2 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted/40">
                Cancelar
              </button>
              <button onClick={guardarConfig}
                className="px-5 py-2 bg-primary hover:opacity-90 text-primary-foreground rounded-lg text-xs font-medium transition-colors">
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
