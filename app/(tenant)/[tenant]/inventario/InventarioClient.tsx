"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, FileDown, ChevronDown, Plus, AlertTriangle, XCircle, Building2 } from "lucide-react";
import type { ProductoInventario } from "@/lib/inventario-data";
import { ajustarStock, type AjusteTipo } from "@/lib/inventario-actions";
import { label, type LabelDictionary } from "@/lib/labels";
import { confirmarSalirSinGuardar, useAdvertirCierrePestaña } from "@/lib/confirmar-cierre";
import { ProductoIcono } from "@/lib/catalogo-iconos";

interface BranchOption {
  id: string;
  name: string;
}

interface InventarioClientProps {
  productos: ProductoInventario[];
  labels: LabelDictionary;
  branches: BranchOption[];
  tenantSlug: string;
  tenantName: string;
  // 2026-09-24, a petición de Carlos (revisión de permisos, seguridad
  // anti-fraude): false cuando el rol de este empleado de PIN no tiene
  // Role.verMontosCaja — `productos` ya llega con `cost` en 0 desde el
  // servidor en ese caso (ver redactarMontosInventario, lib/inventario-data.ts).
  // "Costo" es precio de COMPRA (margen del negocio), a diferencia de
  // "Precio venta" que un Cajero sí necesita para vender — por eso solo el
  // costo se oculta, no toda la pantalla. No con un candado: se omite la
  // ficha "Valor del inventario" y la columna "Costo" enteras (tabla y
  // exportables), mismo criterio que el resto de la auditoría. Default true.
  puedeVerMontos?: boolean;
}

const TODAS_SUCURSALES_ID = "__todas__";
const TODAS_CATEGORIAS = "__todas__";

const filtrosTabs = ["Todos", "Productos", "Refacciones", "Stock bajo", "Agotados"] as const;

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const getStockStatus = (stock: number, min: number) => {
  if (stock === 0) return "out";
  if (stock <= min) return "low";
  return "ok";
};

interface VistaProducto extends ProductoInventario {
  stock: number;
  minStock: number;
}

