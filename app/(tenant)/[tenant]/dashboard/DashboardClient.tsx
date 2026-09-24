"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingCart, Wrench, AlertTriangle, Clock, ArrowUpRight, ArrowDownRight,
  CheckCircle, RotateCcw, Receipt, Building2, X, Phone, Settings,
  Calendar, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import type { RepairStatus, Priority } from "@prisma/client";
import { label, type LabelDictionary } from "@/lib/labels";
import type {
  DashboardData, RepairRow, CategoriaVenta, VentasPorDiaData, VentaPorHora,
} from "@/lib/dashboard-data";
import { obtenerVentasPorDiaAction, guardarConfigCategoriasDashboardAction } from "@/app/actions/dashboard-actions";

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
// CategoriaVenta ya trae "visible" (2026-09-22: el servidor lo resuelve
// con la config guardada del tenant, ver aplicarConfigCategorias en
// lib/dashboard-data.ts) — este alias se queda solo por lo descriptivo
// del nombre en este archivo, ya no agrega ningún campo extra.
type CatConfig = CategoriaVenta;

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const MESES_LARGO = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DIAS_LARGO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// Formatea "YYYY-MM-DD" a texto largo sin pasar por Date/huso horario real
// (Date.UTC a mediodía es solo para leer el día de la semana de forma
// segura) — así el resultado no depende de en qué zona horaria esté el
// navegador de quien mira el Dashboard.
function formatFechaLarga(fechaStr: string): string {
  const [y, m, d] = fechaStr.split("-").map(Number);
  const diaSemana = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return `${DIAS_LARGO[diaSemana]} ${d} de ${MESES_LARGO[m - 1]} de ${y}`;
}

const CustomTooltipHora = ({ active, payload }: { active?: boolean; payload?: { payload: VentaPorHora }[] }) => {
  if (active && payload?.length) {
    const d = payload[0].payload;
    return (
      <div className="bg-card border border-border rounded-lg p-2 shadow-sm">
        <p className="text-xs font-medium text-foreground mb-0.5">{d.horaLabel}</p>
        <p className="text-[11.5px] text-muted-foreground">
          {d.numVentas} {d.numVentas === 1 ? "venta" : "ventas"} · {formatMXN(d.totalVentas)}
        </p>
      </div>
    );
  }
  return null;
};

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

interface SucursalOption {
  id: string;
  name: string;
}

