"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Plus, SlidersHorizontal, Smartphone, Cpu,
  Wrench, TrendingUp, Building2, Calendar, Menu, X,
  Sparkles, Upload, Download, Loader2, CheckCircle2, AlertTriangle, Wand2,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { CatalogoData, TipoCatalogo, ProductoCatalogo } from "@/lib/catalogo-data";
import { label, type LabelDictionary } from "@/lib/labels";
import { ProductoIcono, ICON_PREFIX, ICONOS } from "@/lib/catalogo-iconos";
import { confirmarSalirSinGuardar, useAdvertirCierrePestaña } from "@/lib/confirmar-cierre";
import {
  crearProductoAction, editarProductoAction, crearCategoriaAction,
  cargarCatalogoArranqueAction, importarProductosAction, autoAsignarIconosAction,
  type TipoProductoInput, type FilaImportacion,
} from "@/app/actions/catalogo-actions";

interface BranchOption {
  id: string;
  name: string;
}

interface CatalogoClientProps {
  data: CatalogoData;
  labels: LabelDictionary;
  branches: BranchOption[];
  tenantSlug: string;
  businessType: string | null;
  // 2026-09-24, a petición de Carlos (revisión de permisos, seguridad
  // anti-fraude): false cuando el rol de este empleado de PIN no tiene
  // Role.verMontosCaja — catalogo/page.tsx ya manda `data.ventasDetalle`
  // vacío en ese caso (ver lib/catalogo-data.ts), así que aquí solo falta
  // ocultar la pestaña "Top ventas" en sí (es dinero: ventas por producto
  // en pesos) — no con un candado, se omite el botón por completo, mismo
  // criterio que el resto de la auditoría. Default true (admin / roles con
  // el permiso, no rompe llamadas viejas).
  puedeVerMontos?: boolean;
}

interface FormProducto {
  name: string;
  sku: string;
  price: string;
  cost: string;
  type: TipoProductoInput;
  categoryId: string;
  emoji: string;
  isActive: boolean;
  // Solo se usa al CREAR (no al editar — editar nunca ha tocado Inventory,
  // ver nota en catalogo-actions.ts). "1" por default para que coincida
  // con lo que ya se guardaba antes en automático, pero ahora visible y
  // editable aquí mismo en vez de una segunda visita a Inventario.
  stock: string;
}

const FORM_VACIO: FormProducto = {
  name: "", sku: "", price: "", cost: "", type: "PRODUCT", categoryId: "", emoji: "", isActive: true, stock: "1",
};

const TIPO_LABELS: Record<TipoCatalogo, string> = {
  PRODUCT: "Productos",
  PART: "Refacciones",
  SERVICE: "Servicios",
};

// Solo como placeholder visual del campo emoji en el modal — el valor real
// que se guarda cuando el usuario no escribe nada es null (el fallback por
// tipo se resuelve en lib/catalogo-data.ts al leer, no aquí).
const TYPE_FALLBACK_EMOJI_LOCAL: Record<TipoProductoInput, string> = {
  PRODUCT: "📦",
  PART: "🔩",
  SERVICE: "🔧",
};

// Convierte una clave PascalCase de la galería de íconos (ej.
// "BatteryCharging") en un texto legible para el tooltip del selector
// ("Battery Charging") — evita mantener una segunda lista de nombres en
// español a mano para cada ícono nuevo que se agregue a ICONOS.
const humanizarIcono = (clave: string) => clave.replace(/([a-z0-9])([A-Z])/g, "$1 $2");

