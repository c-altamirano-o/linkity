"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Plus, Users, UserCheck, Clock, Wallet, LogIn, LogOut, Pencil,
  Banknote, X, Check, Ban, KeyRound, Shield,
} from "lucide-react";
import type { PersonalData, EmpleadoUI, EsquemaPago, BaseComision, Frecuencia, EstadoPago, MetodoPago } from "@/lib/personal-data";
import { label, type LabelDictionary } from "@/lib/labels";
import type { RolTenantUI } from "@/lib/roles";
import { PAISES_TELEFONO, PAIS_TELEFONO_DEFAULT, paisPorCodigo, validarTelefono } from "@/lib/paises";
import {
  crearEmpleadoAction, editarEmpleadoAction, cambiarEstadoEmpleadoAction,
  registrarAsistenciaAction, generarPagoAction, actualizarEstadoPagoAction,
  obtenerSugerenciaComisionAction, restablecerPinAction, type DatosEmpleado,
} from "@/app/actions/personal-actions";
import RolesManager from "./RolesManager";
import { confirmarSalirSinGuardar, useAdvertirCierrePestaña } from "@/lib/confirmar-cierre";

interface BranchOption {
  id: string;
  name: string;
}

interface PersonalClientProps {
  data: PersonalData;
  labels: LabelDictionary;
  branches: BranchOption[];
  tenantSlug: string;
  // Catálogo de roles asignables de este negocio (base + personalizados) —
  // ver lib/roles-server.ts. puestosSugeridos alimenta solo un <datalist> de
  // autocompletado para "Puesto" (lib/puestos-rubro.ts), sin ningún efecto
  // en permisos.
  roles: RolTenantUI[];
  puestosSugeridos: string[];
  // Códigos de módulo desactivados para este negocio (2026-09-22, ver el
  // comentario largo en RolesManager.tsx) — se le pasa tal cual a
  // RolesManager para que el selector de casillas al crear/editar un rol
  // solo ofrezca lo que este negocio realmente usa.
  modulosInactivos?: string[];
}

const ESQUEMA_TEXTO: Record<EsquemaPago, string> = {
  FIJO: "Sueldo fijo (sin comisión)",
  COMISION: "Comisión (% del precio)",
  MIXTO: "Fijo + comisión (%)",
  DESTAJO: "Destajo ($ fijo por unidad, no %)",
};
const COMISION_BASE_TEXTO: Record<BaseComision, string> = { VENTAS: "Ventas", REPARACIONES: "Reparaciones", UTILIDAD: "Utilidad" };
const FRECUENCIA_TEXTO: Record<Frecuencia, string> = { SEMANAL: "Semanal", CATORCENAL: "Catorcenal", QUINCENAL: "Quincenal", MENSUAL: "Mensual" };
const METODO_PAGO_TEXTO: Record<MetodoPago, string> = { EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia", CHEQUE: "Cheque", TARJETA_NOMINA: "Tarjeta de nómina", OTRO: "Otro" };
const ESTADO_PAGO_TEXTO: Record<EstadoPago, string> = { PENDING: "Pendiente", PAID: "Pagado", CANCELLED: "Cancelado" };
const ESTADO_PAGO_BADGE: Record<EstadoPago, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  PAID: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-muted text-muted-foreground",
};

const formatMXN = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });
const formatFecha = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
const formatHora = (iso: string) => new Date(iso).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

function periodoPorDefecto(frecuencia: Frecuencia): { inicio: string; fin: string } {
  const hoy = new Date();
  const dias = frecuencia === "SEMANAL" ? 7 : frecuencia === "MENSUAL" ? 30 : 15;
  const inicioDate = new Date(hoy.getTime() - (dias - 1) * 86_400_000);
  return { inicio: inicioDate.toISOString().slice(0, 10), fin: hoy.toISOString().slice(0, 10) };
}

interface FormEmpleado {
  branchId: string;
  name: string;
  phone: string;
  phoneCountryCode: string;
  position: string;
  roleId: string;
  pin: string;
  paymentScheme: EsquemaPago;
  baseSalary: string;
  commissionRate: string;
  commissionBase: BaseComision;
  paymentFrequency: Frecuencia;
  commissionFrequency: Frecuencia;
  pieceRate: string;
  teamCommissionRate: string;
  teamCommissionBase: BaseComision | "";
  staffPaymentMethod: MetodoPago;
  clabe: string;
}

// 2026-09-23, a petición de Carlos ("Todo personal al crearlo, debe pedir
// asignación a una sucursal"): antes esta función se llamaba con
// branches[0]?.id, así que en un negocio de varias sucursales el modal de
// alta ya arrancaba con una sucursal pre-elegida (la primera de la lista)
// sin que el administrador la hubiera tocado — fácil de no notar y dar de
// alta a alguien en la sucursal equivocada. Ahora, cuando SÍ hay más de una
// sucursal entre las que elegir, arranca vacío a propósito (el selector de
// abajo obliga a escogerla, con un placeholder deshabilitado) — la
// validación de guardarEmpleadoAction ya rechazaba branchId vacío, pero
// nada en la UI forzaba antes a que ese vacío fuera visible. Con una sola
// sucursal no tiene caso pedir nada: se sigue asignando sola, como siempre.
function formVacio(branchId: string): FormEmpleado {
  return {
    branchId, name: "", phone: "", phoneCountryCode: PAIS_TELEFONO_DEFAULT, position: "", roleId: "", pin: "",
    paymentScheme: "FIJO", baseSalary: "", commissionRate: "0", commissionBase: "VENTAS",
    paymentFrequency: "QUINCENAL", commissionFrequency: "QUINCENAL", pieceRate: "0",
    teamCommissionRate: "0", teamCommissionBase: "", staffPaymentMethod: "EFECTIVO", clabe: "",
  };
}

