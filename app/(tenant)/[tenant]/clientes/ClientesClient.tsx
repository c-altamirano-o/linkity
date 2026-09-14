"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, Plus, Edit, ShoppingCart, Wrench, Phone, ChevronLeft, X, Users,
} from "lucide-react";
import type { ClienteUI, EstadoReparacionCliente, EstadoVentaCliente } from "@/lib/clientes-data";
import { label, type LabelDictionary } from "@/lib/labels";
import { crearClienteAction, editarClienteAction, type DatosCliente } from "@/app/actions/clientes-actions";

interface ClientesClientProps {
  clientes: ClienteUI[];
  labels: LabelDictionary;
  tenantSlug: string;
}

// Mismo criterio de color que ReparacionesClient.tsx (ESTADO_BADGE), para
// que el estado de una reparación se vea igual en ambos módulos.
const REPARACION_BADGE: Record<EstadoReparacionCliente, string> = {
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

const VENTA_BADGE: Record<EstadoVentaCliente, string> = {
  COMPLETED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-600",
  REFUNDED: "bg-amber-50 text-amber-700",
};

const VENTA_TEXTO: Record<EstadoVentaCliente, string> = {
  COMPLETED: "Pagado",
  CANCELLED: "Cancelada",
  REFUNDED: "Reembolsada",
};

const AVATAR_PALETTE = [
  { bg: "bg-purple-50", color: "text-purple-700" },
  { bg: "bg-orange-50", color: "text-orange-700" },
  { bg: "bg-emerald-50", color: "text-emerald-700" },
  { bg: "bg-blue-50", color: "text-blue-700" },
  { bg: "bg-cyan-50", color: "text-cyan-700" },
  { bg: "bg-amber-50", color: "text-amber-700" },
];

function inicialesDe(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const ini = (partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "");
  return ini.toUpperCase() || "?";
}

function colorPara(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function formatMXN(n: number): string {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });
}

function formatFechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

function formatFechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

function tiempoRelativo(iso: string | null): string {
  if (!iso) return "Sin visitas";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  if (dias < 7) return `Hace ${dias} días`;
  if (dias < 30) return `Hace ${Math.floor(dias / 7)} sem`;
  return formatFechaCorta(iso);
}

function whatsappHref(phone: string | null): string | null {
  if (!phone) return null;
  const digitos = phone.replace(/\D/g, "");
  if (!digitos) return null;
  const numero = digitos.length === 10 ? `52${digitos}` : digitos;
  return `https://wa.me/${numero}`;
}

const filtrosTabs = ["Todo", "Compras", "Reparaciones"] as const;
type FiltroHistorial = (typeof filtrosTabs)[number];

const FORM_VACIO: DatosCliente = { name: "", phone: "", email: "", rfc: "", address: "" };

