"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Plus, Check, Clock, ExternalLink, Copy,
  Wrench, Package, Stethoscope, Store, ArrowRight,
  Phone, CheckCircle, AlertCircle, ChevronLeft, X,
  Printer, Trash2, Pencil,
} from "lucide-react";
import type {
  ReparacionesData, ReparacionUI, EstadoReparacion, PrioridadReparacion, ProductoParaReparacion,
} from "@/lib/reparaciones-data";
import { label, type LabelDictionary } from "@/lib/labels";
import {
  crearReparacionAction, avanzarEstadoAction, marcarWhatsappEnviadoAction, cobrarYEntregarAction,
  agregarPiezaReparacionAction, eliminarPiezaReparacionAction, actualizarCostoEstimadoAction,
  type NuevoEstadoReparacion, type MetodoPagoReparacion,
} from "@/app/actions/reparaciones-actions";
import { PAISES_TELEFONO, PAIS_TELEFONO_DEFAULT } from "@/lib/paises";

interface BranchOption {
  id: string;
  name: string;
}

interface ReparacionesClientProps {
  data: ReparacionesData;
  labels: LabelDictionary;
  branches: BranchOption[];
  tenantSlug: string;
  // Rol real del actor que abrió esta página (lib/roles.ts) — null para el
  // dueño/administrador (cuenta de Supabase Auth, sin restricción de vista)
  // y para Gerente/Técnico. Solo "Cajero" cambia a la vista de mostrador
  // (VistaTienda): cobrar y entregar equipos ya reparados, sin el tablero
  // completo de estados que sí necesita un Técnico. Reemplaza al viejo
  // "simulador de rol" (rolDemo, puramente de UI) ahora que M11 sí tiene
  // sesiones y roles reales.
  roleName: string | null;
}

const ESTADO_BADGE: Record<EstadoReparacion, string> = {
  RECEIVED: "bg-blue-50 text-blue-700",
  DIAGNOSING: "bg-blue-50 text-blue-700",
  WAITING_PARTS: "bg-amber-50 text-amber-700",
  IN_REPAIR: "bg-purple-50 text-purple-700",
  READY: "bg-emerald-50 text-emerald-700",
  DELIVERED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-red-50 text-red-600",
  WORKSHOP_READY: "bg-emerald-50 text-emerald-700",
  WORKSHOP_RETURN: "bg-orange-50 text-orange-700",
  SHOP_READY: "bg-cyan-50 text-cyan-700",
  SHOP_RETURN: "bg-red-50 text-red-600",
};

const PRIORIDAD_TEXTO: Record<PrioridadReparacion, string> = {
  LOW: "Baja", NORMAL: "Normal", HIGH: "Alta", URGENT: "Urgente",
};

const PRIORIDAD_CONFIG: Record<PrioridadReparacion, { classes: string; dot: string }> = {
  LOW: { classes: "bg-muted text-muted-foreground", dot: "text-muted-foreground" },
  NORMAL: { classes: "bg-amber-50 text-amber-600", dot: "text-amber-400" },
  HIGH: { classes: "bg-red-50 text-red-600", dot: "text-red-500" },
  URGENT: { classes: "bg-red-100 text-red-700", dot: "text-red-600" },
};

const HISTORIAL_ICONOS: Record<EstadoReparacion, { icon: React.ElementType; bg: string; color: string }> = {
  RECEIVED: { icon: Package, bg: "bg-muted", color: "text-muted-foreground" },
  DIAGNOSING: { icon: Stethoscope, bg: "bg-blue-50", color: "text-blue-600" },
  WAITING_PARTS: { icon: Package, bg: "bg-amber-50", color: "text-amber-600" },
  IN_REPAIR: { icon: Wrench, bg: "bg-purple-50", color: "text-purple-600" },
  READY: { icon: Check, bg: "bg-emerald-50", color: "text-emerald-600" },
  DELIVERED: { icon: CheckCircle, bg: "bg-muted", color: "text-muted-foreground" },
  CANCELLED: { icon: AlertCircle, bg: "bg-red-50", color: "text-red-600" },
  WORKSHOP_READY: { icon: Wrench, bg: "bg-emerald-50", color: "text-emerald-600" },
  WORKSHOP_RETURN: { icon: ArrowRight, bg: "bg-orange-50", color: "text-orange-600" },
  SHOP_READY: { icon: Store, bg: "bg-cyan-50", color: "text-cyan-600" },
  SHOP_RETURN: { icon: ArrowRight, bg: "bg-red-50", color: "text-red-600" },
};

const flujoSteps = [
  { key: "recibido", label: "Recibido", icon: Package },
  { key: "taller", label: "Taller", icon: Wrench },
  { key: "tienda", label: "Tienda", icon: Store },
  { key: "entregado", label: "Entregado", icon: Check },
];

function getStepIndex(estado: EstadoReparacion) {
  if (estado === "RECEIVED") return 0;
  if (estado === "DIAGNOSING" || estado === "WAITING_PARTS" || estado === "IN_REPAIR") return 1;
  if (estado === "WORKSHOP_READY" || estado === "WORKSHOP_RETURN") return 2;
  if (estado === "SHOP_READY" || estado === "SHOP_RETURN") return 3;
  if (estado === "DELIVERED" || estado === "READY") return 4;
  return 0;
}

function esDevolucion(estado: EstadoReparacion) {
  return estado === "WORKSHOP_RETURN" || estado === "SHOP_RETURN";
}

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const formatFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

const formatFechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true });

const esMismoDia = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

