"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Plus, Check, Clock,
  Wrench, Package, Stethoscope, Store, ArrowRight,
  Phone, CheckCircle, AlertCircle, ChevronLeft, X,
  Printer,
} from "lucide-react";
import type {
  ReparacionesData, ReparacionUI, EstadoReparacion, PrioridadReparacion, ProductoParaReparacion,
} from "@/lib/reparaciones-data";
import { label, type LabelDictionary } from "@/lib/labels";
import {
  crearReparacionAction, avanzarEstadoAction, marcarWhatsappEnviadoAction, cobrarYEntregarAction,
  type NuevoEstadoReparacion, type MetodoPagoReparacion,
} from "@/app/actions/reparaciones-actions";
import { PAISES_TELEFONO, PAIS_TELEFONO_DEFAULT, telefonoWhatsapp } from "@/lib/paises";
import { abrirReciboImprimible, nombreNegocioDeSlug, type ReciboData } from "@/lib/recibo-imprimible";
import { confirmarSalirSinGuardar, useAdvertirCierrePestaña } from "@/lib/confirmar-cierre";

// Agrupa el catálogo de "agregar pieza" por tipo — piezas/productos primero,
// servicios (mano de obra: "quitar cuenta Google", "limpieza general", etc.)
// después, en vez de una lista plana. A petición de Carlos, 2026-09-21: "en
// las reparaciones se debe poder agregar tanto piezas como servicios" — el
// mecanismo YA lo soportaba (RepairItem no distingue tipo de producto), lo
// que faltaba era que se viera claro en el selector que un servicio también
// se puede agregar aquí, no solo refacciones físicas.
function agruparProductosParaSelector(productos: ProductoParaReparacion[]) {
  const piezas = productos.filter((p) => p.type !== "SERVICE");
  const servicios = productos.filter((p) => p.type === "SERVICE");
  return { piezas, servicios };
}

interface BranchOption {
  id: string;
  name: string;
}

interface ReparacionesClientProps {
  data: ReparacionesData;
  labels: LabelDictionary;
  branches: BranchOption[];
  tenantSlug: string;
  // Tenant.phone — a petición de Carlos, 2026-09-21, para que aparezca en el
  // ticket ("el ticket debe venir el teléfono de soporte del taller o del
  // negocio"). Se captura en Configuración → Teléfono de soporte.
  telefonoNegocio: string | null;
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
  fechaEstimada: string | null; // ISO
  telefonoSoporte: string | null;
}