export default function InventarioClient({ productos, labels, branches, tenantSlug, tenantName, puedeVerMontos = true }: InventarioClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<(typeof filtrosTabs)[number]>("Todos");
  const [sucursal, setSucursal] = useState(TODAS_SUCURSALES_ID);
  const [categoriaFiltro, setCategoriaFiltro] = useState(TODAS_CATEGORIAS);

  const [modalAjuste, setModalAjuste] = useState<VistaProducto | null>(null);
  const [ajusteCantidad, setAjusteCantidad] = useState("");
  const [ajusteTipo, setAjusteTipo] = useState<AjusteTipo>("entrada");
  const [ajusteBranchId, setAjusteBranchId] = useState("");
  const [ajusteError, setAjusteError] = useState<string | null>(null);

  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [mostrarExportMenu, setMostrarExportMenu] = useState(false);
  const filtrosRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filtrosRef.current && !filtrosRef.current.contains(e.target as Node)) setMostrarFiltros(false);
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setMostrarExportMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const categoriasDisponibles = useMemo(
    () => Array.from(new Set(productos.map((p) => p.categoryName))).sort((a, b) => a.localeCompare(b)),
    [productos]
  );

  const vista: VistaProducto[] = useMemo(() => {
    return productos.map((p) => {
      if (sucursal === TODAS_SUCURSALES_ID) {
        return { ...p, stock: p.stockTotal, minStock: p.minStockTotal };
      }
      const enSucursal = p.porSucursal.find((s) => s.branchId === sucursal);
      return { ...p, stock: enSucursal?.stock ?? 0, minStock: enSucursal?.minStock ?? 0 };
    });
  }, [productos, sucursal]);

  const productosFiltrados = vista.filter((p) => {
    const q = busqueda.toLowerCase();
    const matchSearch = p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
    const status = getStockStatus(p.stock, p.minStock);
    const matchFiltro =
      filtro === "Todos" ? true :
      filtro === "Productos" ? p.type === "PRODUCT" :
      filtro === "Refacciones" ? p.type === "PART" :
      filtro === "Stock bajo" ? status === "low" :
      filtro === "Agotados" ? status === "out" : true;
    const matchCategoria = categoriaFiltro === TODAS_CATEGORIAS ? true : p.categoryName === categoriaFiltro;
    return matchSearch && matchFiltro && matchCategoria;
  });

  const filtrosActivos = categoriaFiltro !== TODAS_CATEGORIAS ? 1 : 0;

  const nombreArchivo = (ext: string) =>
    `Inventario_${sucursalNombreArchivo()}_${new Date().toISOString().slice(0, 10)}.${ext}`;

  function sucursalNombreArchivo() {
    const n = sucursal === TODAS_SUCURSALES_ID ? "Todas_sucursales" : branches.find((b) => b.id === sucursal)?.name ?? "Sucursal";
    return n.replace(/\s+/g, "_");
  }

  // ── CSV ──────────────────────────────────────────────────
  // 2026-09-24: "Costo" y "Valor inventario" son las mismas dos columnas de
  // margen que se ocultan en la tabla/ficha — se omiten aquí también para
  // que un rol sin Role.verMontosCaja no las obtenga vía exportar.
  const exportarCSV = () => {
    const lines = [
      `# ${tenantName} — Inventario`,
      `# Sucursal: ${sucursal === TODAS_SUCURSALES_ID ? "Todas las sucursales" : branches.find((b) => b.id === sucursal)?.name ?? ""}`,
      `# Generado el: ${new Date().toLocaleString("es-MX")}`,
      puedeVerMontos
        ? `Producto,SKU,Categoria,Tipo,Stock actual,Stock minimo,Precio venta,Costo,Valor inventario`
        : `Producto,SKU,Categoria,Tipo,Stock actual,Stock minimo,Precio venta`,
      ...productosFiltrados.map((p) =>
        puedeVerMontos
          ? `"${p.name}",${p.sku ?? ""},"${p.categoryName}",${p.type === "PRODUCT" ? "Producto" : "Refaccion"},${p.stock},${p.minStock},${p.price},${p.cost},${(p.cost * p.stock).toFixed(2)}`
          : `"${p.name}",${p.sku ?? ""},"${p.categoryName}",${p.type === "PRODUCT" ? "Producto" : "Refaccion"},${p.stock},${p.minStock},${p.price}`
      ),
    ];
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo("csv");
    a.click();
    URL.revokeObjectURL(url);
    setMostrarExportMenu(false);
  };

  // ── XLSX ─────────────────────────────────────────────────
  // 2026-09-24: mismo recorte que exportarCSV — "Costo"/"Valor inventario"
  // se omiten como columnas cuando este rol no tiene Role.verMontosCaja.
  const exportarXLSX = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Linkity Soluciones";
    const numCols = puedeVerMontos ? 9 : 7;
    const ultimaCol = String.fromCharCode("A".charCodeAt(0) + numCols - 1);
    const ws = wb.addWorksheet("Inventario", { views: [{ state: "frozen", ySplit: 4 }] });
    const PU = "4F46E5", LP = "EDE9FE";
    const BD = { style: "thin" as const, color: { argb: "E2E8F0" } };
    const bdr = { top: BD, bottom: BD, left: BD, right: BD };
    ws.columns = puedeVerMontos
      ? [{ width: 28 }, { width: 14 }, { width: 18 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 16 }]
      : [{ width: 28 }, { width: 14 }, { width: 18 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 14 }];
    const addMerged = (range: string, text: string, bg: string, fc: string, sz: number, bold = false, align: any = "left") => {
      ws.mergeCells(range);
      const c = ws.getCell(range.split(":")[0]);
      c.value = text;
      c.font = { bold, size: sz, color: { argb: fc } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      c.alignment = { horizontal: align, vertical: "middle" };
    };
    addMerged(`A1:${ultimaCol}1`, `${tenantName} — Inventario`, PU, "FFFFFF", 14, true);
    ws.getRow(1).height = 26;
    const sucursalTexto = sucursal === TODAS_SUCURSALES_ID ? "Todas las sucursales" : branches.find((b) => b.id === sucursal)?.name ?? "";
    addMerged(`A2:${ultimaCol}2`, `Sucursal: ${sucursalTexto}  ·  Generado el: ${new Date().toLocaleString("es-MX")}`, LP, "374151", 9);
    ws.addRow([]);

    const headerLabels = puedeVerMontos
      ? ["Producto", "SKU", "Categoría", "Tipo", "Stock actual", "Stock mínimo", "Precio venta", "Costo", "Valor inventario"]
      : ["Producto", "SKU", "Categoría", "Tipo", "Stock actual", "Stock mínimo", "Precio venta"];
    const header = ws.addRow(headerLabels);
    header.eachCell((c) => {
      c.font = { bold: true, size: 10, color: { argb: "FFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "1E293B" } };
      c.alignment = { horizontal: "left", vertical: "middle" };
      c.border = bdr;
    });

    for (const p of productosFiltrados) {
      const valores = puedeVerMontos
        ? [p.name, p.sku ?? "", p.categoryName, p.type === "PRODUCT" ? "Producto" : "Refacción", p.stock, p.minStock, p.price, p.cost, Number((p.cost * p.stock).toFixed(2))]
        : [p.name, p.sku ?? "", p.categoryName, p.type === "PRODUCT" ? "Producto" : "Refacción", p.stock, p.minStock, p.price];
      const row = ws.addRow(valores);
      row.eachCell((c, colNumber) => {
        c.border = bdr;
        if (colNumber >= 7) c.numFmt = "$#,##0.00";
      });
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo("xlsx");
    a.click();
    URL.revokeObjectURL(url);
    setMostrarExportMenu(false);
  };

  const totalProductos = productos.length;
  const valorInventario = vista.reduce((s, p) => s + p.cost * p.stock, 0);
  const stockBajo = vista.filter((p) => getStockStatus(p.stock, p.minStock) === "low").length;
  const agotados = vista.filter((p) => p.stock === 0).length;

  const sucursalNombre = sucursal === TODAS_SUCURSALES_ID
    ? "Todas las sucursales"
    : branches.find((b) => b.id === sucursal)?.name ?? "Sucursal";

  // 2026-09-22, a petición de Carlos ("pide confirmación para cerrarlas
  // cuando abandone la acción a mitad del proceso"): antes este modal se
  // cerraba sin más (click fuera no hacía nada; "Cancelar" cerraba sin
  // preguntar) — perdiendo lo capturado sin aviso.
  const cancelarModal = () => {
    if (confirmarSalirSinGuardar()) setModalAjuste(null);
  };

  // Aviso al cerrar/recargar la PESTAÑA del navegador mientras el modal de
  // ajuste de stock sigue abierto (ver el comentario largo en
  // lib/confirmar-cierre.ts) — complementa a cancelarModal() de arriba, que
  // solo cubre cerrar el modal sin salir de la pestaña.
  useAdvertirCierrePestaña(modalAjuste !== null);

  const abrirModal = (p: VistaProducto) => {
    setModalAjuste(p);
    setAjusteCantidad("");
    setAjusteTipo("entrada");
    setAjusteError(null);
    setAjusteBranchId(sucursal !== TODAS_SUCURSALES_ID ? sucursal : branches[0]?.id ?? "");
  };

  const guardarAjuste = () => {
    if (!modalAjuste) return;
    const cantidad = Number(ajusteCantidad);
    if (!ajusteCantidad || Number.isNaN(cantidad) || cantidad < 0) {
      setAjusteError("Ingresa una cantidad válida");
      return;
    }
    if (!ajusteBranchId) {
      setAjusteError("Selecciona una sucursal");
      return;
    }
    setAjusteError(null);
    startTransition(async () => {
      const res = await ajustarStock({
        tenantSlug,
        productId: modalAjuste.id,
        branchId: ajusteBranchId,
        tipo: ajusteTipo,
        cantidad,
      });
      if (!res.ok) {
        setAjusteError(res.error);
        return;
      }
      setModalAjuste(null);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col h-full">

      {/* ── Topbar ──────────────────────────────────────────── */}
      <div className="bg-card border-b border-border px-3 sm:px-5 py-2.5 flex items-center gap-2 sm:gap-3 flex-wrap">
        <span className="text-sm font-medium text-foreground flex-1 min-w-0">{label(labels, "module.inventory.name")}</span>

        <div className="flex items-center gap-2 order-last sm:order-none w-full sm:w-auto">
          <Building2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <select value={sucursal} onChange={(e) => setSucursal(e.target.value)}
            className="flex-1 sm:flex-none px-2 py-2 border border-border rounded-lg text-xs bg-muted focus:outline-none focus:border-primary">
            <option value={TODAS_SUCURSALES_ID}>Todas las sucursales</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        <div className="relative order-last sm:order-none w-full sm:w-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto o SKU..."
            className="w-full sm:w-48 pl-7 pr-3 py-2 border border-border rounded-lg text-xs bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
        </div>

        <div className="flex items-center gap-2">
          <div className="relative" ref={filtrosRef}>
            <button onClick={() => setMostrarFiltros((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-2 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted">
              <SlidersHorizontal className="w-3 h-3" />
              <span className="hidden sm:inline">Filtros</span>
              {filtrosActivos > 0 && (
                <span className="w-4 h-4 flex items-center justify-center bg-primary text-primary-foreground rounded-full text-[10.5px] font-semibold">
                  {filtrosActivos}
                </span>
              )}
            </button>
            {mostrarFiltros && (
              <div className="absolute right-0 top-full mt-1.5 bg-card border border-border rounded-xl shadow-lg z-30 p-3 w-56">
                <label className="block text-[11.5px] font-medium text-muted-foreground mb-1">Categoría</label>
                <select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}
                  className="w-full px-2.5 py-2 border border-border rounded-lg text-xs bg-muted focus:outline-none focus:border-primary">
                  <option value={TODAS_CATEGORIAS}>Todas las categorías</option>
                  {categoriasDisponibles.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                {filtrosActivos > 0 && (
                  <button onClick={() => setCategoriaFiltro(TODAS_CATEGORIAS)}
                    className="mt-2 text-[11.5px] text-primary-text font-medium hover:underline">
                    Limpiar filtro
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="relative" ref={exportRef}>
            <button onClick={() => setMostrarExportMenu((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-2 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted">
              <FileDown className="w-3 h-3" />
              <span className="hidden sm:inline">Exportar</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${mostrarExportMenu ? "rotate-180" : ""}`} />
            </button>
            {mostrarExportMenu && (
              <div className="absolute right-0 top-full mt-1.5 bg-card border border-border rounded-xl shadow-lg z-30 overflow-hidden w-52">
                {[
                  { icon: "📄", label: "CSV", desc: "Compatible con cualquier sistema", fn: exportarCSV },
                  { icon: "📊", label: "Excel (XLSX)", desc: "Con formato y colores", fn: exportarXLSX },
                ].map((opt) => (
                  <button key={opt.label} onClick={opt.fn}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left border-b border-border/60 last:border-0">
                    <span className="text-base">{opt.icon}</span>
                    <div>
                      <p className="text-xs font-medium text-foreground">{opt.label}</p>
                      <p className="text-[11.5px] text-muted-foreground">{opt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Métricas — 2×2 en móvil, 4 en línea en desktop ── */}
      {/* 2026-09-24: "Valor del inventario" (Σ costo × stock) es dinero de
          margen puro — se omite la ficha entera (no un candado) para quien
          no tiene Role.verMontosCaja, mismo patrón que el resto de la
          auditoría (ver lib/dashboard-data.ts). */}
      <div className={`grid gap-2 sm:gap-3 px-3 sm:px-5 py-3 bg-card border-b border-border ${puedeVerMontos ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
        {[
          { label: "Total productos", value: totalProductos, sub: "En catálogo", color: "text-foreground", subColor: "text-muted-foreground" },
          ...(puedeVerMontos
            ? [{ label: "Valor del inventario", value: formatMXN(valorInventario), sub: "Precio de costo", color: "text-foreground", subColor: "text-muted-foreground" }]
            : []),
          { label: "Stock bajo", value: stockBajo, sub: "Requieren surtir", color: "text-amber-600", subColor: "text-amber-500", icon: AlertTriangle },
          { label: "Agotados", value: agotados, sub: "Sin stock", color: "text-red-600", subColor: "text-red-400", icon: XCircle },
        ].map((m) => (
          <div key={m.label} className="bg-muted rounded-lg p-2.5 sm:p-3">
            <p className="text-[10.5px] sm:text-[11.5px] text-muted-foreground mb-1">{m.label}</p>
            <div className="flex items-center gap-1.5">
              {m.icon && <m.icon className={`w-4 h-4 ${m.color}`} />}
              <p className={`text-base sm:text-[18px] font-semibold ${m.color}`}>{m.value}</p>
            </div>
            <p className={`text-[10.5px] sm:text-[11.5px] mt-0.5 ${m.subColor}`}>{m.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Filtros tabs ─────────────────────────────────────── */}
      <div className="flex gap-2 px-3 sm:px-5 py-2 bg-card border-b border-border overflow-x-auto">
        {filtrosTabs.map((tab) => (
          <button key={tab} onClick={() => setFiltro(tab)}
            className={`px-3 py-1 rounded-full text-[11.5px] font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              filtro === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {/* ── Tabla con scroll horizontal en móvil ─────────────── */}
      {productos.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <Plus className="w-8 h-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium text-foreground mb-1">Aún no hay productos en tu inventario</p>
          <p className="text-xs text-muted-foreground max-w-xs">Los productos y refacciones que agregues en el Catálogo aparecerán aquí con su stock.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[680px]">
            <thead className="sticky top-0 bg-card border-b border-border z-10">
              <tr>
                {/* 2026-09-24: "Costo" es la misma columna de margen que se
                    omite en los exportables — no se muestra a quien no
                    tiene Role.verMontosCaja. */}
                {["Producto", "Categoría", "Stock actual", "Stock mínimo", "Precio venta", ...(puedeVerMontos ? ["Costo"] : []), "Acción"].map((h) => (
                  <th key={h} className="text-left text-[11.5px] font-medium text-muted-foreground px-3 sm:px-4 py-2.5 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.map((p) => {
                const status = getStockStatus(p.stock, p.minStock);
                const rowBg = status === "out" ? "bg-red-50/50" : status === "low" ? "bg-amber-50/50" : "";
                const pct = p.minStock > 0 ? Math.min((p.stock / (p.minStock * 3)) * 100, 100) : p.stock > 0 ? 100 : 0;
                return (
                  <tr key={p.id} className={`border-b border-border hover:bg-muted transition-colors ${rowBg}`}>
                    <td className="px-3 sm:px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-muted rounded-lg flex items-center justify-center text-sm flex-shrink-0">
                          <ProductoIcono value={p.emoji} className="w-4 h-4 text-primary-text" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate max-w-[140px]">{p.name}</p>
                          <p className="text-[10.5px] text-muted-foreground">{p.sku ?? "Sin SKU"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-2.5">
                      <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {p.categoryName}
                      </span>
                    </td>
                    <td className="px-3 sm:px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden flex-shrink-0">
                          <div className={`h-full rounded-full transition-all ${
                            status === "out" ? "bg-red-500" : status === "low" ? "bg-amber-500" : "bg-emerald-500"
                          }`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={`text-xs font-medium ${
                          status === "out" ? "text-red-600" : status === "low" ? "text-amber-600" : "text-foreground"
                        }`}>
                          {p.stock}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 text-xs text-muted-foreground">{p.minStock}</td>
                    <td className="px-3 sm:px-4 py-2.5 text-xs font-medium text-foreground">{formatMXN(p.price)}</td>
                    {puedeVerMontos && (
                      <td className="px-3 sm:px-4 py-2.5 text-xs text-muted-foreground">{formatMXN(p.cost)}</td>
                    )}
                    <td className="px-3 sm:px-4 py-2.5">
                      <button onClick={() => abrirModal(p)}
                        className={`text-[11.5px] px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap ${
                          status === "out"
                            ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
                            : status === "low"
                            ? "bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100"
                            : "bg-card border-border text-muted-foreground hover:bg-muted"
                        }`}>
                        {status !== "ok" ? "Surtir" : "Ajustar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {productosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-xs text-muted-foreground py-6">Sin resultados para este filtro.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal ajuste — bottom sheet en móvil ─────────────── */}
      {modalAjuste && (
        <div
          className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50"
          onClick={cancelarModal}
        >
          <div className="bg-card rounded-t-2xl sm:rounded-2xl p-5 w-full sm:w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-foreground mb-1">Ajuste de stock</h2>
            <p className="text-xs text-muted-foreground mb-4 truncate">{modalAjuste.name}</p>

            {branches.length > 1 && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Sucursal</label>
                <select value={ajusteBranchId} onChange={(e) => setAjusteBranchId(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary">
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}

            <div className="flex items-center justify-between bg-muted rounded-lg p-3 mb-4">
              <span className="text-xs text-muted-foreground">Stock actual{branches.length > 1 ? " en esta sucursal" : ""}</span>
              <span className="text-sm font-semibold text-foreground">
                {modalAjuste.porSucursal.find((s) => s.branchId === ajusteBranchId)?.stock ?? 0}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              {(["entrada", "salida", "ajuste"] as const).map((tipo) => (
                <button key={tipo} onClick={() => setAjusteTipo(tipo)}
                  className={`py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                    ajusteTipo === tipo
                      ? tipo === "entrada" ? "bg-emerald-500 text-white"
                        : tipo === "salida" ? "bg-red-500 text-white"
                        : "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}>
                  {tipo === "entrada" ? "Entrada" : tipo === "salida" ? "Salida" : "Ajuste"}
                </button>
              ))}
            </div>

            <div className="mb-1">
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {ajusteTipo === "ajuste" ? "Nuevo stock total" : "Cantidad"}
              </label>
              <input type="number" min={0} value={ajusteCantidad} onChange={(e) => setAjusteCantidad(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
            </div>
            {ajusteError && <p className="text-[12.5px] text-red-600 mb-3">{ajusteError}</p>}
            {!ajusteError && <div className="mb-3" />}

            <div className="flex gap-2">
              <button onClick={cancelarModal} disabled={isPending}
                className="flex-1 py-2 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={guardarAjuste} disabled={isPending}
                className="flex-1 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                {isPending ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
