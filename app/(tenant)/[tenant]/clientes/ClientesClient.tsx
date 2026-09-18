"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, Plus, Edit, ShoppingCart, Wrench, Phone, ChevronLeft, X, Users, Stethoscope,
} from "lucide-react";
import type { ClienteUI, EstadoReparacionCliente, EstadoVentaCliente } from "@/lib/clientes-data";
import type { ExpedienteCliente, CondicionDiente } from "@/lib/expediente-data";
import { DIENTES_SUPERIOR, DIENTES_INFERIOR } from "@/lib/expediente-data";
import { label, type LabelDictionary } from "@/lib/labels";
import { crearClienteAction, editarClienteAction, type DatosCliente } from "@/app/actions/clientes-actions";
import {
  guardarAntecedentesAction, crearNotaEvolucionAction, actualizarDienteAction,
  type DatosAntecedentes, type DatosNotaEvolucion,
} from "@/app/actions/expediente-actions";
import { PAISES_TELEFONO, PAIS_TELEFONO_DEFAULT, telefonoWhatsapp, formatoTelefono } from "@/lib/paises";

interface ClientesClientProps {
  clientes: ClienteUI[];
  labels: LabelDictionary;
  tenantSlug: string;
  reparacionesActiva: boolean;
  // Expediente Clínico + Odontograma (M16, 2026-09-18) — ver el comentario
  // largo en schema.prisma. expedienteActiva es el módulo completo (el
  // negocio lo apagó/prendió desde Configuración); odontogramaActivo es
  // además condicionado al rubro (solo consultorio_dental tiene dientes que
  // registrar) — un negocio puede tener expediente activo SIN odontograma
  // (ej. un consultorio médico o una veterinaria).
  expedienteActiva: boolean;
  odontogramaActivo: boolean;
  expedientes: Record<string, ExpedienteCliente>;
}

const EXPEDIENTE_VACIO: ExpedienteCliente = { antecedentes: null, notas: [], dientes: [] };

const ANTECEDENTES_VACIO: DatosAntecedentes = {
  tipoSangre: "", alergias: "", enfermedadesCronicas: "", medicamentosActuales: "",
  cirugiasPrevias: "", antecedentesFamiliares: "", notasGenerales: "",
};

const NOTA_VACIA: DatosNotaEvolucion = { motivo: "", diagnostico: "", tratamiento: "", notas: "" };

// Los 10 valores del enum ToothCondition, en el mismo orden en que se
// declaran en schema.prisma — el texto que ve el usuario sale de
// lib/labels.ts (tooth.condition.*, personalizable por tenant si algún
// negocio quiere otro texto), aquí solo se necesita el orden fijo para
// construir el <select>.
const CONDICIONES_DIENTE: CondicionDiente[] = [
  "SANO", "CARIES", "OBTURADO", "CORONA", "ENDODONCIA", "AUSENTE",
  "EXTRACCION_INDICADA", "IMPLANTE", "FRACTURADO", "SELLANTE",
];

// Color por condición en el odontograma — SANO se deja neutro (el diente
// "por defecto", sin fila en la BD) y el resto usa la misma paleta de
// severidad que ya usan los badges de Reparaciones/Ventas en este archivo.
const CONDICION_COLOR: Record<CondicionDiente, string> = {
  SANO: "bg-card border-border text-foreground",
  CARIES: "bg-red-50 border-red-200 text-red-700",
  OBTURADO: "bg-blue-50 border-blue-200 text-blue-700",
  CORONA: "bg-amber-50 border-amber-200 text-amber-700",
  ENDODONCIA: "bg-purple-50 border-purple-200 text-purple-700",
  AUSENTE: "bg-muted border-border text-muted-foreground line-through",
  EXTRACCION_INDICADA: "bg-red-100 border-red-300 text-red-800",
  IMPLANTE: "bg-cyan-50 border-cyan-200 text-cyan-700",
  FRACTURADO: "bg-orange-50 border-orange-200 text-orange-700",
  SELLANTE: "bg-emerald-50 border-emerald-200 text-emerald-700",
};

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

function whatsappHref(phone: string | null, countryCode: string | null): string | null {
  const numero = telefonoWhatsapp(phone, countryCode);
  return numero ? `https://wa.me/${numero}` : null;
}

