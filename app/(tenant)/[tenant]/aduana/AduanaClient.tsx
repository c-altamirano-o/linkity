"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Wrench, Package, Stethoscope, Check, CheckCircle, AlertCircle,
  ChevronLeft, X, Plus, ClipboardList, ArrowRight, Store,
} from "lucide-react";
import type {
  ReparacionesData, ReparacionUI, EstadoReparacion, PrioridadReparacion, ProductoParaReparacion,
} from "@/lib/reparaciones-data";
import { label, type LabelDictionary } from "@/lib/labels";
import {
  asignarTecnicoAction, agregarPiezaReparacionAction, eliminarPiezaReparacionAction,
  actualizarCostoEstimadoAction, avanzarEstadoAction, type NuevoEstadoReparacion,
} from "@/app/actions/reparaciones-actions";
import { abrirReciboImprimible, type DatosNegocioRecibo, type ReciboData } from "@/lib/recibo-imprimible";

/**
 * "Aduana" / Recepción del taller (2026-09-22, corrección explícita de
 * Carlos con el ejemplo hipotético "Fix Expres"): la ÚNICA pantalla donde se
 * puede asignar técnico, cambiar el estatus del equipo y ajustar el
 * costo/piezas cotizadas — "eso no lo hacen desde tienda" y "la edición del
 * costo solo se puede hacer en recepción". A propósito centralizada y SIN
 * filtro de sucursal (ver aduana/page.tsx y el comentario de "aduana" en
 * lib/roles.ts): el taller físico es UNO solo y recibe equipos de varias
 * sucursales/tiendas, así que quien trabaja aquí debe ver y operar folios de
 * cualquier sucursal del negocio.
 *
 * Reusa en gran parte la lógica que antes vivía en VistaAdmin de
 * ReparacionesClient.tsx (piezas, costo, avanzar estatus) — movida aquí tal
 * cual porque es exactamente el mismo trabajo, solo que ahora exclusivo de
 * este rol/ruta en vez de disponible también desde tienda o desde el propio
 * técnico.
 */

interface AduanaClientProps {
  data: ReparacionesData;
  labels: LabelDictionary;
  tenantSlug: string;
  // 2026-09-25, a petición de Carlos: true si quien ve esta pantalla TAMBIÉN
  // tiene acceso al módulo "pos" — ver el comentario largo en
  // puedeAccederModulo (lib/actor.ts). Solo decide si se muestra el atajo
  // "Cobrar y entregar" hacia POS; nunca reemplaza la validación real, que
  // sigue pasando por crearVentaAction del lado del servidor.
  puedeCobrar: boolean;
  // Datos reales del negocio para el ticket de "Entregar sin cobro"
  // (2026-09-26, ver el comentario largo en lib/recibo-imprimible.ts).
  negocioRecibo: DatosNegocioRecibo;
  // Tenant.cobrarEnDevolucion (2026-09-26) — decide si "Entregar (sin
  // cobro)" se ofrece aquí para SHOP_RETURN: con la casilla activa esa
  // transición directa la rechaza el servidor de cualquier forma (ver el
  // comentario largo en SIGUIENTES_ESTADOS abajo), así que no tiene caso
  // mostrar un botón que solo va a truene con un error.
  cobrarEnDevolucion: boolean;
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

const PRIORIDAD_CLASES: Record<PrioridadReparacion, string> = {
  LOW: "bg-muted text-muted-foreground",
  NORMAL: "bg-amber-50 text-amber-600",
  HIGH: "bg-red-50 text-red-600",
  URGENT: "bg-red-100 text-red-700",
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

// Botones de avance de estatus ofrecidos aquí — mismo mapa de transiciones
// válidas que TRANSICIONES_VALIDAS en reparaciones-actions.ts (el servidor
// vuelve a validar todo, esto solo decide qué botones mostrar). SHOP_READY
// no ofrece un botón hacia DELIVERED a propósito: ese salto exige un cobro y
// vive exclusivamente en /reparaciones (cobrarYEntregarAction, tienda) — lo
// que SHOP_READY sí ofrece aquí es "Regresar a taller (corregir)", ver más
// abajo. El botón de SHOP_RETURN -> DELIVERED sí se ofrece aquí (una
// devolución no siempre tiene cargo), pero el servidor lo rechaza si el
// negocio activó "cobrar en devolución" en Configuración — en ese caso el
// mensaje de error le indica al usuario que use "Cobrar y entregar" desde
// tienda. 2026-09-26: con la casilla activa, este componente ya ni
// siquiera OFRECE el botón (ver el filtro de "siguientes" más abajo) en
// vez de mostrarlo y dejar que el servidor lo rechace.
const SIGUIENTES_ESTADOS: Partial<Record<EstadoReparacion, { estado: NuevoEstadoReparacion; texto: string }[]>> = {
  RECEIVED: [{ estado: "IN_REPAIR", texto: "Iniciar reparación" }],
  IN_REPAIR: [
    { estado: "WAITING_PARTS", texto: "Esperando refacción" },
    { estado: "WORKSHOP_READY", texto: "Marcar listo" },
    { estado: "WORKSHOP_RETURN", texto: "Marcar devolución" },
  ],
  WAITING_PARTS: [{ estado: "IN_REPAIR", texto: "Reanudar reparación" }],
  WORKSHOP_READY: [{ estado: "SHOP_READY", texto: "Enviar a tienda (listo)" }],
  WORKSHOP_RETURN: [{ estado: "SHOP_RETURN", texto: "Enviar a tienda (devolución)" }],
  // SHOP_READY/SHOP_RETURN también ofrecen un botón de "regresar" al taller
  // (2026-09-25, a petición de Carlos: corregir un "Enviar a tienda" hecho
  // por error de dedo — antes no había forma de deshacerlo desde la UI).
  // Aterriza en IN_REPAIR, no en WORKSHOP_READY/WORKSHOP_RETURN (corregido
  // 2026-09-26: Carlos reportó que, aterrizando ahí, la única opción
  // siguiente era reenviar el mismo estatus de tienda que ya estaba
  // corrigiendo — "debería poderse elegir cualquiera que involucre a
  // taller, por ejemplo En reparación, Equipo Listo, En espera de
  // refacción". IN_REPAIR ya ofrece esas tres salidas completas, ver el
  // renglón de arriba — ver el comentario largo en TRANSICIONES_VALIDAS,
  // reparaciones-actions.ts).
  SHOP_READY: [{ estado: "IN_REPAIR", texto: "Regresar a taller (corregir)" }],
  SHOP_RETURN: [
    { estado: "DELIVERED", texto: "Entregar (sin cobro)" },
    { estado: "IN_REPAIR", texto: "Regresar a taller (corregir)" },
  ],
};

function agruparProductosParaSelector(productos: ProductoParaReparacion[]) {
  const piezas = productos.filter((p) => p.type !== "SERVICE");
  const servicios = productos.filter((p) => p.type === "SERVICE");
  return { piezas, servicios };
}

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const formatFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

const formatFechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true });