function formDeEmpleado(e: EmpleadoUI): FormEmpleado {
  return {
    branchId: e.branchId, name: e.name, phone: e.phone ?? "", phoneCountryCode: e.phoneCountryCode, position: e.position ?? "",
    roleId: e.roleId ?? "", pin: "",
    paymentScheme: e.esquemaPago, baseSalary: String(e.sueldoBase), commissionRate: String(e.comisionRate),
    commissionBase: e.comisionBase, paymentFrequency: e.frecuencia, commissionFrequency: e.frecuenciaComision,
    pieceRate: String(e.montoDestajo), teamCommissionRate: String(e.comisionEquipoRate),
    teamCommissionBase: e.comisionEquipoBase ?? "", staffPaymentMethod: e.metodoPago, clabe: e.clabe ?? "",
  };
}

export default function PersonalClient({ data, labels, branches, tenantSlug, roles, puestosSugeridos, modulosInactivos = [] }: PersonalClientProps) {
  const router = useRouter();
  const { empleados } = data;
  const [modalRoles, setModalRoles] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [filtroSucursal, setFiltroSucursal] = useState("todas");
  const [filtroActivo, setFiltroActivo] = useState<"activos" | "todos">("activos");
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(empleados[0]?.id ?? null);

  const [pending, startAccion] = useTransition();
  const [accionError, setAccionError] = useState<string | null>(null);

  const [modalEmpleado, setModalEmpleado] = useState<{ modo: "crear" | "editar"; id: string | null } | null>(null);
  const [form, setForm] = useState<FormEmpleado>(formVacio(branches.length === 1 ? branches[0].id : ""));
  const [formError, setFormError] = useState<string | null>(null);
  const [guardando, startGuardar] = useTransition();

  const [modalPinStaffId, setModalPinStaffId] = useState<string | null>(null);
  const [nuevoPin, setNuevoPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [restableciendoPin, startRestablecerPin] = useTransition();

  const [modalPagoStaffId, setModalPagoStaffId] = useState<string | null>(null);
  const [pagoInicio, setPagoInicio] = useState("");
  const [pagoFin, setPagoFin] = useState("");
  const [pagoBase, setPagoBase] = useState("");
  const [pagoComision, setPagoComision] = useState("");
  const [pagoNotas, setPagoNotas] = useState("");
  const [pagoAdvertencia, setPagoAdvertencia] = useState<string | null>(null);
  const [pagoError, setPagoError] = useState<string | null>(null);
  const [cargandoSugerencia, setCargandoSugerencia] = useState(false);
  const [generandoPago, startGenerarPago] = useTransition();

  const empleadosFiltrados = useMemo(() => {
    return empleados.filter((e) => {
      const matchBusqueda = e.name.toLowerCase().includes(busqueda.toLowerCase()) || (e.position ?? "").toLowerCase().includes(busqueda.toLowerCase());
      const matchSucursal = filtroSucursal === "todas" || e.branchId === filtroSucursal;
      const matchActivo = filtroActivo === "todos" || e.isActive;
      return matchBusqueda && matchSucursal && matchActivo;
    });
  }, [empleados, busqueda, filtroSucursal, filtroActivo]);

  const seleccionado = empleados.find((e) => e.id === seleccionadoId) ?? null;

  const totalActivos = empleados.filter((e) => e.isActive).length;
  const activosHoy = empleados.filter((e) => e.asistenciaHoy?.checkIn).length;
  const horasSemana = Math.round(empleados.reduce((s, e) => s + e.horasSemana, 0) * 10) / 10;
  const nominaPendiente = empleados.reduce((s, e) => s + e.pagos.filter((p) => p.estado === "PENDING").reduce((s2, p) => s2 + p.total, 0), 0);

  const refrescar = () => router.refresh();

  // ── Asistencia ──────────────────────────────────────────
  const handleAsistencia = (staffId: string, accion: "entrada" | "salida") => {
    setAccionError(null);
    startAccion(async () => {
      const res = await registrarAsistenciaAction({ tenantSlug, staffId, accion });
      if (res.ok) refrescar();
      else setAccionError(res.error);
    });
  };

  const handleToggleActivo = (emp: EmpleadoUI) => {
    setAccionError(null);
    startAccion(async () => {
      const res = await cambiarEstadoEmpleadoAction({ tenantSlug, staffId: emp.id, activo: !emp.isActive });
      if (res.ok) refrescar();
      else setAccionError(res.error);
    });
  };

  // ── Modal empleado (crear/editar) ────────────────────────
  const abrirNuevoEmpleado = () => {
    setForm(formVacio(branches.length === 1 ? branches[0].id : ""));
    setFormError(null);
    setModalEmpleado({ modo: "crear", id: null });
  };

  const abrirEditarEmpleado = (emp: EmpleadoUI) => {
    setForm(formDeEmpleado(emp));
    setFormError(null);
    setModalEmpleado({ modo: "editar", id: emp.id });
  };

  const handleGuardarEmpleado = () => {
    if (!form.name.trim()) { setFormError("El nombre es obligatorio"); return; }
    if (!form.branchId) { setFormError("Selecciona una sucursal"); return; }
    if (!form.roleId) { setFormError("Selecciona un rol — determina a qué módulos tendrá acceso"); return; }
    if (modalEmpleado?.modo === "crear" && !/^\d{6}$/.test(form.pin)) {
      setFormError("Asigna un PIN de inicio de 6 dígitos");
      return;
    }
    const baseSalary = parseFloat(form.baseSalary || "0");
    const commissionRate = parseFloat(form.commissionRate || "0");
    const pieceRate = parseFloat(form.pieceRate || "0");
    const teamCommissionRate = parseFloat(form.teamCommissionRate || "0");
    if (!Number.isFinite(baseSalary) || baseSalary < 0) { setFormError("El sueldo base no es válido"); return; }
    if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) { setFormError("El % de comisión debe estar entre 0 y 100"); return; }
    if (!Number.isFinite(pieceRate) || pieceRate < 0) { setFormError("El monto por destajo no es válido"); return; }
    if (!Number.isFinite(teamCommissionRate) || teamCommissionRate < 0 || teamCommissionRate > 100) { setFormError("El % de comisión de equipo debe estar entre 0 y 100"); return; }
    const errorTelefono = validarTelefono(form.phone, form.phoneCountryCode);
    if (errorTelefono) { setFormError(errorTelefono); return; }
    if (form.staffPaymentMethod === "TRANSFERENCIA" && form.clabe.replace(/\D/g, "").length !== 18) {
      setFormError("La CLABE debe tener exactamente 18 dígitos");
      return;
    }
    setFormError(null);

    const datos: DatosEmpleado = {
      branchId: form.branchId,
      name: form.name,
      phone: form.phone || null,
      phoneCountryCode: form.phoneCountryCode,
      position: form.position || null,
      roleId: form.roleId,
      paymentScheme: form.paymentScheme as any,
      baseSalary,
      commissionRate,
      commissionBase: form.commissionBase as any,
      paymentFrequency: form.paymentFrequency as any,
      commissionFrequency: form.commissionFrequency as any,
      pieceRate,
      teamCommissionRate,
      teamCommissionBase: (form.teamCommissionBase || null) as any,
      staffPaymentMethod: form.staffPaymentMethod as any,
      clabe: form.clabe || null,
    };

    startGuardar(async () => {
      const res = modalEmpleado?.modo === "editar" && modalEmpleado.id
        ? await editarEmpleadoAction({ tenantSlug, staffId: modalEmpleado.id, ...datos })
        : await crearEmpleadoAction({ tenantSlug, pin: form.pin, ...datos });
      if (res.ok) {
        setModalEmpleado(null);
        refrescar();
      } else {
        setFormError(res.error);
      }
    });
  };

  // Cierra el modal de empleado por cualquier vía (fondo, X o Cancelar) —
  // siempre pide confirmación, sin importar si hubo cambios reales (mismo
  // criterio que ya regía solo para el click en el fondo).
  const cancelarModalEmpleado = () => {
    if (confirmarSalirSinGuardar()) setModalEmpleado(null);
  };

  // ── Modal restablecer PIN ────────────────────────────────
  const abrirRestablecerPin = (emp: EmpleadoUI) => {
    setModalPinStaffId(emp.id);
    setNuevoPin("");
    setPinError(null);
  };

  const handleRestablecerPin = () => {
    if (!modalPinStaffId) return;
    if (!/^\d{6}$/.test(nuevoPin)) { setPinError("El PIN debe ser de 6 dígitos"); return; }
    setPinError(null);
    startRestablecerPin(async () => {
      const res = await restablecerPinAction({ tenantSlug, staffId: modalPinStaffId, pin: nuevoPin });
      if (res.ok) {
        setModalPinStaffId(null);
        refrescar();
      } else {
        setPinError(res.error);
      }
    });
  };

  // Cierra el modal de PIN por cualquier vía (fondo, X o Cancelar) — mismo
  // criterio de siempre preguntar, sin dirty-tracking.
  const cancelarModalPin = () => {
    if (confirmarSalirSinGuardar()) setModalPinStaffId(null);
  };

  // ── Modal generar pago ───────────────────────────────────
  const abrirModalPago = (emp: EmpleadoUI) => {
    const periodo = periodoPorDefecto(emp.frecuencia);
    setModalPagoStaffId(emp.id);
    setPagoInicio(periodo.inicio);
    setPagoFin(periodo.fin);
    setPagoBase(emp.esquemaPago === "COMISION" ? "0" : String(emp.sueldoBase));
    setPagoComision("0");
    setPagoAdvertencia(null);
    setPagoError(null);
    if (emp.esquemaPago !== "FIJO") {
      cargarSugerencia(emp.id, periodo.inicio, periodo.fin);
    }
  };

  const cargarSugerencia = (staffId: string, inicio: string, fin: string) => {
    setCargandoSugerencia(true);
    obtenerSugerenciaComisionAction({ tenantSlug, staffId, periodoInicio: inicio, periodoFin: fin })
      .then((res) => {
        if (res.ok) {
          // Suma la comisión individual con la de equipo (si el empleado
          // lidera uno) — un solo monto editable, igual que antes.
          setPagoComision(String(res.monto + res.montoEquipo));
          setPagoAdvertencia([res.advertencia, res.advertenciaEquipo].filter(Boolean).join(" ") || null);
        } else {
          setPagoAdvertencia(res.error);
        }
      })
      .finally(() => setCargandoSugerencia(false));
  };

  const handleCambiarPeriodoPago = (campo: "inicio" | "fin", valor: string) => {
    const nuevoInicio = campo === "inicio" ? valor : pagoInicio;
    const nuevoFin = campo === "fin" ? valor : pagoFin;
    if (campo === "inicio") setPagoInicio(valor); else setPagoFin(valor);
    if (modalPagoStaffId && seleccionadoParaPago?.esquemaPago !== "FIJO") {
      cargarSugerencia(modalPagoStaffId, nuevoInicio, nuevoFin);
    }
  };

  const seleccionadoParaPago = empleados.find((e) => e.id === modalPagoStaffId) ?? null;

  const handleGenerarPago = () => {
    if (!modalPagoStaffId) return;
    const montoBase = parseFloat(pagoBase || "0");
    const montoComision = parseFloat(pagoComision || "0");
    if (!Number.isFinite(montoBase) || montoBase < 0) { setPagoError("El monto base no es válido"); return; }
    if (!Number.isFinite(montoComision) || montoComision < 0) { setPagoError("El monto de comisión no es válido"); return; }
    if (!pagoInicio || !pagoFin) { setPagoError("Define el período"); return; }
    setPagoError(null);

    startGenerarPago(async () => {
      const res = await generarPagoAction({
        tenantSlug, staffId: modalPagoStaffId, periodoInicio: pagoInicio, periodoFin: pagoFin,
        montoBase, montoComision, notas: pagoNotas || null,
      });
      if (res.ok) {
        setModalPagoStaffId(null);
        setPagoNotas("");
        refrescar();
      } else {
        setPagoError(res.error);
      }
    });
  };

  // Cierra el modal de generar pago por cualquier vía (fondo, X o Cancelar)
  // — mismo criterio de siempre preguntar, sin dirty-tracking.
  const cancelarModalPago = () => {
    if (confirmarSalirSinGuardar()) setModalPagoStaffId(null);
  };

  const handleActualizarPago = (paymentId: string, estado: "PAID" | "CANCELLED") => {
    setAccionError(null);
    startAccion(async () => {
      const res = await actualizarEstadoPagoAction({ tenantSlug, paymentId, estado });
      if (res.ok) refrescar();
      else setAccionError(res.error);
    });
  };

  const moduloNombre = label(labels, "module.staff.name");
  const empleadoParaPin = empleados.find((e) => e.id === modalPinStaffId) ?? null;

  // Advierte al cerrar/recargar la PESTAÑA (no solo el modal) mientras
  // cualquiera de los tres modales de captura de este módulo esté abierto
  // (2026-09-22, a petición de Carlos — ver lib/confirmar-cierre.ts).
  useAdvertirCierrePestaña(modalEmpleado !== null || empleadoParaPin !== null || seleccionadoParaPago !== null);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 pt-4 pb-2">
        <h1 className="text-xl font-bold tracking-tight text-foreground">{moduloNombre}</h1>
        <p className="text-sm text-muted-foreground">Directorio, asistencia y nómina de tu equipo.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 sm:px-6 pb-3">
        {[
          { label: "Total empleados", value: String(totalActivos), sub: "Activos", icon: Users, color: "text-primary" },
          { label: "Activos hoy", value: String(activosHoy), sub: "Con entrada registrada", icon: UserCheck, color: "text-emerald-600" },
          { label: "Horas registradas", value: String(horasSemana), sub: "Últimos 8 días", icon: Clock, color: "text-foreground" },
          { label: "Nómina pendiente", value: nominaPendiente === 0 ? "Al día" : formatMXN(nominaPendiente), sub: "Pagos por procesar", icon: Wallet, color: nominaPendiente === 0 ? "text-emerald-600" : "text-amber-600" },
        ].map((m) => (
          <div key={m.label} className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11.5px] text-muted-foreground">{m.label}</p>
              <m.icon className={`w-3.5 h-3.5 ${m.color}`} />
            </div>
            <p className={`text-lg font-semibold ${m.color}`}>{m.value}</p>
            <p className="text-[11.5px] text-muted-foreground">{m.sub}</p>
          </div>
        ))}
      </div>

      {accionError && (
        <div className="mx-4 sm:mx-6 mb-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{accionError}</div>
      )}

      <div className="flex-1 overflow-hidden flex border-t border-border">
        {/* Lista */}
        <div className="w-full md:w-80 flex-col bg-card border-r border-border flex-shrink-0 hidden md:flex">
          <div className="px-3 py-2 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o puesto..."
                className="w-full pl-7 pr-3 py-1.5 border border-border rounded-lg text-xs bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
            </div>
            <div className="flex gap-2">
              {branches.length > 1 && (
                <select value={filtroSucursal} onChange={(e) => setFiltroSucursal(e.target.value)}
                  className="flex-1 text-[12.5px] border border-border rounded-lg px-2 py-1 bg-card text-foreground">
                  <option value="todas">Todas las sucursales</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
              <div className="flex gap-1">
                {(["activos", "todos"] as const).map((f) => (
                  <button key={f} onClick={() => setFiltroActivo(f)}
                    className={`px-2 py-1 rounded-full text-[11.5px] font-medium capitalize transition-colors ${
                      filtroActivo === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                    {f === "activos" ? "Activos" : "Todos"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-1.5">
              <button onClick={abrirNuevoEmpleado}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium rounded-lg">
                <Plus className="w-3.5 h-3.5" /> Nuevo empleado
              </button>
              <button onClick={() => setModalRoles(true)} title="Roles y permisos"
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-border hover:bg-muted text-xs font-medium rounded-lg text-foreground">
                <Shield className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {empleadosFiltrados.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs">Sin resultados</div>
            ) : empleadosFiltrados.map((e) => (
              <div key={e.id} onClick={() => setSeleccionadoId(e.id)}
                className={`px-3 py-3 border-b border-border/60 cursor-pointer transition-all border-l-2 ${
                  seleccionado?.id === e.id ? "bg-primary/5 border-l-primary" : "hover:bg-muted border-l-transparent"
                }`}>
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11.5px] font-semibold flex-shrink-0 ${
                    e.isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  }`}>
                    {iniciales(e.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{e.name}</p>
                    <p className="text-[11.5px] text-muted-foreground truncate">{e.position || e.roleName || "Sin puesto"} · {e.branchName}</p>
                  </div>
                  {!e.isActive && <span className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">Inactivo</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detalle */}
        <div className="flex-1 overflow-y-auto bg-muted">
          {!seleccionado ? (
            <div className="flex flex-col items-center justify-center h-full p-10 text-center">
              <Users className="w-8 h-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm font-medium text-foreground mb-1">Sin empleados registrados</p>
              <button onClick={abrirNuevoEmpleado} className="text-xs text-primary mt-1">+ Registrar el primero</button>
            </div>
          ) : (
            <>
              <div className="bg-card border-b border-border px-4 sm:px-5 py-3">
                <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                      seleccionado.isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {iniciales(seleccionado.name)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{seleccionado.name}</p>
                      <p className="text-xs text-muted-foreground">{seleccionado.position || "Sin puesto"} · {seleccionado.branchName}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap justify-end">
                    {seleccionado.isActive && (!seleccionado.asistenciaHoy?.checkIn ? (
                      <button disabled={pending} onClick={() => handleAsistencia(seleccionado.id, "entrada")}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium">
                        <LogIn className="w-3 h-3" /> Registrar entrada
                      </button>
                    ) : !seleccionado.asistenciaHoy?.checkOut ? (
                      <button disabled={pending} onClick={() => handleAsistencia(seleccionado.id, "salida")}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium">
                        <LogOut className="w-3 h-3" /> Registrar salida
                      </button>
                    ) : (
                      <span className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium">
                        <Check className="w-3 h-3" /> Asistencia completa
                      </span>
                    ))}
                    <button onClick={() => abrirEditarEmpleado(seleccionado)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-border hover:bg-muted rounded-lg text-xs font-medium text-foreground">
                      <Pencil className="w-3 h-3" /> Editar
                    </button>
                    <button onClick={() => abrirRestablecerPin(seleccionado)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-border hover:bg-muted rounded-lg text-xs font-medium text-foreground">
                      <KeyRound className="w-3 h-3" /> {seleccionado.tienePin ? "Restablecer PIN" : "Asignar PIN"}
                    </button>
                    <button onClick={() => abrirModalPago(seleccionado)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-medium">
                      <Banknote className="w-3 h-3" /> Generar pago
                    </button>
                    <button disabled={pending} onClick={() => handleToggleActivo(seleccionado)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-border hover:bg-muted disabled:opacity-50 rounded-lg text-xs font-medium text-muted-foreground">
                      {seleccionado.isActive ? <><Ban className="w-3 h-3" /> Desactivar</> : <><Check className="w-3 h-3" /> Reactivar</>}
                    </button>
                  </div>
                </div>
                {seleccionado.asistenciaHoy?.checkIn && (
                  <p className="text-[12.5px] text-muted-foreground">
                    Hoy: entrada {formatHora(seleccionado.asistenciaHoy.checkIn)}
                    {seleccionado.asistenciaHoy.checkOut ? ` · salida ${formatHora(seleccionado.asistenciaHoy.checkOut)}` : " · sin salida registrada"}
                  </p>
                )}
              </div>

              <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-[11.5px] font-semibold text-muted-foreground tracking-widest mb-3">DATOS DEL EMPLEADO</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Teléfono", value: seleccionado.phone ? `${seleccionado.phoneCountryCode} ${seleccionado.phone}` : "Sin registrar" },
                      { label: "Esquema de pago", value: ESQUEMA_TEXTO[seleccionado.esquemaPago] },
                      { label: "Sueldo base", value: formatMXN(seleccionado.sueldoBase), color: "text-primary" },
                      ...(seleccionado.esquemaPago === "DESTAJO"
                        ? [{ label: "Destajo", value: `${formatMXN(seleccionado.montoDestajo)} por ${COMISION_BASE_TEXTO[seleccionado.comisionBase].toLowerCase()}` }]
                        : seleccionado.esquemaPago !== "FIJO"
                        ? [{ label: "Comisión", value: `${seleccionado.comisionRate}% sobre ${COMISION_BASE_TEXTO[seleccionado.comisionBase].toLowerCase()}` }]
                        : []),
                      ...(seleccionado.esquemaPago !== "FIJO"
                        ? [{ label: "Frecuencia de comisión", value: FRECUENCIA_TEXTO[seleccionado.frecuenciaComision] }]
                        : []),
                      ...(seleccionado.comisionEquipoBase
                        ? [{ label: "Comisión de equipo", value: `${seleccionado.comisionEquipoRate}% sobre ${COMISION_BASE_TEXTO[seleccionado.comisionEquipoBase].toLowerCase()} de la sucursal` }]
                        : []),
                      { label: "Frecuencia del sueldo", value: FRECUENCIA_TEXTO[seleccionado.frecuencia] },
                      { label: "Método de pago", value: METODO_PAGO_TEXTO[seleccionado.metodoPago] },
                      ...(seleccionado.metodoPago === "TRANSFERENCIA"
                        ? [{ label: "CLABE", value: seleccionado.clabe || "Sin registrar" }]
                        : []),
                      { label: "Ingreso", value: formatFecha(seleccionado.hiredAt) },
                    ].map((f) => (
                      <div key={f.label} className="bg-muted rounded-lg p-2.5">
                        <p className="text-[10.5px] text-muted-foreground mb-0.5">{f.label}</p>
                        <p className={`text-xs font-medium ${f.color || "text-foreground"}`}>{f.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[12.5px]">
                    <Shield className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <span className="text-foreground">
                      Rol: {seleccionado.roleName ?? "Sin rol asignado"}
                    </span>
                    <span className="text-muted-foreground">
                      · {seleccionado.tienePin ? "con PIN configurado" : "sin PIN todavía"}
                    </span>
                  </div>
                  {seleccionado.roleDescripcion && (
                    <p className="mt-1 text-[11.5px] text-muted-foreground">{seleccionado.roleDescripcion}</p>
                  )}
                </div>

                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-[11.5px] font-semibold text-muted-foreground tracking-widest mb-3">ASISTENCIA RECIENTE</p>
                  {seleccionado.horasSemana === 0 && !seleccionado.asistenciaHoy ? (
                    <p className="text-xs text-muted-foreground">Sin registros de asistencia todavía.</p>
                  ) : (
                    <p className="text-xs text-foreground">
                      <span className="font-semibold">{seleccionado.horasSemana}</span> horas trabajadas en los últimos 8 días.
                    </p>
                  )}
                </div>

                <div className="sm:col-span-2 bg-card border border-border rounded-xl p-4">
                  <p className="text-[11.5px] font-semibold text-muted-foreground tracking-widest mb-3">HISTORIAL DE PAGOS</p>
                  {seleccionado.pagos.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin pagos generados todavía.</p>
                  ) : (
                    <div className="space-y-2">
                      {seleccionado.pagos.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-2 bg-muted rounded-lg px-3 py-2 flex-wrap">
                          <div>
                            <p className="text-xs text-foreground">{formatFecha(p.periodoInicio)} — {formatFecha(p.periodoFin)}</p>
                            <p className="text-[11.5px] text-muted-foreground">Base {formatMXN(p.montoBase)} + comisión {formatMXN(p.montoComision)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">{formatMXN(p.total)}</span>
                            <span className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full ${ESTADO_PAGO_BADGE[p.estado]}`}>{ESTADO_PAGO_TEXTO[p.estado]}</span>
                            {p.estado === "PENDING" && (
                              <div className="flex gap-1">
                                <button disabled={pending} onClick={() => handleActualizarPago(p.id, "PAID")}
                                  className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded text-[11.5px] font-medium">
                                  Pagar
                                </button>
                                <button disabled={pending} onClick={() => handleActualizarPago(p.id, "CANCELLED")}
                                  className="px-2 py-1 border border-border hover:bg-card disabled:opacity-50 text-muted-foreground rounded text-[11.5px] font-medium">
                                  Cancelar
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal empleado */}
      {modalEmpleado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={cancelarModalEmpleado}>
          {/* flex flex-col + max-h (en vez de overflow-y-auto en este mismo
              div) para que el encabezado y, sobre todo, el pie con el botón
              "Guardar" NUNCA se salgan de la vista al hacer scroll — antes,
              en un formulario largo (muchos campos condicionales: destajo,
              comisión de equipo, CLABE...), el pie completo scrolleaba junto
              con el contenido. Esto es la causa real de "editar empleado y
              dar click en guardar no hace nada" (Carlos, 2026-09-21): si la
              validación fallaba (ej. rol no seleccionado, CLABE incompleta),
              el aviso de error aparecía arriba del todo — fuera de la vista
              si el usuario ya había hecho scroll hasta el botón — así que
              para él, visualmente, "no pasaba nada". Ahora el aviso vive en
              el pie (ver más abajo), siempre junto al botón que se acaba de
              presionar. */}
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <span className="text-sm font-medium text-foreground">{modalEmpleado.modo === "crear" ? "Nuevo empleado" : "Editar empleado"}</span>
              <button onClick={cancelarModalEmpleado} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">NOMBRE</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">PUESTO</label>
                  <input type="text" list="puestos-sugeridos-datalist" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
                  <datalist id="puestos-sugeridos-datalist">
                    {puestosSugeridos.map((p) => <option key={p} value={p} />)}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">PAÍS</label>
                  <select value={form.phoneCountryCode}
                    onChange={(e) => {
                      // Al cambiar de país se recorta el teléfono ya
                      // capturado a los dígitos del país nuevo — evita
                      // dejar un número con la longitud del país anterior.
                      const nuevoPais = paisPorCodigo(e.target.value);
                      setForm({ ...form, phoneCountryCode: e.target.value, phone: form.phone.slice(0, nuevoPais.digits) });
                    }}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary">
                    {PAISES_TELEFONO.map((p) => <option key={p.code} value={p.code}>{p.flag} {p.code}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">
                    TELÉFONO ({paisPorCodigo(form.phoneCountryCode).digits} DÍGITOS)
                  </label>
                  <input type="text" inputMode="numeric" value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, paisPorCodigo(form.phoneCountryCode).digits) })}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
                </div>
              </div>

              {branches.length > 1 && (
                <div>
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">SUCURSAL</label>
                  <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}
                    className={`w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary ${
                      !form.branchId ? "border-amber-400" : "border-border"
                    }`}>
                    <option value="" disabled>Selecciona una sucursal...</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  {!form.branchId && (
                    <p className="text-[11.5px] text-amber-600 mt-1">Obligatorio: define en qué sucursal (o Taller, si la diste de alta como una) trabaja.</p>
                  )}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">ROL — DETERMINA SU ACCESO AL SISTEMA</label>
                  <button type="button" onClick={() => setModalRoles(true)} className="text-[11.5px] text-primary hover:underline">Roles y permisos</button>
                </div>
                <select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary">
                  <option value="">Selecciona un rol...</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                {form.roleId && (
                  <p className="text-[11.5px] text-muted-foreground mt-1">{roles.find((r) => r.id === form.roleId)?.description}</p>
                )}
              </div>

              {modalEmpleado.modo === "crear" ? (
                <div>
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">PIN DE INICIO (6 DÍGITOS)</label>
                  <input type="text" inputMode="numeric" maxLength={6} value={form.pin}
                    onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                    placeholder="000000"
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary tracking-[0.3em]" />
                  <p className="text-[11.5px] text-muted-foreground mt-1">Con este PIN el empleado entra en {branches.length ? `/${tenantSlug}` : "la pantalla de entrada"} — nunca con tu contraseña de administrador.</p>
                </div>
              ) : (
                <p className="text-[11.5px] text-muted-foreground">Para cambiar el PIN de este empleado, usa el botón &quot;Restablecer PIN&quot; en su ficha.</p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">ESQUEMA DE PAGO</label>
                  <select value={form.paymentScheme} onChange={(e) => setForm({ ...form, paymentScheme: e.target.value as EsquemaPago })}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary">
                    {(["FIJO", "COMISION", "MIXTO", "DESTAJO"] as EsquemaPago[]).map((s) => <option key={s} value={s}>{ESQUEMA_TEXTO[s]}</option>)}
                  </select>
                  <div className={`mt-1.5 rounded-lg border px-2.5 py-2 text-[11.5px] leading-relaxed ${
                    form.paymentScheme === "DESTAJO" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-primary/5 border-primary/20 text-foreground"
                  }`}>
                    {form.paymentScheme === "FIJO" && "Se le paga lo mismo sin importar cuánto venda o repare."}
                    {form.paymentScheme === "COMISION" && (
                      <>Es un <strong>PORCENTAJE</strong> del precio de cada venta/reparación — ej. un corte de $250 al 50% = tu empleado recibe $125. Este es el caso típico de un barbero.</>
                    )}
                    {form.paymentScheme === "MIXTO" && "Un sueldo fijo más un porcentaje de comisión adicional (igual que Comisión, pero sumado a un sueldo base)."}
                    {form.paymentScheme === "DESTAJO" && (
                      <>
                        <strong>NO es un porcentaje</strong> — es un monto fijo en pesos por cada unidad, sin importar su precio de venta. Ej. si pagas $50 de destajo por corte, tu empleado recibe $50 tanto si el corte se vendió en $200 como en $300.
                        <br />
                        Si en cambio quieres que reciba un % del precio (como el ejemplo del corte a $250 al 50%), usa <strong>&quot;Comisión&quot;</strong>, no Destajo.
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">MÉTODO DE PAGO</label>
                  <select value={form.staffPaymentMethod} onChange={(e) => setForm({ ...form, staffPaymentMethod: e.target.value as MetodoPago })}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary">
                    {(["EFECTIVO", "TRANSFERENCIA", "CHEQUE", "TARJETA_NOMINA", "OTRO"] as MetodoPago[]).map((m) => <option key={m} value={m}>{METODO_PAGO_TEXTO[m]}</option>)}
                  </select>
                </div>
              </div>

              {form.staffPaymentMethod === "TRANSFERENCIA" && (
                <div>
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">CLABE (18 DÍGITOS)</label>
                  <input type="text" inputMode="numeric" maxLength={18} value={form.clabe}
                    onChange={(e) => setForm({ ...form, clabe: e.target.value.replace(/\D/g, "").slice(0, 18) })}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">SUELDO BASE</label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    <input type="number" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: e.target.value })} placeholder="0"
                      className="w-full pl-6 pr-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
                  </div>
                </div>
                <div>
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">FRECUENCIA DEL SUELDO</label>
                  <select value={form.paymentFrequency} onChange={(e) => setForm({ ...form, paymentFrequency: e.target.value as Frecuencia })}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary">
                    {(["SEMANAL", "CATORCENAL", "QUINCENAL", "MENSUAL"] as Frecuencia[]).map((f) => <option key={f} value={f}>{FRECUENCIA_TEXTO[f]}</option>)}
                  </select>
                </div>
              </div>

              {form.paymentScheme === "DESTAJO" && (
                <div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">MONTO FIJO EN PESOS POR UNIDAD</label>
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                        <input type="number" value={form.pieceRate} onChange={(e) => setForm({ ...form, pieceRate: e.target.value })} placeholder="0"
                          className="w-full pl-6 pr-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">POR CADA</label>
                      <select value={form.commissionBase} onChange={(e) => setForm({ ...form, commissionBase: e.target.value as BaseComision })}
                        className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary">
                        <option value="VENTAS">Venta</option>
                        <option value="REPARACIONES">Reparación entregada</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-[11.5px] text-muted-foreground mt-1">
                    Ejemplo: entrega 1 {form.commissionBase === "VENTAS" ? "venta" : "reparación"}, sin importar en cuánto se cobró — tu empleado recibe exactamente {formatMXN(parseFloat(form.pieceRate || "0") || 0)}.
                  </p>
                </div>
              )}

              {(form.paymentScheme === "COMISION" || form.paymentScheme === "MIXTO") && (
                <div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">% COMISIÓN</label>
                      <div className="relative mt-1">
                        <input type="number" value={form.commissionRate} onChange={(e) => setForm({ ...form, commissionRate: e.target.value })}
                          className="w-full pl-3 pr-7 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">COMISIÓN SOBRE</label>
                      <select value={form.commissionBase} onChange={(e) => setForm({ ...form, commissionBase: e.target.value as BaseComision })}
                        className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary">
                        {(["VENTAS", "REPARACIONES", "UTILIDAD"] as BaseComision[]).map((c) => <option key={c} value={c}>{COMISION_BASE_TEXTO[c]}</option>)}
                      </select>
                    </div>
                  </div>
                  <p className="text-[11.5px] text-muted-foreground mt-1">
                    Ejemplo: en {form.commissionBase === "UTILIDAD" ? "una utilidad" : form.commissionBase === "REPARACIONES" ? "una reparación" : "una venta"} de {formatMXN(250)}, tu empleado recibe {formatMXN(250 * ((parseFloat(form.commissionRate || "0") || 0) / 100))} ({parseFloat(form.commissionRate || "0") || 0}%).
                  </p>
                </div>
              )}

              {form.paymentScheme !== "FIJO" && (
                <div>
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">FRECUENCIA DE LA COMISIÓN</label>
                  <select value={form.commissionFrequency} onChange={(e) => setForm({ ...form, commissionFrequency: e.target.value as Frecuencia })}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary">
                    {(["SEMANAL", "CATORCENAL", "QUINCENAL", "MENSUAL"] as Frecuencia[]).map((f) => <option key={f} value={f}>{FRECUENCIA_TEXTO[f]}</option>)}
                  </select>
                  <p className="text-[11.5px] text-muted-foreground mt-1">Puede ser distinta a la del sueldo — ej. sueldo semanal + comisión mensual.</p>
                </div>
              )}

              <div className="border-t border-border pt-3">
                <label className="flex items-center gap-2 text-[11.5px] font-semibold text-muted-foreground tracking-widest">
                  <input type="checkbox" checked={form.teamCommissionBase !== ""}
                    onChange={(e) => setForm({ ...form, teamCommissionBase: e.target.checked ? "VENTAS" : "", teamCommissionRate: e.target.checked ? form.teamCommissionRate : "0" })} />
                  ¿LIDERA UN EQUIPO? (COMISIÓN EXTRA)
                </label>
                <p className="text-[11.5px] text-muted-foreground mt-1">Ej. Jefe de Barberos: cobra su comisión individual de arriba más esta comisión extra, calculada sobre la producción de toda su sucursal.</p>
                {form.teamCommissionBase !== "" && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">% COMISIÓN DE EQUIPO</label>
                      <div className="relative mt-1">
                        <input type="number" value={form.teamCommissionRate} onChange={(e) => setForm({ ...form, teamCommissionRate: e.target.value })}
                          className="w-full pl-3 pr-7 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">SOBRE (SUCURSAL)</label>
                      <select value={form.teamCommissionBase} onChange={(e) => setForm({ ...form, teamCommissionBase: e.target.value as BaseComision })}
                        className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary">
                        {(["VENTAS", "REPARACIONES", "UTILIDAD"] as BaseComision[]).map((c) => <option key={c} value={c}>{COMISION_BASE_TEXTO[c]}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* Aviso de error en el PIE (fuera del área con scroll) — a
                propósito, para que sea imposible perderlo de vista sin
                importar qué tan abajo esté el usuario en el formulario (ver
                el comentario largo arriba). */}
            <div className="flex-shrink-0 border-t border-border">
              {formError && (
                <div className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{formError}</div>
              )}
              <div className="flex justify-end gap-2 px-4 py-3">
                <button onClick={cancelarModalEmpleado} className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
                <button disabled={guardando} onClick={handleGuardarEmpleado}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-xs font-medium">
                  {guardando ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal restablecer PIN */}
      {empleadoParaPin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={cancelarModalPin}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-medium text-foreground">
                {empleadoParaPin.tienePin ? "Restablecer PIN" : "Asignar PIN"} — {empleadoParaPin.name}
              </span>
              <button onClick={cancelarModalPin} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3">
              {pinError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{pinError}</div>}
              <div>
                <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">NUEVO PIN (6 DÍGITOS)</label>
                <input type="text" inputMode="numeric" maxLength={6} value={nuevoPin} autoFocus
                  onChange={(e) => setNuevoPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary tracking-[0.3em]" />
                <p className="text-[11.5px] text-muted-foreground mt-1">El PIN anterior deja de funcionar de inmediato.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button onClick={cancelarModalPin} className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
              <button disabled={restableciendoPin} onClick={handleRestablecerPin}
                className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-xs font-medium">
                {restableciendoPin ? "Guardando..." : "Guardar PIN"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal generar pago */}
      {seleccionadoParaPago && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={cancelarModalPago}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-medium text-foreground">Generar pago — {seleccionadoParaPago.name}</span>
              <button onClick={cancelarModalPago} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3">
              {pagoError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{pagoError}</div>}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">DESDE</label>
                  <input type="date" value={pagoInicio} onChange={(e) => handleCambiarPeriodoPago("inicio", e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">HASTA</label>
                  <input type="date" value={pagoFin} onChange={(e) => handleCambiarPeriodoPago("fin", e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
                </div>
              </div>

              <div>
                <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">MONTO BASE</label>
                <input type="number" value={pagoBase} onChange={(e) => setPagoBase(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
              </div>

              {seleccionadoParaPago.esquemaPago !== "FIJO" && (
                <div>
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">
                    MONTO DE COMISIÓN {cargandoSugerencia && "(calculando sugerencia...)"}
                  </label>
                  <input type="number" value={pagoComision} onChange={(e) => setPagoComision(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
                  {pagoAdvertencia && <p className="text-[11.5px] text-amber-600 mt-1">{pagoAdvertencia}</p>}
                </div>
              )}

              <div>
                <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">NOTAS (OPCIONAL)</label>
                <input type="text" value={pagoNotas} onChange={(e) => setPagoNotas(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
              </div>

              <div className="bg-muted rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total a pagar</span>
                <span className="text-sm font-semibold text-primary">
                  {formatMXN((parseFloat(pagoBase || "0") || 0) + (parseFloat(pagoComision || "0") || 0))}
                </span>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button onClick={cancelarModalPago} className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
              <button disabled={generandoPago} onClick={handleGenerarPago}
                className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-xs font-medium">
                {generandoPago ? "Generando..." : "Generar pago"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalRoles && (
        <RolesManager
          tenantSlug={tenantSlug}
          rolesIniciales={roles}
          sugerenciasRoles={puestosSugeridos}
          modulosInactivos={modulosInactivos}
          onCerrar={() => setModalRoles(false)}
          onCambio={() => router.refresh()}
        />
      )}
    </div>
  );
}