// Mismo criterio de "humanizar el slug" que usa TenantShell.tsx para el
// nombre del negocio en el sidebar — duplicado aquí a propósito (este
// componente no recibe el nombre "bonito" del tenant como prop).
function nombreNegocio(tenantSlug: string): string {
  return decodeURIComponent(tenantSlug).replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

interface TicketPieza {
  productName: string;
  quantity: number;
  price: number;
}

interface TicketData {
  folio: string;
  cliente: string;
  telefono: string | null;
  marca: string;
  modelo: string;
  falla: string;
  piezas: TicketPieza[];
  costoEstimado: number | null;
}

/**
 * Ticket de recepción imprimible — respuesta directa a que "el cliente debe
 * conocer cuánto le saldrá la reparación antes de decidir dejarlo... así
 * como en el ticket que se le entregará". Antes de esto no existía ningún
 * comprobante entregable al cliente (solo el mensaje de WhatsApp). Se abre
 * en una ventana aparte con su propio HTML/CSS mínimo — así no hay que
 * pelear con el layout/tema oscuro de la app para que imprima limpio, y
 * funciona igual sin importar el navegador. No es un CFDI/factura fiscal
 * (eso sigue pendiente, ver notas del proyecto) — es solo el comprobante de
 * recepción con el costo pactado, para que quede algo físico en la mano del
 * cliente.
 */
function abrirTicketImprimible(t: TicketData, negocio: string) {
  if (typeof window === "undefined") return;
  const subtotalPiezas = t.piezas.reduce((s, p) => s + p.price * p.quantity, 0);
  const filasPiezas = t.piezas
    .map(
      (p) => `
        <tr>
          <td>${p.productName}</td>
          <td style="text-align:center">${p.quantity}</td>
          <td style="text-align:right">${formatMXN(p.price)}</td>
          <td style="text-align:right">${formatMXN(p.price * p.quantity)}</td>
        </tr>`
    )
    .join("");

  const win = window.open("", "_blank", "width=420,height=720");
  if (!win) return;

  win.document.write(`
    <!DOCTYPE html>
    <html lang="es-MX">
    <head>
      <meta charset="utf-8" />
      <title>Ticket ${t.folio}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; padding: 20px; color: #111827; font-size: 13px; max-width: 380px; margin: 0 auto; }
        h1 { font-size: 16px; margin: 0 0 2px; }
        .muted { color: #6b7280; font-size: 11px; margin: 0; }
        hr { border: none; border-top: 1px dashed #9ca3af; margin: 10px 0; }
        p { margin: 4px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 6px; }
        th, td { padding: 4px 2px; font-size: 11.5px; border-bottom: 1px solid #f3f4f6; }
        th { text-align: left; color: #6b7280; font-weight: 600; }
        .total { font-size: 15px; font-weight: bold; text-align: right; margin-top: 8px; }
        .aviso { margin-top: 14px; font-size: 10.5px; color: #4b5563; border-top: 1px dashed #9ca3af; padding-top: 8px; }
        .firma { margin-top: 40px; border-top: 1px solid #374151; padding-top: 4px; font-size: 11px; text-align: center; color: #374151; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>${negocio}</h1>
      <p class="muted">Recibo de reparación · ${t.folio}</p>
      <p class="muted">${new Date().toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })}</p>
      <hr />
      <p><strong>Cliente:</strong> ${t.cliente}${t.telefono ? ` · ${t.telefono}` : ""}</p>
      <p><strong>Equipo:</strong> ${t.marca} ${t.modelo}</p>
      <p><strong>Falla reportada:</strong> ${t.falla}</p>
      ${
        t.piezas.length > 0
          ? `<hr />
      <table>
        <thead><tr><th>Pieza</th><th style="text-align:center">Cant.</th><th style="text-align:right">P. Unit.</th><th style="text-align:right">Subtotal</th></tr></thead>
        <tbody>${filasPiezas}</tbody>
      </table>
      <p class="muted" style="text-align:right">Subtotal piezas: ${formatMXN(subtotalPiezas)}</p>`
          : ""
      }
      <hr />
      <p class="total">Costo estimado: ${t.costoEstimado != null ? formatMXN(t.costoEstimado) : "Por definir"}</p>
      <p class="aviso">Este costo es un estimado y puede ajustarse tras el diagnóstico completo del equipo. Cualquier cambio se te notificará antes de proceder con la reparación.</p>
      <div class="firma">Firma de conformidad</div>
    </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

/* ── Botón de acción por estado ── */
function AccionBtn({
  estado, onAvanzar, onCobrarClick, pending,
}: {
  estado: EstadoReparacion;
  onAvanzar: (nuevoEstado: NuevoEstadoReparacion) => void;
  onCobrarClick: () => void;
  pending: boolean;
}) {
  if (estado === "RECEIVED") return (
    <button disabled={pending} onClick={() => onAvanzar("IN_REPAIR")}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
      <Wrench className="w-3 h-3" /> Iniciar reparación
    </button>
  );
  if (estado === "IN_REPAIR") return (
    <div className="flex gap-2 flex-wrap">
      <button disabled={pending} onClick={() => onAvanzar("WORKSHOP_READY")}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
        <Check className="w-3 h-3" /> Listo en Taller
      </button>
      <button disabled={pending} onClick={() => onAvanzar("WORKSHOP_RETURN")}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
        <ArrowRight className="w-3 h-3" /> Devolución Taller
      </button>
    </div>
  );
  if (estado === "WORKSHOP_READY" || estado === "WORKSHOP_RETURN") return (
    <button disabled={pending} onClick={() => onAvanzar(estado === "WORKSHOP_READY" ? "SHOP_READY" : "SHOP_RETURN")}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
        estado === "WORKSHOP_READY" ? "bg-cyan-500 hover:bg-cyan-600" : "bg-orange-500 hover:bg-orange-600"
      }`}>
      <Store className="w-3 h-3" /> Trasladar a Tienda
    </button>
  );
  // SHOP_READY (reparación exitosa) SIEMPRE pasa por el modal de cobro antes
  // de entregarse — ver cobrarYEntregarAction. SHOP_RETURN (devolución, no
  // se pudo reparar) no tiene cargo, así que se entrega directo.
  if (estado === "SHOP_READY") return (
    <button disabled={pending} onClick={onCobrarClick}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-xs font-medium transition-colors">
      <Check className="w-3 h-3" /> Cobrar y entregar
    </button>
  );
  if (estado === "SHOP_RETURN") return (
    <button disabled={pending} onClick={() => onAvanzar("DELIVERED")}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-xs font-medium transition-colors">
      <Check className="w-3 h-3" /> Marcar entregado
    </button>
  );
  return null;
}

