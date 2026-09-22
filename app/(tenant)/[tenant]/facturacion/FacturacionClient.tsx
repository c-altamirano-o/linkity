"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, Download, XCircle, FileText, CheckCircle, Clock, AlertCircle, X, Info } from "lucide-react";
import type { FacturacionData, FacturaUI, EstadoFactura } from "@/lib/facturacion-data";
import { label, type LabelDictionary } from "@/lib/labels";
import { confirmarSalirSinGuardar, useAdvertirCierrePestaña } from "@/lib/confirmar-cierre";
import {
  crearFacturaAction,
  timbrarFacturaAction,
  cancelarFacturaAction,
} from "@/app/actions/facturacion-actions";

interface FacturacionClientProps {
  data: FacturacionData;
  labels: LabelDictionary;
  tenantSlug: string;
}

const ESTADO_CONFIG: Record<EstadoFactura, { label: string; classes: string; icon: typeof CheckCircle }> = {
  STAMPED: { label: "Timbrada", classes: "bg-emerald-50 text-emerald-700", icon: CheckCircle },
  PENDING: { label: "Pendiente", classes: "bg-amber-50 text-amber-600", icon: Clock },
  CANCELLED: { label: "Cancelada", classes: "bg-red-50 text-red-600", icon: XCircle },
};

const FILTROS_TABS: { label: string; estado: EstadoFactura | "TODAS" }[] = [
  { label: "Todas", estado: "TODAS" },
  { label: "Timbradas", estado: "STAMPED" },
  { label: "Pendientes", estado: "PENDING" },
  { label: "Canceladas", estado: "CANCELLED" },
];

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const formatFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

const nombreMesActual = () =>
  new Date().toLocaleDateString("es-MX", { month: "long", year: "numeric" });

