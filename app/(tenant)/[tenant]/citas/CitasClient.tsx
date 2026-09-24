"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, X, ChevronLeft, ChevronRight, Phone, Clock, CalendarDays,
  CheckCircle2, PlayCircle, Ban, UserX, Pencil, CalendarCheck,
} from "lucide-react";
import type { CitasData, EstadoCita } from "@/lib/citas-data";
import { label, type LabelDictionary } from "@/lib/labels";
import {
  crearCitaAction, editarCitaAction, cambiarEstadoCitaAction, type NuevoEstadoCita,
} from "@/app/actions/citas-actions";
import { PAISES_TELEFONO, PAIS_TELEFONO_DEFAULT, formatoTelefono } from "@/lib/paises";
import { confirmarSalirSinGuardar, useAdvertirCierrePestaña } from "@/lib/confirmar-cierre";

interface CitasClientProps {
  data: CitasData;
  labels: LabelDictionary;
  branches: { id: string; name: string }[];
  tenantSlug: string;
}

const ESTADO_BADGE: Record<EstadoCita, string> = {
  SCHEDULED: "bg-blue-50 text-blue-700",
  CONFIRMED: "bg-cyan-50 text-cyan-700",
  IN_PROGRESS: "bg-purple-50 text-purple-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  NO_SHOW: "bg-amber-50 text-amber-700",
  CANCELLED: "bg-red-50 text-red-600",
};

const DURACIONES = [15, 30, 45, 60, 90, 120];

function inicialesDe(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const ini = (partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "");
  return ini.toUpperCase() || "?";
}

function fechaAKey(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
}

