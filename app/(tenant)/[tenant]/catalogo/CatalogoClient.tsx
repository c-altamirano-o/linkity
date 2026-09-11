"use client";

import { useMemo, useState } from "react";
import {
  Search, Plus, SlidersHorizontal, Smartphone, Cpu,
  Wrench, TrendingUp, Building2, Calendar, Menu, X
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { CatalogoData, TipoCatalogo } from "@/lib/catalogo-data";
import { label, type LabelDictionary } from "@/lib/labels";

interface BranchOption {
  id: string;
  name: string;
}

interface CatalogoClientProps {
  data: CatalogoData;
  labels: LabelDictionary;
  branches: BranchOption[];
}

const TIPO_LABELS: Record<TipoCatalogo, string> = {
  PRODUCT: "Productos",
  PART: "Refacciones",
  SERVICE: "Servicios",
};

// Colores fijos por tipo — funcionan como etiquetas categóricas (igual que
// los badges de método de pago en el Dashboard), no como marca ni como
// indicador de estatus, así que se quedan igual sin importar el tema.
const tipoConfig: Record<TipoCatalogo, { label: string; icon: typeof Smartphone; color: string; bg: string }> = {
  PRODUCT: { label: TIPO_LABELS.PRODUCT, icon: Smartphone, color: "text-purple-600", bg: "bg-purple-50" },
  PART:    { label: TIPO_LABELS.PART,    icon: Cpu,        color: "text-orange-600", bg: "bg-orange-50" },
  SERVICE: { label: TIPO_LABELS.SERVICE, icon: Wrench,     color: "text-emerald-600", bg: "bg-emerald-50" },
};

const TIPOS_ORDEN: TipoCatalogo[] = ["PRODUCT", "PART", "SERVICE"];

const SIN_CATEGORIA_ID = "__sin_categoria__";
const TODAS_SUCURSALES_ID = "__todas__";

const periodos = ["Hoy", "Semana", "Mes", "Año", "Personalizado"];

// Paleta para las barras de "Top ventas": el primer lugar usa el color de
// marca del tema activo, el resto son acentos fijos solo para distinguir
// productos entre sí (no representan ningún estatus).
const RANKING_COLORS = ["var(--primary)", "#06B6D4", "#8B5CF6", "#10B981", "#F59E0B"];

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const stockBadge = (isService: boolean, stock: number) => {
  if (isService) return <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600">Servicio</span>;
  if (stock === 0) return <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-red-50 text-red-600">Agotado</span>;
  if (stock > 0 && stock <= 2) return <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600">Stock: {stock}</span>;
  return <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600">Stock: {stock}</span>;
};

const rankBadgeClass = (i: number) => {
  if (i === 0) return "bg-amber-50 text-amber-600";
  if (i === 1) return "bg-slate-100 text-slate-500";
  if (i === 2) return "bg-orange-50 text-orange-600";
  return "bg-muted text-muted-foreground";
};

const MX_OFFSET_MS = 6 * 60 * 60 * 1000;
function mxParts(d: Date) {
  const mx = new Date(d.getTime() - MX_OFFSET_MS);
  return { y: mx.getUTCFullYear(), m: mx.getUTCMonth(), day: mx.getUTCDate() };
}

function matchesPeriodo(fechaISO: string, periodo: string, fechaInicio: string, fechaFin: string): boolean {
  const fecha = new Date(fechaISO);
  const ahora = new Date();
  if (periodo === "Hoy") {
    const hoy = mxParts(ahora);
    const f = mxParts(fecha);
    return f.y === hoy.y && f.m === hoy.m && f.day === hoy.day;
  }
  if (periodo === "Semana") {
    const diffDias = Math.floor((ahora.getTime() - fecha.getTime()) / (24 * 3600 * 1000));
    return diffDias >= 0 && diffDias < 7;
  }
  if (periodo === "Mes") {
    const hoy = mxParts(ahora);
    const f = mxParts(fecha);
    return f.y === hoy.y && f.m === hoy.m;
  }
  if (periodo === "Año") {
    return mxParts(fecha).y === mxParts(ahora).y;
  }
  if (periodo === "Personalizado") {
    if (!fechaInicio || !fechaFin) return true;
    const inicio = new Date(`${fechaInicio}T00:00:00`);
    const fin = new Date(`${fechaFin}T23:59:59`);
    return fecha >= inicio && fecha <= fin;
  }
  return true;
}

export default function CatalogoClient({ data, labels, branches }: CatalogoClientProps) {
  const { categorias, productos, ventasDetalle } = data;

  const categoriasPorTipo = useMemo(() => {
    const map: Record<TipoCatalogo, { id: string; name: string }[]> = { PRODUCT: [], PART: [], SERVICE: [] };
    for (const c of categorias) map[c.type].push({ id: c.id, name: c.name });
    for (const tipo of TIPOS_ORDEN) {
      const hayNoCategorizados = productos.some((p) => p.type === tipo && p.categoryId === null);
      if (hayNoCategorizados) map[tipo].push({ id: SIN_CATEGORIA_ID, name: "Sin categoría" });
    }
    return map;
  }, [categorias, productos]);

  const primerTipoConProductos = TIPOS_ORDEN.find((t) => productos.some((p) => p.type === t)) ?? "PRODUCT";

  const [tipoActivo, setTipoActivo] = useState<TipoCatalogo>(primerTipoConProductos);
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(
    categoriasPorTipo[primerTipoConProductos][0]?.id ?? null
  );
  const [busqueda, setBusqueda] = useState("");
  const [tabActivo, setTabActivo] = useState<"catalogo" | "topventas">("catalogo");
  const [sucursal, setSucursal] = useState(TODAS_SUCURSALES_ID);
  const [periodo, setPeriodo] = useState("Semana");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [sidebarMovil, setSidebarMovil] = useState(false);

  const seleccionarTipo = (tipo: TipoCatalogo) => {
    setTipoActivo(tipo);
    setCategoriaActiva(categoriasPorTipo[tipo][0]?.id ?? null);
    setTabActivo("catalogo");
    setSidebarMovil(false);
  };

  const productosFiltrados = productos.filter((p) => {
    const matchTipo = p.type === tipoActivo;
    const matchCat = categoriaActiva === null
      ? true
      : categoriaActiva === SIN_CATEGORIA_ID
      ? p.categoryId === null
      : p.categoryId === categoriaActiva;
    const q = busqueda.toLowerCase();
    const matchSearch = p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
    return matchTipo && matchCat && matchSearch;
  });

  const conteo = (tipo: TipoCatalogo) => productos.filter((p) => p.type === tipo).length;
  const conteoCat = (tipo: TipoCatalogo, catId: string) =>
    productos.filter((p) => p.type === tipo && (catId === SIN_CATEGORIA_ID ? p.categoryId === null : p.categoryId === catId)).length;

  const sucursalNombre = sucursal === TODAS_SUCURSALES_ID
    ? "Todas las sucursales"
    : branches.find((b) => b.id === sucursal)?.name ?? "Sucursal";

  const periodoLabel: Record<string, string> = {
    "Hoy": "hoy", "Semana": "esta semana", "Mes": "este mes", "Año": "este año",
    "Personalizado": fechaInicio && fechaFin ? `${fechaInicio} — ${fechaFin}` : "período personalizado",
  };

  const topVentas = useMemo(() => {
    const filtradas = ventasDetalle.filter((v) => {
      const matchSucursal = sucursal === TODAS_SUCURSALES_ID || v.branchId === sucursal;
      return matchSucursal && matchesPeriodo(v.fecha, periodo, fechaInicio, fechaFin);
    });
    const porProducto = new Map<string, { nombre: string; categoria: string; unidades: number; total: number }>();
    for (const v of filtradas) {
      const prev = porProducto.get(v.productId);
      if (prev) {
        prev.unidades += v.quantity;
        prev.total += v.subtotal;
      } else {
        porProducto.set(v.productId, { nombre: v.productName, categoria: v.categoryName, unidades: v.quantity, total: v.subtotal });
      }
    }
    return Array.from(porProducto.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map((item, i) => ({
        ...item,
        corto: item.nombre.length > 16 ? `${item.nombre.slice(0, 14)}…` : item.nombre,
        color: RANKING_COLORS[i % RANKING_COLORS.length],
      }));
  }, [ventasDetalle, sucursal, periodo, fechaInicio, fechaFin]);

  const totalTop = topVentas.reduce((s, p) => s + p.total, 0);

  // Contenido del sidebar (reutilizado en desktop y drawer móvil)
  const sidebarContent = (
    <>
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        <span className="text-sm font-medium text-foreground">{label(labels, "module.catalog.name")}</span>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 bg-primary text-primary-foreground text-[10px] font-medium px-2 py-1.5 rounded-lg">
            <Plus className="w-2.5 h-2.5" /> Nuevo
          </button>
          <button onClick={() => setSidebarMovil(false)}
            className="md:hidden w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {TIPOS_ORDEN.map((tipo) => {
          const cfg = tipoConfig[tipo];
          const Icono = cfg.icon;
          const cats = categoriasPorTipo[tipo];
          return (
            <div key={tipo} className="mb-3">
              <div
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg mb-1 cursor-pointer ${
                  tipoActivo === tipo && tabActivo === "catalogo" ? cfg.bg : "bg-muted"
                }`}
                onClick={() => seleccionarTipo(tipo)}>
                <Icono className={`w-3.5 h-3.5 ${cfg.color}`} />
                <span className={`text-xs font-semibold ${tipoActivo === tipo && tabActivo === "catalogo" ? cfg.color : "text-muted-foreground"}`}>
                  {cfg.label}
                </span>
                <span className="ml-auto text-[9px] text-muted-foreground">{conteo(tipo)}</span>
              </div>
              {tipoActivo === tipo && tabActivo === "catalogo" && cats.map((cat) => (
                <div key={cat.id}
                  onClick={() => { setCategoriaActiva(cat.id); setSidebarMovil(false); }}
                  className={`flex items-center justify-between pl-6 pr-2 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
                    categoriaActiva === cat.id ? `${cfg.bg} ${cfg.color} font-medium` : "text-muted-foreground hover:bg-muted"
                  }`}>
                  <span>{cat.name}</span>
                  <span className="text-[9px] text-muted-foreground">{conteoCat(tipo, cat.id)}</span>
                </div>
              ))}
              {cats.length === 0 && tipoActivo === tipo && tabActivo === "catalogo" && (
                <p className="pl-6 pr-2 py-1.5 text-[10px] text-muted-foreground/70">Sin categorías aún</p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );

  return (
    <div className="flex h-full">

      {/* ── Sidebar desktop (oculto en móvil) ────────────── */}
      <div className="hidden md:flex w-48 flex-col bg-card border-r border-border flex-shrink-0">
        {sidebarContent}
      </div>

      {/* ── Drawer móvil ─────────────────────────────────── */}
      {sidebarMovil && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setSidebarMovil(false)} />
          <div className="md:hidden fixed left-0 top-0 bottom-0 w-56 bg-card z-50 flex flex-col shadow-xl">
            {sidebarContent}
          </div>
        </>
      )}

      {/* ── Contenido principal ──────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Tabs superiores + botón menú móvil */}
        <div className="flex bg-card border-b border-border px-2 sm:px-4 overflow-x-auto">

          <button onClick={() => setSidebarMovil(true)}
            className="md:hidden flex items-center justify-center w-8 h-full mr-1 text-muted-foreground flex-shrink-0">
            <Menu className="w-4 h-4" />
          </button>

          {TIPOS_ORDEN.map((tipo) => {
            const cfg = tipoConfig[tipo];
            const Icono = cfg.icon;
            return (
              <button key={tipo}
                onClick={() => seleccionarTipo(tipo)}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                  tabActivo === "catalogo" && tipoActivo === tipo
                    ? "text-primary border-primary"
                    : "text-muted-foreground border-transparent hover:text-foreground"
                }`}>
                <Icono className="w-3 h-3" />
                {cfg.label}
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                  tabActivo === "catalogo" && tipoActivo === tipo
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {conteo(tipo)}
                </span>
              </button>
            );
          })}

          <button onClick={() => setTabActivo("topventas")}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ml-auto whitespace-nowrap flex-shrink-0 ${
              tabActivo === "topventas"
                ? "text-amber-600 border-amber-500"
                : "text-muted-foreground border-transparent hover:text-foreground"
            }`}>
            <TrendingUp className="w-3 h-3" />
            Top ventas
          </button>
        </div>

        {/* ── Categorías en móvil (fila horizontal) ─────── */}
        {tabActivo === "catalogo" && categoriasPorTipo[tipoActivo].length > 0 && (
          <div className="md:hidden flex gap-1.5 px-3 py-2 border-b border-border overflow-x-auto bg-card flex-shrink-0">
            {categoriasPorTipo[tipoActivo].map((cat) => (
              <button key={cat.id} onClick={() => setCategoriaActiva(cat.id)}
                className={`px-3 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                  categoriaActiva === cat.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}>
                {cat.name} <span className="opacity-60">({conteoCat(tipoActivo, cat.id)})</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Catálogo ────────────────────────────────────── */}
        {tabActivo === "catalogo" && (
          <>
            <div className="bg-card border-b border-border px-3 sm:px-4 py-2 flex items-center gap-2 sm:gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre o SKU..."
                  className="w-full pl-7 pr-3 py-2 border border-border rounded-lg text-xs bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
              <button className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors flex-shrink-0">
                <SlidersHorizontal className="w-3 h-3" />
                <span className="hidden sm:inline">Filtros</span>
              </button>
            </div>

            {productos.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <Plus className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm font-medium text-foreground mb-1">Aún no hay nada en tu catálogo</p>
                <p className="text-xs text-muted-foreground max-w-xs">Agrega tus primeros productos, refacciones o servicios para empezar a venderlos.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 content-start">
                {productosFiltrados.map((p) => (
                  <div key={p.id} className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer">
                    <div className="h-14 sm:h-16 bg-muted flex items-center justify-center text-2xl border-b border-border">
                      {p.emoji}
                    </div>
                    <div className="p-2.5 sm:p-3">
                      <p className="text-xs font-medium text-foreground leading-tight mb-1 line-clamp-2">{p.name}</p>
                      <p className="text-[9px] text-muted-foreground mb-2 truncate">{p.sku ?? "Sin SKU"}</p>
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <span className="text-xs font-bold text-primary">{formatMXN(p.price)}</span>
                        {stockBadge(p.isService, p.stock)}
                      </div>
                      {!p.isService && p.cost > 0 && (
                        <p className="text-[9px] text-muted-foreground mt-1">Costo: {formatMXN(p.cost)}</p>
                      )}
                    </div>
                  </div>
                ))}
                {productosFiltrados.length === 0 && (
                  <p className="col-span-full text-center text-xs text-muted-foreground py-6">Sin resultados para este filtro.</p>
                )}
                <button className="flex flex-col items-center justify-center border border-dashed border-border rounded-xl hover:border-primary/40 hover:bg-muted transition-all min-h-[130px] sm:min-h-[140px]">
                  <Plus className="w-6 h-6 text-muted-foreground/50 mb-1" />
                  <span className="text-[10px] text-muted-foreground/50">Agregar</span>
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Top Ventas ───────────────────────────────────── */}
        {tabActivo === "topventas" && (
          <div className="flex-1 overflow-y-auto p-3 sm:p-4">

            {/* Filtros — apilados en móvil */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-2 sm:gap-3 mb-4 p-3 bg-card border border-border rounded-xl">

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-muted-foreground flex-shrink-0">Sucursal:</span>
                <select value={sucursal} onChange={(e) => setSucursal(e.target.value)}
                  className="flex-1 sm:flex-none px-2 py-1.5 border border-border rounded-lg text-xs bg-muted focus:outline-none focus:border-primary">
                  <option value={TODAS_SUCURSALES_ID}>Todas las sucursales</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div className="hidden sm:block w-px h-5 bg-border" />

              <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-muted-foreground flex-shrink-0">Período:</span>
                <div className="flex gap-1 overflow-x-auto">
                  {periodos.map((p) => (
                    <button key={p} onClick={() => setPeriodo(p)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                        periodo === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                      }`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {periodo === "Personalizado" && (
                <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                  <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)}
                    className="px-2 py-1.5 border border-border rounded-lg text-xs focus:outline-none focus:border-primary" />
                  <span className="text-xs text-muted-foreground">—</span>
                  <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)}
                    className="px-2 py-1.5 border border-border rounded-lg text-xs focus:outline-none focus:border-primary" />
                </div>
              )}
            </div>

            {topVentas.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-10 text-center bg-card border border-border rounded-xl">
                <TrendingUp className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm font-medium text-foreground mb-1">Sin ventas en este período</p>
                <p className="text-xs text-muted-foreground">Prueba con otro rango de fechas o sucursal.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">

                  <div className="bg-card border border-border rounded-xl p-4">
                    <p className="text-sm font-medium text-foreground mb-1">Top 5 por ingresos</p>
                    <p className="text-xs text-muted-foreground mb-3 capitalize">{sucursalNombre} · {periodoLabel[periodo]}</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={topVentas} layout="vertical"
                        margin={{ top: 0, right: 55, bottom: 0, left: 10 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="corto"
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          axisLine={false} tickLine={false} width={75} />
                        <Tooltip
                          formatter={(v: any) => [formatMXN(Number(v)), "Ingresos"]}
                          labelFormatter={(lbl) => topVentas.find((d) => d.corto === lbl)?.nombre || lbl}
                        />
                        <Bar dataKey="total" radius={[0, 4, 4, 0]}
                          label={{ position: "right", fontSize: 9, fill: "var(--muted-foreground)", formatter: (v: any) => formatMXN(Number(v)) }}>
                          {topVentas.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-border">
                      <p className="text-sm font-medium text-foreground">Ranking de productos</p>
                      <p className="text-xs text-muted-foreground capitalize">{periodoLabel[periodo]}</p>
                    </div>
                    <div className="divide-y divide-border">
                      {topVentas.map((item, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors">
                          <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${rankBadgeClass(i)}`}>
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{item.nombre}</p>
                            <p className="text-[10px] text-muted-foreground">{item.categoria} · {item.unidades} unidades</p>
                          </div>
                          <span className="text-xs font-semibold text-primary flex-shrink-0">{formatMXN(item.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-start sm:items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <TrendingUp className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5 sm:mt-0" />
                  <p className="text-xs text-emerald-700">
                    Mostrando datos de <strong>{sucursalNombre}</strong> · {periodoLabel[periodo]} · Total generado: <strong>{formatMXN(totalTop)}</strong>
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