/* ── VISTA TIENDA ── */
function VistaTienda({
  reparaciones, labels, onAvanzar, onWhatsapp, onCobrarClick, pending,
}: {
  reparaciones: ReparacionUI[];
  labels: LabelDictionary;
  onAvanzar: (repairId: string, nuevoEstado: NuevoEstadoReparacion) => void;
  onWhatsapp: (repairId: string) => void;
  onCobrarClick: (repairId: string, costoEstimado: number | null) => void;
  pending: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("Pendientes");
  const enTienda = reparaciones.filter((r) => r.estado === "SHOP_READY" || r.estado === "SHOP_RETURN");
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(enTienda[0]?.id ?? reparaciones[0]?.id ?? null);
  const [mostrarDetalle, setMostrarDetalle] = useState(false);

  const seleccionada = reparaciones.find((r) => r.id === seleccionadaId) ?? reparaciones[0] ?? null;

  const tiendaReps = reparaciones.filter((r) => {
    const esTienda = r.estado === "SHOP_READY" || r.estado === "SHOP_RETURN";
    const esEntregadoHoy = r.estado === "DELIVERED" && r.fechaEntregado != null && esMismoDia(r.fechaEntregado);
    const match =
      r.cliente.toLowerCase().includes(busqueda.toLowerCase()) ||
      r.folio.toLowerCase().includes(busqueda.toLowerCase()) ||
      (r.telefono ?? "").includes(busqueda);
    if (!match) return false;
    if (filtro === "Pendientes") return esTienda;
    if (filtro === "Entregados hoy") return esEntregadoHoy;
    return true;
  });

  const totalListos = reparaciones.filter((r) => r.estado === "SHOP_READY").length;
  const totalDevoluciones = reparaciones.filter((r) => r.estado === "SHOP_RETURN").length;
  const totalEntregados = reparaciones.filter((r) => r.estado === "DELIVERED").length;
  const activoLabel = label(labels, "entity.repair.asset");

  if (!seleccionada) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-10 text-center">
        <Wrench className="w-8 h-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm font-medium text-foreground mb-1">Sin {label(labels, "entity.repair.plural").toLowerCase()} registradas</p>
      </div>
    );
  }

  const isDev = seleccionada.estado === "SHOP_RETURN";

  return (
    <div className="flex h-full">
      <div className={`${mostrarDetalle ? "hidden md:flex" : "flex"} w-full md:w-72 flex-col bg-card border-r border-border flex-shrink-0`}>
        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Cliente, folio o teléfono..."
              className="w-full pl-7 pr-3 py-1.5 border border-border rounded-lg text-xs bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 px-3 py-2 border-b border-border">
          {[
            { label: "Listos", value: totalListos, color: "text-emerald-600" },
            { label: "Devoluciones", value: totalDevoluciones, color: "text-amber-600" },
            { label: "Entregados", value: totalEntregados, color: "text-muted-foreground" },
          ].map((s) => (
            <div key={s.label} className="bg-muted rounded-lg py-2 text-center">
              <p className={`text-base font-semibold ${s.color}`}>{s.value}</p>
              <p className="text-[9px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-1 px-3 py-2 border-b border-border">
          {["Pendientes", "Entregados hoy", "Todo"].map((tab) => (
            <button key={tab} onClick={() => setFiltro(tab)}
              className={`px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors ${
                filtro === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
              }`}>
              {tab}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {tiendaReps.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">Sin equipos pendientes</div>
          ) : tiendaReps.map((rep) => (
            <div key={rep.id} onClick={() => { setSeleccionadaId(rep.id); setMostrarDetalle(true); }}
              className={`p-3 rounded-xl border mb-2 cursor-pointer transition-all ${
                seleccionada.id === rep.id ? "bg-primary/5 border-primary" : "bg-card border-border hover:border-foreground/30"
              } ${rep.estado === "SHOP_READY" ? "border-l-2 border-l-emerald-500" : rep.estado === "SHOP_RETURN" ? "border-l-2 border-l-amber-400" : ""}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${ESTADO_BADGE[rep.estado]}`}>
                  {rep.iniciales}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">{rep.cliente}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{rep.modelo} · {rep.falla}</p>
                </div>
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${ESTADO_BADGE[rep.estado]}`}>
                  {rep.estado === "SHOP_READY" ? "Listo" : rep.estado === "SHOP_RETURN" ? "Devolución" : "Entregado"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" /> {rep.folio}
                </span>
                {rep.telefono && (
                  <span className="text-[10px] text-primary flex items-center gap-1">
                    <Phone className="w-2.5 h-2.5" /> {rep.telefono}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`${mostrarDetalle ? "flex" : "hidden md:flex"} flex-1 flex-col bg-muted overflow-hidden`}>
        <div className="bg-card border-b border-border px-4 sm:px-5 py-3">
          <button onClick={() => setMostrarDetalle(false)} className="md:hidden flex items-center gap-1 text-primary text-xs font-medium mb-3">
            <ChevronLeft className="w-4 h-4" /> Volver a la lista
          </button>

          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-semibold flex-shrink-0 ${ESTADO_BADGE[seleccionada.estado]}`}>
                {seleccionada.iniciales}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{seleccionada.cliente}</p>
                <p className="text-xs text-muted-foreground">{seleccionada.folio} · {seleccionada.telefono ?? "sin teléfono"}</p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <button disabled={pending} onClick={() => onWhatsapp(seleccionada.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366] hover:bg-[#22c35e] disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
                <Phone className="w-3 h-3" /> Avisar
              </button>
              {seleccionada.estado === "SHOP_READY" && (
                <button disabled={pending} onClick={() => onCobrarClick(seleccionada.id, seleccionada.costoEstimado)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-xs font-medium transition-colors">
                  <CheckCircle className="w-3 h-3" /> Cobrar y entregar
                </button>
              )}
              {seleccionada.estado === "SHOP_RETURN" && (
                <button disabled={pending} onClick={() => onAvanzar(seleccionada.id, "DELIVERED")}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-xs font-medium transition-colors">
                  <CheckCircle className="w-3 h-3" /> Entregar
                </button>
              )}
            </div>
          </div>

          {seleccionada.estado !== "DELIVERED" && (
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${isDev ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
              {isDev ? <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" /> : <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />}
              <div>
                <p className={`text-xs font-semibold ${isDev ? "text-amber-700" : "text-emerald-700"}`}>
                  {isDev ? "Equipo para devolver al cliente" : "Equipo listo para entregar"}
                </p>
                <p className={`text-[10px] mt-0.5 ${isDev ? "text-amber-600" : "text-emerald-600"}`}>
                  {seleccionada.modelo} ·{" "}
                  {isDev ? "No fue posible realizar la reparación" : `Reparación completada${seleccionada.costoFinal || seleccionada.costoEstimado ? ` · Costo: ${formatMXN(seleccionada.costoFinal ?? seleccionada.costoEstimado ?? 0)}` : ""}`}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold text-muted-foreground tracking-widest mb-3">DATOS DE {activoLabel.toUpperCase()}</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: activoLabel, value: `${seleccionada.marca} ${seleccionada.modelo}` },
                { label: "Falla", value: seleccionada.falla },
                { label: "Costo final", value: seleccionada.costoFinal ? formatMXN(seleccionada.costoFinal) : isDev ? "Sin cargo" : "Por definir", color: isDev ? "text-amber-600" : "text-primary" },
                { label: "Técnico", value: seleccionada.tecnico },
              ].map((f) => (
                <div key={f.label} className="bg-muted rounded-lg p-2.5">
                  <p className="text-[9px] text-muted-foreground mb-0.5">{f.label}</p>
                  <p className={`text-xs font-medium ${f.color || "text-foreground"}`}>{f.value}</p>
                </div>
              ))}
            </div>
            {seleccionada.piezas.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border">
                <p className="text-[9px] text-muted-foreground mb-1">Piezas asignadas</p>
                {seleccionada.piezas.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-[11px] text-muted-foreground py-0.5">
                    <span className="truncate flex-1">{p.productName} × {p.quantity}</span>
                    <span>{formatMXN(p.price * p.quantity)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold text-muted-foreground tracking-widest mb-3">HISTORIAL</p>
            <div className="space-y-3">
              {seleccionada.historial.slice(0, 4).map((h, i) => {
                const cfg = HISTORIAL_ICONOS[h.estado] || HISTORIAL_ICONOS.RECEIVED;
                const Icon = cfg.icon;
                return (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                      <Icon className={`w-3 h-3 ${cfg.color}`} />
                    </div>
                    <div>
                      <p className="text-xs text-foreground">{h.nota ?? label(labels, `repair.status.${h.estado}`)}</p>
                      <p className="text-[10px] text-muted-foreground">{formatFechaHora(h.fecha)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── VISTA ADMIN / TÉCNICO ── */
function VistaAdmin({
  reparaciones, labels, onAvanzar, onWhatsapp, onCobrarClick, pending, onNuevaClick,
  productos, negocio, tenantSlug, router,
}: {
  reparaciones: ReparacionUI[];
  labels: LabelDictionary;
  onAvanzar: (repairId: string, nuevoEstado: NuevoEstadoReparacion) => void;
  onWhatsapp: (repairId: string) => void;
  onCobrarClick: (repairId: string, costoEstimado: number | null) => void;
  pending: boolean;
  onNuevaClick: () => void;
  productos: ProductoParaReparacion[];
  negocio: string;
  tenantSlug: string;
  router: ReturnType<typeof useRouter>;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("Todas");
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(reparaciones[0]?.id ?? null);
  const [copiado, setCopiado] = useState(false);
  const [mostrarDetalle, setMostrarDetalle] = useState(false);
  const activoLabel = label(labels, "entity.repair.asset");

  const [piezaAccion, startPiezaAccion] = useTransition();
  const [piezaError, setPiezaError] = useState<string | null>(null);
  const [piezaProductoId, setPiezaProductoId] = useState("");
  const [piezaCantidad, setPiezaCantidad] = useState("1");
  const [editandoCosto, setEditandoCosto] = useState(false);
  const [costoEditado, setCostoEditado] = useState("");

  const agregarPieza = (repairId: string) => {
    if (!piezaProductoId) return;
    const cantidad = Math.max(1, parseInt(piezaCantidad, 10) || 1);
    setPiezaError(null);
    startPiezaAccion(async () => {
      const res = await agregarPiezaReparacionAction({ tenantSlug, repairId, productId: piezaProductoId, quantity: cantidad });
      if (res.ok) {
        setPiezaProductoId("");
        setPiezaCantidad("1");
        router.refresh();
      } else {
        setPiezaError(res.error);
      }
    });
  };

  const quitarPieza = (repairId: string, itemId: string) => {
    setPiezaError(null);
    startPiezaAccion(async () => {
      const res = await eliminarPiezaReparacionAction({ tenantSlug, repairId, itemId });
      if (res.ok) router.refresh();
      else setPiezaError(res.error);
    });
  };

  const guardarCostoEditado = (repairId: string) => {
    const valor = parseFloat(costoEditado);
    if (!Number.isFinite(valor) || valor < 0) {
      setPiezaError("Ingresa un costo válido");
      return;
    }
    setPiezaError(null);
    startPiezaAccion(async () => {
      const res = await actualizarCostoEstimadoAction({ tenantSlug, repairId, costoEstimado: valor });
      if (res.ok) {
        setEditandoCosto(false);
        router.refresh();
      } else {
        setPiezaError(res.error);
      }
    });
  };

  const filtrosMap: Record<string, EstadoReparacion[]> = {
    "Todas": [],
    "Recibidas": ["RECEIVED", "DIAGNOSING", "WAITING_PARTS", "IN_REPAIR"],
    "En taller": ["WORKSHOP_READY", "WORKSHOP_RETURN"],
    "En tienda": ["SHOP_READY", "SHOP_RETURN"],
    "Entregadas": ["DELIVERED"],
  };

  const filtradas = reparaciones.filter((r) => {
    const ok1 = filtrosMap[filtro].length === 0 || filtrosMap[filtro].includes(r.estado);
    const ok2 = r.folio.toLowerCase().includes(busqueda.toLowerCase()) || r.cliente.toLowerCase().includes(busqueda.toLowerCase());
    return ok1 && ok2;
  });

  const seleccionada = reparaciones.find((r) => r.id === seleccionadaId) ?? null;

  if (!seleccionada) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <span className="text-sm font-medium text-foreground">{label(labels, "module.repair.name")}</span>
          <button onClick={onNuevaClick} className="flex items-center gap-1 bg-primary text-primary-foreground text-xs font-medium px-2.5 py-1.5 rounded-lg">
            <Plus className="w-3 h-3" /> Nueva
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
          <Wrench className="w-8 h-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium text-foreground mb-1">Sin {label(labels, "entity.repair.plural").toLowerCase()} registradas</p>
          <p className="text-xs text-muted-foreground">Crea la primera con el botón "Nueva".</p>
        </div>
      </div>
    );
  }

  const stepIdx = getStepIndex(seleccionada.estado);
  const devolucion = esDevolucion(seleccionada.estado);
  const copiarLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(`linkity.mx/rep/${seleccionada.publicToken}`).catch(() => {});
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="flex h-full">
      <div className={`${mostrarDetalle ? "hidden md:flex" : "flex"} w-full md:w-72 flex-col bg-card border-r border-border flex-shrink-0`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-medium text-foreground">{label(labels, "module.repair.name")}</span>
          <button onClick={onNuevaClick} className="flex items-center gap-1 bg-primary text-primary-foreground text-xs font-medium px-2.5 py-1.5 rounded-lg">
            <Plus className="w-3 h-3" /> Nueva
          </button>
        </div>

        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar folio o cliente..."
              className="w-full pl-7 pr-3 py-1.5 border border-border rounded-lg text-xs bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
          </div>
        </div>

        <div className="flex gap-1 px-3 py-2 border-b border-border overflow-x-auto">
          {Object.keys(filtrosMap).map((tab) => (
            <button key={tab} onClick={() => setFiltro(tab)}
              className={`px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors ${
                filtro === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
              }`}>
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtradas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">Sin resultados</div>
          ) : filtradas.map((rep) => (
            <div key={rep.id} onClick={() => { setSeleccionadaId(rep.id); setMostrarDetalle(true); }}
              className={`px-3 py-3 border-b border-border/60 cursor-pointer transition-all border-l-2 ${
                seleccionada.id === rep.id ? "bg-primary/5 border-l-primary" : "hover:bg-muted border-l-transparent"
              }`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${ESTADO_BADGE[rep.estado]}`}>
                  {rep.iniciales}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">{rep.folio}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{rep.modelo} · {rep.falla}</p>
                </div>
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${ESTADO_BADGE[rep.estado]}`}>
                  {label(labels, `repair.status.${rep.estado}`)}
                </span>
              </div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-muted-foreground">{formatFecha(rep.fechaRecibido)}</span>
                <span className={`text-[10px] font-medium ${PRIORIDAD_CONFIG[rep.prioridad].dot}`}>
                  ● {PRIORIDAD_TEXTO[rep.prioridad]}
                </span>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${esDevolucion(rep.estado) ? "bg-orange-400" : "bg-primary"}`}
                  style={{ width: `${(getStepIndex(rep.estado) / 4) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`${mostrarDetalle ? "flex" : "hidden md:flex"} flex-1 flex-col bg-muted overflow-hidden`}>
        <div className="bg-card border-b border-border px-4 sm:px-5 py-3">
          <button onClick={() => setMostrarDetalle(false)} className="md:hidden flex items-center gap-1 text-primary text-xs font-medium mb-3">
            <ChevronLeft className="w-4 h-4" /> Volver a la lista
          </button>

          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-xs font-semibold flex-shrink-0 ${ESTADO_BADGE[seleccionada.estado]}`}>
                {seleccionada.iniciales}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {seleccionada.folio}
                  <span className="text-xs font-normal text-muted-foreground ml-1 hidden sm:inline">— {seleccionada.marca} {seleccionada.modelo}</span>
                </p>
                <p className="text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-none">{seleccionada.cliente} · {seleccionada.telefono ?? "sin teléfono"}</p>
              </div>
            </div>
            <div className="flex gap-1.5 sm:gap-2 items-center flex-wrap justify-end">
              <button
                onClick={() =>
                  abrirTicketImprimible(
                    {
                      folio: seleccionada.folio,
                      cliente: seleccionada.cliente,
                      telefono: seleccionada.telefono,
                      marca: seleccionada.marca,
                      modelo: seleccionada.modelo,
                      falla: seleccionada.falla,
                      piezas: seleccionada.piezas,
                      costoEstimado: seleccionada.costoEstimado,
                    },
                    negocio
                  )
                }
                className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-accent text-foreground rounded-lg text-xs font-medium transition-colors">
                <Printer className="w-3 h-3" /> Ticket
              </button>
              <AccionBtn estado={seleccionada.estado} pending={pending}
                onAvanzar={(nuevo) => onAvanzar(seleccionada.id, nuevo)}
                onCobrarClick={() => onCobrarClick(seleccionada.id, seleccionada.costoEstimado)} />
            </div>
          </div>

          {seleccionada.estado !== "CANCELLED" && (
            <div className="flex items-center">
              {flujoSteps.map((step, i) => {
                const Icon = step.icon;
                const isDone = i < stepIdx;
                const isCurrent = i === stepIdx;
                const isDevStep = devolucion && (isCurrent || isDone) && i >= 1;
                const stepColor = isDevStep ? "bg-orange-500 border-orange-500" : "bg-primary border-primary";
                const lineColor = isDevStep ? "bg-orange-400" : "bg-primary";
                const labelColor = isCurrent ? (devolucion ? "text-orange-500" : "text-primary") : isDone ? "text-primary" : "text-muted-foreground";
                return (
                  <div key={step.key} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center">
                      <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center border-2 transition-all ${
                        isDone ? stepColor : isCurrent ? `bg-card ${devolucion ? "border-orange-500" : "border-primary"}` : "bg-card border-border"
                      }`}>
                        {isDone ? <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" /> : <Icon className={`w-2.5 h-2.5 sm:w-3 sm:h-3 ${isCurrent ? (devolucion ? "text-orange-500" : "text-primary") : "text-muted-foreground/50"}`} />}
                      </div>
                      <div className="flex flex-col items-center mt-1">
                        <span className={`text-[8px] sm:text-[9px] whitespace-nowrap font-medium ${labelColor}`}>{step.label}</span>
                        {(step.key === "taller" || step.key === "tienda") && isCurrent && (
                          <span className={`text-[7px] sm:text-[8px] font-semibold ${devolucion ? "text-orange-500" : "text-emerald-500"}`}>
                            {devolucion ? "Dev." : "Listo"}
                          </span>
                        )}
                      </div>
                    </div>
                    {i < flujoSteps.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-1 mb-5 transition-all ${i < stepIdx ? lineColor : "bg-border"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold text-muted-foreground tracking-widest mb-3">DETALLES DE {activoLabel.toUpperCase()}</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: `Marca / Modelo`, value: `${seleccionada.marca} ${seleccionada.modelo}` },
                { label: "Falla reportada", value: seleccionada.falla },
                { label: "Fecha estimada", value: seleccionada.fechaEstimada ? formatFecha(seleccionada.fechaEstimada) : "Sin definir" },
                { label: "Técnico", value: seleccionada.tecnico },
                { label: "Prioridad", value: PRIORIDAD_TEXTO[seleccionada.prioridad], badge: PRIORIDAD_CONFIG[seleccionada.prioridad].classes },
              ].map((f) => (
                <div key={f.label} className="bg-muted rounded-lg p-2.5">
                  <p className="text-[9px] text-muted-foreground mb-0.5">{f.label}</p>
                  {f.badge
                    ? <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${f.badge}`}>{f.value}</span>
                    : <p className="text-xs font-medium text-foreground">{f.value}</p>}
                </div>
              ))}

              <div className="bg-muted rounded-lg p-2.5 col-span-2">
                <p className="text-[9px] text-muted-foreground mb-0.5">Costo estimado</p>
                {editandoCosto ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <input type="number" autoFocus value={costoEditado} onChange={(e) => setCostoEditado(e.target.value)}
                      placeholder="$0"
                      className="w-24 px-2 py-1 border border-border rounded-md text-xs bg-card focus:outline-none focus:border-primary" />
                    <button disabled={piezaAccion} onClick={() => guardarCostoEditado(seleccionada.id)}
                      className="px-2 py-1 bg-primary text-primary-foreground rounded-md text-[11px] disabled:opacity-50">
                      Guardar
                    </button>
                    <button onClick={() => setEditandoCosto(false)} className="px-2 py-1 text-[11px] text-muted-foreground">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium text-primary">
                      {seleccionada.costoEstimado ? formatMXN(seleccionada.costoEstimado) : "Por definir"}
                    </p>
                    <button
                      onClick={() => { setEditandoCosto(true); setCostoEditado(seleccionada.costoEstimado != null ? String(seleccionada.costoEstimado) : ""); }}
                      className="text-muted-foreground hover:text-foreground">
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold text-muted-foreground tracking-widest mb-3">PIEZAS / REFACCIONES</p>
            {piezaError && <p className="text-[10px] text-red-600 mb-2">{piezaError}</p>}
            {seleccionada.piezas.length === 0 ? (
              <p className="text-[11px] text-muted-foreground mb-2">Sin piezas asignadas todavía.</p>
            ) : (
              <div className="mb-2 divide-y divide-border border border-border rounded-lg">
                {seleccionada.piezas.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-2.5 py-1.5 text-xs">
                    <span className="flex-1 truncate">{p.productName} × {p.quantity}</span>
                    <span className="text-muted-foreground mr-2">{formatMXN(p.price * p.quantity)}</span>
                    <button disabled={piezaAccion} onClick={() => quitarPieza(seleccionada.id, p.id)}
                      className="text-muted-foreground hover:text-red-600 disabled:opacity-40">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between px-2.5 py-1.5 text-xs font-medium">
                  <span>Subtotal piezas</span>
                  <span>{formatMXN(seleccionada.piezas.reduce((s, p) => s + p.price * p.quantity, 0))}</span>
                </div>
              </div>
            )}
            {seleccionada.estado !== "DELIVERED" && seleccionada.estado !== "CANCELLED" && (
              <div className="flex gap-1.5">
                <select value={piezaProductoId} onChange={(e) => setPiezaProductoId(e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1.5 border border-border rounded-lg text-[11px] bg-muted focus:outline-none focus:border-primary">
                  <option value="">Selecciona una pieza…</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} — {formatMXN(p.price)}</option>
                  ))}
                </select>
                <input type="number" min={1} value={piezaCantidad} onChange={(e) => setPiezaCantidad(e.target.value)}
                  className="w-12 px-2 py-1.5 border border-border rounded-lg text-[11px] bg-muted focus:outline-none focus:border-primary" />
                <button disabled={!piezaProductoId || piezaAccion} onClick={() => agregarPieza(seleccionada.id)}
                  className="px-2.5 py-1.5 bg-muted hover:bg-accent disabled:opacity-40 rounded-lg text-primary">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold text-muted-foreground tracking-widest mb-3">HISTORIAL</p>
            <div className="space-y-3">
              {seleccionada.historial.map((h, i) => {
                const cfg = HISTORIAL_ICONOS[h.estado] || HISTORIAL_ICONOS.RECEIVED;
                const Icon = cfg.icon;
                return (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                      <Icon className={`w-3 h-3 ${cfg.color}`} />
                    </div>
                    <div>
                      <p className="text-xs text-foreground">{h.nota ?? label(labels, `repair.status.${h.estado}`)}</p>
                      <p className="text-[10px] text-muted-foreground">{formatFechaHora(h.fecha)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="sm:col-span-2 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-[#25D366] rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">W</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-emerald-700 truncate">
                  {seleccionada.whatsappSent ? `Mensaje enviado a ${seleccionada.cliente}` : "WhatsApp no enviado aún"}
                </p>
              </div>
              {seleccionada.whatsappSent && (
                <button disabled={pending} onClick={() => onWhatsapp(seleccionada.id)}
                  className="px-3 py-1.5 bg-[#25D366] hover:bg-[#22c35e] disabled:opacity-50 text-white text-xs font-medium rounded-lg flex-shrink-0">
                  Reenviar
                </button>
              )}
            </div>
            {seleccionada.whatsappSent ? (
              <>
                <div className="bg-[#DCF8C6] rounded-lg p-3 text-xs text-slate-800 leading-relaxed mb-2">
                  Hola {seleccionada.cliente.split(" ")[0]} 👋, tu <strong>{seleccionada.modelo}</strong> está siendo atendido.{" "}
                  {seleccionada.costoEstimado
                    ? <>Costo estimado: <strong>{formatMXN(seleccionada.costoEstimado)}</strong>. </>
                    : ""}
                  Puedes ver el estado aquí:
                </div>
                <div className="flex items-center gap-2 bg-card rounded-lg px-3 py-2 border border-emerald-200">
                  <ExternalLink className="w-3 h-3 text-primary flex-shrink-0" />
                  <span className="text-xs text-primary flex-1 truncate">linkity.mx/rep/{seleccionada.publicToken}</span>
                  <button onClick={copiarLink} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 flex-shrink-0">
                    <Copy className="w-3 h-3" /> {copiado ? "¡Copiado!" : "Copiar"}
                  </button>
                </div>
              </>
            ) : (
              <button disabled={pending} onClick={() => onWhatsapp(seleccionada.id)}
                className="w-full max-w-xs py-2 bg-[#25D366] hover:bg-[#22c35e] disabled:opacity-50 text-white text-xs font-medium rounded-lg">
                Enviar notificación WhatsApp
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReparacionesClient({ data, labels, branches, tenantSlug, roleName }: ReparacionesClientProps) {
  const { reparaciones, clientes, productos } = data;
  const router = useRouter();
  const negocio = nombreNegocio(tenantSlug);

  // Cajero ve el mostrador (cobrar/entregar); todos los demás (dueño,
  // Gerente, Técnico) ven el tablero completo — ver el comentario en
  // ReparacionesClientProps.
  const vistaTienda = roleName === "Cajero";
  const [pendingAccion, startAccion] = useTransition();
  const [accionError, setAccionError] = useState<string | null>(null);

  const [modalNuevaAbierto, setModalNuevaAbierto] = useState(false);
  const [nuevaBranchId, setNuevaBranchId] = useState(branches[0]?.id ?? "");
  const [nuevaClienteId, setNuevaClienteId] = useState<string | null>(null);
  const [nuevaClienteQuery, setNuevaClienteQuery] = useState("");
  const [modoClienteNuevo, setModoClienteNuevo] = useState(false);
  const [nuevaClienteNuevoNombre, setNuevaClienteNuevoNombre] = useState("");
  const [nuevaClienteNuevoTelefono, setNuevaClienteNuevoTelefono] = useState("");
  const [nuevaClienteNuevoCodigoPais, setNuevaClienteNuevoCodigoPais] = useState(PAIS_TELEFONO_DEFAULT);
  const [nuevaMarca, setNuevaMarca] = useState("");
  const [nuevaModelo, setNuevaModelo] = useState("");
  const [nuevaFalla, setNuevaFalla] = useState("");
  const [nuevaCosto, setNuevaCosto] = useState("");
  const [nuevaPrioridad, setNuevaPrioridad] = useState<PrioridadReparacion>("NORMAL");
  const [nuevaError, setNuevaError] = useState<string | null>(null);
  const [creando, startCrear] = useTransition();

  // Piezas/refacciones capturadas ya desde el alta — ver el comentario en
  // CrearReparacionParams.piezas (reparaciones-actions.ts). El precio que
  // se ve aquí es solo de referencia (viene del catálogo cargado en la
  // página); el servidor vuelve a tomarlo del catálogo al crear, nunca
  // confía en este valor.
  const [piezaNuevaId, setPiezaNuevaId] = useState("");
  const [piezaNuevaCantidad, setPiezaNuevaCantidad] = useState("1");
  const [nuevasPiezas, setNuevasPiezas] = useState<{ productId: string; productName: string; price: number; quantity: number }[]>([]);
  const subtotalPiezasNueva = nuevasPiezas.reduce((s, p) => s + p.price * p.quantity, 0);

  const agregarPiezaNueva = () => {
    const producto = productos.find((p) => p.id === piezaNuevaId);
    if (!producto) return;
    const cantidad = Math.max(1, parseInt(piezaNuevaCantidad, 10) || 1);
    setNuevasPiezas((prev) => {
      const existente = prev.find((p) => p.productId === producto.id);
      if (existente) {
        return prev.map((p) => (p.productId === producto.id ? { ...p, quantity: p.quantity + cantidad } : p));
      }
      return [...prev, { productId: producto.id, productName: producto.name, price: producto.price, quantity: cantidad }];
    });
    setPiezaNuevaId("");
    setPiezaNuevaCantidad("1");
  };

  const quitarPiezaNueva = (productId: string) => setNuevasPiezas((prev) => prev.filter((p) => p.productId !== productId));

  const [cobroRepairId, setCobroRepairId] = useState<string | null>(null);
  const [cobroMonto, setCobroMonto] = useState("");
  const [cobroMetodo, setCobroMetodo] = useState<MetodoPagoReparacion>("EFECTIVO");
  const [cobroError, setCobroError] = useState<string | null>(null);
  const [cobrando, startCobrar] = useTransition();
  const reparacionCobro = reparaciones.find((r) => r.id === cobroRepairId) ?? null;

  const clientesFiltrados = clientes
    .filter((c) => c.name.toLowerCase().includes(nuevaClienteQuery.toLowerCase()))
    .slice(0, 8);

  const handleAvanzar = (repairId: string, nuevoEstado: NuevoEstadoReparacion) => {
    setAccionError(null);
    startAccion(async () => {
      const res = await avanzarEstadoAction({ tenantSlug, repairId, nuevoEstado });
      if (res.ok) router.refresh();
      else setAccionError(res.error);
    });
  };

  const handleWhatsapp = (repairId: string) => {
    setAccionError(null);
    startAccion(async () => {
      const res = await marcarWhatsappEnviadoAction({ tenantSlug, repairId });
      if (res.ok) router.refresh();
      else setAccionError(res.error);
    });
  };

  const abrirModalCobro = (repairId: string, costoEstimado: number | null) => {
    setCobroRepairId(repairId);
    setCobroMonto(costoEstimado != null ? String(costoEstimado) : "");
    setCobroMetodo("EFECTIVO");
    setCobroError(null);
  };

  const handleCobrarYEntregar = () => {
    if (!cobroRepairId) return;
    const valor = parseFloat(cobroMonto);
    if (!Number.isFinite(valor) || valor < 0) {
      setCobroError("Ingresa un monto válido");
      return;
    }
    setCobroError(null);
    startCobrar(async () => {
      const res = await cobrarYEntregarAction({
        tenantSlug,
        repairId: cobroRepairId,
        monto: valor,
        metodoPago: cobroMetodo,
      });
      if (res.ok) {
        setCobroRepairId(null);
        setCobroMonto("");
        router.refresh();
        if (res.sinCajaAbierta) {
          setAccionError("Cobro registrado, pero no hay una caja abierta en esta sucursal — no se reflejó en el efectivo esperado de Caja.");
        }
      } else {
        setCobroError(res.error);
      }
    });
  };

  const resetModalNueva = () => {
    setNuevaMarca(""); setNuevaModelo(""); setNuevaFalla(""); setNuevaCosto("");
    setNuevaClienteId(null); setNuevaClienteQuery(""); setModoClienteNuevo(false);
    setNuevaClienteNuevoNombre(""); setNuevaClienteNuevoTelefono(""); setNuevaClienteNuevoCodigoPais(PAIS_TELEFONO_DEFAULT);
    setNuevaPrioridad("NORMAL"); setNuevaError(null);
    setNuevasPiezas([]); setPiezaNuevaId(""); setPiezaNuevaCantidad("1");
  };

  const handleCrearReparacion = () => {
    setNuevaError(null);
    if (!nuevaMarca.trim() || !nuevaModelo.trim()) { setNuevaError("Marca y modelo son obligatorios"); return; }
    if (!nuevaFalla.trim()) { setNuevaError("Describe la falla reportada"); return; }
    if (!modoClienteNuevo && !nuevaClienteId) { setNuevaError("Selecciona un cliente o registra uno nuevo"); return; }
    if (modoClienteNuevo && !nuevaClienteNuevoNombre.trim()) { setNuevaError("Escribe el nombre del cliente"); return; }
    const branchId = branches.length > 1 ? nuevaBranchId : (branches[0]?.id ?? "");
    if (!branchId) { setNuevaError("No hay sucursales activas"); return; }

    // Nombre/teléfono del cliente para el ticket que se imprime justo abajo
    // — tomado del cliente ya existente seleccionado o del que se está
    // registrando en el momento, según el modo activo del formulario.
    const clienteExistente = !modoClienteNuevo && nuevaClienteId ? clientes.find((c) => c.id === nuevaClienteId) : null;
    const clienteNombreTicket = modoClienteNuevo ? nuevaClienteNuevoNombre.trim() : (clienteExistente?.name ?? nuevaClienteQuery);
    const clienteTelefonoTicket = modoClienteNuevo ? (nuevaClienteNuevoTelefono || null) : (clienteExistente?.phone ?? null);
    const costoEstimadoTicket = nuevaCosto ? parseFloat(nuevaCosto) : null;

    startCrear(async () => {
      const res = await crearReparacionAction({
        tenantSlug,
        branchId,
        clienteId: modoClienteNuevo ? null : nuevaClienteId,
        clienteNuevo: modoClienteNuevo
          ? { name: nuevaClienteNuevoNombre, phone: nuevaClienteNuevoTelefono || undefined, phoneCountryCode: nuevaClienteNuevoCodigoPais }
          : null,
        marca: nuevaMarca,
        modelo: nuevaModelo,
        falla: nuevaFalla,
        costoEstimado: costoEstimadoTicket,
        prioridad: nuevaPrioridad,
        piezas: nuevasPiezas.map((p) => ({ productId: p.productId, quantity: p.quantity })),
      });
      if (res.ok) {
        // Se imprime/muestra el ticket de una vez, con lo que se acaba de
        // capturar — así el cliente sabe cuánto le va a costar antes de
        // irse, sin depender de que el admin vuelva a seleccionar esta
        // reparación en la lista (que además no cambia sola tras el
        // router.refresh()).
        abrirTicketImprimible(
          {
            folio: res.folio,
            cliente: clienteNombreTicket || "Cliente",
            telefono: clienteTelefonoTicket,
            marca: nuevaMarca,
            modelo: nuevaModelo,
            falla: nuevaFalla,
            piezas: nuevasPiezas,
            costoEstimado: costoEstimadoTicket,
          },
          negocio
        );
        setModalNuevaAbierto(false);
        resetModalNueva();
        router.refresh();
      } else {
        setNuevaError(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col h-full">
      {accionError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-1.5 text-[11px] text-red-600">{accionError}</div>
      )}

      <div className="flex-1 overflow-hidden">
        {vistaTienda ? (
          <VistaTienda reparaciones={reparaciones} labels={labels} onAvanzar={handleAvanzar} onWhatsapp={handleWhatsapp} onCobrarClick={abrirModalCobro} pending={pendingAccion} />
        ) : (
          <VistaAdmin reparaciones={reparaciones} labels={labels} onAvanzar={handleAvanzar} onWhatsapp={handleWhatsapp} onCobrarClick={abrirModalCobro} pending={pendingAccion} onNuevaClick={() => setModalNuevaAbierto(true)}
            productos={productos} negocio={negocio} tenantSlug={tenantSlug} router={router} />
        )}
      </div>

      {modalNuevaAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setModalNuevaAbierto(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-medium text-foreground">Nueva {label(labels, "entity.repair.singular").toLowerCase()}</span>
              <button onClick={() => setModalNuevaAbierto(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {nuevaError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{nuevaError}</div>}

              <div>
                <label className="text-[10px] font-semibold text-muted-foreground tracking-widest">CLIENTE</label>
                {!modoClienteNuevo ? (
                  <>
                    <input type="text" value={nuevaClienteQuery}
                      onChange={(e) => { setNuevaClienteQuery(e.target.value); setNuevaClienteId(null); }}
                      placeholder="Buscar cliente..."
                      className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
                    {nuevaClienteQuery && !nuevaClienteId && (
                      <div className="mt-1 border border-border rounded-lg max-h-32 overflow-y-auto">
                        {clientesFiltrados.map((c) => (
                          <button key={c.id} type="button"
                            onClick={() => { setNuevaClienteId(c.id); setNuevaClienteQuery(c.name); }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-muted truncate">
                            {c.name}
                          </button>
                        ))}
                        {clientesFiltrados.length === 0 && (
                          <p className="px-3 py-2 text-[11px] text-muted-foreground/70">Sin resultados</p>
                        )}
                      </div>
                    )}
                    <button type="button" onClick={() => { setModoClienteNuevo(true); setNuevaClienteId(null); setNuevaClienteQuery(""); }}
                      className="text-[11px] text-primary mt-1">
                      + Registrar cliente nuevo
                    </button>
                  </>
                ) : (
                  <div className="space-y-2 mt-1">
                    <input type="text" value={nuevaClienteNuevoNombre} onChange={(e) => setNuevaClienteNuevoNombre(e.target.value)}
                      placeholder="Nombre del cliente"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
                    <div className="flex gap-2">
                      <select value={nuevaClienteNuevoCodigoPais} onChange={(e) => setNuevaClienteNuevoCodigoPais(e.target.value)}
                        className="px-2 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary flex-shrink-0">
                        {PAISES_TELEFONO.map((p) => (
                          <option key={p.code} value={p.code}>{p.flag} {p.code}</option>
                        ))}
                      </select>
                      <input type="text" value={nuevaClienteNuevoTelefono} onChange={(e) => setNuevaClienteNuevoTelefono(e.target.value)}
                        placeholder="Teléfono (opcional)"
                        className="flex-1 min-w-0 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
                    </div>
                    <button type="button" onClick={() => setModoClienteNuevo(false)} className="text-[11px] text-muted-foreground">
                      Buscar cliente existente
                    </button>
                  </div>
                )}
              </div>

              {branches.length > 1 && (
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground tracking-widest">SUCURSAL</label>
                  <select value={nuevaBranchId} onChange={(e) => setNuevaBranchId(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary">
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground tracking-widest">MARCA</label>
                  <input type="text" value={nuevaMarca} onChange={(e) => setNuevaMarca(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground tracking-widest">MODELO</label>
                  <input type="text" value={nuevaModelo} onChange={(e) => setNuevaModelo(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-muted-foreground tracking-widest">FALLA REPORTADA</label>
                <textarea value={nuevaFalla} onChange={(e) => setNuevaFalla(e.target.value)} rows={2}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary resize-none" />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-muted-foreground tracking-widest">PIEZAS / REFACCIONES (OPCIONAL)</label>
                <div className="flex gap-2 mt-1">
                  <select value={piezaNuevaId} onChange={(e) => setPiezaNuevaId(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-2 border border-border rounded-lg text-xs bg-muted focus:outline-none focus:border-primary">
                    <option value="">Selecciona una pieza…</option>
                    {productos.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — {formatMXN(p.price)}</option>
                    ))}
                  </select>
                  <input type="number" min={1} value={piezaNuevaCantidad} onChange={(e) => setPiezaNuevaCantidad(e.target.value)}
                    className="w-14 px-2 py-2 border border-border rounded-lg text-xs bg-muted focus:outline-none focus:border-primary" />
                  <button type="button" onClick={agregarPiezaNueva} disabled={!piezaNuevaId}
                    className="px-2.5 py-2 bg-muted hover:bg-accent disabled:opacity-40 rounded-lg text-primary">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                {nuevasPiezas.length > 0 && (
                  <div className="mt-2 border border-border rounded-lg divide-y divide-border">
                    {nuevasPiezas.map((p) => (
                      <div key={p.productId} className="flex items-center justify-between px-2.5 py-1.5 text-[11px]">
                        <span className="flex-1 truncate">{p.productName} × {p.quantity}</span>
                        <span className="text-muted-foreground mr-2">{formatMXN(p.price * p.quantity)}</span>
                        <button type="button" onClick={() => quitarPiezaNueva(p.productId)} className="text-muted-foreground hover:text-red-600">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px] font-medium">
                      <span>Subtotal piezas</span>
                      <div className="flex items-center gap-2">
                        <span>{formatMXN(subtotalPiezasNueva)}</span>
                        <button type="button" onClick={() => setNuevaCosto(String(subtotalPiezasNueva))} className="text-[10px] text-primary">
                          Usar como estimado
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground tracking-widest">COSTO ESTIMADO</label>
                  <input type="number" value={nuevaCosto} onChange={(e) => setNuevaCosto(e.target.value)} placeholder="$0"
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
                  <p className="text-[10px] text-muted-foreground mt-1">El cliente verá este monto en su ticket y en el aviso de WhatsApp.</p>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground tracking-widest">PRIORIDAD</label>
                  <select value={nuevaPrioridad} onChange={(e) => setNuevaPrioridad(e.target.value as PrioridadReparacion)}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary">
                    <option value="LOW">Baja</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">Alta</option>
                    <option value="URGENT">Urgente</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button onClick={() => setModalNuevaAbierto(false)} className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                Cancelar
              </button>
              <button disabled={creando} onClick={handleCrearReparacion}
                className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-xs font-medium">
                {creando ? "Creando..." : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {reparacionCobro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setCobroRepairId(null)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-medium text-foreground">Cobrar y entregar</span>
              <button onClick={() => setCobroRepairId(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                {reparacionCobro.folio} · {reparacionCobro.cliente} · {reparacionCobro.marca} {reparacionCobro.modelo}
              </p>
              {cobroError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{cobroError}</div>}

              <div>
                <label className="text-[10px] font-semibold text-muted-foreground tracking-widest">MONTO A COBRAR</label>
                <input type="number" value={cobroMonto} onChange={(e) => setCobroMonto(e.target.value)} placeholder="$0" autoFocus
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-muted-foreground tracking-widest">MÉTODO DE PAGO</label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {(["EFECTIVO", "TARJETA", "TRANSFERENCIA"] as MetodoPagoReparacion[]).map((m) => (
                    <button key={m} type="button" onClick={() => setCobroMetodo(m)}
                      className={`py-2 rounded-lg text-[11px] font-medium capitalize transition-colors ${
                        cobroMetodo === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}>
                      {m === "EFECTIVO" ? "Efectivo" : m === "TARJETA" ? "Tarjeta" : "Transferencia"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button onClick={() => setCobroRepairId(null)} className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                Cancelar
              </button>
              <button disabled={cobrando} onClick={handleCobrarYEntregar}
                className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-xs font-medium">
                {cobrando ? "Guardando..." : "Cobrar y entregar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
