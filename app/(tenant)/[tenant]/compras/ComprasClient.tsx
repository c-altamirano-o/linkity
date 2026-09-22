"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Printer, Check, Building2, Package, X, Ban } from "lucide-react";
import type { ComprasData, CompraUI, EstadoCompra } from "@/lib/compras-data";
import { label, type LabelDictionary } from "@/lib/labels";
import { confirmarSalirSinGuardar } from "@/lib/confirmar-cierre";
import {
  crearCompraAction,
  actualizarEstadoCompraAction,
  type ItemCompraParams,
} from "@/app/actions/compras-actions";

interface BranchOption {
  id: string;
  name: string;
}

interface ComprasClientProps {
  data: ComprasData;
  labels: LabelDictionary;
  branches: BranchOption[];
  tenantSlug: string;
}

const ESTADO_TEXTO: Record<EstadoCompra, string> = {
  PENDING: "Pendiente",
  RECEIVED: "Recibida",
  CANCELLED: "Cancelada",
};

// Mismo criterio que ESTADO_PAGO_BADGE en PersonalClient.tsx: colores
// literales (no tokens de tema) para distinguir estatus semánticos —
// CANCELLED cae a bg-muted/text-muted-foreground por ser "neutral", igual
// que StaffPaymentStatus.CANCELLED.
const ESTADO_BADGE: Record<EstadoCompra, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  RECEIVED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-muted text-muted-foreground",
};

// Ciclo de colores para el avatar del proveedor — mismo patrón que
// borderColors en DashboardClient.tsx: bg-primary (token, reemplaza el
// #4F46E5 fijo del mockup) combinado con colores literales para dar
// variedad visual entre proveedores distintos.
const PROV_COLORS = ["bg-primary", "bg-cyan-500", "bg-emerald-500", "bg-amber-500"];

const FILTROS_TABS: { label: string; estado: EstadoCompra | "TODAS" }[] = [
  { label: "Todas", estado: "TODAS" },
  { label: "Pendientes", estado: "PENDING" },
  { label: "Recibidas", estado: "RECEIVED" },
  { label: "Canceladas", estado: "CANCELLED" },
];

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const formatFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

function colorPorId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PROV_COLORS[hash % PROV_COLORS.length];
}

interface RenglonForm {
  productId: string;
  quantity: string;
  cost: string;
}

function renglonVacio(): RenglonForm {
  return { productId: "", quantity: "1", cost: "" };
}