type FiltroHistorial = "Todo" | "Compras" | "Reparaciones";

const FORM_VACIO: DatosCliente = { name: "", phone: "", phoneCountryCode: PAIS_TELEFONO_DEFAULT, email: "", rfc: "", address: "" };

export default function ClientesClient({
  clientes, labels, tenantSlug, reparacionesActiva, expedienteActiva, odontogramaActivo, expedientes,
}: ClientesClientProps) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(clientes[0]?.id ?? null);
  const [filtroHistorial, setFiltroHistorial] = useState<FiltroHistorial>("Todo");
  const [mostrarDetalle, setMostrarDetalle] = useState(false);

  // Body del detalle: "historial" (compras/reparaciones, comportamiento de
  // siempre) o "expediente" (M16) — solo existe la segunda opción cuando el
  // negocio tiene el módulo activo.
  const [vistaDetalle, setVistaDetalle] = useState<"historial" | "expediente">("historial");

  const [antecedentesForm, setAntecedentesForm] = useState<DatosAntecedentes>(ANTECEDENTES_VACIO);
  const [antecedentesGuardando, startAntecedentesGuardar] = useTransition();
  const [antecedentesGuardado, setAntecedentesGuardado] = useState(false);

  const [notaModalAbierto, setNotaModalAbierto] = useState(false);
  const [notaForm, setNotaForm] = useState<DatosNotaEvolucion>(NOTA_VACIA);
  const [notaError, setNotaError] = useState<string | null>(null);
  const [notaGuardando, startNotaGuardar] = useTransition();

  const [dienteSeleccionado, setDienteSeleccionado] = useState<number | null>(null);
  const [dienteCondicion, setDienteCondicion] = useState<CondicionDiente>("SANO");
  const [dienteNotas, setDienteNotas] = useState("");
  const [dienteGuardando, startDienteGuardar] = useTransition();

  // Negocio con el módulo de Reparaciones apagado (ej. una barbería): ni la
  // pestaña "Reparaciones" del historial ni ningún registro de tipo
  // "reparacion" que pudiera haber quedado de antes deben aparecer aquí.
  const filtrosTabs: FiltroHistorial[] = reparacionesActiva
    ? ["Todo", "Compras", "Reparaciones"]
    : ["Todo", "Compras"];

  const [modalAbierto, setModalAbierto] = useState(false);
  const [modoModal, setModoModal] = useState<"crear" | "editar">("crear");
  const [form, setForm] = useState<DatosCliente>(FORM_VACIO);
  const [formError, setFormError] = useState<string | null>(null);
  const [guardando, startGuardar] = useTransition();

  const clientesFiltrados = clientes.filter(
    (c) => c.name.toLowerCase().includes(busqueda.toLowerCase()) || (c.phone ?? "").includes(busqueda)
  );
  const seleccionado = clientes.find((c) => c.id === seleccionadoId) ?? null;
  const expedienteSeleccionado: ExpedienteCliente =
    (seleccionado && expedientes[seleccionado.id]) || EXPEDIENTE_VACIO;

  // Al cambiar de cliente (o de antecedentes ya guardados desde el server
  // tras un router.refresh()), el formulario de antecedentes se re-sincroniza
  // con lo último persistido — evita que quede pegado el texto de otro
  // paciente al cambiar de selección, y limpia el aviso de "Guardado".
  useEffect(() => {
    const a = expedienteSeleccionado.antecedentes;
    setAntecedentesForm(
      a
        ? {
            tipoSangre: a.tipoSangre ?? "",
            alergias: a.alergias ?? "",
            enfermedadesCronicas: a.enfermedadesCronicas ?? "",
            medicamentosActuales: a.medicamentosActuales ?? "",
            cirugiasPrevias: a.cirugiasPrevias ?? "",
            antecedentesFamiliares: a.antecedentesFamiliares ?? "",
            notasGenerales: a.notasGenerales ?? "",
          }
        : ANTECEDENTES_VACIO
    );
    setAntecedentesGuardado(false);
    setDienteSeleccionado(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionadoId, expedienteSeleccionado.antecedentes]);

  function abrirDiente(numero: number) {
    const existente = expedienteSeleccionado.dientes.find((d) => d.numero === numero);
    setDienteSeleccionado(numero);
    setDienteCondicion(existente?.condicion ?? "SANO");
    setDienteNotas(existente?.notas ?? "");
  }

  function handleGuardarAntecedentes() {
    if (!seleccionado) return;
    startAntecedentesGuardar(async () => {
      const res = await guardarAntecedentesAction({ tenantSlug, customerId: seleccionado.id, ...antecedentesForm });
      if (res.ok) {
        setAntecedentesGuardado(true);
        router.refresh();
      }
    });
  }

  function abrirModalNota() {
    setNotaForm(NOTA_VACIA);
    setNotaError(null);
    setNotaModalAbierto(true);
  }

  function handleGuardarNota() {
    if (!seleccionado) return;
    if (!notaForm.motivo.trim()) {
      setNotaError("Describe el motivo de la consulta");
      return;
    }
    setNotaError(null);
    startNotaGuardar(async () => {
      const res = await crearNotaEvolucionAction({ tenantSlug, customerId: seleccionado.id, ...notaForm });
      if (res.ok) {
        setNotaModalAbierto(false);
        router.refresh();
      } else {
        setNotaError(res.error);
      }
    });
  }

  function handleGuardarDiente() {
    if (!seleccionado || dienteSeleccionado == null) return;
    startDienteGuardar(async () => {
      const res = await actualizarDienteAction({
        tenantSlug,
        customerId: seleccionado.id,
        numero: dienteSeleccionado,
        condicion: dienteCondicion,
        notas: dienteNotas,
      });
      if (res.ok) {
        setDienteSeleccionado(null);
        router.refresh();
      }
    });
  }

  const historialVisible =
    seleccionado && !reparacionesActiva
      ? seleccionado.historial.filter((h) => h.tipo !== "reparacion")
      : seleccionado?.historial ?? [];

  const historialFiltrado = historialVisible.filter((h) => {
    if (filtroHistorial === "Todo") return true;
    if (filtroHistorial === "Compras") return h.tipo === "venta";
    return h.tipo === "reparacion";
  });

  function abrirModalNuevo() {
    setModoModal("crear");
    setForm(FORM_VACIO);
    setFormError(null);
    setModalAbierto(true);
  }

  function abrirModalEditar(c: ClienteUI) {
    setModoModal("editar");
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      phoneCountryCode: c.phoneCountryCode || PAIS_TELEFONO_DEFAULT,
      email: c.email ?? "",
      rfc: c.rfc ?? "",
      address: c.address ?? "",
    });
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
            <div className="mt-1 flex gap-2">
              <select
                value={form.phoneCountryCode || PAIS_TELEFONO_DEFAULT}
                onChange={(e) => setForm({ ...form, phoneCountryCode: e.target.value })}
                className="px-2 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary flex-shrink-0"
              >
                {PAISES_TELEFONO.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.flag} {p.code}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={form.phone ?? ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="flex-1 min-w-0 px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="Número"
              />
            </div>
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
                      <span className="truncate">{formatoTelefono(c.phone, c.phoneCountryCode) ?? "Sin teléfono"}</span>
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
                      <span>{formatoTelefono(seleccionado.phone, seleccionado.phoneCountryCode) ?? "Sin teléfono"}</span>
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
                  {whatsappHref(seleccionado.phone, seleccionado.phoneCountryCode) && (
                    <a
                      href={whatsappHref(seleccionado.phone, seleccionado.phoneCountryCode)!}
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

              <div className={`grid grid-cols-2 gap-2 sm:gap-3 ${reparacionesActiva ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
                {[
                  { label: "Total gastado", value: formatMXN(seleccionado.totalGastado), sub: `${seleccionado.visitas} visitas` },
                  ...(reparacionesActiva
                    ? [
                        {
                          label: label(labels, "entity.repair.plural"),
                          value: String(seleccionado.reparaciones),
                          sub: seleccionado.reparacionesActivas > 0 ? `${seleccionado.reparacionesActivas} activa(s)` : "Sin activas",
                        },
                      ]
                    : []),
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

            {/* Selector Historial / Expediente Clínico (M16) — solo existe
                si el negocio tiene el módulo activo; si no, el body se
                queda exactamente como antes de este cambio. */}
            {expedienteActiva && (
              <div className="flex gap-2 px-3 sm:px-4 pt-3 bg-card border-b border-border">
                {(["historial", "expediente"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setVistaDetalle(v)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                      vistaDetalle === v
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {v === "expediente" && <Stethoscope className="w-3.5 h-3.5" />}
                    {v === "historial" ? "Historial" : label(labels, "module.clinicalRecord.name")}
                  </button>
                ))}
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4">
              {(!expedienteActiva || vistaDetalle === "historial") ? (
                <>
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
                </>
              ) : (
                <div className="space-y-5">
                  {/* Antecedentes */}
                  <div className="bg-card border border-border rounded-xl p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] font-semibold text-muted-foreground tracking-widest">ANTECEDENTES</p>
                      {antecedentesGuardado && <span className="text-[10px] text-emerald-600">Guardado</span>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Tipo de sangre</label>
                        <input
                          type="text"
                          value={antecedentesForm.tipoSangre ?? ""}
                          onChange={(e) => { setAntecedentesForm({ ...antecedentesForm, tipoSangre: e.target.value }); setAntecedentesGuardado(false); }}
                          placeholder="ej. O+"
                          className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Alergias</label>
                        <input
                          type="text"
                          value={antecedentesForm.alergias ?? ""}
                          onChange={(e) => { setAntecedentesForm({ ...antecedentesForm, alergias: e.target.value }); setAntecedentesGuardado(false); }}
                          placeholder="ej. Penicilina"
                          className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Enfermedades crónicas</label>
                        <input
                          type="text"
                          value={antecedentesForm.enfermedadesCronicas ?? ""}
                          onChange={(e) => { setAntecedentesForm({ ...antecedentesForm, enfermedadesCronicas: e.target.value }); setAntecedentesGuardado(false); }}
                          placeholder="ej. Diabetes, hipertensión"
                          className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Medicamentos actuales</label>
                        <input
                          type="text"
                          value={antecedentesForm.medicamentosActuales ?? ""}
                          onChange={(e) => { setAntecedentesForm({ ...antecedentesForm, medicamentosActuales: e.target.value }); setAntecedentesGuardado(false); }}
                          placeholder="opcional"
                          className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Cirugías previas</label>
                        <input
                          type="text"
                          value={antecedentesForm.cirugiasPrevias ?? ""}
                          onChange={(e) => { setAntecedentesForm({ ...antecedentesForm, cirugiasPrevias: e.target.value }); setAntecedentesGuardado(false); }}
                          placeholder="opcional"
                          className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Antecedentes familiares</label>
                        <input
                          type="text"
                          value={antecedentesForm.antecedentesFamiliares ?? ""}
                          onChange={(e) => { setAntecedentesForm({ ...antecedentesForm, antecedentesFamiliares: e.target.value }); setAntecedentesGuardado(false); }}
                          placeholder="opcional"
                          className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-xs font-medium text-muted-foreground">Notas generales</label>
                        <textarea
                          value={antecedentesForm.notasGenerales ?? ""}
                          onChange={(e) => { setAntecedentesForm({ ...antecedentesForm, notasGenerales: e.target.value }); setAntecedentesGuardado(false); }}
                          rows={2}
                          placeholder="opcional"
                          className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end mt-3">
                      <button
                        onClick={handleGuardarAntecedentes}
                        disabled={antecedentesGuardando}
                        className="px-4 py-1.5 text-xs rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium disabled:opacity-50"
                      >
                        {antecedentesGuardando ? "Guardando…" : "Guardar antecedentes"}
                      </button>
                    </div>
                  </div>

                  {/* Odontograma — solo consultorio dental */}
                  {odontogramaActivo && (
                    <div className="bg-card border border-border rounded-xl p-3 sm:p-4">
                      <p className="text-[10px] font-semibold text-muted-foreground tracking-widest mb-3">ODONTOGRAMA</p>
                      <div className="space-y-1.5 overflow-x-auto pb-1">
                        {[DIENTES_SUPERIOR, DIENTES_INFERIOR].map((fila, i) => (
                          <div key={i} className="flex gap-1 justify-center min-w-max">
                            {fila.map((numero) => {
                              const diente = expedienteSeleccionado.dientes.find((d) => d.numero === numero);
                              const condicion = diente?.condicion ?? "SANO";
                              return (
                                <button
                                  key={numero}
                                  onClick={() => abrirDiente(numero)}
                                  title={`Diente ${numero} — ${label(labels, `tooth.condition.${condicion}`)}`}
                                  className={`w-9 h-9 sm:w-10 sm:h-10 rounded-md border text-[10px] font-semibold flex items-center justify-center transition-colors ${CONDICION_COLOR[condicion]} ${dienteSeleccionado === numero ? "ring-2 ring-primary" : ""}`}
                                >
                                  {numero}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>

                      {dienteSeleccionado != null && (
                        <div className="mt-4 p-3 rounded-lg bg-muted/40 border border-border">
                          <p className="text-xs font-semibold text-foreground mb-2">Diente {dienteSeleccionado}</p>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <select
                              value={dienteCondicion}
                              onChange={(e) => setDienteCondicion(e.target.value as CondicionDiente)}
                              className="px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            >
                              {CONDICIONES_DIENTE.map((c) => (
                                <option key={c} value={c}>{label(labels, `tooth.condition.${c}`)}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={dienteNotas}
                              onChange={(e) => setDienteNotas(e.target.value)}
                              placeholder="Notas del diente (opcional)"
                              className="flex-1 px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={handleGuardarDiente}
                                disabled={dienteGuardando}
                                className="px-4 py-2 text-xs rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium disabled:opacity-50 whitespace-nowrap"
                              >
                                {dienteGuardando ? "Guardando…" : "Guardar"}
                              </button>
                              <button
                                onClick={() => setDienteSeleccionado(null)}
                                className="px-3 py-2 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notas de evolución */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] font-semibold text-muted-foreground tracking-widest">NOTAS DE EVOLUCIÓN</p>
                      <button
                        onClick={abrirModalNota}
                        className="flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium px-2.5 py-1.5 rounded-lg"
                      >
                        <Plus className="w-3 h-3" /> Nueva nota
                      </button>
                    </div>
                    <div className="space-y-2">
                      {expedienteSeleccionado.notas.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-xs">Sin notas de evolución todavía</div>
                      ) : (
                        expedienteSeleccionado.notas.map((n) => (
                          <div key={n.id} className="p-3 bg-card border border-border rounded-xl">
                            <div className="flex items-start justify-between gap-3 mb-1">
                              <p className="text-xs font-medium text-foreground">{n.motivo}</p>
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                                {formatFechaLarga(n.fecha)}
                              </span>
                            </div>
                            {n.diagnostico && <p className="text-xs text-muted-foreground"><span className="font-medium">Diagnóstico:</span> {n.diagnostico}</p>}
                            {n.tratamiento && <p className="text-xs text-muted-foreground"><span className="font-medium">Tratamiento:</span> {n.tratamiento}</p>}
                            {n.notas && <p className="text-xs text-muted-foreground mt-1">{n.notas}</p>}
                            <p className="text-[10px] text-muted-foreground mt-1.5">Atendió: {n.doctor}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {notaModalAbierto && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <p className="text-sm font-semibold text-foreground">Nueva nota de evolución</p>
              <button onClick={() => setNotaModalAbierto(false)} className="p-1 rounded-md hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Motivo de la consulta *</label>
                <input
                  type="text"
                  value={notaForm.motivo}
                  onChange={(e) => setNotaForm({ ...notaForm, motivo: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="ej. Limpieza dental, revisión"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Diagnóstico</label>
                <input
                  type="text"
                  value={notaForm.diagnostico ?? ""}
                  onChange={(e) => setNotaForm({ ...notaForm, diagnostico: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="opcional"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Tratamiento</label>
                <input
                  type="text"
                  value={notaForm.tratamiento ?? ""}
                  onChange={(e) => setNotaForm({ ...notaForm, tratamiento: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="opcional"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Notas</label>
                <textarea
                  value={notaForm.notas ?? ""}
                  onChange={(e) => setNotaForm({ ...notaForm, notas: e.target.value })}
                  rows={3}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  placeholder="opcional"
                />
              </div>
              {notaError && <p className="text-xs text-red-600">{notaError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button
                onClick={() => setNotaModalAbierto(false)}
                className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardarNota}
                disabled={notaGuardando}
                className="px-4 py-2 text-sm rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium disabled:opacity-50"
              >
                {notaGuardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal}
    </div>
  );
}