// Colores por tipo — a petición explícita de Carlos ("que los colores
// cambien de acuerdo al theme que seleccione el usuario, eso nos dará una
// capa de personalización más completa"), estos YA NO son colores fijos de
// Tailwind (antes bg-purple-50/text-purple-600, etc.) sino los tokens de
// tema de lib/theme-presets.ts (--primary, --accent, --secondary) — cambian
// solos si el negocio cambia de tema en Configuración, sin tocar código.
// Se conserva la distinción visual entre los 3 tipos (para que la pestaña/
// categoría activa y la miniatura de cada producto sigan siendo
// reconocibles a simple vista) usando 3 tokens distintos del mismo tema en
// vez de un solo color para los tres. A diferencia de los badges de
// estatus/método de pago (esos SÍ siguen fijos siempre, ver el criterio en
// lib/theme-presets.ts), este es un caso donde Carlos pidió expresamente lo
// contrario: que sí cedan al tema.
const tipoConfig: Record<TipoCatalogo, { label: string; icon: typeof Smartphone; color: string; bg: string }> = {
  PRODUCT: { label: TIPO_LABELS.PRODUCT, icon: Smartphone, color: "text-primary-text", bg: "bg-primary/10" },
  PART:    { label: TIPO_LABELS.PART,    icon: Cpu,        color: "text-accent-foreground", bg: "bg-accent" },
  SERVICE: { label: TIPO_LABELS.SERVICE, icon: Wrench,     color: "text-secondary-foreground", bg: "bg-secondary" },
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
  if (isService) return <span className="text-[10.5px] px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600">Servicio</span>;
  if (stock === 0) return <span className="text-[10.5px] px-1.5 py-0.5 rounded-md bg-red-50 text-red-600">Agotado</span>;
  if (stock > 0 && stock <= 2) return <span className="text-[10.5px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600">Stock: {stock}</span>;
  return <span className="text-[10.5px] px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600">Stock: {stock}</span>;
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

export default function CatalogoClient({ data, labels, branches, tenantSlug, businessType, puedeVerMontos = true }: CatalogoClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
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

  // ── Catálogo de arranque por rubro ───────────────────────────
  const [cargandoArranque, setCargandoArranque] = useState(false);
  const [errorArranque, setErrorArranque] = useState<string | null>(null);

  function cargarCatalogoArranque() {
    setErrorArranque(null);
    setCargandoArranque(true);
    startTransition(async () => {
      const res = await cargarCatalogoArranqueAction({ tenantSlug });
      setCargandoArranque(false);
      if (!res.ok) {
        setErrorArranque(res.error);
        return;
      }
      router.refresh();
    });
  }

  // ── Importar catálogo (CSV/Excel) ────────────────────────────
  const [modalImportar, setModalImportar] = useState(false);
  const [importando, setImportando] = useState(false);
  const [errorImportar, setErrorImportar] = useState<string | null>(null);
  const [resultadoImportar, setResultadoImportar] = useState<{ creados: number; omitidos: { fila: number; motivo: string }[] } | null>(null);

  // 2026-09-22, a petición de Carlos ("pide confirmación para cerrarlas
  // cuando abandone la acción a mitad del proceso"): antes este modal
  // cerraba sin más (click fuera, X o Cancelar) — a diferencia del modal de
  // producto de abajo, aquí SÍ hay un caso en el que no hace falta
  // preguntar: una vez que `resultadoImportar` ya existe, la importación ya
  // terminó (por eso el botón cambia a "Cerrar") y no hay nada pendiente
  // que se pierda.
  const cancelarModalImportar = () => {
    if (resultadoImportar || confirmarSalirSinGuardar()) setModalImportar(false);
  };

  // ── Auto-asignar íconos (2026-09-26, a petición de Carlos) ────
  // Arregla de un clic los productos que se quedaron con el emoji genérico
  // de tipo (📦/🔩/🔧) porque nunca tuvieron un ícono — típicamente tras
  // importar un catálogo de otro sistema (el CSV no trae íconos). Nunca
  // toca un producto que ya tiene un ícono puesto a mano, así que es
  // seguro correrlo varias veces (ver autoAsignarIconosAction).
  const [modalAutoIconos, setModalAutoIconos] = useState(false);
  const [autoIconosPendiente, setAutoIconosPendiente] = useState(false);
  const [autoIconosError, setAutoIconosError] = useState<string | null>(null);
  const [autoIconosResultado, setAutoIconosResultado] = useState<{ asignados: number; sinCoincidencia: number } | null>(null);

  function ejecutarAutoIconos() {
    setAutoIconosError(null);
    setAutoIconosPendiente(true);
    startTransition(async () => {
      const res = await autoAsignarIconosAction({ tenantSlug });
      setAutoIconosPendiente(false);
      if (!res.ok) {
        setAutoIconosError(res.error);
        return;
      }
      setAutoIconosResultado({ asignados: res.asignados, sinCoincidencia: res.sinCoincidencia });
      if (res.asignados > 0) router.refresh();
    });
  }

  function abrirModalAutoIconos() {
    setAutoIconosError(null);
    setAutoIconosResultado(null);
    setModalAutoIconos(true);
  }

  const TIPO_ARCHIVO_A_ENUM: Record<string, TipoProductoInput> = {
    producto: "PRODUCT", productos: "PRODUCT", product: "PRODUCT",
    refaccion: "PART", "refacción": "PART", refacciones: "PART", part: "PART",
    servicio: "SERVICE", servicios: "SERVICE", service: "SERVICE",
  };

  function descargarPlantilla() {
    const encabezado = "Nombre,Tipo,Precio,Costo,SKU,Categoria";
    const ejemplo = "Ejemplo: Cambio de pantalla,Servicio,800,,,Servicios";
    const csv = [
      "# Tipo debe ser: Producto, Refaccion o Servicio",
      "# Costo, SKU y Categoria son opcionales — puedes dejarlos en blanco",
      encabezado,
      ejemplo,
    ].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_catalogo_linkity.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function parsearCSV(texto: string): FilaImportacion[] {
    const lineas = texto.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
    if (lineas.length === 0) return [];
    // La primera línea no-comentario es el encabezado, se descarta.
    const filas: FilaImportacion[] = [];
    for (let i = 1; i < lineas.length; i++) {
      const cols = lineas[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const [nombre, tipoTexto, precioTexto, costoTexto, sku, categoria] = cols;
      if (!nombre) continue;
      filas.push({
        fila: i + 1,
        name: nombre,
        type: TIPO_ARCHIVO_A_ENUM[(tipoTexto ?? "").toLowerCase()] ?? ("" as TipoProductoInput),
        price: Number(precioTexto),
        cost: costoTexto ? Number(costoTexto) : null,
        sku: sku || null,
        categoryName: categoria || null,
      });
    }
    return filas;
  }

  async function parsearXLSX(file: File): Promise<FilaImportacion[]> {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    const filas: FilaImportacion[] = [];
    // Fila 1 = encabezado, se descarta. Cualquier fila que empiece con "#"
    // en la primera celda se trata como comentario y se ignora.
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const primera = String(row.getCell(1).value ?? "");
      if (primera.trim().startsWith("#")) return;
      const nombre = String(row.getCell(1).value ?? "").trim();
      if (!nombre) return;
      const tipoTexto = String(row.getCell(2).value ?? "").trim().toLowerCase();
      const precioVal = row.getCell(3).value;
      const costoVal = row.getCell(4).value;
      const sku = String(row.getCell(5).value ?? "").trim();
      const categoria = String(row.getCell(6).value ?? "").trim();
      filas.push({
        fila: rowNumber,
        name: nombre,
        type: TIPO_ARCHIVO_A_ENUM[tipoTexto] ?? ("" as TipoProductoInput),
        price: typeof precioVal === "number" ? precioVal : Number(precioVal),
        cost: costoVal != null && costoVal !== "" ? (typeof costoVal === "number" ? costoVal : Number(costoVal)) : null,
        sku: sku || null,
        categoryName: categoria || null,
      });
    });
    return filas;
  }

  async function manejarArchivoImportar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setErrorImportar(null);
    setResultadoImportar(null);
    setImportando(true);

    try {
      const esExcel = file.name.toLowerCase().endsWith(".xlsx");
      const filas = esExcel ? await parsearXLSX(file) : parsearCSV(await file.text());

      if (filas.length === 0) {
        setErrorImportar("No se encontraron filas para importar en el archivo.");
        setImportando(false);
        return;
      }

      const res = await importarProductosAction({ tenantSlug, filas });
      setImportando(false);
      if (!res.ok) {
        setErrorImportar(res.error);
        return;
      }
      setResultadoImportar({ creados: res.creados, omitidos: res.omitidos });
      if (res.creados > 0) router.refresh();
    } catch (err) {
      setImportando(false);
      setErrorImportar("No se pudo leer el archivo. Verifica que sea un .csv o .xlsx válido.");
    }
  }

  const seleccionarTipo = (tipo: TipoCatalogo) => {
    setTipoActivo(tipo);
    setCategoriaActiva(categoriasPorTipo[tipo][0]?.id ?? null);
    setTabActivo("catalogo");
    setSidebarMovil(false);
  };

  // ── Modal crear/editar producto ──────────────────────────────
  const [modalAbierto, setModalAbierto] = useState(false);

  // 2026-09-22, a petición de Carlos: el click fuera de este modal ya
  // preguntaba antes de cerrar (2026-09-21), pero la X y "Cancelar" seguían
  // cerrando sin preguntar nada — mismo hueco que el resto de los módulos
  // auditados ese día.
  const cancelarModalProducto = () => {
    if (confirmarSalirSinGuardar()) setModalAbierto(false);
  };

  // Aviso al cerrar/recargar la pestaña del navegador mientras cualquiera
  // de los 2 modales de captura de este módulo sigue abierto (ver el
  // comentario largo en lib/confirmar-cierre.ts).
  useAdvertirCierrePestaña(modalAbierto || modalImportar);
  const [editando, setEditando] = useState<ProductoCatalogo | null>(null);
  const [form, setForm] = useState<FormProducto>(FORM_VACIO);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [nuevaCategoria, setNuevaCategoria] = useState(false);
  const [nombreNuevaCategoria, setNombreNuevaCategoria] = useState("");

  // Selector de ícono del modal: "icono" muestra la galería de ICONOS
  // (misma paleta vectorial que ya usa el catálogo de arranque),  "emoji"
  // muestra el campo de texto libre de siempre para quien prefiera escribir
  // un emoji real que no esté en la galería. form.emoji guarda el valor
  // final en ambos casos (con prefijo ICON_PREFIX si viene de la galería,
  // o el texto tal cual si es un emoji escrito a mano) — un solo campo,
  // sin necesidad de reconciliar dos fuentes al guardar.
  const [modoIcono, setModoIcono] = useState<"icono" | "emoji">("icono");

  function alternarModoIcono() {
    setModoIcono((m) => (m === "icono" ? "emoji" : "icono"));
    setForm((f) => ({ ...f, emoji: "" }));
  }

  function abrirNuevo() {
    setEditando(null);
    setForm({ ...FORM_VACIO, type: tipoActivo });
    setModoIcono("icono");
    setErrorModal(null);
    setNuevaCategoria(false);
    setNombreNuevaCategoria("");
    setModalAbierto(true);
  }

  function abrirEditar(p: ProductoCatalogo) {
    setEditando(p);
    const esIconoDeSistema = !!p.emoji && p.emoji.startsWith(ICON_PREFIX);
    setForm({
      name: p.name,
      sku: p.sku ?? "",
      price: String(p.price),
      cost: p.cost ? String(p.cost) : "",
      type: p.type,
      categoryId: p.categoryId ?? "",
      emoji: p.emoji ?? "",
      isActive: true,
      stock: "1", // no se usa al editar, ver comentario en FormProducto
    });
    // Si ya trae un ícono de la galería, o si no tiene nada todavía,
    // arranca en modo galería; solo entra directo a modo texto si ya
    // tenía un emoji escrito a mano.
    setModoIcono(esIconoDeSistema || !p.emoji ? "icono" : "emoji");
    setErrorModal(null);
    setNuevaCategoria(false);
    setNombreNuevaCategoria("");
    setModalAbierto(true);
  }

  function guardarProducto() {
    setErrorModal(null);
    startTransition(async () => {
      let categoryId = form.categoryId;

      if (nuevaCategoria && nombreNuevaCategoria.trim()) {
        const resCat = await crearCategoriaAction({ tenantSlug, name: nombreNuevaCategoria.trim(), type: form.type });
        if (!resCat.ok) {
          setErrorModal(resCat.error);
          return;
        }
        categoryId = resCat.id;
      }

      const datos = {
        name: form.name,
        sku: form.sku || null,
        price: Number(form.price),
        // 2026-09-24: el campo "Costo" ni se le muestra a este rol cuando
        // !puedeVerMontos (ver el formulario arriba) — no se manda la llave
        // en absoluto (en vez de mandar `null`) para que editarProductoAction
        // no le borre a un admin el costo que ya tenía capturado solo porque
        // esta cajera cambió el precio o el nombre. Ver el comentario largo
        // en catalogo-actions.ts.
        ...(puedeVerMontos ? { cost: form.cost ? Number(form.cost) : null } : {}),
        type: form.type,
        categoryId: categoryId || null,
        emoji: form.emoji.trim() || null,
      };

      const res = editando
        ? await editarProductoAction({ tenantSlug, productId: editando.id, isActive: form.isActive, ...datos })
        : await crearProductoAction({
            tenantSlug,
            ...datos,
            stockInicial: form.type !== "SERVICE" && form.stock.trim() !== "" ? Number(form.stock) : undefined,
          });

      if (!res.ok) {
        setErrorModal(res.error);
        return;
      }
      setModalAbierto(false);
      router.refresh();
    });
  }

  const categoriasDelTipoForm = categorias.filter((c) => c.type === form.type);

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
      <div className="flex items-center justify-between px-3 py-3 border-b border-border gap-1.5">
        <span className="text-sm font-medium text-foreground">{label(labels, "module.catalog.name")}</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={abrirModalAutoIconos}
            title="Auto-asignar íconos a productos que se quedaron con el genérico"
            className="w-6 h-6 flex-shrink-0 flex items-center justify-center bg-muted text-muted-foreground rounded-lg hover:bg-muted/70">
            <Wand2 className="w-3 h-3" />
          </button>
          <button
            onClick={() => { setModalImportar(true); setErrorImportar(null); setResultadoImportar(null); }}
            title="Importar catálogo desde CSV o Excel"
            className="flex items-center gap-1 bg-muted text-muted-foreground text-[11.5px] font-medium px-2 py-1.5 rounded-lg hover:bg-muted/70">
            <Upload className="w-2.5 h-2.5" /> Importar
          </button>
          <button onClick={abrirNuevo} className="flex items-center gap-1 bg-primary text-primary-foreground text-[11.5px] font-medium px-2 py-1.5 rounded-lg">
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
                <span className="ml-auto text-[10.5px] text-muted-foreground">{conteo(tipo)}</span>
              </div>
              {tipoActivo === tipo && tabActivo === "catalogo" && cats.map((cat) => (
                <div key={cat.id}
                  onClick={() => { setCategoriaActiva(cat.id); setSidebarMovil(false); }}
                  className={`flex items-center justify-between pl-6 pr-2 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
                    categoriaActiva === cat.id ? `${cfg.bg} ${cfg.color} font-medium` : "text-muted-foreground hover:bg-muted"
                  }`}>
                  <span>{cat.name}</span>
                  <span className="text-[10.5px] text-muted-foreground">{conteoCat(tipo, cat.id)}</span>
                </div>
              ))}
              {cats.length === 0 && tipoActivo === tipo && tabActivo === "catalogo" && (
                <p className="pl-6 pr-2 py-1.5 text-[11.5px] text-muted-foreground/70">Sin categorías aún</p>
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
                    ? "text-primary-text border-primary"
                    : "text-muted-foreground border-transparent hover:text-foreground"
                }`}>
                <Icono className="w-3 h-3" />
                {cfg.label}
                <span className={`text-[10.5px] px-1.5 py-0.5 rounded-full ${
                  tabActivo === "catalogo" && tipoActivo === tipo
                    ? "bg-primary/10 text-primary-text"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {conteo(tipo)}
                </span>
              </button>
            );
          })}

          {puedeVerMontos && (
            <button onClick={() => setTabActivo("topventas")}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ml-auto whitespace-nowrap flex-shrink-0 ${
                tabActivo === "topventas"
                  ? "text-amber-600 border-amber-500"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              }`}>
              <TrendingUp className="w-3 h-3" />
              Top ventas
            </button>
          )}
        </div>

        {/* ── Categorías en móvil (fila horizontal) ─────── */}
        {tabActivo === "catalogo" && categoriasPorTipo[tipoActivo].length > 0 && (
          <div className="md:hidden flex gap-1.5 px-3 py-2 border-b border-border overflow-x-auto bg-card flex-shrink-0">
            {categoriasPorTipo[tipoActivo].map((cat) => (
              <button key={cat.id} onClick={() => setCategoriaActiva(cat.id)}
                className={`px-3 py-1 rounded-full text-[11.5px] font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
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
                <p className="text-xs text-muted-foreground max-w-xs mb-3">Agrega tus primeros productos, refacciones o servicios para empezar a venderlos.</p>
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <button onClick={abrirNuevo} className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-medium px-3 py-2 rounded-lg">
                    <Plus className="w-3.5 h-3.5" /> Agregar producto
                  </button>
                  {businessType && (
                    <button
                      onClick={cargarCatalogoArranque}
                      disabled={cargandoArranque}
                      className="flex items-center gap-1.5 bg-card border border-border text-foreground text-xs font-medium px-3 py-2 rounded-lg hover:bg-muted disabled:opacity-60 transition-colors">
                      {cargandoArranque
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Sparkles className="w-3.5 h-3.5 text-amber-500" />}
                      {cargandoArranque ? "Cargando…" : "Cargar catálogo de ejemplo"}
                    </button>
                  )}
                  <button
                    onClick={() => { setModalImportar(true); setErrorImportar(null); setResultadoImportar(null); }}
                    className="flex items-center gap-1.5 bg-card border border-border text-foreground text-xs font-medium px-3 py-2 rounded-lg hover:bg-muted transition-colors">
                    <Upload className="w-3.5 h-3.5" /> Importar desde archivo
                  </button>
                </div>
                {errorArranque && (
                  <p className="text-[12.5px] text-red-600 mt-2 max-w-xs">{errorArranque}</p>
                )}
                {businessType && (
                  <p className="text-[11.5px] text-muted-foreground/70 mt-2 max-w-xs">
                    Te agregamos algunos productos y servicios típicos de tu giro para que puedas empezar de inmediato — puedes editarlos o borrarlos cuando quieras.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 content-start items-start">
                {/* 2026-09-26, a petición de Carlos: antes era vertical
                    (franja de ícono arriba a lo ancho + info abajo) — con
                    un ícono chico dentro de una franja ancha, se
                    desperdiciaba espacio horizontal. Ahora es horizontal:
                    el ícono (siempre cuadrado) va en una columna angosta a
                    la izquierda, y el nombre/SKU/precio/stock aprovechan
                    todo el ancho restante a la derecha.
                    `items-start` en este grid es lo que corrige el hueco
                    feo que Carlos reportó entre el precio y el badge de
                    stock: por default CSS Grid estira TODAS las tarjetas de
                    una misma fila a la altura de la más alta (ej. una con
                    nombre de 2 líneas o con "Costo" visible) — sin
                    `items-start`, una tarjeta con menos contenido (como
                    "Adaptador Bluetooth", sin costo) se estiraba de más y
                    ese sobrante de alto quedaba como espacio muerto entre
                    sus propias líneas. Con `items-start` cada tarjeta mide
                    solo lo que su contenido necesita, sin estirarse por sus
                    vecinas. */}
                {productosFiltrados.map((p) => (
                  <div key={p.id} onClick={() => abrirEditar(p)} className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer flex">
                    <div className={`w-20 sm:w-24 flex-shrink-0 ${tipoConfig[p.type].bg} flex items-center justify-center border-r border-border`}>
                      <ProductoIcono value={p.emoji} className={`w-7 h-7 sm:w-8 sm:h-8 ${tipoConfig[p.type].color}`} />
                    </div>
                    <div className="flex-1 min-w-0 p-2 sm:p-2.5 flex flex-col justify-start gap-0.5">
                      <p className="text-xs font-medium text-foreground leading-tight line-clamp-2">{p.name}</p>
                      <p className="text-[10.5px] text-muted-foreground truncate">{p.sku ?? "Sin SKU"}</p>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <span className="text-xs font-bold text-primary-text">{formatMXN(p.price)}</span>
                        {stockBadge(p.isService, p.stock)}
                      </div>
                      {/* 2026-09-24: "Costo" es precio de compra (margen del
                          negocio) — se omite para quien no tiene
                          Role.verMontosCaja, igual que en Inventario. */}
                      {puedeVerMontos && !p.isService && p.cost > 0 && (
                        <p className="text-[10.5px] text-muted-foreground">Costo: {formatMXN(p.cost)}</p>
                      )}
                    </div>
                  </div>
                ))}
                {productosFiltrados.length === 0 && (
                  <p className="col-span-full text-center text-xs text-muted-foreground py-6">Sin resultados para este filtro.</p>
                )}
                <button onClick={abrirNuevo} className="flex flex-col items-center justify-center border border-dashed border-border rounded-xl hover:border-primary/40 hover:bg-muted transition-all min-h-[76px] sm:min-h-[88px]">
                  <Plus className="w-5 h-5 text-muted-foreground/50 mb-1" />
                  <span className="text-[11.5px] text-muted-foreground/50">Agregar</span>
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
                      className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
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
                          <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11.5px] font-bold flex-shrink-0 ${rankBadgeClass(i)}`}>
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{item.nombre}</p>
                            <p className="text-[11.5px] text-muted-foreground">{item.categoria} · {item.unidades} unidades</p>
                          </div>
                          <span className="text-xs font-semibold text-primary-text flex-shrink-0">{formatMXN(item.total)}</span>
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

      {/* Modal crear/editar producto */}
      {modalAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => { if (confirmarSalirSinGuardar()) setModalAbierto(false); }}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-[14.5px] font-semibold text-foreground">
                {editando ? "Editar producto" : "Nuevo producto"}
              </h3>
              <button onClick={cancelarModalProducto} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div>
                <label className="text-[12.5px] font-medium text-muted-foreground">Tipo</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as TipoProductoInput, categoryId: "" })}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                >
                  {TIPOS_ORDEN.map((t) => (
                    <option key={t} value={t}>{TIPO_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[12.5px] font-medium text-muted-foreground">Nombre *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                  placeholder="Ej. Pantalla iPhone 13"
                />
              </div>
              <div>
                <label className="text-[12.5px] font-medium text-muted-foreground">SKU</label>
                <input
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[12.5px] font-medium text-muted-foreground flex items-center gap-1.5">
                    Ícono
                    <span className="w-5 h-5 rounded-md bg-muted border border-border flex items-center justify-center text-muted-foreground">
                      <ProductoIcono value={form.emoji || null} className="w-3 h-3" />
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={alternarModoIcono}
                    className="text-[11.5px] text-primary-text font-medium hover:underline"
                  >
                    {modoIcono === "icono" ? "Escribir mi propio emoji" : "Elegir de la galería"}
                  </button>
                </div>
                {modoIcono === "icono" ? (
                  <div className="mt-1 grid grid-cols-8 gap-1 p-2 border border-border rounded-lg bg-muted max-h-32 overflow-y-auto">
                    <button
                      type="button"
                      title="Sin ícono (usa el genérico del tipo)"
                      onClick={() => setForm({ ...form, emoji: "" })}
                      className={`w-7 h-7 flex items-center justify-center rounded-md text-[10.5px] font-medium transition-colors ${
                        form.emoji === ""
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-muted-foreground hover:bg-primary/10 hover:text-primary-text"
                      }`}
                    >
                      —
                    </button>
                    {Object.entries(ICONOS).map(([key, Icono]) => {
                      const valor = `${ICON_PREFIX}${key}`;
                      const seleccionado = form.emoji === valor;
                      return (
                        <button
                          key={key}
                          type="button"
                          title={humanizarIcono(key)}
                          onClick={() => setForm({ ...form, emoji: valor })}
                          className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
                            seleccionado
                              ? "bg-primary text-primary-foreground"
                              : "bg-card text-muted-foreground hover:bg-primary/10 hover:text-primary-text"
                          }`}
                        >
                          <Icono className="w-4 h-4" weight="regular" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    value={form.emoji}
                    onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                    placeholder={TYPE_FALLBACK_EMOJI_LOCAL[form.type]}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                  />
                )}
              </div>
              {/* 2026-09-24: "Costo" es precio de compra (margen del
                  negocio) — el campo se omite por completo (no solo se
                  deshabilita) para quien no tiene Role.verMontosCaja, mismo
                  criterio que la ficha inline de arriba. Sin ese campo,
                  "Precio de venta" ocupa el ancho completo. */}
              <div className={`grid gap-3 ${puedeVerMontos ? "grid-cols-2" : "grid-cols-1"}`}>
                <div>
                  <label className="text-[12.5px] font-medium text-muted-foreground">Precio de venta *</label>
                  <input
                    type="number" min={0} step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                  />
                </div>
                {puedeVerMontos && (
                  <div>
                    <label className="text-[12.5px] font-medium text-muted-foreground">Costo</label>
                    <input
                      type="number" min={0} step="0.01"
                      value={form.cost}
                      onChange={(e) => setForm({ ...form, cost: e.target.value })}
                      className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                    />
                  </div>
                )}
              </div>
              {!editando && form.type !== "SERVICE" && (
                <div>
                  <label className="text-[12.5px] font-medium text-muted-foreground">
                    Existencia inicial{branches.length > 1 ? ` (en cada una de las ${branches.length} sucursales activas)` : ""}
                  </label>
                  <input
                    type="number" min={0} step="1"
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                  />
                </div>
              )}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[12.5px] font-medium text-muted-foreground">Categoría</label>
                  <button
                    type="button"
                    onClick={() => setNuevaCategoria((v) => !v)}
                    className="text-[11.5px] text-primary-text font-medium hover:underline"
                  >
                    {nuevaCategoria ? "Elegir existente" : "+ Nueva categoría"}
                  </button>
                </div>
                {nuevaCategoria ? (
                  <input
                    value={nombreNuevaCategoria}
                    onChange={(e) => setNombreNuevaCategoria(e.target.value)}
                    placeholder="Nombre de la nueva categoría"
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                  />
                ) : (
                  <select
                    value={form.categoryId}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                  >
                    <option value="">Sin categoría</option>
                    {categoriasDelTipoForm.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>
              {editando && (
                <label className="flex items-center gap-2 text-[12.5px] text-foreground/80">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  />
                  Producto activo (visible para venderse)
                </label>
              )}
              {errorModal && <p className="text-[12.5px] text-red-600">{errorModal}</p>}
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button
                onClick={cancelarModalProducto}
                className="px-3 py-2 text-[13.5px] font-medium text-foreground/70 hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={guardarProducto}
                disabled={isPending || !form.name.trim() || !form.price}
                className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-[13.5px] font-medium transition-colors"
              >
                {isPending ? "Guardando…" : editando ? "Guardar cambios" : "Crear producto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal importar catálogo (CSV/Excel) */}
      {modalImportar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={cancelarModalImportar}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-[14.5px] font-semibold text-foreground">Importar catálogo</h3>
              <button onClick={cancelarModalImportar} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                Sube un archivo CSV o Excel con tus productos, refacciones o servicios. Si vienes de otro sistema, primero descarga la plantilla para ver el formato esperado.
              </p>

              <button
                type="button"
                onClick={descargarPlantilla}
                className="flex items-center justify-center gap-1.5 border border-dashed border-border text-foreground text-xs font-medium px-3 py-2 rounded-lg hover:bg-muted transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Descargar plantilla (.csv)
              </button>

              <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-border rounded-lg px-3 py-6 text-center cursor-pointer hover:border-primary/40 hover:bg-muted transition-colors">
                {importando ? (
                  <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
                ) : (
                  <Upload className="w-6 h-6 text-muted-foreground/60" />
                )}
                <span className="text-xs font-medium text-foreground">
                  {importando ? "Importando…" : "Haz clic para elegir tu archivo"}
                </span>
                <span className="text-[11.5px] text-muted-foreground">Formatos aceptados: .csv, .xlsx</span>
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={manejarArchivoImportar}
                  disabled={importando}
                  className="hidden"
                />
              </label>

              {errorImportar && (
                <div className="flex items-start gap-1.5 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[12.5px] text-red-700">{errorImportar}</p>
                </div>
              )}

              {resultadoImportar && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <p className="text-[12.5px] text-emerald-700">
                      {resultadoImportar.creados === 0
                        ? "No se importó ningún producto."
                        : `Se importaron ${resultadoImportar.creados} producto${resultadoImportar.creados === 1 ? "" : "s"} correctamente.`}
                    </p>
                  </div>
                  {resultadoImportar.creados > 0 && (
                    <p className="text-[11.5px] text-muted-foreground px-1">
                      Tip: si tu archivo no traía íconos, usa el botón <Wand2 className="inline w-3 h-3 -mt-0.5" /> junto a "Importar" para asignarlos automáticamente según el nombre de cada producto.
                    </p>
                  )}
                  {resultadoImportar.omitidos.length > 0 && (
                    <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg max-h-32 overflow-y-auto">
                      <p className="text-[12.5px] font-medium text-amber-700 mb-1">
                        {resultadoImportar.omitidos.length} fila{resultadoImportar.omitidos.length === 1 ? "" : "s"} omitida{resultadoImportar.omitidos.length === 1 ? "" : "s"}:
                      </p>
                      <ul className="text-[11.5px] text-amber-700 space-y-0.5">
                        {resultadoImportar.omitidos.map((o, i) => (
                          <li key={i}>Fila {o.fila}: {o.motivo}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button
                onClick={cancelarModalImportar}
                className="px-3 py-2 text-[13.5px] font-medium text-foreground/70 hover:text-foreground"
              >
                {resultadoImportar ? "Cerrar" : "Cancelar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal auto-asignar íconos (2026-09-26) */}
      {modalAutoIconos && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => !autoIconosPendiente && setModalAutoIconos(false)}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-[14.5px] font-semibold text-foreground flex items-center gap-1.5">
                <Wand2 className="w-4 h-4 text-primary-text" /> Auto-asignar íconos
              </h3>
              <button onClick={() => !autoIconosPendiente && setModalAutoIconos(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                Busca todos los productos que se quedaron con el ícono genérico (📦) y les asigna uno más específico según su nombre y categoría — por ejemplo, "Cámara de seguridad" recibe un ícono de cámara, "Cargador rápido" uno de carga. Nunca toca un producto que ya tenga un ícono puesto a mano.
              </p>

              {autoIconosError && (
                <div className="flex items-start gap-1.5 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[12.5px] text-red-700">{autoIconosError}</p>
                </div>
              )}

              {autoIconosResultado && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <p className="text-[12.5px] text-emerald-700">
                      {autoIconosResultado.asignados === 0
                        ? "No había ningún producto pendiente de ícono."
                        : `Se asignó ícono a ${autoIconosResultado.asignados} producto${autoIconosResultado.asignados === 1 ? "" : "s"}.`}
                    </p>
                  </div>
                  {autoIconosResultado.sinCoincidencia > 0 && (
                    <div className="flex items-start gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-[12.5px] text-amber-700">
                        {autoIconosResultado.sinCoincidencia} producto{autoIconosResultado.sinCoincidencia === 1 ? "" : "s"} no tuvo ninguna coincidencia y se quedó con el ícono genérico — puedes ajustarlo a mano desde su tarjeta.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button
                onClick={() => setModalAutoIconos(false)}
                disabled={autoIconosPendiente}
                className="px-3 py-2 text-[13.5px] font-medium text-foreground/70 hover:text-foreground disabled:opacity-50"
              >
                {autoIconosResultado ? "Cerrar" : "Cancelar"}
              </button>
              {!autoIconosResultado && (
                <button
                  onClick={ejecutarAutoIconos}
                  disabled={autoIconosPendiente}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-[13.5px] font-medium transition-colors"
                >
                  {autoIconosPendiente && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {autoIconosPendiente ? "Asignando…" : "Ejecutar"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