export default function ComprasClient({ data, labels, branches, tenantSlug }: ComprasClientProps) {
  const router = useRouter();
  const { compras, proveedores, productos } = data;

  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<EstadoCompra | "TODAS">("TODAS");
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(compras[0]?.id ?? null);

  const [pending, startAccion] = useTransition();
  const [accionError, setAccionError] = useState<string | null>(null);

  const [modalNueva, setModalNueva] = useState(false);
  const [nvBranchId, setNvBranchId] = useState(branches[0]?.id ?? "");
  const [nvSupplierId, setNvSupplierId] = useState<string>(proveedores[0]?.id ?? "");
  const [nvProveedorNuevo, setNvProveedorNuevo] = useState(false);
  const [nvProvNombre, setNvProvNombre] = useState("");
  const [nvProvTelefono, setNvProvTelefono] = useState("");
  const [nvProvEmail, setNvProvEmail] = useState("");
  const [nvNotas, setNvNotas] = useState("");
  const [nvItems, setNvItems] = useState<RenglonForm[]>([renglonVacio()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [guardando, startGuardar] = useTransition();

  const comprasFiltradas = useMemo(() => {
    return compras.filter((c) => {
      const matchBusqueda =
        c.folio.toLowerCase().includes(busqueda.toLowerCase()) ||
        c.supplierName.toLowerCase().includes(busqueda.toLowerCase());
      const matchFiltro = filtro === "TODAS" || c.status === filtro;
      return matchBusqueda && matchFiltro;
    });
  }, [compras, busqueda, filtro]);

  const seleccionada = compras.find((c) => c.id === seleccionadoId) ?? null;

  const refrescar = () => router.refresh();

  const moduloNombre = label(labels, "module.suppliers.name");

  // ── Recibir / Cancelar ───────────────────────────────────
  const handleActualizarEstado = (compra: CompraUI, nuevoEstado: "RECEIVED" | "CANCELLED") => {
    setAccionError(null);
    startAccion(async () => {
      const res = await actualizarEstadoCompraAction({ tenantSlug, purchaseId: compra.id, nuevoEstado });
      if (res.ok) refrescar();
      else setAccionError(res.error);
    });
  };

  const handleImprimir = () => {
    window.print();
  };

  // ── Modal nueva compra ───────────────────────────────────
  const abrirModalNueva = () => {
    setNvBranchId(branches[0]?.id ?? "");
    setNvSupplierId(proveedores[0]?.id ?? "");
    setNvProveedorNuevo(proveedores.length === 0);
    setNvProvNombre("");
    setNvProvTelefono("");
    setNvProvEmail("");
    setNvNotas("");
    setNvItems([renglonVacio()]);
    setFormError(null);
    setModalNueva(true);
  };

  const handleAgregarRenglon = () => setNvItems((r) => [...r, renglonVacio()]);

  const handleQuitarRenglon = (idx: number) => setNvItems((r) => r.filter((_, i) => i !== idx));

  const handleCambiarRenglon = (idx: number, campo: keyof RenglonForm, valor: string) => {
    setNvItems((r) =>
      r.map((item, i) => {
        if (i !== idx) return item;
        const actualizado = { ...item, [campo]: valor };
        // Al elegir producto, se precarga su costo de catálogo si el
        // renglón todavía no tiene uno capturado a mano.
        if (campo === "productId" && !item.cost) {
          const prod = productos.find((p) => p.id === valor);
          if (prod) actualizado.cost = String(prod.cost);
        }
        return actualizado;
      })
    );
  };

  const totalNueva = useMemo(() => {
    return nvItems.reduce((s, it) => {
      const cant = parseFloat(it.quantity || "0");
      const costo = parseFloat(it.cost || "0");
      if (!Number.isFinite(cant) || !Number.isFinite(costo)) return s;
      return s + cant * costo;
    }, 0);
  }, [nvItems]);

  const handleCrearCompra = () => {
    if (!nvBranchId) { setFormError("Selecciona una sucursal"); return; }
    if (!nvProveedorNuevo && !nvSupplierId) { setFormError("Selecciona un proveedor"); return; }
    if (nvProveedorNuevo && !nvProvNombre.trim()) { setFormError("Escribe el nombre del proveedor"); return; }
    const renglonesValidos = nvItems.filter((it) => it.productId);
    if (!renglonesValidos.length) { setFormError("Agrega al menos un producto"); return; }

    const items: ItemCompraParams[] = [];
    for (const it of renglonesValidos) {
      const quantity = parseInt(it.quantity, 10);
      const cost = parseFloat(it.cost || "0");
      if (!Number.isFinite(quantity) || quantity <= 0) { setFormError("Hay una cantidad inválida"); return; }
      if (!Number.isFinite(cost) || cost < 0) { setFormError("Hay un costo inválido"); return; }
      items.push({ productId: it.productId, quantity, cost });
    }
    setFormError(null);

    startGuardar(async () => {
      const res = await crearCompraAction({
        tenantSlug,
        branchId: nvBranchId,
        supplierId: nvProveedorNuevo ? null : nvSupplierId,
        proveedorNuevo: nvProveedorNuevo
          ? { name: nvProvNombre, phone: nvProvTelefono || undefined, email: nvProvEmail || undefined }
          : null,
        items,
        notes: nvNotas || null,
      });
      if (res.ok) {
        setModalNueva(false);
        setSeleccionadoId(res.id);
        refrescar();
      } else {
        setFormError(res.error);
      }
    });
  };

  const subtotalSeleccionada = seleccionada
    ? seleccionada.items.reduce((s, i) => s + i.subtotal, 0)
    : 0;

  return (
    <div className="flex h-full">

      {/* Lista */}
      <div className="w-full md:w-72 flex-col bg-card border-r border-border flex-shrink-0 hidden md:flex">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-[14.5px] font-medium text-foreground">{moduloNombre}</span>
          <button
            onClick={abrirModalNueva}
            className="flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground text-[12.5px] font-medium px-2.5 py-1.5 rounded-lg"
          >
            <Plus className="w-3 h-3" /> Nueva
          </button>
        </div>

        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por folio o proveedor..."
              className="w-full pl-7 pr-3 py-1.5 border border-border rounded-lg text-[12.5px] bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        </div>

        <div className="flex gap-1.5 px-3 py-2 border-b border-border overflow-x-auto">
          {FILTROS_TABS.map((tab) => (
            <button
              key={tab.label}
              onClick={() => setFiltro(tab.estado)}
              className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium whitespace-nowrap transition-colors ${
                filtro === tab.estado ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {comprasFiltradas.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-xs">Sin resultados</div>
          )}
          {comprasFiltradas.map((c) => (
            <div
              key={c.id}
              onClick={() => setSeleccionadoId(c.id)}
              className={`px-3 py-3 border-b border-border/60 cursor-pointer border-l-2 transition-all ${
                seleccionada?.id === c.id
                  ? "bg-primary/5 border-l-primary"
                  : "hover:bg-muted border-l-transparent"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12.5px] font-semibold text-foreground">{c.folio}</span>
                <span className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full ${ESTADO_BADGE[c.status]}`}>
                  {ESTADO_TEXTO[c.status]}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground mb-1.5">
                <Building2 className="w-3 h-3 text-muted-foreground" />
                {c.supplierName}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] text-muted-foreground">{formatFecha(c.createdAt)}</span>
                <span className="text-[13.5px] font-semibold text-foreground">{formatMXN(c.total)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detalle */}
      <div className="flex-1 flex flex-col bg-muted overflow-hidden">
        {accionError && (
          <div className="bg-red-50 border-b border-red-100 text-red-700 text-xs px-4 py-2">{accionError}</div>
        )}

        {!seleccionada ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <Package className="w-8 h-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No hay compras registradas todavía.</p>
            <button onClick={abrirModalNueva} className="text-xs text-primary mt-1">+ Registrar la primera</button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-card border-b border-border px-4 sm:px-5 py-4">
              <div className="flex items-start justify-between mb-4 gap-2 flex-wrap">
                <div>
                  <p className="text-[14px] font-semibold text-foreground">
                    {seleccionada.folio}
                    <span className="text-[13.5px] font-normal text-muted-foreground ml-2">— Orden de compra</span>
                  </p>
                  <p className="text-[12.5px] text-muted-foreground mt-0.5">
                    Creada el {formatFecha(seleccionada.createdAt)}
                    {seleccionada.receivedAt && ` · Recibida el ${formatFecha(seleccionada.receivedAt)}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleImprimir}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-[12.5px] text-foreground hover:bg-muted"
                  >
                    <Printer className="w-3 h-3" /> Imprimir
                  </button>
                  {seleccionada.status === "PENDING" && (
                    <>
                      <button
                        onClick={() => handleActualizarEstado(seleccionada, "CANCELLED")}
                        disabled={pending}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-border hover:bg-muted disabled:opacity-50 rounded-lg text-[12.5px] font-medium text-muted-foreground"
                      >
                        <Ban className="w-3 h-3" /> Cancelar
                      </button>
                      <button
                        onClick={() => handleActualizarEstado(seleccionada, "RECEIVED")}
                        disabled={pending}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-[12.5px] font-medium transition-colors"
                      >
                        <Check className="w-3 h-3" /> Marcar recibida
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: "Proveedor", value: seleccionada.supplierName, small: true },
                  { label: "Productos", value: String(seleccionada.items.length), small: false },
                  { label: "Total", value: formatMXN(seleccionada.total), color: "text-primary" },
                ].map((s) => (
                  <div key={s.label} className="bg-muted rounded-lg p-3">
                    <p className="text-[10.5px] text-muted-foreground mb-1">{s.label}</p>
                    <p className={`font-semibold ${s.small ? "text-[13.5px]" : "text-[15px]"} ${s.color || "text-foreground"}`}>
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4">

              {/* Proveedor */}
              <p className="text-[11.5px] font-semibold text-muted-foreground tracking-widest mb-2">PROVEEDOR</p>
              <div className="flex items-center gap-3 bg-card border border-border rounded-xl p-3 mb-4">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-[13.5px] font-semibold text-white flex-shrink-0 ${colorPorId(
                    seleccionada.supplierId
                  )}`}
                >
                  {iniciales(seleccionada.supplierName)}
                </div>
                <div className="flex-1">
                  <p className="text-[13.5px] font-medium text-foreground">{seleccionada.supplierName}</p>
                  <p className="text-[11.5px] text-muted-foreground">
                    {[seleccionada.supplierPhone, seleccionada.supplierEmail].filter(Boolean).join(" · ") ||
                      "Sin datos de contacto capturados"}
                  </p>
                </div>
              </div>

              {/* Productos */}
              <p className="text-[11.5px] font-semibold text-muted-foreground tracking-widest mb-2">PRODUCTOS COMPRADOS</p>
              <div className="bg-card border border-border rounded-xl overflow-hidden mb-4">
                <div className="grid grid-cols-[1fr_60px_90px_90px] px-4 py-2 bg-muted border-b border-border">
                  {["Producto", "Cant.", "Costo unit.", "Subtotal"].map((h) => (
                    <p key={h} className="text-[11.5px] font-medium text-muted-foreground">{h}</p>
                  ))}
                </div>
                {seleccionada.items.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_60px_90px_90px] px-4 py-3 border-b border-border/60 last:border-0 items-center hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-muted rounded-md flex items-center justify-center flex-shrink-0">
                        <Package className="w-3 h-3 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-[12.5px] font-medium text-foreground">{item.productName}</p>
                        <p className="text-[10.5px] text-muted-foreground">{item.productSku ?? "—"}</p>
                      </div>
                    </div>
                    <p className="text-[12.5px] text-muted-foreground text-center">{item.quantity}</p>
                    <p className="text-[12.5px] text-muted-foreground">{formatMXN(item.cost)}</p>
                    <p className="text-[12.5px] font-medium text-foreground">{formatMXN(item.subtotal)}</p>
                  </div>
                ))}
              </div>

              {/* Totales */}
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[12.5px] text-muted-foreground">Subtotal</span>
                    <span className="text-[12.5px] text-foreground">{formatMXN(subtotalSeleccionada)}</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex justify-between items-baseline">
                    <span className="text-[14.5px] font-semibold text-foreground">Total</span>
                    <span className="text-[16px] font-bold text-primary">{formatMXN(seleccionada.total)}</span>
                  </div>
                  {seleccionada.notes && (
                    <p className="text-[11.5px] text-muted-foreground pt-1">Nota: {seleccionada.notes}</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal: nueva compra */}
      {modalNueva && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => { if (confirmarSalirSinGuardar()) setModalNueva(false); }}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold text-foreground">Nueva orden de compra</span>
              <button onClick={() => setModalNueva(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">SUCURSAL</label>
                <select
                  value={nvBranchId}
                  onChange={(e) => setNvBranchId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                >
                  <option value="">Selecciona...</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">PROVEEDOR</label>
                  <button
                    type="button"
                    onClick={() => setNvProveedorNuevo((v) => !v)}
                    className="text-[11.5px] text-primary"
                  >
                    {nvProveedorNuevo ? "Elegir existente" : "+ Nuevo proveedor"}
                  </button>
                </div>
                {nvProveedorNuevo ? (
                  <div className="space-y-2 mt-1">
                    <input
                      value={nvProvNombre}
                      onChange={(e) => setNvProvNombre(e.target.value)}
                      placeholder="Nombre del proveedor"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={nvProvTelefono}
                        onChange={(e) => setNvProvTelefono(e.target.value)}
                        placeholder="Teléfono (opcional)"
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                      />
                      <input
                        value={nvProvEmail}
                        onChange={(e) => setNvProvEmail(e.target.value)}
                        placeholder="Email (opcional)"
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                ) : (
                  <select
                    value={nvSupplierId}
                    onChange={(e) => setNvSupplierId(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                  >
                    <option value="">Selecciona...</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">PRODUCTOS</label>
                  <button type="button" onClick={handleAgregarRenglon} className="text-[11.5px] text-primary">
                    + Agregar producto
                  </button>
                </div>
                <div className="space-y-2">
                  {nvItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <select
                        value={item.productId}
                        onChange={(e) => handleCambiarRenglon(idx, "productId", e.target.value)}
                        className="flex-1 min-w-0 px-2 py-1.5 border border-border rounded-lg text-[12.5px] bg-muted focus:outline-none focus:border-primary"
                      >
                        <option value="">Producto...</option>
                        {productos.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => handleCambiarRenglon(idx, "quantity", e.target.value)}
                        placeholder="Cant."
                        className="w-14 px-2 py-1.5 border border-border rounded-lg text-[12.5px] bg-muted focus:outline-none focus:border-primary"
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.cost}
                        onChange={(e) => handleCambiarRenglon(idx, "cost", e.target.value)}
                        placeholder="Costo"
                        className="w-20 px-2 py-1.5 border border-border rounded-lg text-[12.5px] bg-muted focus:outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => handleQuitarRenglon(idx)}
                        disabled={nvItems.length === 1}
                        className="text-muted-foreground hover:text-red-600 disabled:opacity-30 flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">NOTAS (OPCIONAL)</label>
                <textarea
                  value={nvNotas}
                  onChange={(e) => setNvNotas(e.target.value)}
                  rows={2}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary resize-none"
                />
              </div>

              <div className="flex justify-between items-baseline bg-muted rounded-lg px-3 py-2">
                <span className="text-[12.5px] text-muted-foreground">Total estimado</span>
                <span className="text-[14px] font-bold text-primary">{formatMXN(totalNueva)}</span>
              </div>

              {formError && <p className="text-[12.5px] text-red-600">{formError}</p>}
            </div>

            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button
                onClick={() => setModalNueva(false)}
                className="px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={handleCrearCompra}
                disabled={guardando}
                className="px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-xs font-medium"
              >
                {guardando ? "Guardando..." : "Crear orden de compra"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