export default function AduanaClient({ data, labels, tenantSlug, puedeCobrar, negocioRecibo, cobrarEnDevolucion }: AduanaClientProps) {
  const { reparaciones, productos, tecnicos } = data;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [soloActivas, setSoloActivas] = useState(true);
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(reparaciones[0]?.id ?? null);

  const [costoEdit, setCostoEdit] = useState("");
  const [piezaNuevaId, setPiezaNuevaId] = useState("");
  const [piezaNuevaCantidad, setPiezaNuevaCantidad] = useState("1");

  const activas = reparaciones.filter((r) => r.estado !== "DELIVERED" && r.estado !== "CANCELLED");
  const base = soloActivas ? activas : reparaciones;
  const listaVisible = base.filter((r) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return (
      r.folio.toLowerCase().includes(q) ||
      r.cliente.toLowerCase().includes(q) ||
      r.sucursalNombre.toLowerCase().includes(q)
    );
  });

  const seleccionada = reparaciones.find((r) => r.id === seleccionadaId) ?? null;

  function ejecutar(promesa: () => Promise<{ ok: boolean; error?: string }>, alTerminar?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await promesa();
      if (!res.ok) {
        setError(res.error ?? "No se pudo completar la acción");
        return;
      }
      alTerminar?.();
      router.refresh();
    });
  }

  const handleAsignarTecnico = (staffId: string) => {
    if (!seleccionada) return;
    ejecutar(() => asignarTecnicoAction({ tenantSlug, repairId: seleccionada.id, staffId: staffId || null }));
  };

  const handleGuardarCosto = () => {
    if (!seleccionada) return;
    const valor = parseFloat(costoEdit);
    if (!Number.isFinite(valor) || valor < 0) { setError("Ingresa un costo válido"); return; }
    ejecutar(
      () => actualizarCostoEstimadoAction({ tenantSlug, repairId: seleccionada.id, costoEstimado: valor }),
      () => setCostoEdit("")
    );
  };

  const handleAgregarPieza = () => {
    if (!seleccionada || !piezaNuevaId) return;
    const cantidad = Math.max(1, parseInt(piezaNuevaCantidad, 10) || 1);
    ejecutar(
      () => agregarPiezaReparacionAction({ tenantSlug, repairId: seleccionada.id, productId: piezaNuevaId, quantity: cantidad }),
      () => { setPiezaNuevaId(""); setPiezaNuevaCantidad("1"); }
    );
  };

  const handleQuitarPieza = (itemId: string) => {
    if (!seleccionada) return;
    ejecutar(() => eliminarPiezaReparacionAction({ tenantSlug, repairId: seleccionada.id, itemId }));
  };

  const handleAvanzar = (nuevoEstado: NuevoEstadoReparacion) => {
    if (!seleccionada) return;
    ejecutar(() => avanzarEstadoAction({ tenantSlug, repairId: seleccionada.id, nuevoEstado }));
  };

  // "Entregar (sin cobro)" de una devolución (2026-09-26, mismo cambio que
  // handleEntregarSinCobro en ReparacionesClient.tsx, a petición explícita
  // de Carlos: "si es devolución se imprime un ticket en $0.00, pero
  // siempre indicando si fue Listo o Devolución" — antes esta entrega
  // directa no dejaba ningún comprobante, solo cambiaba el estatus).
  const handleEntregarSinCobro = () => {
    if (!seleccionada) return;
    const repair = seleccionada;
    ejecutar(
      () => avanzarEstadoAction({ tenantSlug, repairId: repair.id, nuevoEstado: "DELIVERED" }),
      async () => {
        const recibo: ReciboData = {
          tipoDocumento: "Reparación — Devolución",
          folio: repair.folio,
          cliente: repair.cliente,
          telefono: repair.telefono,
          renglones: [{ nombre: `${repair.marca} ${repair.modelo}`.trim(), cantidad: 1, precioUnitario: 0 }],
          subtotal: 0,
          iva: 0,
          total: 0,
          metodoPago: "Sin cargo",
          notaPie: "No fue posible reparar el equipo — se entrega sin costo.",
          qrUrl: `${window.location.origin}/rep/${repair.publicToken}`,
          qrEtiqueta: "Sigue tu reparación",
        };
        await abrirReciboImprimible(recibo, negocioRecibo);
      }
    );
  };

  // 2026-09-25, a petición de Carlos: atajo para el dueño/único operador —
  // manda directo a POS con esta reparación precargada (mismo camino que ya
  // usa "Cobrar y entregar" en /reparaciones, ver getRepairParaCobro y
  // crearVentaAction). Nunca cobra aquí mismo: solo navega.
  const handleCobrar = () => {
    if (!seleccionada) return;
    router.push(`/${tenantSlug}/pos?repairId=${seleccionada.id}`);
  };

  const entidadPlural = label(labels, "entity.repair.plural");
  const activo = label(labels, "entity.repair.asset");
  const cerrada = seleccionada?.estado === "DELIVERED" || seleccionada?.estado === "CANCELLED";
  // Con "cobrar en devolución" activo, SHOP_RETURN -> DELIVERED directo NO
  // se ofrece aquí (ver el comentario largo en SIGUIENTES_ESTADOS arriba):
  // el servidor lo rechaza de cualquier forma, y ese caso pasa por "Cobrar
  // y entregar" (el atajo de abajo, o /reparaciones).
  const siguientes = (seleccionada ? (SIGUIENTES_ESTADOS[seleccionada.estado] ?? []) : []).filter(
    (s) => !(s.estado === "DELIVERED" && cobrarEnDevolucion)
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <h1 className="text-[15px] font-semibold text-foreground flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary-text" /> Recepción / Aduana
          </h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Asigna técnico, cambia el estatus y ajusta costo/piezas — todas las {entidadPlural.toLowerCase()} del taller, de cualquier sucursal.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          {(["activas", "todas"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setSoloActivas(f === "activas")}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors ${
                (f === "activas") === soloActivas ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
              }`}
            >
              {f === "activas" ? "Activas" : "Todas"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-2 flex items-center gap-2 bg-red-50 text-red-700 text-[12.5px] px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Lista */}
        <div className={`w-full md:w-[340px] flex-shrink-0 border-r border-border overflow-y-auto ${seleccionada ? "hidden md:block" : ""}`}>
          <div className="px-3 py-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Folio, cliente o sucursal..."
                className="w-full pl-7 pr-3 py-1.5 border border-border rounded-lg text-xs bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>
          {listaVisible.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-muted-foreground">
              No hay {entidadPlural.toLowerCase()} {soloActivas ? "activas" : "registradas"}.
            </div>
          ) : (
            listaVisible.map((r) => (
              <button
                key={r.id}
                onClick={() => setSeleccionadaId(r.id)}
                className={`w-full text-left px-4 py-3 border-b border-border/60 hover:bg-muted/60 transition-colors ${
                  seleccionadaId === r.id ? "bg-primary/5" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-semibold text-foreground">{r.folio}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${ESTADO_BADGE[r.estado]}`}>
                    {label(labels, `repair.status.${r.estado}`)}
                  </span>
                </div>
                <p className="text-[12px] text-foreground/80 mt-1">{r.marca} {r.modelo}</p>
                <p className="text-[11.5px] text-muted-foreground truncate">{r.cliente} · {r.sucursalNombre}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${PRIORIDAD_CLASES[r.prioridad]}`}>
                    {PRIORIDAD_TEXTO[r.prioridad]}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground">
                    {r.tecnicoAsignadoNombre ?? "Sin técnico asignado"}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Detalle */}
        <div className={`flex-1 overflow-y-auto p-4 ${seleccionada ? "" : "hidden md:block"}`}>
          {!seleccionada ? (
            <div className="h-full flex items-center justify-center text-center text-[12.5px] text-muted-foreground p-8">
              Selecciona una {label(labels, "entity.repair.singular").toLowerCase()} de la lista para ver el detalle.
            </div>
          ) : (
            <div className="max-w-xl">
              <button
                onClick={() => setSeleccionadaId(null)}
                className="md:hidden flex items-center gap-1 text-[12px] text-muted-foreground mb-3"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Volver a la lista
              </button>

              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-semibold text-foreground">{seleccionada.folio}</h2>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${ESTADO_BADGE[seleccionada.estado]}`}>
                  {label(labels, `repair.status.${seleccionada.estado}`)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="bg-muted rounded-lg p-2.5">
                  <p className="text-[10.5px] text-muted-foreground mb-0.5">{activo}</p>
                  <p className="text-[13px] font-medium text-foreground">{seleccionada.marca} {seleccionada.modelo}</p>
                </div>
                <div className="bg-muted rounded-lg p-2.5">
                  <p className="text-[10.5px] text-muted-foreground mb-0.5">Cliente</p>
                  <p className="text-[13px] font-medium text-foreground truncate">{seleccionada.cliente}</p>
                </div>
                <div className="bg-muted rounded-lg p-2.5">
                  <p className="text-[10.5px] text-muted-foreground mb-0.5">Sucursal</p>
                  <p className="text-[13px] font-medium text-foreground">{seleccionada.sucursalNombre}</p>
                </div>
                <div className="bg-muted rounded-lg p-2.5">
                  <p className="text-[10.5px] text-muted-foreground mb-0.5">Fecha prometida</p>
                  <p className="text-[13px] font-medium text-foreground">
                    {seleccionada.fechaEstimada ? formatFecha(seleccionada.fechaEstimada) : "Sin definir"}
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <p className="text-[10.5px] text-muted-foreground mb-1">Falla reportada</p>
                <p className="text-[12.5px] text-foreground/90 bg-muted rounded-lg p-2.5">{seleccionada.falla}</p>
              </div>

              {/* Técnico asignado — exclusivo de Aduana (2026-09-22, corrección
                  de Carlos: ni tienda ni el técnico mismo pueden elegirlo). */}
              <div className="mt-4">
                <p className="text-[12.5px] font-semibold text-foreground mb-1.5">Técnico asignado</p>
                <select
                  disabled={pending || cerrada}
                  value={seleccionada.tecnicoAsignadoId ?? ""}
                  onChange={(e) => handleAsignarTecnico(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-[12.5px] bg-card focus:outline-none focus:border-primary disabled:opacity-50"
                >
                  <option value="">Sin asignar</option>
                  {tecnicos.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Costo estimado — exclusivo de Aduana ("la edición del costo
                  solo se puede hacer en recepción", Carlos). El cambio queda
                  registrado en el Historial de abajo con fecha y hora. */}
              <div className="mt-4">
                <p className="text-[12.5px] font-semibold text-foreground mb-1.5">Costo estimado / pieza cotizada</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    disabled={pending || cerrada}
                    value={costoEdit}
                    onChange={(e) => setCostoEdit(e.target.value)}
                    placeholder={seleccionada.costoEstimado != null ? formatMXN(seleccionada.costoEstimado) : "$0"}
                    className="flex-1 min-w-0 px-3 py-2 border border-border rounded-lg text-[12.5px] bg-card focus:outline-none focus:border-primary disabled:opacity-50"
                  />
                  <button
                    onClick={handleGuardarCosto}
                    disabled={pending || cerrada || !costoEdit}
                    className="px-3 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-[12.5px] font-medium transition-colors"
                  >
                    Guardar
                  </button>
                </div>
                {seleccionada.costoEstimado != null && (
                  <p className="text-[11.5px] text-muted-foreground mt-1">Actual: {formatMXN(seleccionada.costoEstimado)}</p>
                )}
              </div>

              {/* Piezas — exclusivo de Aduana (ver el comentario en
                  agregarPiezaReparacionAction). */}
              <div className="mt-4">
                <p className="text-[12.5px] font-semibold text-foreground mb-1.5">Piezas y servicios cotizados</p>
                {seleccionada.piezas.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-2">
                    {seleccionada.piezas.map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-muted rounded-lg px-2.5 py-1.5 text-[12px]">
                        <span className="text-foreground/90">{p.productName} × {p.quantity}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{formatMXN(p.price * p.quantity)}</span>
                          {!cerrada && (
                            <button
                              onClick={() => handleQuitarPieza(p.id)}
                              disabled={pending}
                              className="text-muted-foreground hover:text-red-600 disabled:opacity-50"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!cerrada && (
                  <div className="flex gap-2">
                    <select
                      value={piezaNuevaId}
                      onChange={(e) => setPiezaNuevaId(e.target.value)}
                      className="flex-1 min-w-0 px-2 py-2 border border-border rounded-lg text-[12px] bg-card focus:outline-none focus:border-primary"
                    >
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
                    <input
                      type="number"
                      min={1}
                      value={piezaNuevaCantidad}
                      onChange={(e) => setPiezaNuevaCantidad(e.target.value)}
                      className="w-14 px-2 py-2 border border-border rounded-lg text-[12px] bg-card focus:outline-none focus:border-primary"
                    />
                    <button
                      onClick={handleAgregarPieza}
                      disabled={pending || !piezaNuevaId}
                      className="px-2.5 py-2 bg-muted hover:bg-accent disabled:opacity-40 rounded-lg text-primary-text"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Avanzar estatus — exclusivo de Aduana ("solo la encargada de
                  recepción puede cambiar el estatus de un equipo", Carlos). */}
              {siguientes.length > 0 && (
                <div className="mt-4">
                  <p className="text-[12.5px] font-semibold text-foreground mb-1.5">Cambiar estatus</p>
                  <div className="flex flex-wrap gap-2">
                    {siguientes.map((s) => (
                      <button
                        key={s.estado}
                        onClick={() => (s.estado === "DELIVERED" ? handleEntregarSinCobro() : handleAvanzar(s.estado))}
                        disabled={pending}
                        className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-[12.5px] font-medium transition-colors"
                      >
                        <ArrowRight className="w-3.5 h-3.5" /> {s.texto}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Atajo "Cobrar y entregar" (2026-09-25, a petición de
                  Carlos: simplificar el proceso para el operador único, sin
                  quitarle la separación de funciones a quien sí la necesita
                  por jerarquía) — solo aparece cuando el equipo ya está listo
                  en tienda Y quien ve esta pantalla también tiene acceso al
                  módulo POS (puedeCobrar, ver el comentario en page.tsx). Un
                  recepcionista sin ese módulo nunca ve este botón; para él la
                  pantalla queda igual que siempre. Nunca cobra aquí mismo —
                  solo manda a /pos con la reparación precargada, el mismo
                  camino que ya usa este botón en /reparaciones. */}
              {puedeCobrar && (seleccionada.estado === "SHOP_READY" || seleccionada.estado === "SHOP_RETURN") && (
                <div className="mt-4">
                  <button
                    onClick={handleCobrar}
                    disabled={pending}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-[12.5px] font-medium transition-colors"
                  >
                    <Store className="w-3.5 h-3.5" /> Cobrar y entregar
                  </button>
                </div>
              )}

              {/* Historial — incluye cambios de costo y alertas del técnico
                  (ver enviarAlertaTallerAction), todos con fecha y hora. */}
              {seleccionada.historial.length > 0 && (
                <div className="mt-5">
                  <p className="text-[12.5px] font-semibold text-foreground mb-2">Historial</p>
                  <div className="space-y-2.5">
                    {seleccionada.historial.map((h, i) => {
                      const cfg = HISTORIAL_ICONOS[h.estado] || HISTORIAL_ICONOS.RECEIVED;
                      const Icon = cfg.icon;
                      return (
                        <div key={i} className="flex items-start gap-2.5">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                            <Icon className={`w-3 h-3 ${cfg.color}`} />
                          </div>
                          <div>
                            <p className="text-[12.5px] text-foreground">{h.nota ?? label(labels, `repair.status.${h.estado}`)}</p>
                            <p className="text-[11px] text-muted-foreground">{formatFechaHora(h.fecha)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