function formatFechaLarga(key: string): string {
  // key es "YYYY-MM-DD" en hora LOCAL (fechaAKey) — se construye con las
  // partes por separado (no `new Date(key)`, que Date interpreta como UTC
  // medianoche y puede mostrar el día anterior según la zona horaria).
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function inputDateTimeLocal(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  const h = String(fecha.getHours()).padStart(2, "0");
  const min = String(fecha.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

interface FormCita {
  branchId: string;
  doctorUserId: string;
  clienteId: string;
  clienteNuevoNombre: string;
  clienteNuevoTelefono: string;
  clienteNuevoPais: string;
  usarClienteNuevo: boolean;
  motivo: string;
  inicio: string; // valor de <input type="datetime-local">
  duracion: number;
  notas: string;
}

function formVacio(branches: { id: string; name: string }[], fechaBase: Date): FormCita {
  const inicio = new Date(fechaBase);
  inicio.setMinutes(0, 0, 0);
  if (inicio.getTime() < Date.now()) inicio.setHours(inicio.getHours() + 1);
  return {
    branchId: branches[0]?.id ?? "",
    doctorUserId: "",
    clienteId: "",
    clienteNuevoNombre: "",
    clienteNuevoTelefono: "",
    clienteNuevoPais: PAIS_TELEFONO_DEFAULT,
    usarClienteNuevo: false,
    motivo: "",
    inicio: inputDateTimeLocal(inicio),
    duracion: 30,
    notas: "",
  };
}

export default function CitasClient({ data, labels, branches, tenantSlug }: CitasClientProps) {
  const router = useRouter();
  const [diaSeleccionado, setDiaSeleccionado] = useState<Date>(() => new Date());
  const [verTodas, setVerTodas] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [citaEditando, setCitaEditando] = useState<string | null>(null);
  const [form, setForm] = useState<FormCita>(() => formVacio(branches, new Date()));
  const [formError, setFormError] = useState<string | null>(null);
  const [guardando, startGuardar] = useTransition();
  const [accionEnCurso, startAccion] = useTransition();

  const diaKey = fechaAKey(diaSeleccionado);

  const citasDelDia = useMemo(
    () => data.citas.filter((c) => fechaAKey(new Date(c.inicio)) === diaKey),
    [data.citas, diaKey]
  );
  const citasMostradas = verTodas
    ? data.citas.filter((c) => c.estado !== "COMPLETED" && c.estado !== "CANCELLED" && c.estado !== "NO_SHOW")
    : citasDelDia;

  const etiquetaEntidad = label(labels, "entity.appointment.plural") || "Citas";

  // 2026-09-22, a petición de Carlos ("pide confirmación para cerrarlas
  // cuando abandone la acción a mitad del proceso"): antes este modal se
  // cerraba sin más (click fuera no hacía nada; la X y "Cancelar" cerraban
  // sin preguntar) — perdiendo lo capturado sin aviso.
  const cancelarModal = () => {
    if (confirmarSalirSinGuardar()) setModalAbierto(false);
  };

  // Aviso al cerrar/recargar la PESTAÑA del navegador mientras el modal de
  // nueva/editar cita sigue abierto (ver el comentario largo en
  // lib/confirmar-cierre.ts) — complementa a cancelarModal() de arriba, que
  // solo cubre cerrar el modal sin salir de la pestaña.
  useAdvertirCierrePestaña(modalAbierto);

  function abrirModalNueva() {
    setCitaEditando(null);
    setForm(formVacio(branches, diaSeleccionado));
    setFormError(null);
    setModalAbierto(true);
  }

  function abrirModalEditar(citaId: string) {
    const cita = data.citas.find((c) => c.id === citaId);
    if (!cita) return;
    setCitaEditando(citaId);
    setForm({
      branchId: cita.branchId,
      doctorUserId: cita.doctorUserId,
      clienteId: cita.clienteId,
      clienteNuevoNombre: "",
      clienteNuevoTelefono: "",
      clienteNuevoPais: PAIS_TELEFONO_DEFAULT,
      usarClienteNuevo: false,
      motivo: cita.motivo,
      inicio: inputDateTimeLocal(new Date(cita.inicio)),
      duracion: Math.max(15, Math.round((new Date(cita.fin).getTime() - new Date(cita.inicio).getTime()) / 60000)),
      notas: cita.notas ?? "",
    });
    setFormError(null);
    setModalAbierto(true);
  }

  function handleGuardar() {
    if (!form.branchId) return setFormError("Selecciona una sucursal");
    if (!form.doctorUserId) return setFormError("Selecciona quién atiende la cita");
    if (!form.motivo.trim()) return setFormError("Describe el motivo de la cita");
    if (!citaEditando && !form.usarClienteNuevo && !form.clienteId) {
      return setFormError("Selecciona o registra un cliente");
    }
    if (!citaEditando && form.usarClienteNuevo && !form.clienteNuevoNombre.trim()) {
      return setFormError("Escribe el nombre del cliente nuevo");
    }

    const inicioFecha = new Date(form.inicio);
    if (Number.isNaN(inicioFecha.getTime())) return setFormError("Fecha u hora no válida");
    const finFecha = new Date(inicioFecha.getTime() + form.duracion * 60000);

    setFormError(null);
    startGuardar(async () => {
      const res = citaEditando
        ? await editarCitaAction({
            tenantSlug,
            citaId: citaEditando,
            branchId: form.branchId,
            doctorUserId: form.doctorUserId,
            motivo: form.motivo,
            inicio: inicioFecha.toISOString(),
            fin: finFecha.toISOString(),
            notas: form.notas || null,
          })
        : await crearCitaAction({
            tenantSlug,
            branchId: form.branchId,
            doctorUserId: form.doctorUserId,
            clienteId: form.usarClienteNuevo ? null : form.clienteId,
            clienteNuevo: form.usarClienteNuevo
              ? { name: form.clienteNuevoNombre, phone: form.clienteNuevoTelefono, phoneCountryCode: form.clienteNuevoPais }
              : null,
            motivo: form.motivo,
            inicio: inicioFecha.toISOString(),
            fin: finFecha.toISOString(),
            notas: form.notas || null,
          });

      if (res.ok) {
        setModalAbierto(false);
        router.refresh();
      } else {
        setFormError(res.error);
      }
    });
  }

  function cambiarEstado(citaId: string, nuevoEstado: NuevoEstadoCita) {
    startAccion(async () => {
      await cambiarEstadoCitaAction({ tenantSlug, citaId, nuevoEstado });
      router.refresh();
    });
  }

  const modal = modalAbierto && (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={cancelarModal}
    >
      <div className="bg-card rounded-xl shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground">{citaEditando ? "Editar cita" : "Nueva cita"}</p>
          <button onClick={cancelarModal} className="p-1 rounded-md hover:bg-muted">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {!citaEditando && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-muted-foreground">Cliente *</label>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, usarClienteNuevo: !form.usarClienteNuevo })}
                  className="text-[12.5px] text-primary-text font-medium"
                >
                  {form.usarClienteNuevo ? "Elegir cliente existente" : "+ Cliente nuevo"}
                </button>
              </div>
              {form.usarClienteNuevo ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={form.clienteNuevoNombre}
                    onChange={(e) => setForm({ ...form, clienteNuevoNombre: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="Nombre del cliente"
                  />
                  <div className="flex gap-2">
                    <select
                      value={form.clienteNuevoPais}
                      onChange={(e) => setForm({ ...form, clienteNuevoPais: e.target.value })}
                      className="px-2 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary flex-shrink-0"
                    >
                      {PAISES_TELEFONO.map((p) => (
                        <option key={p.code} value={p.code}>{p.flag} {p.code}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={form.clienteNuevoTelefono}
                      onChange={(e) => setForm({ ...form, clienteNuevoTelefono: e.target.value })}
                      className="flex-1 min-w-0 px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="Teléfono (opcional)"
                    />
                  </div>
                </div>
              ) : (
                <select
                  value={form.clienteId}
                  onChange={(e) => setForm({ ...form, clienteId: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="">Selecciona un cliente…</option>
                  {data.clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground">Sucursal *</label>
            <select
              value={form.branchId}
              onChange={(e) => setForm({ ...form, branchId: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Atiende *</label>
            <select
              value={form.doctorUserId}
              onChange={(e) => setForm({ ...form, doctorUserId: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Selecciona…</option>
              {data.doctores.map((d) => (
                <option key={d.userId} value={d.userId}>{d.name}{d.puesto ? ` — ${d.puesto}` : ""}</option>
              ))}
            </select>
            {data.doctores.length === 0 && (
              <p className="text-[12.5px] text-amber-600 mt-1">
                Todavía no hay personal disponible para asignar. Agrégalo desde Personal.
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Motivo *</label>
            <input
              type="text"
              value={form.motivo}
              onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="Ej. Limpieza dental"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Fecha y hora *</label>
              <input
                type="datetime-local"
                value={form.inicio}
                onChange={(e) => setForm({ ...form, inicio: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Duración</label>
              <select
                value={form.duracion}
                onChange={(e) => setForm({ ...form, duracion: Number(e.target.value) })}
                className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                {DURACIONES.map((min) => (
                  <option key={min} value={min}>{min} min</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Notas</label>
            <textarea
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              rows={2}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
              placeholder="Opcional"
            />
          </div>

          {formError && <p className="text-xs text-red-600">{formError}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={cancelarModal}
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

  // ---- Negocio nuevo sin citas todavía ----
  if (data.citas.length === 0) {
    return (
      <>
        <div className="flex h-full items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <CalendarCheck className="w-7 h-7 text-primary-text" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">Aún no tienes {etiquetaEntidad.toLowerCase()} agendadas</p>
            <p className="text-xs text-muted-foreground mb-5">
              Agenda la primera cita para empezar a organizar tu día.
            </p>
            <button
              onClick={abrirModalNueva}
              className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg"
            >
              <Plus className="w-4 h-4" /> Nueva cita
            </button>
          </div>
        </div>
        {modal}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{etiquetaEntidad}</h1>
          <p className="text-muted-foreground text-sm">Agenda y da seguimiento a las citas de tu negocio.</p>
        </div>
        <button
          onClick={abrirModalNueva}
          className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium px-3 py-2 rounded-lg"
        >
          <Plus className="w-4 h-4" /> Nueva cita
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-card border border-border rounded-lg px-1 py-1">
          <button
            onClick={() => { const d = new Date(diaSeleccionado); d.setDate(d.getDate() - 1); setDiaSeleccionado(d); setVerTodas(false); }}
            className="p-1.5 rounded-md hover:bg-muted"
          >
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <span className="text-xs font-medium text-foreground px-2 min-w-[190px] text-center capitalize">
            {verTodas ? "Todas las próximas" : formatFechaLarga(diaKey)}
          </span>
          <button
            onClick={() => { const d = new Date(diaSeleccionado); d.setDate(d.getDate() + 1); setDiaSeleccionado(d); setVerTodas(false); }}
            className="p-1.5 rounded-md hover:bg-muted"
          >
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <button
          onClick={() => { setDiaSeleccionado(new Date()); setVerTodas(false); }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-card border border-border text-muted-foreground hover:bg-muted"
        >
          Hoy
        </button>
        <button
          onClick={() => setVerTodas((v) => !v)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
            verTodas ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          Ver todas las próximas
        </button>
      </div>

      <div className="space-y-2">
        {citasMostradas.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm bg-card border border-border rounded-xl">
            {verTodas ? "No hay próximas citas pendientes." : "No hay citas para este día."}
          </div>
        ) : (
          citasMostradas.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 p-3 bg-card border border-border rounded-xl">
              <div className="flex items-center gap-2 min-w-[110px]">
                <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <div className="text-xs">
                  <p className="font-medium text-foreground">{formatHora(c.inicio)}</p>
                  {verTodas && <p className="text-muted-foreground">{formatFechaLarga(fechaAKey(new Date(c.inicio)))}</p>}
                </div>
              </div>

              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary-text flex items-center justify-center text-xs font-semibold flex-shrink-0">
                  {c.iniciales}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{c.cliente}</p>
                  <p className="text-[12.5px] text-muted-foreground truncate">{c.motivo} · {c.doctor}</p>
                </div>
              </div>

              {c.telefono && (
                <div className="hidden md:flex items-center gap-1 text-[12.5px] text-muted-foreground">
                  <Phone className="w-3 h-3" /> {formatoTelefono(c.telefono, c.telefonoPais)}
                </div>
              )}

              <span className={`text-[11.5px] font-medium px-2 py-1 rounded-full whitespace-nowrap ${ESTADO_BADGE[c.estado]}`}>
                {label(labels, `appointment.status.${c.estado}`)}
              </span>

              <div className="flex items-center gap-1 flex-shrink-0">
                {c.estado === "SCHEDULED" && (
                  <button disabled={accionEnCurso} onClick={() => cambiarEstado(c.id, "CONFIRMED")} title="Confirmar" className="p-1.5 rounded-md hover:bg-muted text-cyan-700">
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                )}
                {(c.estado === "SCHEDULED" || c.estado === "CONFIRMED") && (
                  <button disabled={accionEnCurso} onClick={() => cambiarEstado(c.id, "IN_PROGRESS")} title="Iniciar atención" className="p-1.5 rounded-md hover:bg-muted text-purple-700">
                    <PlayCircle className="w-4 h-4" />
                  </button>
                )}
                {c.estado === "IN_PROGRESS" && (
                  <button disabled={accionEnCurso} onClick={() => cambiarEstado(c.id, "COMPLETED")} title="Completar" className="p-1.5 rounded-md hover:bg-muted text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                )}
                {(c.estado === "SCHEDULED" || c.estado === "CONFIRMED") && (
                  <button disabled={accionEnCurso} onClick={() => cambiarEstado(c.id, "NO_SHOW")} title="No se presentó" className="p-1.5 rounded-md hover:bg-muted text-amber-600">
                    <UserX className="w-4 h-4" />
                  </button>
                )}
                {(c.estado === "SCHEDULED" || c.estado === "CONFIRMED" || c.estado === "IN_PROGRESS") && (
                  <>
                    <button onClick={() => abrirModalEditar(c.id)} title="Editar" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button disabled={accionEnCurso} onClick={() => cambiarEstado(c.id, "CANCELLED")} title="Cancelar" className="p-1.5 rounded-md hover:bg-muted text-red-600">
                      <Ban className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {modal}
    </div>
  );
}
