"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowRight, Building2, Package, DollarSign, Wrench, X, Pencil, Link2, Check } from "lucide-react";
import type { SucursalesData, SucursalUI } from "@/lib/sucursales-data";
import { confirmarSalirSinGuardar, useAdvertirCierrePestaña } from "@/lib/confirmar-cierre";
import {
  crearSucursalAction,
  editarSucursalAction,
  transferirInventarioAction,
  type DatosSucursal,
} from "@/app/actions/sucursales-actions";

interface SucursalesClientProps {
  data: SucursalesData;
  tenantSlug: string;
}

const AVATAR_PALETTE = [
  { bg: "bg-purple-50", color: "text-purple-700" },
  { bg: "bg-emerald-50", color: "text-emerald-700" },
  { bg: "bg-blue-50", color: "text-blue-700" },
  { bg: "bg-amber-50", color: "text-amber-700" },
  { bg: "bg-orange-50", color: "text-orange-700" },
  { bg: "bg-cyan-50", color: "text-cyan-700" },
];

function colorPara(texto: string) {
  let hash = 0;
  for (let i = 0; i < texto.length; i++) hash = texto.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const BARRA_COLORES = ["bg-primary", "bg-cyan-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500"];

// Días de la semana para el selector de "días que opera" — Fase 2 de
// notificaciones (2026-09-22, ver Branch.diasOperacion en schema.prisma).
// Se muestran en orden lunes→domingo (más natural para leer), pero cada
// uno guarda su índice real 0=domingo…6=sábado (mismo criterio que
// Tenant.weekStartDay) — el orden de despliegue no tiene que coincidir con
// el valor almacenado.
const DIAS_SEMANA_SELECTOR = [
  { valor: 1, etiqueta: "L" },
  { valor: 2, etiqueta: "M" },
  { valor: 3, etiqueta: "M" },
  { valor: 4, etiqueta: "J" },
  { valor: 5, etiqueta: "V" },
  { valor: 6, etiqueta: "S" },
  { valor: 0, etiqueta: "D" },
];
const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6];

