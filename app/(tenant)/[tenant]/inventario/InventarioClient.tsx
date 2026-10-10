"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, FileDown, ChevronDown, Plus, AlertTriangle, XCircle, Building2, ListChecks, X } from "lucide-react";
import type { ProductoInventario } from "@/lib/inventario-data";
import { ajustarStock, ajustarStockLote, type AjusteTipo } from "@/lib/inventario-actions";
import { calcularCambiosStock, limpiarEntradaStock } from "@/lib/captura-stock";
import { label, type LabelDictionary } from "@/lib/labels";
import { confirmarSalirSinGuardar, useAdvertirCierrePestaña } from "@/lib/confirmar-cierre";
import { ProductoIcono } from "@/lib/catalogo-iconos";
import { useTourDesdeUrl, TOUR_INVENTARIO_AJUSTAR } from "@/lib/tours";

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

  useTourDesdeUrl("inventario-ajustar-stock", TOUR_INVENTARIO_AJUSTAR);

  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<(typeof filtrosTabs)[number]>("Todos");
  const parteSing = label(labels, "catalog.part.singular");
  const partePlural = label(labels, "catalog.part.plural");
  // 2026-10-10, a petición de Carlos: la captura de stock es la vista normal
  // de Inventario, y el stock es por sucursal — por eso se abre ya en la
  // primera sucursal (con una sola, igual que siempre). "Todas las
  // sucursales" sigue en el selector, pero ahí el stock es de solo lectura.
  const [sucursal, setSucursal] = useState(branches[0]?.id ?? TODAS_SUCURSALES_ID);
  const [categoriaFiltro, setCategoriaFiltro] = useState(TODAS_CATEGORIAS);

  const [modalAjuste, setModalAjuste] = useState<VistaProducto | null>(null);
  const [ajusteCantidad, setAjusteCantidad] = useState("");
  const [ajusteTipo, setAjusteTipo] = useState<AjusteTipo>("entrada");
  const [ajusteBranchId, setAjusteBranchId] = useState("");
  const [ajusteError, setAjusteError] = useState<string | null>(null);
  // 2026-10-05, a petición de Carlos (auditoría de Inventario): aviso cuando
  // una "salida" pidió descontar más de lo que había disponible y el
  // servidor recortó la cantidad real aplicada (ver ajustarStock,
  // lib/inventario-actions.ts) — antes el modal se cerraba igual que un
  // ajuste exitoso normal, sin que el empleado se enterara de que no se
  // descontó todo lo que tecleó. No es un error (el ajuste sí se guardó),
  // por eso vive aparte de ajusteError y el modal se queda abierto hasta que
  // el empleado lo confirma.
  const [ajusteAviso, setAjusteAviso] = useState<string | null>(null);

  // ── Captura rápida de stock (2026-10-10, a petición de Carlos: "una lista
  // en columnas solo con la parte de stock editable... solo ir dando Enter
  // hasta terminar y al final darle guardar"; y después: "déjala activada
  // por default y agrega un botón para detalles al final de cada fila").
  // El número tecleado es el stock NUEVO TOTAL de la sucursal elegida
  // (lib/captura-stock.ts). Lo individual (entrada, salida, ajuste) vive en
  // el botón "Detalles" de cada fila.
  // productId → texto tecleado. Solo cuenta lo que difiere del stock actual.
  const [ediciones, setEdiciones] = useState<Record<string, string>>({});
  const [notaCaptura, setNotaCaptura] = useState<{ tipo: "ok" | "aviso" | "error"; texto: string } | null>(null);
  const inputsCapturaRef = useRef<(HTMLInputElement | null)[]>([]);
  const guardarCapturaBtnRef = useRef<HTMLButtonElement>(null);

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

  const puedeCapturar = sucursal !== TODAS_SUCURSALES_ID;

  // Cambios pendientes de la captura rápida: se calculan sobre TODOS los
  // productos de la sucursal (no solo los filtrados), porque el empleado
  // puede teclear, cambiar de categoría y seguir tecleando.
  const cambiosCaptura = useMemo(
    () => calcularCambiosStock(vista.map((p) => ({ id: p.id, stock: p.stock })), ediciones),
    [vista, ediciones]
  );

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
          ? `"${p.name}",${p.sku ?? ""},"${p.categoryName}",${p.type === "PRODUCT" ? "Producto" : parteSing},${p.stock},${p.minStock},${p.price},${p.cost},${(p.cost * p.stock).toFixed(2)}`
          : `"${p.name}",${p.sku ?? ""},"${p.categoryName}",${p.type === "PRODUCT" ? "Producto" : parteSing},${p.stock},${p.minStock},${p.price}`
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
        ? [p.name, p.sku ?? "", p.categoryName, p.type === "PRODUCT" ? "Producto" : parteSing, p.stock, p.minStock, p.price, p.cost, Number((p.cost * p.stock).toFixed(2))]
        : [p.name, p.sku ?? "", p.categoryName, p.type === "PRODUCT" ? "Producto" : parteSing, p.stock, p.minStock, p.price];
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
    // Si ya se guardó el ajuste y solo queda el aviso de recorte de la
    // "salida" (ver guardarAjuste), ya no hay nada pendiente que se pueda
    // perder — se cierra directo, sin preguntar.
    if (ajusteAviso || confirmarSalirSinGuardar()) {
      setModalAjuste(null);
      setAjusteAviso(null);
    }
  };

  // Aviso al cerrar/recargar la PESTAÑA del navegador mientras el modal de
  // ajuste de stock sigue abierto (ver el comentario largo en
  // lib/confirmar-cierre.ts) — complementa a cancelarModal() de arriba, que
  // solo cubre cerrar el modal sin salir de la pestaña.
  useAdvertirCierrePestaña(modalAjuste !== null);
  // Lo mismo para la captura rápida: con cambios sin guardar, cerrar o
  // recargar la pestaña pide confirmación.
  useAdvertirCierrePestaña(cambiosCaptura.length > 0);

  const abrirModal = (p: VistaProducto) => {
    setModalAjuste(p);
    setAjusteCantidad("");
    setAjusteTipo("entrada");
    setAjusteError(null);
    setAjusteAviso(null);
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
    setAjusteAviso(null);
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
      router.refresh();
      // El stock disponible no alcanzaba para descontar la cantidad completa
      // pedida — se avisa cuánto se descontó de verdad en vez de cerrar el
      // modal como si hubiera salido tal cual se pidió.
      if (ajusteTipo === "salida" && res.cantidadAplicada < cantidad) {
        setAjusteAviso(
          `Solo había ${res.cantidadAplicada} unidad${res.cantidadAplicada === 1 ? "" : "es"} disponible${res.cantidadAplicada === 1 ? "" : "s"} — se descontó eso, no las ${cantidad} que pediste. El stock quedó en 0.`
        );
        return;
      }
      setModalAjuste(null);
    });
  };

  // Lo tecleado es de UNA sucursal: al cambiar de sucursal con cambios sin
  // guardar se pide confirmación para no mezclar capturas.
  const cambiarSucursal = (nueva: string) => {
    if (nueva === sucursal) return;
    if (cambiosCaptura.length > 0 && !confirmarSalirSinGuardar()) return;
    setEdiciones({});
    setNotaCaptura(null);
    setSucursal(nueva);
  };

  const descartarCambios = () => {
    if (cambiosCaptura.length > 0 && !confirmarSalirSinGuardar()) return;
    setEdiciones({});
    setNotaCaptura(null);
  };

  const guardarCaptura = () => {
    if (!puedeCapturar || cambiosCaptura.length === 0) return;
    setNotaCaptura(null);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof ajustarStockLote>>;
      try {
        res = await ajustarStockLote({ tenantSlug, branchId: sucursal, cambios: cambiosCaptura });
      } catch {
        setNotaCaptura({ tipo: "error", texto: "No se pudo conectar con el servidor — inténtalo de nuevo. Lo que tecleaste sigue aquí." });
        return;
      }
      if (!res.ok) {
        setNotaCaptura({ tipo: "error", texto: res.error });
        return;
      }
      // Lo aplicado deja de estar pendiente; lo que falló se queda tecleado.
      const fallidosIds = new Set(res.fallidos.map((f) => f.productId));
      setEdiciones((prev) => {
        const resto: Record<string, string> = {};
        for (const [id, v] of Object.entries(prev)) if (fallidosIds.has(id)) resto[id] = v;
        return resto;
      });
      router.refresh();
      if (res.fallidos.length > 0) {
        const nombres = res.fallidos
          .slice(0, 3)
          .map((f) => `${productos.find((p) => p.id === f.productId)?.name ?? "Producto"} (${f.error})`)
          .join(", ");
        const mas = res.fallidos.length > 3 ? ` y ${res.fallidos.length - 3} más` : "";
        setNotaCaptura({
          tipo: "error",
          texto: `Se guardaron ${res.aplicados}, pero ${res.fallidos.length} no: ${nombres}${mas}. Siguen en pantalla para que los corrijas.`,
        });
        return;
      }
      setNotaCaptura({
        tipo: "ok",
        texto: `Stock actualizado en ${res.aplicados} producto${res.aplicados === 1 ? "" : "s"} de ${sucursalNombre}.`,
      });
    });
  };

  // Enter/↓ baja a la siguiente fila y Shift+Enter/↑ sube. Tras la última
  // fila, Enter lleva el foco a "Guardar" (otro Enter lo pulsa): no se
  // guarda en lote por accidente al teclear el último número.
  const teclaCaptura = (e: React.KeyboardEvent<HTMLInputElement>, i: number, total: number) => {
    if (e.nativeEvent.isComposing) return;
    const atras = (e.key === "Enter" && e.shiftKey) || e.key === "ArrowUp";
    const adelante = (e.key === "Enter" && !e.shiftKey) || e.key === "ArrowDown";
    if (!atras && !adelante) return;
    e.preventDefault();
    if (atras) {
      inputsCapturaRef.current[i - 1]?.focus();
    } else if (i + 1 < total) {
      inputsCapturaRef.current[i + 1]?.focus();
    } else if (e.key === "Enter") {
      guardarCapturaBtnRef.current?.focus();
    }
  };

  return (
    <div className="flex flex-col h-full">

      {/* ── Topbar ──────────────────────────────────────────── */}
      <div className="bg-card border-b border-border px-3 sm:px-5 py-2.5 flex items-center gap-2 sm:gap-3 flex-wrap">
        <span className="text-sm font-medium text-foreground flex-1 min-w-0">{label(labels, "module.inventory.name")}</span>

        <div className="flex items-center gap-2 order-last sm:order-none w-full sm:w-auto">
          <Building2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <select value={sucursal} onChange={(e) => cambiarSucursal(e.target.value)}
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
              className="btn-secondary flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs">
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
                    className="btn-ghost mt-2 -mx-1.5 px-1.5 py-0.5 rounded-md text-[11.5px]">
                    Limpiar filtro
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="relative" ref={exportRef}>
            <button onClick={() => setMostrarExportMenu((v) => !v)}
              className="btn-secondary flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs">
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
            {tab === "Refacciones" ? partePlural : tab}
          </button>
        ))}
      </div>

      {/* ── Captura rápida: aviso del modo + resultado del guardado ── */}
      {productos.length > 0 && (
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap px-3 sm:px-5 py-2.5 bg-primary/5 border-b border-primary/20">
          <ListChecks className="w-4 h-4 text-primary-text flex-shrink-0" />
          {puedeCapturar ? (
            <p className="text-xs text-foreground flex-1 min-w-[200px]">
              <span className="font-semibold">Captura rápida — {sucursalNombre}.</span>{" "}
              <span className="text-muted-foreground">
                Escribe el <strong>stock nuevo total</strong> y pulsa Enter para bajar a la siguiente fila. Lo que dejes
                igual no se modifica. Para entradas, salidas o ajustes de un solo producto, usa <strong>Detalles</strong>.
              </span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground flex-1 min-w-[200px]">
              <span className="font-semibold text-foreground">Estás viendo el total de todas las sucursales.</span>{" "}
              El stock se captura por sucursal: elige una en el selector de arriba para editarlo.
            </p>
          )}
          {puedeCapturar && (
            <>
              <span className="text-xs font-medium text-foreground">
                {cambiosCaptura.length === 0 ? "Sin cambios" : `${cambiosCaptura.length} cambio${cambiosCaptura.length === 1 ? "" : "s"}`}
              </span>
              {cambiosCaptura.length > 0 && (
                <button onClick={descartarCambios} disabled={isPending} className="btn-secondary px-3 py-1.5 rounded-lg text-xs">
                  Descartar
                </button>
              )}
              <button ref={guardarCapturaBtnRef} onClick={guardarCaptura} disabled={isPending || cambiosCaptura.length === 0}
                className="btn-primary px-3 py-1.5 rounded-lg text-xs">
                {isPending ? "Guardando…" : `Guardar${cambiosCaptura.length > 0 ? ` (${cambiosCaptura.length})` : ""}`}
              </button>
            </>
          )}
        </div>
      )}
      {notaCaptura && (
        <div
          className={`flex items-start gap-2 px-3 sm:px-5 py-2 text-xs border-b ${
            notaCaptura.tipo === "ok"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : notaCaptura.tipo === "aviso"
              ? "bg-amber-50 text-amber-800 border-amber-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}
          role={notaCaptura.tipo === "error" ? "alert" : "status"}
        >
          <p className="flex-1">{notaCaptura.texto}</p>
          <button onClick={() => setNotaCaptura(null)} aria-label="Cerrar aviso" className="flex-shrink-0 opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Tabla con scroll horizontal en móvil ─────────────── */}
      {productos.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <Plus className="w-8 h-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium text-foreground mb-1">Aún no hay productos en tu inventario</p>
          <p className="text-xs text-muted-foreground max-w-xs">Los productos y {partePlural.toLowerCase()} que agregues en el Catálogo aparecerán aquí con su stock.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[420px]">
            <thead className="sticky top-0 bg-card border-b border-border z-10">
              <tr>
                <th className="text-left text-[11.5px] font-medium text-muted-foreground px-3 sm:px-4 py-2.5">Producto</th>
                <th className="hidden md:table-cell text-left text-[11.5px] font-medium text-muted-foreground px-3 sm:px-4 py-2.5">Categoría</th>
                <th className="hidden lg:table-cell text-left text-[11.5px] font-medium text-muted-foreground px-3 sm:px-4 py-2.5 whitespace-nowrap">Stock mínimo</th>
                <th className="hidden lg:table-cell text-left text-[11.5px] font-medium text-muted-foreground px-3 sm:px-4 py-2.5 whitespace-nowrap">Precio venta</th>
                {puedeVerMontos && (
                  <th className="hidden xl:table-cell text-left text-[11.5px] font-medium text-muted-foreground px-3 sm:px-4 py-2.5">Costo</th>
                )}
                <th className="text-right text-[11.5px] font-medium text-muted-foreground px-3 sm:px-4 py-2.5 w-44 whitespace-nowrap">
                  {puedeCapturar ? "Stock nuevo total" : "Stock (total)"}
                </th>
                <th className="text-right text-[11.5px] font-medium text-muted-foreground px-3 sm:px-4 py-2.5 w-24">Acción</th>
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.map((p, i) => {
                const status = getStockStatus(p.stock, p.minStock);
                const valor = ediciones[p.id] ?? String(p.stock);
                const cambiado = cambiosCaptura.some((c) => c.productId === p.id);
                const fondo = cambiado ? "bg-primary/5" : status === "out" ? "bg-red-50/50" : status === "low" ? "bg-amber-50/50" : "";
                return (
                  <tr key={p.id} className={`border-b border-border ${fondo}`}>
                    <td className="px-3 sm:px-4 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="relative w-7 h-7 bg-muted rounded-lg flex items-center justify-center text-sm flex-shrink-0">
                          <ProductoIcono value={p.emoji} imageUrl={p.image} className="w-4 h-4 text-primary-text" imageClassName="absolute inset-0 w-full h-full object-cover rounded-lg" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate max-w-[180px] sm:max-w-[260px]">{p.name}</p>
                          <p className="text-[10.5px] text-muted-foreground">
                            {p.sku ?? "Sin SKU"}
                            {status !== "ok" && (
                              <span className={`ml-1.5 font-medium ${status === "out" ? "text-red-600" : "text-amber-600"}`}>
                                · {status === "out" ? "Agotado" : "Stock bajo"}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-3 sm:px-4 py-1.5">
                      <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {p.categoryName}
                      </span>
                    </td>
                    <td className="hidden lg:table-cell px-3 sm:px-4 py-1.5 text-xs text-muted-foreground">{p.minStock}</td>
                    <td className="hidden lg:table-cell px-3 sm:px-4 py-1.5 text-xs font-medium text-foreground">{formatMXN(p.price)}</td>
                    {puedeVerMontos && (
                      <td className="hidden xl:table-cell px-3 sm:px-4 py-1.5 text-xs text-muted-foreground">{formatMXN(p.cost)}</td>
                    )}
                    <td className="px-3 sm:px-4 py-1.5">
                      <div className="flex items-center justify-end gap-2">
                        {puedeCapturar ? (
                          <>
                            {cambiado && <span className="text-[10.5px] text-muted-foreground whitespace-nowrap">antes {p.stock}</span>}
                            <input
                              ref={(el) => { inputsCapturaRef.current[i] = el; }}
                              type="text"
                              inputMode="numeric"
                              autoComplete="off"
                              aria-label={`Stock nuevo de ${p.name}`}
                              value={valor}
                              disabled={isPending}
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) => {
                                const limpio = limpiarEntradaStock(e.target.value);
                                setEdiciones((prev) => ({ ...prev, [p.id]: limpio }));
                              }}
                              onBlur={() => {
                                // Campo vacío = sin cambio: vuelve a mostrar el stock actual.
                                setEdiciones((prev) => {
                                  if (prev[p.id] !== "") return prev;
                                  const { [p.id]: _omitido, ...resto } = prev;
                                  return resto;
                                });
                              }}
                              onKeyDown={(e) => teclaCaptura(e, i, productosFiltrados.length)}
                              className="w-24 px-2.5 py-1.5 border border-border rounded-lg text-sm text-right bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-60"
                            />
                          </>
                        ) : (
                          <span className={`text-sm font-medium px-2.5 ${
                            status === "out" ? "text-red-600" : status === "low" ? "text-amber-600" : "text-foreground"
                          }`}>
                            {p.stock}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-1.5 text-right">
                      <button onClick={() => abrirModal(p)}
                        data-tour="inventario-ajustar"
                        className="text-[11.5px] px-2.5 py-1 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted transition-colors whitespace-nowrap">
                        Detalles
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
            <h2 className="text-sm font-semibold text-foreground mb-1">Detalles del stock</h2>
            <p className="text-xs text-muted-foreground mb-4 truncate">{modalAjuste.name}</p>

            {branches.length > 1 && (
              <div className="mb-4" data-tour="inventario-sucursal">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Sucursal</label>
                <select value={ajusteBranchId} onChange={(e) => setAjusteBranchId(e.target.value)} disabled={!!ajusteAviso}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary disabled:opacity-60">
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

            <div className="grid grid-cols-3 gap-2 mb-4" data-tour="inventario-tipo">
              {(["entrada", "salida", "ajuste"] as const).map((tipo) => (
                <button key={tipo} onClick={() => setAjusteTipo(tipo)} disabled={!!ajusteAviso}
                  className={`py-2 rounded-lg text-xs font-medium capitalize transition-colors disabled:opacity-60 ${
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

            <div className="mb-1" data-tour="inventario-cantidad">
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {ajusteTipo === "ajuste" ? "Nuevo stock total" : "Cantidad"}
              </label>
              <input type="number" min={0} value={ajusteCantidad} onChange={(e) => setAjusteCantidad(e.target.value)}
                placeholder="0" disabled={!!ajusteAviso}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-60" />
            </div>
            {ajusteError && <p className="text-[12.5px] text-red-600 mb-3">{ajusteError}</p>}
            {/* 2026-10-05: aviso de que una "salida" no pudo descontar la
                cantidad completa pedida por falta de stock disponible (ver
                guardarAjuste) — el ajuste YA se guardó con lo que sí había,
                esto solo informa que fue menos de lo tecleado. */}
            {ajusteAviso && (
              <p className="text-[12.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                {ajusteAviso}
              </p>
            )}
            {!ajusteError && !ajusteAviso && <div className="mb-3" />}

            <div className="flex gap-2">
              {ajusteAviso ? (
                <button onClick={cancelarModal}
                  className="btn-primary flex-1 py-2 rounded-lg text-xs">
                  Entendido
                </button>
              ) : (
                <>
                  <button onClick={cancelarModal} disabled={isPending}
                    className="btn-secondary flex-1 py-2 rounded-lg text-xs">
                    Cancelar
                  </button>
                  <button onClick={guardarAjuste} disabled={isPending}
                    data-tour="inventario-guardar" data-enter-primario
                    className="btn-primary flex-1 py-2 rounded-lg text-xs">
                    {isPending ? "Guardando…" : "Guardar"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