export default function DashboardClient({
  data,
  labels,
  tenantSlug,
  ventasPorDiaInicial,
  branches,
  sucursalActualId,
  puedeConfigurarCategorias = true,
}: {
  data: DashboardData;
  labels: LabelDictionary;
  tenantSlug: string;
  ventasPorDiaInicial: VentasPorDiaData;
  // "Vista global" / "vista por sucursal" (2026-09-22, a petición de
  // Carlos). branches = TODAS las sucursales activas del tenant (para el
  // selector, sin importar cuál esté filtrada ahora mismo — ver
  // dashboard/page.tsx). sucursalActualId = null en vista global; el id de
  // la sucursal cuando está filtrado. page.tsx ya remonta este componente
  // (key={sucursalActualId}) al cambiar, así que aquí no hace falta
  // resetear nada a mano.
  branches: SucursalOption[];
  sucursalActualId: string | null;
  // 2026-09-24, a petición de Carlos (revisión de permisos) — false para un
  // empleado de PIN sin Role.verTodoNegocio: oculta el engrane de
  // "Configurar categorías" (cambia Tenant.dashboardCategoriasConfig,
  // compartido por TODO el negocio, no por empleado). Mismo candado ya
  // aplicado del lado del servidor en guardarConfigCategoriasDashboardAction
  // (dashboard-actions.ts) — esto es solo para no mostrar un botón que el
  // servidor va a rechazar. Default true para no romper otros usos.
  puedeConfigurarCategorias?: boolean;
}) {
  const router = useRouter();
  const t = (key: string) => label(labels, key);
  const enVistaGlobal = sucursalActualId === null;

  const cambiarVista = (destino: "global" | string) => {
    if (destino === "global") {
      router.push(`/${tenantSlug}/dashboard`);
    } else {
      router.push(`/${tenantSlug}/dashboard?sucursal=${destino}`);
    }
  };

  const [modalAbierto, setModalAbierto] = useState<ModalType>(null);
  const [ventasPorDia, setVentasPorDia] = useState<VentasPorDiaData>(ventasPorDiaInicial);
  const [fechaSel, setFechaSel] = useState(ventasPorDiaInicial.fecha);
  const [hoyStr, setHoyStr] = useState(ventasPorDiaInicial.fecha);
  const [cargandoFecha, setCargandoFecha] = useState(false);
  const [configurandoCategorias, setConfigurandoCategorias] = useState(false);
  // 2026-09-22: data.categorias ya viene con "visible" resuelto desde el
  // servidor (config guardada del tenant, o el default de las primeras 6
  // si nunca la ha configurado — ver aplicarConfigCategorias en
  // lib/dashboard-data.ts) — antes este useState recalculaba "las primeras
  // 6" localmente cada vez, así que cualquier cambio del dueño se perdía
  // al recargar la página (pendiente registrado, ya resuelto).
  const [categoriasConfig, setCategoriasConfig] = useState<CatConfig[]>(data.categorias);
  const [catTemp, setCatTemp] = useState<CatConfig[]>([]);
  const [guardandoCategorias, setGuardandoCategorias] = useState(false);
  const [errorCategorias, setErrorCategorias] = useState<string | null>(null);
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
    // "en-CA" formatea como YYYY-MM-DD directamente — mismo truco que el
    // resto del proyecto para no reconstruir el string a mano.
    setHoyStr(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date()));
  }, []);

  const cambiarFechaVentas = async (nuevaFecha: string) => {
    if (nuevaFecha === fechaSel || cargandoFecha) return;
    setFechaSel(nuevaFecha);
    setCargandoFecha(true);
    const res = await obtenerVentasPorDiaAction(tenantSlug, nuevaFecha, sucursalActualId ?? undefined);
    if (res.ok) setVentasPorDia(res.data);
    setCargandoFecha(false);
  };

  const sumarDias = (fechaStr: string, delta: number) => {
    const [y, m, d] = fechaStr.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
  };

  const esHoySeleccionado = fechaSel >= hoyStr;

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

  // 2026-09-22: ahora persiste en el servidor (Tenant.dashboardCategoriasConfig)
  // en vez de solo actualizar el useState local — así el dueño no pierde su
  // configuración al recargar la página. Se actualiza el estado local de una
  // vez (optimista) en cuanto el servidor confirma, sin esperar a un
  // router.refresh() completo — el propio Dashboard ya tiene todo lo que
  // necesita mostrar en catTemp.
  const guardarConfig = () => {
    setErrorCategorias(null);
    setGuardandoCategorias(true);
    const config = catTemp.map((c) => ({ name: c.name, color: c.color, visible: c.visible }));
    guardarConfigCategoriasDashboardAction(tenantSlug, config)
      .then((res) => {
        setGuardandoCategorias(false);
        if (!res.ok) {
          setErrorCategorias(res.error);
          return;
        }
        setCategoriasConfig(catTemp);
        setConfigurandoCategorias(false);
      })
      .catch(() => {
        setGuardandoCategorias(false);
        setErrorCategorias("No se pudo guardar la configuración");
      });
  };

  // ── Tabla ventas reutilizable ────────────────────────
  function TablaVentas() {
    if (data.ventasHoy.length === 0) {
      return <EmptyState text="Aún no hay ventas registradas hoy." />;
    }
    return (
      <>
        <div className="grid grid-cols-[70px_1fr_80px_65px] sm:grid-cols-[80px_1fr_90px_75px] px-4 py-2 bg-muted/50 border-b border-border sticky top-0">
          {["Folio · Hora", "Artículos", "Método", "Total"].map((h, i) => (
            <p key={h} className={`text-[11.5px] font-medium text-muted-foreground ${i === 3 ? "text-right" : ""}`}>{h}</p>
          ))}
        </div>
        {data.ventasHoy.map((v) => (
          <div key={v.id} className="grid grid-cols-[70px_1fr_80px_65px] sm:grid-cols-[80px_1fr_90px_75px] px-4 py-3 border-b border-border/60 hover:bg-muted/40 items-center">
            <div>
              <p className="text-xs font-semibold text-primary-text">{v.folio}</p>
              <p className="text-[11.5px] text-muted-foreground">{v.hora}</p>
            </div>
            <div>
              <p className="text-xs text-foreground truncate">{v.articulos}</p>
              <p className="text-[11.5px] text-muted-foreground">{v.count} {v.count === 1 ? "artículo" : "artículos"}</p>
            </div>
            <span className={`text-[10.5px] font-medium px-1.5 py-0.5 rounded-full w-fit ${metodoBadge[v.metodo]}`}>{v.metodo}</span>
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
            <p key={h} className="text-[11.5px] font-medium text-muted-foreground">{h}</p>
          ))}
        </div>
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-[80px_1fr_90px_75px] px-4 py-3 border-b border-border/60 hover:bg-muted/40 items-center">
            <div>
              <p className="text-xs font-semibold text-primary-text">{r.folio}</p>
              <div className={`w-1.5 h-1.5 rounded-full mt-1 ${prioridadDot[r.prioridad]}`} />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">{r.cliente}</p>
              <p className="text-[11.5px] text-muted-foreground">{r.equipo}</p>
            </div>
            <span className={`text-[10.5px] font-medium px-1.5 py-0.5 rounded-full w-fit ${estadoConfig[r.status].classes}`}>
              {estadoConfig[r.status].label}
            </span>
            <p className="text-[11.5px] text-muted-foreground truncate">{r.tecnico}</p>
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
            <p key={h} className="text-[11.5px] font-medium text-muted-foreground">{h}</p>
          ))}
        </div>
        {rows.map((e) => (
          <div key={e.id} className="grid grid-cols-[80px_1fr_90px_70px] px-4 py-3 border-b border-border/60 hover:bg-muted/40 items-center">
            <div>
              <p className="text-xs font-semibold text-primary-text">{e.folio}</p>
              <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Listo</span>
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">{e.cliente}</p>
              <p className="text-[11.5px] text-muted-foreground">{e.equipo} · {e.falla ?? "Sin detalle"}</p>
              <p className="text-[11.5px] text-primary-text flex items-center gap-1 mt-0.5">
                <Phone className="w-2.5 h-2.5" /> {e.telefono}
              </p>
            </div>
            <p className="text-xs font-semibold text-emerald-600">{e.costo != null ? formatMXN(e.costo) : "—"}</p>
            <p className="text-[11.5px] text-muted-foreground">{e.espera}</p>
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
            <p key={h} className="text-[11.5px] font-medium text-muted-foreground">{h}</p>
          ))}
        </div>
        {rows.map((e) => (
          <div key={e.id} className="grid grid-cols-[80px_1fr_1fr] px-4 py-3 border-b border-border/60 hover:bg-muted/40 items-start">
            <div>
              <p className="text-xs font-semibold text-primary-text">{e.folio}</p>
              <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">Devolución</span>
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">{e.cliente}</p>
              <p className="text-[11.5px] text-muted-foreground">{e.equipo}</p>
              <p className="text-[11.5px] text-primary-text flex items-center gap-1 mt-0.5">
                <Phone className="w-2.5 h-2.5" /> {e.telefono}
              </p>
            </div>
            <div>
              <p className="text-[11.5px] text-muted-foreground">{e.razon ?? "Sin motivo especificado"}</p>
              <p className="text-[11.5px] text-amber-500 mt-0.5">{e.espera}</p>
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
        titulo: "Ventas del día", iconBg: "bg-primary/10", iconColor: "text-primary-text", icon: ShoppingCart,
        stats: [
          { label: "Total ventas", value: formatMXN(data.totalVentasHoy), color: "text-primary-text" },
          { label: "Num. de ventas", value: String(data.numVentasHoy), color: "text-foreground" },
          { label: "Ticket promedio", value: formatMXN(data.ticketPromedio), color: "text-foreground" },
        ],
        content: <TablaVentas />,
      },
      tickets: {
        titulo: "Total de tickets", iconBg: "bg-cyan-50", iconColor: "text-cyan-600", icon: Receipt,
        stats: [
          { label: "Tickets hoy", value: String(data.numVentasHoy), color: "text-cyan-600" },
          { label: "Monto total", value: formatMXN(data.totalVentasHoy), color: "text-primary-text" },
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
          { label: "Total a cobrar", value: formatMXN(data.equiposListos.reduce((s, e) => s + (e.costo ?? 0), 0)), color: "text-primary-text" },
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
                <p className="text-[11.5px] text-muted-foreground">{fechaHoy} · Actualizado al momento</p>
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
                <p className="text-[10.5px] text-muted-foreground mb-1">{s.label}</p>
                <p className={`text-sm sm:text-base font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">{cfg.content}</div>
        </div>
      </div>
    );
  };

  // Las 3 fichas de reparaciones (2026-09-18) solo se agregan cuando el
  // módulo está activo para este tenant — antes se mostraban siempre, aun
  // en negocios como una barbería que no lo usan ("Sigue mostrando
  // Reparaciones activas, dispositivos listos y devolución... Es una
  // barbería, eso no aplica ahí" — reporte de Carlos en producción).
  const metricas = [
    { label: "Ventas del día", value: formatMXN(data.totalVentasHoy), sub: data.numVentasHoy > 0 ? `${data.numVentasHoy} ${data.numVentasHoy === 1 ? "venta" : "ventas"} hoy` : "Sin ventas aún", positive: true, icon: ShoppingCart, iconBg: "bg-primary/10", iconColor: "text-primary-text", modal: "ventas" as ModalType, btnColor: "text-primary-text bg-primary/10" },
    { label: "Total de tickets", value: String(data.numVentasHoy), sub: "Transacciones hoy", positive: true, icon: Receipt, iconBg: "bg-cyan-50", iconColor: "text-cyan-600", modal: "tickets" as ModalType, btnColor: "text-cyan-600 bg-cyan-50" },
    ...(data.reparacionesActiva
      ? [
          { label: `${t("entity.repair.plural")} activas`, value: String(data.reparacionesActivasCount), sub: "En proceso", positive: true, icon: Wrench, iconBg: "bg-amber-50", iconColor: "text-amber-600", modal: "reparaciones" as ModalType, btnColor: "text-amber-600 bg-amber-50" },
          { label: `${t("entity.repair.asset")}s listos`, value: String(data.equiposListosCount), sub: "Pendientes entregar", positive: true, icon: CheckCircle, iconBg: "bg-emerald-50", iconColor: "text-emerald-600", modal: "listos" as ModalType, btnColor: "text-emerald-600 bg-emerald-50" },
          { label: `${t("entity.repair.asset")}s devolución`, value: String(data.equiposDevolucionCount), sub: "Sin reparación", positive: false, icon: RotateCcw, iconBg: "bg-red-50", iconColor: "text-red-500", modal: "devoluciones" as ModalType, btnColor: "text-red-600 bg-red-50" },
        ]
      : []),
  ];

  // Comparativo "Ventas por sucursal" (vista global, 2026-09-22) — orden de
  // mayor a menor, mismo criterio visual que el reporte diario que Carlos
  // compartió como referencia de su sistema anterior.
  const sucursalesOrdenadas = [...data.sucursales].sort((a, b) => b.ventasDia - a.ventasDia);

  return (
    <div className="p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-y-auto h-full">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-base sm:text-lg font-semibold text-foreground">
            {saludo} 👋{!enVistaGlobal && <span className="text-muted-foreground font-normal"> · {branches.find((b) => b.id === sucursalActualId)?.name ?? "Sucursal"}</span>}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 capitalize">{fechaHoy}</p>
        </div>
        <div className="text-right">
          <p className="text-[11.5px] text-muted-foreground">Total semana</p>
          <p className="text-sm sm:text-base font-bold text-foreground">{formatMXN(data.totalSemana)}</p>
        </div>
      </div>

      {/* ── Vista global / vista por sucursal ────────────────────────────
          2026-09-22, a petición de Carlos: "en el dashboard de
          administrador debe contener una vista global y una por tienda".
          Solo se ofrece cuando el negocio tiene más de una sucursal
          (data.multiSucursal) — con una sola no hay nada que comparar.
          Cambiar de vista navega a ?sucursal=<id> (mismo patrón que ya usa
          Caja) y el servidor recalcula TODO el Dashboard acotado a esa
          sucursal — no es un filtro de solo apariencia en el cliente. */}
      {data.multiSucursal && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            <button
              onClick={() => cambiarVista("global")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors ${
                enVistaGlobal ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
              }`}
            >
              Vista global
            </button>
            <button
              onClick={() => cambiarVista(sucursalActualId ?? branches[0]?.id ?? "global")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors ${
                !enVistaGlobal ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
              }`}
            >
              <Building2 className="w-3 h-3" /> Por sucursal
            </button>
          </div>
          {!enVistaGlobal && (
            <select
              value={sucursalActualId ?? ""}
              onChange={(e) => cambiarVista(e.target.value)}
              className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* ── Métricas 5 fichas ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3">
        {metricas.map((m) => (
          <div key={m.label} className="bg-card border border-border rounded-xl p-3 hover:border-primary/30 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11.5px] sm:text-xs text-muted-foreground leading-tight">{m.label}</p>
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
                <p className={`text-[10.5px] sm:text-[11.5px] ${m.positive ? "text-emerald-500" : "text-red-500"}`}>{m.sub}</p>
              </div>
              <button onClick={() => setModalAbierto(m.modal)}
                className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full hover:opacity-80 transition-opacity ${m.btnColor}`}>
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
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-primary" /><span className="text-[11.5px] sm:text-xs text-muted-foreground">Ventas</span></div>
              {data.reparacionesActiva && (
                <>
                  <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#06B6D4]" /><span className="text-[11.5px] sm:text-xs text-muted-foreground">Rep.</span></div>
                  <div className="flex items-center gap-1"><div className="w-3 h-0 border-t-2 border-dashed border-emerald-500" /><span className="text-[11.5px] sm:text-xs text-muted-foreground">Total</span></div>
                </>
              )}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={data.ventasSemana} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="cV" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
                {data.reparacionesActiva && (
                  <>
                    <linearGradient id="cR" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cT" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.10} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </>
                )}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="dia" tick={{ fontSize: 9, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={36} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="ventas" stroke="var(--primary)" strokeWidth={2} fill="url(#cV)" />
              {data.reparacionesActiva && (
                <>
                  <Area type="monotone" dataKey="reparaciones" stroke="#06B6D4" strokeWidth={2} fill="url(#cR)" />
                  <Area type="monotone" dataKey="total" stroke="#10B981" strokeWidth={2} strokeDasharray="5 3" fill="url(#cT)" />
                </>
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-foreground">Ventas por categoría</p>
            {puedeConfigurarCategorias && (
              <button onClick={abrirConfig} disabled={categoriasConfig.length === 0}
                className="w-6 h-6 rounded-lg bg-muted hover:bg-muted/70 flex items-center justify-center transition-colors disabled:opacity-40">
                <Settings className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
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
                      <span className="text-[11.5px] sm:text-xs text-muted-foreground truncate">{cat.name}</span>
                    </div>
                    <span className="text-[11.5px] sm:text-xs font-medium text-foreground ml-1">{cat.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Ventas por día y hora (selector de fecha) ─────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 mb-3">
          <div>
            <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-primary-text" /> Ventas por día y hora
            </p>
            <p className="text-xs text-muted-foreground capitalize">{formatFechaLarga(fechaSel)}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => cambiarFechaVentas(sumarDias(fechaSel, -1))} disabled={cargandoFecha}
              className="w-7 h-7 rounded-lg border border-border hover:bg-muted flex items-center justify-center disabled:opacity-40 flex-shrink-0">
              <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <input
              type="date"
              value={fechaSel}
              max={hoyStr}
              disabled={cargandoFecha}
              onChange={(e) => e.target.value && cambiarFechaVentas(e.target.value)}
              className="px-2 py-1.5 border border-border rounded-lg text-xs bg-muted focus:outline-none focus:border-primary disabled:opacity-60"
            />
            <button onClick={() => cambiarFechaVentas(sumarDias(fechaSel, 1))} disabled={cargandoFecha || esHoySeleccionado}
              className="w-7 h-7 rounded-lg border border-border hover:bg-muted flex items-center justify-center disabled:opacity-40 flex-shrink-0">
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            {!esHoySeleccionado && (
              <button onClick={() => cambiarFechaVentas(hoyStr)} disabled={cargandoFecha}
                className="text-[11.5px] font-medium px-2 py-1.5 rounded-lg text-primary-text bg-primary/10 hover:opacity-80 flex-shrink-0">
                Hoy
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {[
            { label: "Total vendido", value: formatMXN(ventasPorDia.totalVentas) },
            { label: "Ventas", value: String(ventasPorDia.numVentas) },
            { label: "Ticket promedio", value: formatMXN(ventasPorDia.ticketPromedio) },
            { label: "Mayor flujo", value: ventasPorDia.horaPico ? ventasPorDia.horaPico.horaLabel : "—" },
          ].map((s) => (
            <div key={s.label} className="bg-muted/50 rounded-xl p-2 text-center">
              <p className="text-[10.5px] text-muted-foreground mb-0.5">{s.label}</p>
              <p className="text-sm font-semibold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>

        {ventasPorDia.numVentas === 0 ? (
          <EmptyState text="No hay ventas registradas ese día." />
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={ventasPorDia.porHora} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="horaLabel" tick={{ fontSize: 8, fill: "#94A3B8" }} axisLine={false} tickLine={false} interval={2} />
              <YAxis tick={{ fontSize: 9, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={22} allowDecimals={false} />
              <Tooltip content={<CustomTooltipHora />} cursor={{ fill: "var(--primary)", fillOpacity: 0.06 }} />
              <Bar dataKey="numVentas" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        )}
        {cargandoFecha && <p className="text-[11.5px] text-muted-foreground text-center mt-2">Cargando…</p>}
      </div>

      {/* ── Reparaciones + Alertas ─────────────────────────────────────────── */}
      {/* El panel "Reparaciones activas" (izquierda) solo aparece con el
          módulo activo — mismo reporte de Carlos citado arriba. Sin él, el
          grid pasa de 2 columnas a 1 sola (Alertas) en vez de dejar un
          hueco vacío al lado. */}
      <div className={`grid grid-cols-1 ${data.reparacionesActiva ? "lg:grid-cols-2" : ""} gap-3 sm:gap-4`}>
        {data.reparacionesActiva && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-sm font-medium text-foreground">{t("entity.repair.plural")} activas</p>
              <button onClick={() => setModalAbierto("reparaciones")} className="text-xs text-primary-text hover:underline">Ver todas</button>
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
                      <p className="text-[11.5px] text-muted-foreground truncate">{r.cliente}</p>
                    </div>
                    <span className={`text-[10.5px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${estadoConfig[r.status].classes}`}>
                      {estadoConfig[r.status].label}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

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
                ...(data.reparacionesActiva
                  ? [{ label: `Nueva ${t("entity.repair.singular").toLowerCase()}`, color: "bg-cyan-500", href: `/${tenantSlug}/reparaciones` }]
                  : []),
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

      {/* ── Comparativo de ventas por sucursal (solo vista global) ───────
          2026-09-22, a petición de Carlos, referencia de su sistema
          anterior (reporte "AdminDaily") — comparación rápida de quién
          vendió más hoy, de un vistazo. No aparece en vista por sucursal
          (no hay nada que comparar viendo una sola). */}
      {data.multiSucursal && enVistaGlobal && (
        <div className="bg-card border border-border rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-foreground">Ventas por sucursal</p>
            <span className="text-xs text-muted-foreground hidden sm:block capitalize">Hoy · {fechaHoy}</span>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(120, sucursalesOrdenadas.length * 38)}>
            <BarChart data={sucursalesOrdenadas} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 9, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis dataKey="nombre" type="category" width={110} tick={{ fontSize: 10.5, fill: "#64748B" }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)", borderRadius: 8, fontSize: 12 }}
                formatter={(v: any) => [formatMXN(Number(v)), "Venta"]}
              />
              <Bar dataKey="ventasDia" radius={[0, 4, 4, 0]} barSize={18}>
                {sucursalesOrdenadas.map((_, i) => (
                  <Cell key={i} fill={coloresDisponibles[i % coloresDisponibles.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Grid sucursales ─────────────────────────────────────────────── */}
      {data.multiSucursal && enVistaGlobal && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary-text" />
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
                    <span className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full ${suc.estado === "activa" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-600"}`}>
                      {suc.estado === "activa" ? "Activa" : "En prueba"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-2 divide-x divide-y divide-border">
                    {[
                      { label: "Ventas del día", value: formatMXN(suc.ventasDia), color: "text-primary-text", sub: suc.vsAyer != null ? `${suc.vsAyer >= 0 ? "↑" : "↓"} ${Math.abs(suc.vsAyer)}% vs ayer` : "Sin datos de ayer" },
                      ...(data.reparacionesActiva
                        ? [
                            { label: "Equipos recibidos", value: String(suc.equiposRecibidos), color: "text-foreground", sub: "Hoy" },
                            { label: "Listos entrega", value: String(suc.listosEntrega), color: suc.listosEntrega > 0 ? "text-emerald-600" : "text-muted-foreground", sub: "En tienda" },
                            { label: "Devoluciones", value: String(suc.devoluciones), color: suc.devoluciones > 0 ? "text-amber-600" : "text-muted-foreground", sub: "Pendientes" },
                            { label: "Rep. activas", value: String(suc.repActivas), color: "text-foreground", sub: "En proceso" },
                          ]
                        : []),
                      { label: "Ticket promedio", value: formatMXN(suc.ticketsVenta > 0 ? Math.round(suc.ventasDia / suc.ticketsVenta) : 0), color: "text-primary-text", sub: "Por venta" },
                    ].map((m) => (
                      <div key={m.label} className="px-3 py-2.5">
                        <p className="text-[10.5px] text-muted-foreground mb-0.5">{m.label}</p>
                        <p className={`text-sm font-semibold ${m.color}`}>{m.value}</p>
                        <p className="text-[10.5px] text-muted-foreground mt-0.5">{m.sub}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-t border-border">
                    <div className="flex gap-2">
                      <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">{suc.ticketsVenta} ventas</span>
                      {data.reparacionesActiva && (
                        <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-orange-50 text-orange-700">{suc.ticketsRep} {t("entity.repair.plural").toLowerCase()}</span>
                      )}
                    </div>
                    <span className="text-[11.5px] text-muted-foreground">Total: <span className="font-semibold text-foreground">{formatMXN(suc.ventasDia)}</span></span>
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
                <Settings className="w-4 h-4 text-primary-text" />
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
                      {cat.visible && <span className="text-white text-[10.5px] font-bold">✓</span>}
                    </div>
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                    <span className="text-xs font-medium text-foreground flex-1">{cat.name}</span>
                    <span className="text-[11.5px] text-muted-foreground w-8 text-right">{cat.value}%</span>
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
            {errorCategorias && (
              <p className="px-5 pt-1 text-[11.5px] text-red-600">{errorCategorias}</p>
            )}
            <div className="flex items-center justify-between px-5 py-4 border-t border-border flex-shrink-0">
              <button onClick={() => setConfigurandoCategorias(false)}
                className="px-4 py-2 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted/40">
                Cancelar
              </button>
              <button onClick={guardarConfig} disabled={guardandoCategorias}
                className="px-5 py-2 bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground rounded-lg text-xs font-medium transition-colors">
                {guardandoCategorias ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