export default function SucursalesClient({ data, tenantSlug }: SucursalesClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [modalAbierto, setModalAbierto] = useState(false);
  // 2026-09-22, a petición de Carlos ("pide confirmación para cerrarlas
  // cuando abandone la acción a mitad del proceso"): el click fuera de
  // este modal ya preguntaba antes de cerrar (2026-09-21), pero la X y
  // "Cancelar" seguían cerrando sin preguntar nada.
  const cancelarModal = () => {
    if (confirmarSalirSinGuardar()) setModalAbierto(false);
  };
  useAdvertirCierrePestaña(modalAbierto);
  const [editando, setEditando] = useState<SucursalUI | null>(null);
  const [form, setForm] = useState<DatosSucursal & { isActive: boolean }>({
    name: "",
    code: "",
    address: "",
    phone: "",
    horaAperturaEsperada: "",
    horaCierreEsperada: "",
    diasOperacion: TODOS_LOS_DIAS,
    isActive: true,
  });
  const [errorModal, setErrorModal] = useState<string | null>(null);

  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [errorTransfer, setErrorTransfer] = useState<string | null>(null);
  const [okTransfer, setOkTransfer] = useState(false);
  const [linkCopiadoId, setLinkCopiadoId] = useState<string | null>(null);

  const { sucursales, productos } = data;
  const totalVentas = sucursales.reduce((s, suc) => s + suc.ventasHoy, 0) || 1;

  function abrirNueva() {
    setEditando(null);
    setForm({
      name: "", code: "", address: "", phone: "",
      horaAperturaEsperada: "", horaCierreEsperada: "", diasOperacion: TODOS_LOS_DIAS,
      isActive: true,
    });
    setErrorModal(null);
    setModalAbierto(true);
  }

  function abrirEditar(suc: SucursalUI) {
    setEditando(suc);
    setForm({
      name: suc.name, code: suc.code ?? "", address: suc.address ?? "", phone: suc.phone ?? "",
      horaAperturaEsperada: suc.horaAperturaEsperada ?? "",
      horaCierreEsperada: suc.horaCierreEsperada ?? "",
      diasOperacion: suc.diasOperacion.length > 0 ? suc.diasOperacion : TODOS_LOS_DIAS,
      isActive: suc.isActive,
    });
    setErrorModal(null);
    setModalAbierto(true);
  }

  function alternarDia(dia: number) {
    setForm((f) => {
      const actuales = f.diasOperacion ?? TODOS_LOS_DIAS;
      const siguiente = actuales.includes(dia) ? actuales.filter((d) => d !== dia) : [...actuales, dia];
      return { ...f, diasOperacion: siguiente };
    });
  }

  function guardarSucursal() {
    setErrorModal(null);
    startTransition(async () => {
      const res = editando
        ? await editarSucursalAction({ tenantSlug, branchId: editando.id, ...form })
        : await crearSucursalAction({
            tenantSlug,
            name: form.name,
            code: form.code,
            address: form.address,
            phone: form.phone,
            horaAperturaEsperada: form.horaAperturaEsperada,
            horaCierreEsperada: form.horaCierreEsperada,
            diasOperacion: form.diasOperacion,
          });

      if (!res.ok) {
        setErrorModal(res.error);
        return;
      }
      setModalAbierto(false);
      router.refresh();
    });
  }

  function transferir() {
    setErrorTransfer(null);
    setOkTransfer(false);
    startTransition(async () => {
      const res = await transferirInventarioAction({
        tenantSlug,
        productId: productoId,
        origenBranchId: origenId,
        destinoBranchId: destinoId,
        cantidad: Number(cantidad),
      });
      if (!res.ok) {
        setErrorTransfer(res.error);
        return;
      }
      setOkTransfer(true);
      setTimeout(() => setOkTransfer(false), 2500);
      router.refresh();
    });
  }

  const puedeTransferir = origenId && destinoId && origenId !== destinoId && productoId && Number(cantidad) > 0;

  // 2026-09-21, a petición de Carlos: el link de entrada es por SUCURSAL —
  // copiarlo desde aquí es lo que le permite a un dueño remoto (ej. con 15
  // sucursales) compartírselo a cada una sin tener que ir en persona a
  // dejarlo configurado en su tablet/mostrador. 2026-09-23: apunta a la
  // puerta única del negocio (app/(auth)/[tenant]/page.tsx) con
  // ?sucursal=<id> para que la ficha de Empleado arranque ya posicionada
  // en esta sucursal — reemplaza la vieja /entrada/[tenant]/[branch], que
  // ahora solo redirige aquí por compatibilidad con links viejos ya
  // repartidos.
  function copiarLinkEntrada(branchId: string) {
    const link = `${window.location.origin}/${tenantSlug}?sucursal=${branchId}`;
    navigator.clipboard.writeText(link).then(() => {
      setLinkCopiadoId(branchId);
      setTimeout(() => setLinkCopiadoId((id) => (id === branchId ? null : id)), 2000);
    });
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-semibold text-foreground">Sucursales</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {sucursales.length} {sucursales.length === 1 ? "sucursal registrada" : "sucursales registradas"}
          </p>
        </div>
        <button
          onClick={abrirNueva}
          className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-[12.5px] font-medium px-3 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Nueva sucursal
        </button>
      </div>

      {/* Tarjetas sucursales */}
      {sucursales.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 flex flex-col items-center justify-center text-center gap-2">
          <Building2 className="w-8 h-8 text-muted-foreground" />
          <p className="text-[13.5px] font-medium text-foreground">Todavía no tienes sucursales registradas</p>
          <p className="text-[12.5px] text-muted-foreground max-w-sm">
            Agrega tu primera sucursal para empezar a llevar el control de ventas, caja e inventario por ubicación.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sucursales.map((suc) => (
            <div
              key={suc.id}
              className={`bg-card rounded-xl border overflow-hidden transition-all hover:shadow-sm ${
                suc.esPrincipal ? "border-primary" : "border-border"
              }`}
            >
              {/* Header tarjeta */}
              <div className="flex items-start justify-between p-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg bg-primary/10">
                    🏪
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[13.5px] font-semibold text-foreground">{suc.name}</p>
                      {suc.code && (
                        <span className="text-[10.5px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-mono font-medium">
                          {suc.code}
                        </span>
                      )}
                      {suc.esPrincipal && (
                        <span className="text-[10.5px] bg-primary/10 text-primary-text px-1.5 py-0.5 rounded-full font-medium">
                          Principal
                        </span>
                      )}
                    </div>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5">{suc.address || "Sin dirección registrada"}</p>
                  </div>
                </div>
                <span
                  className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full ${
                    suc.isActive ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {suc.isActive ? "Activa" : "Inactiva"}
                </span>
              </div>

              {/* Métricas */}
              <div className="grid grid-cols-2 gap-2 p-3">
                {[
                  { icon: DollarSign, label: "Ventas hoy", value: formatMXN(suc.ventasHoy), color: "text-primary-text" },
                  { icon: Wrench, label: "Reparaciones activas", value: String(suc.reparacionesActivas), color: "text-cyan-600" },
                  {
                    icon: Package,
                    label: "Caja actual",
                    value: suc.cajaAbierta ? formatMXN(suc.cajaActual ?? 0) : "Cerrada",
                    color: suc.cajaAbierta ? "text-emerald-600" : "text-muted-foreground",
                  },
                  { icon: Package, label: "Stock total", value: String(suc.stockTotal), color: "text-amber-600" },
                ].map((m) => (
                  <div key={m.label} className="bg-muted rounded-lg p-2">
                    <p className="text-[10.5px] text-muted-foreground mb-1">{m.label}</p>
                    <p className={`text-[14.5px] font-semibold ${m.color}`}>{m.value}</p>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
                <div className="flex items-center gap-1">
                  {suc.personalIniciales.length === 0 ? (
                    <span className="text-[11.5px] text-muted-foreground">Sin personal activo</span>
                  ) : (
                    <>
                      {suc.personalIniciales.map((ini, i) => {
                        const c = colorPara(ini + suc.id);
                        return (
                          <div
                            key={i}
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-[9.5px] font-semibold border-2 border-card ${c.bg} ${c.color}`}
                            style={{ marginLeft: i > 0 ? "-4px" : "0" }}
                          >
                            {ini}
                          </div>
                        );
                      })}
                      <span className="text-[11.5px] text-muted-foreground ml-2">
                        {suc.personalActivo} {suc.personalActivo === 1 ? "empleado" : "empleados"}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => copiarLinkEntrada(suc.id)}
                    className={`flex items-center gap-1 text-[11.5px] font-medium hover:underline ${
                      linkCopiadoId === suc.id ? "text-emerald-600" : "text-muted-foreground"
                    }`}
                    title="Copiar el link de entrada por PIN de esta sucursal"
                  >
                    {linkCopiadoId === suc.id ? (
                      <>
                        <Check className="w-3 h-3" /> Copiado
                      </>
                    ) : (
                      <>
                        <Link2 className="w-3 h-3" /> Link de entrada
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => abrirEditar(suc)}
                    className="flex items-center gap-1 text-[11.5px] text-primary-text font-medium hover:underline"
                  >
                    <Pencil className="w-3 h-3" /> Editar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Transferencia */}
      {sucursales.length >= 2 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <ArrowRight className="w-4 h-4 text-primary-text" />
            <h2 className="text-[13.5px] font-semibold text-foreground">Transferir inventario entre sucursales</h2>
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
              <label className="text-[11.5px] font-medium text-muted-foreground">ORIGEN</label>
              <select
                value={origenId}
                onChange={(e) => setOrigenId(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg text-[12.5px] bg-muted focus:outline-none focus:border-primary"
              >
                <option value="">Selecciona…</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground mb-2.5 flex-shrink-0" />
            <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
              <label className="text-[11.5px] font-medium text-muted-foreground">DESTINO</label>
              <select
                value={destinoId}
                onChange={(e) => setDestinoId(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg text-[12.5px] bg-muted focus:outline-none focus:border-primary"
              >
                <option value="">Selecciona…</option>
                {sucursales.filter((s) => s.id !== origenId).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
              <label className="text-[11.5px] font-medium text-muted-foreground">PRODUCTO</label>
              <select
                value={productoId}
                onChange={(e) => setProductoId(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg text-[12.5px] bg-muted focus:outline-none focus:border-primary"
              >
                <option value="">Selecciona…</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11.5px] font-medium text-muted-foreground">CANT.</label>
              <input
                type="number"
                min={1}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="w-16 px-3 py-2 border border-border rounded-lg text-[12.5px] text-center bg-muted focus:outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={transferir}
              disabled={!puedeTransferir || isPending}
              className={`px-4 py-2 rounded-lg text-[12.5px] font-medium transition-colors mb-0.5 disabled:opacity-50 ${
                okTransfer ? "bg-emerald-500 text-white" : "bg-primary hover:bg-primary/90 text-primary-foreground"
              }`}
            >
              {okTransfer ? "✓ Transferido" : isPending ? "Transfiriendo…" : "Transferir"}
            </button>
          </div>
          {errorTransfer && <p className="text-[12.5px] text-red-600 mt-2">{errorTransfer}</p>}
          {productos.length === 0 && (
            <p className="text-[12.5px] text-muted-foreground mt-2">
              No hay productos transferibles en el catálogo (excluyendo servicios).
            </p>
          )}
        </div>
      )}

      {/* Comparativo */}
      {sucursales.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-[13.5px] font-semibold text-foreground">Comparativo de rendimiento — Hoy</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted border-b border-border">
                  {["Sucursal", "Ventas hoy", "Rendimiento", "Reparaciones activas", "Personal activo"].map((h) => (
                    <th key={h} className="text-left text-[11.5px] font-medium text-muted-foreground px-4 py-2.5 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sucursales.map((suc, i) => {
                  const pct = Math.round((suc.ventasHoy / totalVentas) * 100);
                  return (
                    <tr key={suc.id} className="border-b border-border/60 last:border-0 hover:bg-muted/60 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-[12.5px] font-medium text-foreground">{suc.name}</span>
                          {suc.esPrincipal && (
                            <span className="text-[10.5px] bg-primary/10 text-primary-text px-1.5 py-0.5 rounded-full">Principal</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[12.5px] font-medium text-foreground whitespace-nowrap">{formatMXN(suc.ventasHoy)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${BARRA_COLORES[i % BARRA_COLORES.length]}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11.5px] text-muted-foreground">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[12.5px] text-foreground/80">{suc.reparacionesActivas}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {suc.personalIniciales.map((ini, pi) => {
                            const c = colorPara(ini + suc.id);
                            return (
                              <div key={pi} className={`w-5 h-5 rounded-full flex items-center justify-center text-[9.5px] font-semibold ${c.bg} ${c.color}`}>
                                {ini}
                              </div>
                            );
                          })}
                          <span className="text-[11.5px] text-muted-foreground ml-1">{suc.personalActivo}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal crear/editar */}
      {modalAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={cancelarModal}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-[14.5px] font-semibold text-foreground">
                {editando ? "Editar sucursal" : "Nueva sucursal"}
              </h3>
              <button onClick={cancelarModal} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div>
                <label className="text-[12.5px] font-medium text-muted-foreground">Nombre *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                  placeholder="Ej. Sucursal Centro"
                />
              </div>
              <div>
                <label className="text-[12.5px] font-medium text-muted-foreground">
                  Código de sucursal (opcional)
                </label>
                <input
                  value={form.code ?? ""}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  maxLength={8}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm font-mono bg-muted focus:outline-none focus:border-primary"
                  placeholder="Ej. CEN"
                />
                <p className="text-[11.5px] text-muted-foreground mt-1">
                  Aparece en el folio de las reparaciones de esta sucursal (ej. REP-CEN-0001), para identificar de
                  dónde viene cada equipo si manejas un taller centralizado.
                </p>
              </div>
              <div>
                <label className="text-[12.5px] font-medium text-muted-foreground">Dirección</label>
                <input
                  value={form.address ?? ""}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-[12.5px] font-medium text-muted-foreground">Teléfono</label>
                <input
                  value={form.phone ?? ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                />
              </div>

              <div className="pt-1 border-t border-border">
                <label className="text-[12.5px] font-medium text-muted-foreground">
                  Horario esperado de caja (opcional)
                </label>
                <p className="text-[11.5px] text-muted-foreground mt-0.5 mb-2">
                  Si lo defines, recibirás un aviso si esta sucursal no reporta apertura o cierre de caja a esta hora
                  (con 15 minutos de margen).
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11.5px] text-muted-foreground">Abre</label>
                    <input
                      type="time"
                      value={form.horaAperturaEsperada ?? ""}
                      onChange={(e) => setForm({ ...form, horaAperturaEsperada: e.target.value })}
                      className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[11.5px] text-muted-foreground">Cierra</label>
                    <input
                      type="time"
                      value={form.horaCierreEsperada ?? ""}
                      onChange={(e) => setForm({ ...form, horaCierreEsperada: e.target.value })}
                      className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
                {(form.horaAperturaEsperada || form.horaCierreEsperada) && (
                  <div className="mt-2">
                    <label className="text-[11.5px] text-muted-foreground">Días que opera</label>
                    <div className="flex gap-1 mt-1">
                      {DIAS_SEMANA_SELECTOR.map((d) => {
                        const activo = (form.diasOperacion ?? TODOS_LOS_DIAS).includes(d.valor);
                        return (
                          <button
                            key={d.valor}
                            type="button"
                            onClick={() => alternarDia(d.valor)}
                            className={`w-8 h-8 rounded-lg text-[12.5px] font-medium transition-colors ${
                              activo ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {d.etiqueta}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              {editando && (
                <label className="flex items-center gap-2 text-[12.5px] text-foreground/80">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  />
                  Sucursal activa
                </label>
              )}
              {errorModal && <p className="text-[12.5px] text-red-600">{errorModal}</p>}
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button
                onClick={cancelarModal}
                className="px-3 py-2 text-[13.5px] font-medium text-foreground/70 hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={guardarSucursal}
                disabled={isPending || !form.name.trim()}
                className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-[13.5px] font-medium transition-colors"
              >
                {isPending ? "Guardando…" : editando ? "Guardar cambios" : "Crear sucursal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