// Texto plano para el mensaje de WhatsApp del ticket digital — mismo
// contenido que el ticket impreso, en formato de mensaje. Se abre wa.me con
// el texto precargado y el negocio lo manda con un clic, igual que el resto
// de la app (ver whatsappHref en ClientesClient.tsx) — no hay envío
// automático desde el servidor, ninguna integración de este proyecto lo
// tiene todavía.
function textoTicketWhatsapp(t: TicketData, negocio: string): string {
  const lineas = [
    `*${negocio}*`,
    `Recibo de reparación · ${t.folio}`,
    "",
    `Equipo: ${t.marca} ${t.modelo}`,
    `Falla reportada: ${t.falla}`,
  ];
  if (t.piezas.length > 0) {
    lineas.push("", "Piezas y servicios:");
    for (const p of t.piezas) lineas.push(`• ${p.productName} × ${p.quantity} — ${formatMXN(p.price * p.quantity)}`);
  }
  lineas.push("", `Costo estimado: ${t.costoEstimado != null ? formatMXN(t.costoEstimado) : "Por definir"}`);
  if (t.fechaEstimada) lineas.push(`Fecha estimada de entrega: ${formatFecha(t.fechaEstimada)}`);
  if (t.telefonoSoporte) lineas.push("", `Dudas o soporte: ${t.telefonoSoporte}`);
  lineas.push("", "Este costo es un estimado y puede ajustarse tras el diagnóstico completo del equipo.");
  return lineas.join("\n");
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
      ${t.telefonoSoporte ? `<p class="muted">Soporte: ${t.telefonoSoporte}</p>` : ""}
      <hr />
      <p><strong>Cliente:</strong> ${t.cliente}${t.telefono ? ` · ${t.telefono}` : ""}</p>
      <p><strong>Equipo:</strong> ${t.marca} ${t.modelo}</p>
      <p><strong>Falla reportada:</strong> ${t.falla}</p>
      ${
        t.piezas.length > 0
          ? `<hr />
      <table>
        <thead><tr><th>Pieza/Servicio</th><th style="text-align:center">Cant.</th><th style="text-align:right">P. Unit.</th><th style="text-align:right">Subtotal</th></tr></thead>
        <tbody>${filasPiezas}</tbody>
      </table>
      <p class="muted" style="text-align:right">Subtotal: ${formatMXN(subtotalPiezas)}</p>`
          : ""
      }
      <hr />
      <p class="total">Costo estimado: ${t.costoEstimado != null ? formatMXN(t.costoEstimado) : "Por definir"}</p>
      ${t.fechaEstimada ? `<p class="muted" style="text-align:right">Fecha estimada de entrega: ${formatFecha(t.fechaEstimada)}</p>` : ""}
      <p class="aviso">Este costo es un estimado y puede ajustarse tras el diagnóstico completo del equipo. Cualquier cambio se te notificará antes de proceder con la reparación.</p>
      <div class="firma">Firma de conformidad</div>
    </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

/* ── VISTA TIENDA — única vista de /reparaciones desde 2026-09-22
   (corrección de Carlos): tienda recibe con folio, ve el detalle de solo
   lectura (costo, piezas, estatus, técnico asignado) y cobra/entrega — el
   control de piezas/costo/estatus/técnico vive en /aduana. ── */
function VistaTienda({
  reparaciones, labels, onAvanzar, onWhatsapp, onCobrarClick, pending, onNuevaClick,
  negocio, telefonoNegocio,
}: {
  reparaciones: ReparacionUI[];
  labels: LabelDictionary;
  onAvanzar: (repairId: string, nuevoEstado: NuevoEstadoReparacion) => void;
  onWhatsapp: (repairId: string) => void;
  onCobrarClick: (repairId: string, costoEstimado: number | null) => void;
  pending: boolean;
  onNuevaClick: () => void;
  negocio: string;
  telefonoNegocio: string | null;
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
              <p className="text-[10.5px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-1 px-3 py-2 border-b border-border">
          {["Pendientes", "Entregados hoy", "Todo"].map((tab) => (
            <button key={tab} onClick={() => setFiltro(tab)}
              className={`px-2 py-1 rounded-full text-[11.5px] font-medium whitespace-nowrap transition-colors ${
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
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11.5px] font-semibold flex-shrink-0 ${ESTADO_BADGE[rep.estado]}`}>
                  {rep.iniciales}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">{rep.cliente}</p>
                  <p className="text-[11.5px] text-muted-foreground truncate">{rep.modelo} · {rep.falla}</p>
                </div>
                <span className={`text-[10.5px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${ESTADO_BADGE[rep.estado]}`}>
                  {rep.estado === "SHOP_READY" ? "Listo" : rep.estado === "SHOP_RETURN" ? "Devolución" : "Entregado"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" /> {rep.folio}
                </span>
                {rep.telefono && (
                  <span className="text-[11.5px] text-primary-text flex items-center gap-1">
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
          <button onClick={() => setMostrarDetalle(false)} className="md:hidden flex items-center gap-1 text-primary-text text-xs font-medium mb-3">
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
                      fechaEstimada: seleccionada.fechaEstimada,
                      telefonoSoporte: telefonoNegocio,
                    },
                    negocio
                  )
                }
                title="Reimprimir ticket de recepción"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-accent text-foreground rounded-lg text-xs font-medium transition-colors">
                <Printer className="w-3 h-3" /> Ticket
              </button>
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

          {/* 2026-09-24, corrigiendo un bug real que Carlos reportó con
              capturas: esta franja decía "Equipo listo para entregar/
              Reparación completada" (o "para devolver") para CUALQUIER
              estado que no fuera DELIVERED — incluyendo un folio recién
              creado (RECEIVED), que ni siquiera ha pasado por el taller.
              La condición correcta es la misma que ya usan los botones de
              "Cobrar y entregar"/"Entregar" un poco más arriba: solo
              cuando el taller (o el propio "aduana", ver lib/roles.ts) ya
              marcó el equipo como listo para tienda (SHOP_READY) o como
              devolución sin reparar (SHOP_RETURN) — nunca mientras sigue
              en RECEIVED/DIAGNOSING/WAITING_PARTS/IN_REPAIR. */}
          {(seleccionada.estado === "SHOP_READY" || seleccionada.estado === "SHOP_RETURN") && (
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${isDev ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
              {isDev ? <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" /> : <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />}
              <div>
                <p className={`text-xs font-semibold ${isDev ? "text-amber-700" : "text-emerald-700"}`}>
                  {isDev ? "Equipo para devolver al cliente" : "Equipo listo para entregar"}
                </p>
                <p className={`text-[11.5px] mt-0.5 ${isDev ? "text-amber-600" : "text-emerald-600"}`}>
                  {seleccionada.modelo} ·{" "}
                  {isDev ? "No fue posible realizar la reparación" : `Reparación completada${seleccionada.costoFinal || seleccionada.costoEstimado ? ` · Costo: ${formatMXN(seleccionada.costoFinal ?? seleccionada.costoEstimado ?? 0)}` : ""}`}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-[11.5px] font-semibold text-muted-foreground tracking-widest mb-3">DATOS DE {activoLabel.toUpperCase()}</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: activoLabel, value: `${seleccionada.marca} ${seleccionada.modelo}` },
                { label: "Falla", value: seleccionada.falla },
                { label: "Sucursal", value: seleccionada.sucursalNombre },
                { label: "Fecha prometida", value: seleccionada.fechaEstimada ? formatFecha(seleccionada.fechaEstimada) : "Sin definir" },
                { label: "Costo final", value: seleccionada.costoFinal ? formatMXN(seleccionada.costoFinal) : isDev ? "Sin cargo" : "Por definir", color: isDev ? "text-amber-600" : "text-primary-text" },
                // "Técnico" (seleccionada.tecnico) en realidad es quien REGISTRÓ
                // la reparación (Repair.userId — encargado/recepción), nunca
                // el técnico que la trabajó; se relabela para no confundir con
                // el técnico ASIGNADO real (assignedToStaffId, 2026-09-21).
                { label: "Recibido por", value: seleccionada.tecnico },
                { label: "Técnico asignado", value: seleccionada.tecnicoAsignadoNombre ?? "Sin asignar", color: seleccionada.tecnicoAsignadoNombre ? undefined : "text-amber-600" },
              ].map((f) => (
                <div key={f.label} className="bg-muted rounded-lg p-2.5">
                  <p className="text-[10.5px] text-muted-foreground mb-0.5">{f.label}</p>
                  <p className={`text-xs font-medium ${f.color || "text-foreground"}`}>{f.value}</p>
                </div>
              ))}
            </div>
            {seleccionada.piezas.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border">
                <p className="text-[10.5px] text-muted-foreground mb-1">Piezas asignadas</p>
                {seleccionada.piezas.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-[12.5px] text-muted-foreground py-0.5">
                    <span className="truncate flex-1">{p.productName} × {p.quantity}</span>
                    <span>{formatMXN(p.price * p.quantity)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-[11.5px] font-semibold text-muted-foreground tracking-widest mb-3">HISTORIAL</p>
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
                      <p className="text-[11.5px] text-muted-foreground">{formatFechaHora(h.fecha)}</p>
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

/* ── (VistaAdmin fue eliminada el 2026-09-22, corrección de Carlos: el
   control de piezas/costo/estatus/técnico ya no vive en /reparaciones para
   NINGÚN rol — se movió por completo a /aduana, ver AduanaClient.tsx. Esta
   pantalla ahora es SIEMPRE la vista de tienda: recibir con folio, ver el
   detalle de solo lectura, y cobrar/entregar/avisar.) ── */
export default function ReparacionesClient({ data, labels, branches, tenantSlug, telefonoNegocio }: ReparacionesClientProps) {
  const { reparaciones, clientes, productos } = data;
  const router = useRouter();
  const negocio = nombreNegocio(tenantSlug);
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
  // Contraseña/patrón de desbloqueo del equipo (2026-09-24, a petición de
  // Carlos — el Técnico de Reparación la necesita para poder trabajar el
  // equipo). Opcional: no todo equipo trae bloqueo.
  const [nuevoCodigoDesbloqueo, setNuevoCodigoDesbloqueo] = useState("");
  const [nuevaFechaEstimada, setNuevaFechaEstimada] = useState("");
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

  // Aviso al cerrar/recargar la pestaña mientras cualquiera de los 2 modales
  // de captura de esta pantalla esté abierto — ver lib/confirmar-cierre.ts.
  useAdvertirCierrePestaña(modalNuevaAbierto || reparacionCobro !== null);

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

  const cancelarModalCobro = () => {
    if (!confirmarSalirSinGuardar()) return;
    setCobroRepairId(null);
  };

  const METODO_PAGO_REPARACION_TEXTO: Record<MetodoPagoReparacion, string> = {
    EFECTIVO: "Efectivo", TARJETA: "Tarjeta", TRANSFERENCIA: "Transferencia",
  };

  const handleCobrarYEntregar = () => {
    if (!cobroRepairId || !reparacionCobro) return;
    const valor = parseFloat(cobroMonto);
    if (!Number.isFinite(valor) || valor < 0) {
      setCobroError("Ingresa un monto válido");
      return;
    }
    setCobroError(null);

    // Snapshot antes de cerrar el modal — igual que en POSClient, el ticket
    // necesita estos datos tal como estaban al momento de cobrar.
    const reciboBase: ReciboData = {
      tipoDocumento: "Reparación",
      folio: reparacionCobro.folio,
      cliente: reparacionCobro.cliente,
      telefono: reparacionCobro.telefono,
      renglones: reparacionCobro.piezas.map((p) => ({ nombre: p.productName, cantidad: p.quantity, precioUnitario: p.price })),
      subtotal: valor,
      iva: 0,
      total: valor,
      metodoPago: METODO_PAGO_REPARACION_TEXTO[cobroMetodo],
      notaPie: `${reparacionCobro.marca} ${reparacionCobro.modelo}`.trim(),
    };

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
        // "Al cobrar en el punto de venta, solo guarda la venta, no genera
        // un ticket... ya sea de una reparación, articulo o servicio"
        // (Carlos, 2026-09-21) — el cobro final de una reparación entregada
        // es exactamente ese caso, antes solo quedaba el ticket de
        // RECEPCIÓN (con el costo estimado), nunca uno del pago real.
        abrirReciboImprimible(reciboBase, nombreNegocioDeSlug(tenantSlug));
      } else {
        setCobroError(res.error);
      }
    });
  };

  const resetModalNueva = () => {
    setNuevaMarca(""); setNuevaModelo(""); setNuevaFalla(""); setNuevoCodigoDesbloqueo(""); setNuevaFechaEstimada("");
    setNuevaClienteId(null); setNuevaClienteQuery(""); setModoClienteNuevo(false);
    setNuevaClienteNuevoNombre(""); setNuevaClienteNuevoTelefono(""); setNuevaClienteNuevoCodigoPais(PAIS_TELEFONO_DEFAULT);
    setNuevaPrioridad("NORMAL"); setNuevaError(null);
    setNuevasPiezas([]); setPiezaNuevaId(""); setPiezaNuevaCantidad("1");
  };

  const cancelarModalNueva = () => {
    if (!confirmarSalirSinGuardar()) return;
    setModalNuevaAbierto(false);
  };

  const handleCrearReparacion = () => {
    setNuevaError(null);
    if (!nuevaMarca.trim() || !nuevaModelo.trim()) { setNuevaError("Marca y modelo son obligatorios"); return; }
    if (!nuevaFalla.trim()) { setNuevaError("Describe la falla reportada"); return; }
    if (!modoClienteNuevo && !nuevaClienteId) { setNuevaError("Selecciona un cliente o registra uno nuevo"); return; }
    if (modoClienteNuevo && !nuevaClienteNuevoNombre.trim()) { setNuevaError("Escribe el nombre del cliente"); return; }
    // 2026-09-24, a petición de Carlos: "una reparación no puede ingresar
    // sin costo estipulado" — ver el comentario largo en
    // CrearReparacionParams.piezas (reparaciones-actions.ts).
    if (nuevasPiezas.length === 0) { setNuevaError("Agrega al menos una pieza del catálogo o un servicio cotizado (ej. diagnóstico/mano de obra)"); return; }
    const branchId = branches.length > 1 ? nuevaBranchId : (branches[0]?.id ?? "");
    if (!branchId) { setNuevaError("No hay sucursales activas"); return; }

    // Nombre/teléfono del cliente para el ticket que se imprime justo abajo
    // — tomado del cliente ya existente seleccionado o del que se está
    // registrando en el momento, según el modo activo del formulario.
    const clienteExistente = !modoClienteNuevo && nuevaClienteId ? clientes.find((c) => c.id === nuevaClienteId) : null;
    const clienteNombreTicket = modoClienteNuevo ? nuevaClienteNuevoNombre.trim() : (clienteExistente?.name ?? nuevaClienteQuery);
    const clienteTelefonoTicket = modoClienteNuevo ? (nuevaClienteNuevoTelefono || null) : (clienteExistente?.phone ?? null);
    // El costo del ticket ya no se captura aparte — es la suma de las
    // piezas/servicios cotizados, exactamente lo mismo que calcula el
    // servidor (ver el comentario largo en CrearReparacionParams.piezas).
    const costoEstimadoTicket = subtotalPiezasNueva;

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
        codigoDesbloqueo: nuevoCodigoDesbloqueo || null,
        fechaEstimada: nuevaFechaEstimada || null,
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
            fechaEstimada: nuevaFechaEstimada ? `${nuevaFechaEstimada}T00:00:00` : null,
            telefonoSoporte: telefonoNegocio,
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
        <div className="bg-red-50 border-b border-red-200 px-4 py-1.5 text-[12.5px] text-red-600">{accionError}</div>
      )}

      <div className="flex-1 overflow-hidden">
        <VistaTienda reparaciones={reparaciones} labels={labels} onAvanzar={handleAvanzar} onWhatsapp={handleWhatsapp} onCobrarClick={abrirModalCobro} pending={pendingAccion}
          onNuevaClick={() => setModalNuevaAbierto(true)} negocio={negocio} telefonoNegocio={telefonoNegocio} />
      </div>

      {modalNuevaAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={cancelarModalNueva}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-medium text-foreground">Nueva {label(labels, "entity.repair.singular").toLowerCase()}</span>
              <button onClick={cancelarModalNueva} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {nuevaError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{nuevaError}</div>}

              <div>
                <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">CLIENTE</label>
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
                          <p className="px-3 py-2 text-[12.5px] text-muted-foreground/70">Sin resultados</p>
                        )}
                      </div>
                    )}
                    <button type="button" onClick={() => { setModoClienteNuevo(true); setNuevaClienteId(null); setNuevaClienteQuery(""); }}
                      className="text-[12.5px] text-primary-text mt-1">
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
                    <button type="button" onClick={() => setModoClienteNuevo(false)} className="text-[12.5px] text-muted-foreground">
                      Buscar cliente existente
                    </button>
                  </div>
                )}
              </div>

              {branches.length > 1 && (
                <div>
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">SUCURSAL</label>
                  <select value={nuevaBranchId} onChange={(e) => setNuevaBranchId(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary">
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}


              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">MARCA</label>
                  <input type="text" value={nuevaMarca} onChange={(e) => setNuevaMarca(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">MODELO</label>
                  <input type="text" value={nuevaModelo} onChange={(e) => setNuevaModelo(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
                </div>
              </div>

              <div>
                <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">FALLA REPORTADA</label>
                <textarea value={nuevaFalla} onChange={(e) => setNuevaFalla(e.target.value)} rows={2}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary resize-none" />
              </div>

              <div>
                {/* 2026-09-24, a petición de Carlos — el técnico la necesita
                    para trabajar el equipo (ver Repair.deviceUnlockCode,
                    schema.prisma). Opcional, nunca aparece en la página
                    pública de seguimiento del cliente. */}
                <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">CONTRASEÑA DE DESBLOQUEO (OPCIONAL)</label>
                <input type="text" value={nuevoCodigoDesbloqueo} onChange={(e) => setNuevoCodigoDesbloqueo(e.target.value)}
                  placeholder="Ej. 1234 o el patrón que indicó el cliente"
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
              </div>

              <div>
                {/* 2026-09-24, a petición de Carlos: "una reparación no puede
                    ingresar sin costo estipulado" — ya no dice "(opcional)":
                    hace falta al menos una línea (pieza o servicio) para
                    poder guardar. */}
                <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">PIEZAS Y SERVICIOS COTIZADOS</label>
                <div className="flex gap-2 mt-1">
                  <select value={piezaNuevaId} onChange={(e) => setPiezaNuevaId(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-2 border border-border rounded-lg text-xs bg-muted focus:outline-none focus:border-primary">
                    <option value="">Selecciona una pieza o servicio…</option>
                    {(() => {
                      const { piezas: piezasCat, servicios } = agruparProductosParaSelector(productos);
                      return (
                        <>
                          {piezasCat.length > 0 && (
                            <optgroup label="Piezas / productos">
                              {piezasCat.map((p) => (
                                <option key={p.id} value={p.id}>{p.name} — {formatMXN(p.price)}</option>
                              ))}
                            </optgroup>
                          )}
                          {servicios.length > 0 && (
                            <optgroup label="Servicios">
                              {servicios.map((p) => (
                                <option key={p.id} value={p.id}>{p.name} — {formatMXN(p.price)}</option>
                              ))}
                            </optgroup>
                          )}
                        </>
                      );
                    })()}
                  </select>
                  <input type="number" min={1} value={piezaNuevaCantidad} onChange={(e) => setPiezaNuevaCantidad(e.target.value)}
                    className="w-14 px-2 py-2 border border-border rounded-lg text-xs bg-muted focus:outline-none focus:border-primary" />
                  <button type="button" onClick={agregarPiezaNueva} disabled={!piezaNuevaId}
                    className="px-2.5 py-2 bg-muted hover:bg-accent disabled:opacity-40 rounded-lg text-primary-text">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                {nuevasPiezas.length > 0 && (
                  <div className="mt-2 border border-border rounded-lg divide-y divide-border">
                    {nuevasPiezas.map((p) => (
                      <div key={p.productId} className="flex items-center justify-between px-2.5 py-1.5 text-[12.5px]">
                        <span className="flex-1 truncate">{p.productName} × {p.quantity}</span>
                        <span className="text-muted-foreground mr-2">{formatMXN(p.price * p.quantity)}</span>
                        <button type="button" onClick={() => quitarPiezaNueva(p.productId)} className="text-muted-foreground hover:text-red-600">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-2.5 py-1.5 text-[12.5px] font-medium">
                      <span>Costo estimado</span>
                      <span>{formatMXN(subtotalPiezasNueva)}</span>
                    </div>
                  </div>
                )}
                {nuevasPiezas.length === 0 && (
                  <p className="text-[11.5px] text-amber-600 mt-1.5">
                    Agrega al menos una pieza o un servicio (ej. "Diagnóstico"/"Mano de obra" si no hay repuesto físico) — sin esto no se puede guardar la reparación.
                  </p>
                )}
                <p className="text-[11.5px] text-muted-foreground mt-1">Este es el costo que verá el cliente en su ticket y en el aviso de WhatsApp.</p>
              </div>

              <div>
                <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">PRIORIDAD</label>
                <select value={nuevaPrioridad} onChange={(e) => setNuevaPrioridad(e.target.value as PrioridadReparacion)}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary">
                  <option value="LOW">Baja</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">Alta</option>
                  <option value="URGENT">Urgente</option>
                </select>
              </div>

              <div>
                <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">FECHA ESTIMADA DE ENTREGA (OPCIONAL)</label>
                <input type="date" value={nuevaFechaEstimada} onChange={(e) => setNuevaFechaEstimada(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
                <p className="text-[11.5px] text-muted-foreground mt-1">Aparece en el ticket del cliente. Se puede dejar en blanco si aún no se sabe.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button onClick={cancelarModalNueva} className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={cancelarModalCobro}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-medium text-foreground">Cobrar y entregar</span>
              <button onClick={cancelarModalCobro} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                {reparacionCobro.folio} · {reparacionCobro.cliente} · {reparacionCobro.marca} {reparacionCobro.modelo}
              </p>
              {cobroError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{cobroError}</div>}

              <div>
                <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">MONTO A COBRAR</label>
                <input type="number" value={cobroMonto} onChange={(e) => setCobroMonto(e.target.value)} placeholder="$0" autoFocus
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
              </div>

              <div>
                <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">MÉTODO DE PAGO</label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {(["EFECTIVO", "TARJETA", "TRANSFERENCIA"] as MetodoPagoReparacion[]).map((m) => (
                    <button key={m} type="button" onClick={() => setCobroMetodo(m)}
                      className={`py-2 rounded-lg text-[12.5px] font-medium capitalize transition-colors ${
                        cobroMetodo === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}>
                      {m === "EFECTIVO" ? "Efectivo" : m === "TARJETA" ? "Tarjeta" : "Transferencia"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button onClick={cancelarModalCobro} className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
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