export default function FacturacionClient({ data, labels, tenantSlug }: FacturacionClientProps) {
  const router = useRouter();
  const { facturas, ventasSinFacturar, clientes } = data;

  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<EstadoFactura | "TODAS">("TODAS");
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(facturas[0]?.id ?? null);

  const [pending, startAccion] = useTransition();
  const [accionError, setAccionError] = useState<string | null>(null);

  const [modalNueva, setModalNueva] = useState(false);
  // 2026-09-22, a petición de Carlos ("pide confirmación para cerrarlas
  // cuando abandone la acción a mitad del proceso"): el click fuera de
  // este modal ya preguntaba antes de cerrar (2026-09-21), pero la X y
  // "Cancelar" seguían cerrando sin preguntar nada.
  const cancelarModalNueva = () => {
    if (confirmarSalirSinGuardar()) setModalNueva(false);
  };
  useAdvertirCierrePestaña(modalNueva);
  const [nvSaleId, setNvSaleId] = useState<string>(ventasSinFacturar[0]?.id ?? "");
  const [nvCustomerId, setNvCustomerId] = useState<string>("");
  const [nvClienteNuevo, setNvClienteNuevo] = useState(false);
  const [nvNombre, setNvNombre] = useState("");
  const [nvRfc, setNvRfc] = useState("");
  const [nvTelefono, setNvTelefono] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [guardando, startGuardar] = useTransition();

  const facturasFiltradas = useMemo(() => {
    return facturas.filter((f) => {
      const matchBusqueda =
        f.folio.toLowerCase().includes(busqueda.toLowerCase()) ||
        f.customerName.toLowerCase().includes(busqueda.toLowerCase()) ||
        (f.customerRfc ?? "").toLowerCase().includes(busqueda.toLowerCase());
      const matchFiltro = filtro === "TODAS" || f.status === filtro;
      return matchBusqueda && matchFiltro;
    });
  }, [facturas, busqueda, filtro]);

  const seleccionada = facturas.find((f) => f.id === seleccionadaId) ?? null;

  const totalTimbradas = facturas.filter((f) => f.status === "STAMPED").length;
  const totalPendientes = facturas.filter((f) => f.status === "PENDING").length;
  const totalCanceladas = facturas.filter((f) => f.status === "CANCELLED").length;

  const mesActual = useMemo(() => {
    const hoy = new Date();
    return facturas.filter((f) => {
      if (f.status !== "STAMPED") return false;
      const d = new Date(f.createdAt);
      return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth();
    });
  }, [facturas]);
  const totalMes = mesActual.reduce((s, f) => s + f.total, 0);
  const ivaMes = mesActual.reduce((s, f) => s + (f.saleTax ?? 0), 0);

  const refrescar = () => router.refresh();

  const moduloNombre = label(labels, "module.invoicing.name");

  // ── Timbrar / Cancelar ───────────────────────────────────
  const handleTimbrar = (factura: FacturaUI) => {
    setAccionError(null);
    startAccion(async () => {
      const res = await timbrarFacturaAction({ tenantSlug, invoiceId: factura.id });
      if (res.ok) refrescar();
      else setAccionError(res.error);
    });
  };

  const handleCancelar = (factura: FacturaUI) => {
    setAccionError(null);
    startAccion(async () => {
      const res = await cancelarFacturaAction({ tenantSlug, invoiceId: factura.id });
      if (res.ok) refrescar();
      else setAccionError(res.error);
    });
  };

  // ── Modal nueva factura ──────────────────────────────────
  const abrirModalNueva = () => {
    const primera = ventasSinFacturar[0] ?? null;
    setNvSaleId(primera?.id ?? "");
    setNvCustomerId(primera?.customerId ?? "");
    setNvClienteNuevo(!primera?.customerId);
    setNvNombre("");
    setNvRfc("");
    setNvTelefono("");
    setFormError(null);
    setModalNueva(true);
  };

  const handleCambiarVenta = (saleId: string) => {
    setNvSaleId(saleId);
    const venta = ventasSinFacturar.find((v) => v.id === saleId);
    setNvCustomerId(venta?.customerId ?? "");
    setNvClienteNuevo(!venta?.customerId);
  };

  const ventaSeleccionadaNueva = ventasSinFacturar.find((v) => v.id === nvSaleId) ?? null;

  const handleCrearFactura = () => {
    if (!nvSaleId) { setFormError("Selecciona una venta a facturar"); return; }
    if (!nvClienteNuevo && !nvCustomerId) { setFormError("Selecciona el cliente que recibirá el CFDI"); return; }
    if (nvClienteNuevo && !nvNombre.trim()) { setFormError("Escribe el nombre o razón social del receptor"); return; }
    setFormError(null);

    startGuardar(async () => {
      const res = await crearFacturaAction({
        tenantSlug,
        saleId: nvSaleId,
        customerId: nvClienteNuevo ? null : nvCustomerId,
        clienteNuevo: nvClienteNuevo
          ? { name: nvNombre, rfc: nvRfc || undefined, phone: nvTelefono || undefined }
          : null,
      });
      if (res.ok) {
        setModalNueva(false);
        setSeleccionadaId(res.id);
        refrescar();
      } else {
        setFormError(res.error);
      }
    });
  };

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
            <FileText className="w-3 h-3" /> Nueva
          </button>
        </div>

        {/* Métricas rápidas */}
        <div className="grid grid-cols-3 gap-2 p-3 border-b border-border">
          {[
            { label: "Timbradas", value: totalTimbradas, color: "text-emerald-600" },
            { label: "Pendientes", value: totalPendientes, color: "text-amber-600" },
            { label: "Canceladas", value: totalCanceladas, color: "text-red-500" },
          ].map((m) => (
            <div key={m.label} className="bg-muted rounded-lg p-2 text-center">
              <p className={`text-[16px] font-semibold ${m.color}`}>{m.value}</p>
              <p className="text-[10.5px] text-muted-foreground">{m.label}</p>
            </div>
          ))}
        </div>

        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Folio, cliente o RFC..."
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
          {facturasFiltradas.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-xs">Sin resultados</div>
          )}
          {facturasFiltradas.map((f) => {
            const cfg = ESTADO_CONFIG[f.status];
            const Icono = cfg.icon;
            return (
              <div
                key={f.id}
                onClick={() => setSeleccionadaId(f.id)}
                className={`px-3 py-3 border-b border-border/60 cursor-pointer border-l-2 transition-all ${
                  seleccionada?.id === f.id
                    ? "bg-primary/5 border-l-primary"
                    : "hover:bg-muted border-l-transparent"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12.5px] font-semibold text-foreground">{f.folio}</span>
                  <span className={`flex items-center gap-1 text-[10.5px] font-medium px-2 py-0.5 rounded-full ${cfg.classes}`}>
                    <Icono className="w-2.5 h-2.5" />
                    {cfg.label}
                  </span>
                </div>
                <p className="text-[12.5px] text-muted-foreground mb-0.5">{f.customerName}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] text-muted-foreground">{formatFecha(f.createdAt)}</span>
                  <span className="text-[13.5px] font-semibold text-foreground">{formatMXN(f.total)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detalle */}
      <div className="flex-1 flex flex-col bg-muted overflow-hidden">
        {accionError && (
          <div className="bg-red-50 border-b border-red-100 text-red-700 text-xs px-4 py-2">{accionError}</div>
        )}

        {!seleccionada ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <FileText className="w-8 h-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No hay facturas generadas todavía.</p>
            {ventasSinFacturar.length > 0 && (
              <button onClick={abrirModalNueva} className="text-xs text-primary mt-1">+ Generar la primera</button>
            )}
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-card border-b border-border px-5 py-4">
              <div className="flex items-start justify-between mb-4 gap-2 flex-wrap">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <p className="text-[14px] font-semibold text-foreground">{seleccionada.folio}</p>
                    <span className={`flex items-center gap-1 text-[11.5px] font-medium px-2 py-0.5 rounded-full ${ESTADO_CONFIG[seleccionada.status].classes}`}>
                      {(() => { const Icono = ESTADO_CONFIG[seleccionada.status].icon; return <Icono className="w-3 h-3" />; })()}
                      {ESTADO_CONFIG[seleccionada.status].label}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-muted-foreground">
                    {formatFecha(seleccionada.createdAt)}
                    {seleccionada.saleFolio && ` · Venta ${seleccionada.saleFolio}`} · Ingreso
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {seleccionada.status === "STAMPED" && (
                    <>
                      <button
                        disabled
                        title="El timbrado de este módulo es simulado — no hay un PAC real conectado, así que no existe un XML/PDF real que descargar todavía."
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-[12.5px] text-muted-foreground opacity-50 cursor-not-allowed"
                      >
                        <Download className="w-3 h-3" /> XML
                      </button>
                      <button
                        disabled
                        title="El timbrado de este módulo es simulado — no hay un PAC real conectado, así que no existe un XML/PDF real que descargar todavía."
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-[12.5px] text-muted-foreground opacity-50 cursor-not-allowed"
                      >
                        <Download className="w-3 h-3" /> PDF
                      </button>
                      <button
                        onClick={() => handleCancelar(seleccionada)}
                        disabled={pending}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 border border-red-200 rounded-lg text-[12.5px] transition-colors"
                      >
                        <XCircle className="w-3 h-3" /> Cancelar
                      </button>
                    </>
                  )}
                  {seleccionada.status === "PENDING" && (
                    <>
                      <button
                        onClick={() => handleCancelar(seleccionada)}
                        disabled={pending}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-border hover:bg-muted disabled:opacity-50 rounded-lg text-[12.5px] font-medium text-muted-foreground"
                      >
                        <XCircle className="w-3 h-3" /> Cancelar
                      </button>
                      <button
                        onClick={() => handleTimbrar(seleccionada)}
                        disabled={pending}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-[12.5px] font-medium transition-colors"
                      >
                        <FileText className="w-3 h-3" /> Timbrar ahora
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Subtotal", value: seleccionada.saleSubtotal != null ? formatMXN(seleccionada.saleSubtotal) : "—" },
                  { label: "IVA", value: seleccionada.saleTax != null ? formatMXN(seleccionada.saleTax) : "—" },
                  { label: "Total", value: formatMXN(seleccionada.total), color: "text-primary" },
                  { label: "Tipo", value: "Ingreso" },
                ].map((s) => (
                  <div key={s.label} className="bg-muted rounded-lg p-3">
                    <p className="text-[10.5px] text-muted-foreground mb-1">{s.label}</p>
                    <p className={`text-[14px] font-semibold ${s.color || "text-foreground"}`}>{s.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {/* Datos del receptor */}
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-[11.5px] font-semibold text-muted-foreground tracking-widest mb-3">DATOS DEL RECEPTOR</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: "Nombre / Razón social", value: seleccionada.customerName },
                    { label: "RFC", value: seleccionada.customerRfc ?? "No capturado" },
                    { label: "Uso de CFDI", value: "G03 - Gastos en general" },
                    { label: "Método de pago", value: "PUE - Pago en una sola exhibición" },
                  ].map((field) => (
                    <div key={field.label} className="bg-muted rounded-lg p-2.5">
                      <p className="text-[10.5px] text-muted-foreground mb-0.5">{field.label}</p>
                      <p className="text-[12.5px] font-medium text-foreground">{field.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* UUID */}
              {seleccionada.status === "STAMPED" && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <p className="text-[12.5px] font-semibold text-emerald-700">Factura timbrada</p>
                  </div>
                  <div className="bg-card rounded-lg p-2.5 border border-emerald-200 mb-2">
                    <p className="text-[10.5px] text-muted-foreground mb-0.5">UUID (Folio Fiscal)</p>
                    <p className="text-[11.5px] font-mono text-foreground break-all">{seleccionada.uuid}</p>
                  </div>
                  <p className="text-[11.5px] text-emerald-700 flex items-start gap-1">
                    <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                    Timbrado simulado — este módulo todavía no está conectado a un PAC/SAT real.
                  </p>
                </div>
              )}

              {seleccionada.status === "PENDING" && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <p className="text-[12.5px] font-semibold text-amber-700">Factura pendiente de timbrar</p>
                  </div>
                  <p className="text-[12.5px] text-amber-600">
                    Esta factura aún no ha sido timbrada. Haz clic en &quot;Timbrar ahora&quot; para procesarla.
                  </p>
                </div>
              )}

              {seleccionada.status === "CANCELLED" && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="w-4 h-4 text-red-500" />
                    <p className="text-[12.5px] font-semibold text-red-600">Factura cancelada</p>
                  </div>
                  <p className="text-[12.5px] text-red-500">Esta factura fue cancelada y ya no tiene validez fiscal.</p>
                </div>
              )}

              {/* Resumen mes */}
              <div className="bg-gradient-to-r from-[#0F172A] to-[#1E293B] rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
                <div className="text-white">
                  <p className="text-[11.5px] text-white/50 mb-1">Total facturado — {nombreMesActual()}</p>
                  <p className="text-[22px] font-bold">{formatMXN(totalMes)}</p>
                  <p className="text-[11.5px] text-white/40 mt-1">{mesActual.length} facturas timbradas</p>
                </div>
                <div className="text-right">
                  <p className="text-[11.5px] text-white/50 mb-1">IVA trasladado</p>
                  <p className="text-[16px] font-semibold text-cyan-400">{formatMXN(ivaMes)}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal: nueva factura */}
      {modalNueva && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={cancelarModalNueva}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold text-foreground">Nueva factura</span>
              <button onClick={cancelarModalNueva} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {ventasSinFacturar.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No hay ventas completadas pendientes de facturar por el momento.
                </p>
              ) : (
                <>
                  <div>
                    <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">VENTA A FACTURAR</label>
                    <select
                      value={nvSaleId}
                      onChange={(e) => handleCambiarVenta(e.target.value)}
                      className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                    >
                      {ventasSinFacturar.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.folio} — {v.customerName ?? "Cliente de mostrador"} — {formatMXN(v.total)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">RECEPTOR DEL CFDI</label>
                      {ventaSeleccionadaNueva?.customerId && (
                        <button type="button" onClick={() => setNvClienteNuevo((v) => !v)} className="text-[11.5px] text-primary">
                          {nvClienteNuevo ? "Usar cliente de la venta" : "Facturar a otro receptor"}
                        </button>
                      )}
                    </div>
                    {nvClienteNuevo ? (
                      <div className="space-y-2 mt-1">
                        <input
                          value={nvNombre}
                          onChange={(e) => setNvNombre(e.target.value)}
                          placeholder="Nombre o razón social"
                          className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={nvRfc}
                            onChange={(e) => setNvRfc(e.target.value.toUpperCase())}
                            placeholder="RFC (opcional)"
                            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary uppercase"
                          />
                          <input
                            value={nvTelefono}
                            onChange={(e) => setNvTelefono(e.target.value)}
                            placeholder="Teléfono (opcional)"
                            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                          />
                        </div>
                      </div>
                    ) : (
                      <select
                        value={nvCustomerId}
                        onChange={(e) => setNvCustomerId(e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                      >
                        <option value="">Selecciona...</option>
                        {clientes.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}{c.rfc ? ` — ${c.rfc}` : ""}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {formError && <p className="text-[12.5px] text-red-600">{formError}</p>}
                </>
              )}
            </div>

            {ventasSinFacturar.length > 0 && (
              <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
                <button
                  onClick={cancelarModalNueva}
                  className="px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-foreground hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCrearFactura}
                  disabled={guardando}
                  className="px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-xs font-medium"
                >
                  {guardando ? "Generando..." : "Generar factura"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