export default function ClientesClient({ clientes, labels, tenantSlug }: ClientesClientProps) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(clientes[0]?.id ?? null);
  const [filtroHistorial, setFiltroHistorial] = useState<FiltroHistorial>("Todo");
  const [mostrarDetalle, setMostrarDetalle] = useState(false);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [modoModal, setModoModal] = useState<"crear" | "editar">("crear");
  const [form, setForm] = useState<DatosCliente>(FORM_VACIO);
  const [formError, setFormError] = useState<string | null>(null);
  const [guardando, startGuardar] = useTransition();

  const clientesFiltrados = clientes.filter(
    (c) => c.name.toLowerCase().includes(busqueda.toLowerCase()) || (c.phone ?? "").includes(busqueda)
  );
  const seleccionado = clientes.find((c) => c.id === seleccionadoId) ?? null;

  const historialFiltrado = seleccionado
    ? seleccionado.historial.filter((h) => {
        if (filtroHistorial === "Todo") return true;
        if (filtroHistorial === "Compras") return h.tipo === "venta";
        return h.tipo === "reparacion";
      })
    : [];

  function abrirModalNuevo() {
    setModoModal("crear");
    setForm(FORM_VACIO);
    setFormError(null);
    setModalAbierto(true);
  }

  function abrirModalEditar(c: ClienteUI) {
    setModoModal("editar");
    setForm({ name: c.name, phone: c.phone ?? "", email: c.email ?? "", rfc: c.rfc ?? "", address: c.address ?? "" });
    setFormError(null);
    setModalAbierto(true);
  }

  function handleGuardar() {
    if (!form.name.trim()) {
      setFormError("El nombre es obligatorio");
      return;
    }
    setFormError(null);
    startGuardar(async () => {
      const res =
        modoModal === "crear"
          ? await crearClienteAction({ tenantSlug, ...form })
          : await editarClienteAction({ tenantSlug, clienteId: seleccionado!.id, ...form });
      if (res.ok) {
        setModalAbierto(false);
        if (modoModal === "crear") setSeleccionadoId(res.id);
        router.refresh();
      } else {
        setFormError(res.error);
      }
    });
  }

  const modal = modalAbierto && (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground">
            {modoModal === "crear" ? "Nuevo cliente" : "Editar cliente"}
          </p>
          <button onClick={() => setModalAbierto(false)} className="p-1 rounded-md hover:bg-muted">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nombre completo *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="Nombre y apellido"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Teléfono</label>
            <input
              type="text"
              value={form.phone ?? ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="10 dígitos"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Correo electrónico</label>
            <input
              type="email"
              value={form.email ?? ""}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="opcional"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">RFC</label>
              <input
                type="text"
                value={form.rfc ?? ""}
                onChange={(e) => setForm({ ...form, rfc: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="opcional"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Dirección</label>
              <input
                type="text"
                value={form.address ?? ""}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="opcional"
              />
            </div>
          </div>
          {formError && <p className="text-xs text-red-600">{formError}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={() => setModalAbierto(false)}
            className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={guardando}
            className="px-4 py-2 text-sm rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );

  // ---- Negocio nuevo sin clientes todavía ----
  if (clientes.length === 0) {
    return (
      <>
        <div className="flex h-full items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7 text-primary" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">Aún no tienes clientes registrados</p>
            <p className="text-xs text-muted-foreground mb-5">
              Da de alta a tu primer cliente aquí, o se registrará solo la próxima vez que hagas una venta o
              recibas un equipo a reparar.
            </p>
            <button
              onClick={abrirModalNuevo}
              className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg"
            >
              <Plus className="w-4 h-4" /> Agregar cliente
            </button>
          </div>
        </div>
        {modal}
      </>
    );
  }

  return (
    <div className="flex h-full">
      {/* ── Lista clientes ───────────────────────────────── */}
      <div
        className={`
        ${mostrarDetalle ? "hidden md:flex" : "flex"}
        w-full md:w-72 flex-col bg-card border-r border-border flex-shrink-0
      `}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-medium text-foreground">Clientes</span>
          <button
            onClick={abrirModalNuevo}
            className="flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium px-2.5 py-1.5 rounded-lg"
          >
            <Plus className="w-3 h-3" /> Nuevo
          </button>
        </div>

        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre o teléfono..."
              className="w-full pl-7 pr-3 py-1.5 border border-border rounded-lg text-xs bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {clientesFiltrados.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">Sin resultados</div>
          ) : (
            clientesFiltrados.map((c) => {
              const avatar = colorPara(c.id);
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setSeleccionadoId(c.id);
                    setMostrarDetalle(true);
                  }}
                  className={`flex items-center gap-3 px-3 py-3 border-b border-border cursor-pointer border-l-2 transition-all ${
                    seleccionadoId === c.id ? "bg-primary/5 border-l-primary" : "hover:bg-muted/40 border-l-transparent"
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${avatar.bg} ${avatar.color}`}
                  >
                    {inicialesDe(c.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{c.name}</p>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                      <Phone className="w-2.5 h-2.5 flex-shrink-0" />
                      <span className="truncate">{c.phone ?? "Sin teléfono"}</span>
                      <span className="text-muted-foreground/50 flex-shrink-0">·</span>
                      <span className="flex-shrink-0">{c.visitas} {c.visitas === 1 ? "visita" : "visitas"}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Detalle cliente ──────────────────────────────── */}
      <div
        className={`
        ${mostrarDetalle ? "flex" : "hidden md:flex"}
        flex-1 flex-col bg-muted/20 overflow-hidden
      `}
      >
        {!seleccionado ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
            Selecciona un cliente para ver su detalle
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-card border-b border-border px-4 sm:px-5 py-4">
              <button
                onClick={() => setMostrarDetalle(false)}
                className="md:hidden flex items-center gap-1 text-primary text-xs font-medium mb-3"
              >
                <ChevronLeft className="w-4 h-4" /> Volver a clientes
              </button>

              <div className="flex items-start justify-between mb-4 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-sm font-semibold flex-shrink-0 ${colorPara(seleccionado.id).bg} ${colorPara(seleccionado.id).color}`}
                  >
                    {inicialesDe(seleccionado.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm sm:text-[15px] font-semibold text-foreground">{seleccionado.name}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Phone className="w-3 h-3 flex-shrink-0" />
                      <span>{seleccionado.phone ?? "Sin teléfono"}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5 sm:gap-2 flex-wrap justify-end flex-shrink-0">
                  <button
                    onClick={() => abrirModalEditar(seleccionado)}
                    className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted"
                  >
                    <Edit className="w-3 h-3" />
                    <span className="hidden sm:inline">Editar</span>
                  </button>
                  {whatsappHref(seleccionado.phone) && (
                    <a
                      href={whatsappHref(seleccionado.phone)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 bg-[#25D366] hover:bg-[#22c35e] text-white rounded-lg text-xs font-medium transition-colors"
                    >
                      <span className="text-xs font-bold">W</span>
                      <span className="hidden sm:inline">WhatsApp</span>
                    </a>
                  )}
                  <Link
                    href={`/${tenantSlug}/pos`}
                    className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-medium transition-colors"
                  >
                    <ShoppingCart className="w-3 h-3" />
                    <span className="hidden sm:inline">Nueva venta</span>
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                {[
                  { label: "Total gastado", value: formatMXN(seleccionado.totalGastado), sub: `${seleccionado.visitas} visitas` },
                  {
                    label: label(labels, "entity.repair.plural"),
                    value: String(seleccionado.reparaciones),
                    sub: seleccionado.reparacionesActivas > 0 ? `${seleccionado.reparacionesActivas} activa(s)` : "Sin activas",
                  },
                  { label: "Última visita", value: tiempoRelativo(seleccionado.ultimaVisita), sub: "" },
                  { label: "Cliente desde", value: formatFechaCorta(seleccionado.createdAt), sub: "" },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg p-2.5 sm:p-3 bg-muted/40">
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground mb-1">{s.label}</p>
                    <p className="text-base sm:text-[15px] font-semibold text-foreground">{s.value}</p>
                    {s.sub && <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">{s.sub}</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4">
              <div className="flex gap-2 mb-3 overflow-x-auto">
                {filtrosTabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setFiltroHistorial(tab)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                      filtroHistorial === tab
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <p className="text-[10px] font-semibold text-muted-foreground tracking-widest mb-3">HISTORIAL</p>

              <div className="space-y-2">
                {historialFiltrado.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-xs">Sin registros en esta categoría</div>
                ) : (
                  historialFiltrado.map((h) => (
                    <div
                      key={`${h.tipo}-${h.id}`}
                      className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl hover:border-muted-foreground/30 transition-colors"
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          h.tipo === "reparacion" ? "bg-purple-50" : "bg-emerald-50"
                        }`}
                      >
                        {h.tipo === "reparacion" ? (
                          <Wrench className="w-4 h-4 text-purple-600" />
                        ) : (
                          <ShoppingCart className="w-4 h-4 text-emerald-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{h.titulo}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {h.folio} · {formatFechaLarga(h.fecha)}
                        </p>
                      </div>
                      <span
                        className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${
                          h.tipo === "reparacion"
                            ? REPARACION_BADGE[h.estado as EstadoReparacionCliente]
                            : VENTA_BADGE[h.estado as EstadoVentaCliente]
                        }`}
                      >
                        {h.tipo === "reparacion"
                          ? label(labels, `repair.status.${h.estado}`)
                          : VENTA_TEXTO[h.estado as EstadoVentaCliente]}
                      </span>
                      <span className="text-xs font-semibold text-foreground min-w-[60px] text-right flex-shrink-0">
                        {h.monto > 0 ? formatMXN(h.monto) : "Por definir"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {modal}
    </div>
  );
}
