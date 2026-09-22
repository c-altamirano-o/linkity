"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wrench, Clock, AlertCircle, ChevronLeft, Send, Users } from "lucide-react";
import type { ReparacionesData, EstadoReparacion, PrioridadReparacion } from "@/lib/reparaciones-data";
import { label, type LabelDictionary } from "@/lib/labels";
import { enviarAlertaTallerAction } from "@/app/actions/reparaciones-actions";

/**
 * Vista del técnico reparador (módulo "taller") — RECORTADA a solo lectura
 * + alerta el 2026-09-22, corrección explícita de Carlos con el ejemplo
 * hipotético "Fix Expres": "solo la encargada de recepción puede cambiar el
 * estastus de un equipo" y "la edición del costo solo se puede hacer en
 * recepción" — antes esta pantalla dejaba agregar piezas y avanzar el
 * estatus, ambas cosas ahora exclusivas de /aduana (ver AduanaClient.tsx).
 * Lo único que un técnico puede seguir "haciendo" aquí es mandar una alerta
 * a Aduana/Recepción/Tienda cuando necesita información o una cotización
 * (enviarAlertaTallerAction, que reutiliza RepairHistory — ver el
 * comentario largo en esa acción).
 *
 * Campos visibles — exactamente la lista que dio Carlos ("Nombre del
 * clente, numero de folio, sucursal, contraseña [= el folio mismo, ver la
 * aclaración de Carlos], falla reportada, pieza cotizada y fecha
 * prometida"), sin datos de contacto (teléfono) — "para evitar fraudes...
 * y también evita problemas entre el personal de competir o envidias".
 */

interface TallerClientProps {
  data: ReparacionesData;
  labels: LabelDictionary;
  tenantSlug: string;
  // El staffId de la sesión de PIN actual — cuando viene presente y
  // verTodoTaller es false, la lista se filtra a SOLO las reparaciones
  // asignadas a este técnico. null en una sesión admin (ve todo).
  miStaffId: string | null;
  // "Jefe de técnicos" (Role.verTodoTaller, 2026-09-22, a petición de
  // Carlos: "Ve todos los folios, pero sin editar") — cuando es true, se
  // ignora miStaffId y se muestran TODAS las reparaciones del taller.
  verTodoTaller: boolean;
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

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const formatFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

const formatFechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true });

export default function TallerClient({ data, labels, tenantSlug, miStaffId, verTodoTaller }: TallerClientProps) {
  const router = useRouter();
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const [soloActivas, setSoloActivas] = useState(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [alertaTexto, setAlertaTexto] = useState("");
  const [alertaOk, setAlertaOk] = useState(false);

  // "cada técnico solo debe ver SUS reparaciones asignadas, no toda la cola"
  // (Carlos) salvo el Jefe de técnicos, que ve todo sin poder editar.
  const reparaciones = verTodoTaller
    ? data.reparaciones
    : miStaffId
      ? data.reparaciones.filter((r) => r.tecnicoAsignadoId === miStaffId)
      : data.reparaciones;

  const activas = reparaciones.filter((r) => r.estado !== "DELIVERED" && r.estado !== "CANCELLED");
  const listaVisible = soloActivas ? activas : reparaciones;
  const seleccionada = reparaciones.find((r) => r.id === seleccionadaId) ?? null;

  function enviarAlerta(repairId: string) {
    const mensaje = alertaTexto.trim();
    if (!mensaje) return;
    setError(null);
    startTransition(async () => {
      const res = await enviarAlertaTallerAction({ tenantSlug, repairId, mensaje });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAlertaTexto("");
      setAlertaOk(true);
      setTimeout(() => setAlertaOk(false), 2500);
      router.refresh();
    });
  }

  const entidad = label(labels, "entity.repair.singular");
  const entidadPlural = label(labels, "entity.repair.plural");
  const activo = label(labels, "entity.repair.asset");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <h1 className="text-[15px] font-semibold text-foreground flex items-center gap-2">
            <Wrench className="w-4 h-4 text-primary" /> Taller
          </h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {verTodoTaller
              ? `Todas las ${entidadPlural.toLowerCase()} del taller`
              : miStaffId
                ? `${entidadPlural} asignadas a ti`
                : `${entidadPlural} del taller`}
            {" "}— consulta el detalle y avisa a Aduana/Recepción si necesitas algo.
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

      {verTodoTaller && (
        <div className="mx-4 mb-2 flex items-center gap-2 bg-primary/5 text-primary text-[12px] px-3 py-1.5 rounded-lg">
          <Users className="w-3.5 h-3.5 flex-shrink-0" /> Vista de Jefe de técnicos — ves todas las reparaciones del taller, sin poder editarlas.
        </div>
      )}

      {error && (
        <div className="mx-4 mb-2 flex items-center gap-2 bg-red-50 text-red-700 text-[12.5px] px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Lista */}
        <div className={`w-full md:w-[340px] flex-shrink-0 border-r border-border overflow-y-auto ${seleccionada ? "hidden md:block" : ""}`}>
          {listaVisible.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-muted-foreground">
              {miStaffId && !verTodoTaller
                ? `No tienes ${entidadPlural.toLowerCase()} ${soloActivas ? "activas" : "registradas"} asignadas todavía.`
                : `No hay ${entidadPlural.toLowerCase()} ${soloActivas ? "activas" : "registradas"} en el taller.`}
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
                <p className="text-[11.5px] text-muted-foreground truncate">{r.falla}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${PRIORIDAD_CLASES[r.prioridad]}`}>
                    {PRIORIDAD_TEXTO[r.prioridad]}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground">{r.cliente}</span>
                  {verTodoTaller && r.tecnicoAsignadoNombre && (
                    <span className="text-[10.5px] text-muted-foreground">· {r.tecnicoAsignadoNombre}</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Detalle — de solo lectura: sin botón de agregar/quitar pieza,
            editar costo ni avanzar estatus (ver el comentario del archivo). */}
        <div className={`flex-1 overflow-y-auto p-4 ${seleccionada ? "" : "hidden md:block"}`}>
          {!seleccionada ? (
            <div className="h-full flex items-center justify-center text-center text-[12.5px] text-muted-foreground p-8">
              Selecciona una {entidad.toLowerCase()} de la lista para ver el detalle.
            </div>
          ) : (
            <div className="max-w-lg">
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
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[9.5px] font-semibold flex items-center justify-center">
                      {iniciales(seleccionada.cliente)}
                    </span>
                    <p className="text-[13px] font-medium text-foreground truncate">{seleccionada.cliente}</p>
                  </div>
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

              <div className="flex items-center gap-4 mt-3 text-[11.5px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Recibido {formatFecha(seleccionada.fechaRecibido)}
                </span>
                {seleccionada.costoEstimado != null && (
                  <span>Pieza cotizada: {formatMXN(seleccionada.costoEstimado)}</span>
                )}
              </div>

              {seleccionada.piezas.length > 0 && (
                <div className="mt-4">
                  <p className="text-[12.5px] font-semibold text-foreground mb-2">Piezas y servicios cotizados</p>
                  <div className="flex flex-col gap-1.5">
                    {seleccionada.piezas.map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-muted rounded-lg px-2.5 py-1.5 text-[12px]">
                        <span className="text-foreground/90">{p.productName} × {p.quantity}</span>
                        <span className="text-muted-foreground">{formatMXN(p.price * p.quantity)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Historial — incluye las alertas ya enviadas (ver
                  enviarAlertaTallerAction), para que el técnico vea si ya
                  levantó esta misma alerta antes. */}
              {seleccionada.historial.length > 0 && (
                <div className="mt-4">
                  <p className="text-[12.5px] font-semibold text-foreground mb-2">Historial</p>
                  <div className="flex flex-col gap-2">
                    {seleccionada.historial.slice(0, 6).map((h, i) => (
                      <div key={i} className="text-[12px] bg-muted rounded-lg px-2.5 py-1.5">
                        <p className="text-foreground/90">{h.nota ?? label(labels, `repair.status.${h.estado}`)}</p>
                        <p className="text-[10.5px] text-muted-foreground">{formatFechaHora(h.fecha)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Alerta a Aduana/Recepción/Tienda (2026-09-22, a petición de
                  Carlos) — la única acción de escritura que le queda al
                  técnico sobre esta reparación. Oculta para el Jefe de
                  técnicos (verTodoTaller): ese puesto es supervisión sobre
                  folios que no tiene asignados a sí mismo, no le toca
                  alertar por ellos. */}
              {!verTodoTaller && seleccionada.estado !== "DELIVERED" && seleccionada.estado !== "CANCELLED" && (
                <div className="mt-5">
                  <p className="text-[12.5px] font-semibold text-foreground mb-2">Enviar alerta a Aduana / Recepción / Tienda</p>
                  <textarea
                    value={alertaTexto}
                    onChange={(e) => setAlertaTexto(e.target.value)}
                    rows={2}
                    placeholder="Ej. Necesito autorización para cotizar una pieza extra…"
                    className="w-full px-3 py-2 border border-border rounded-lg text-[12.5px] bg-card focus:outline-none focus:border-primary resize-none"
                  />
                  <button
                    onClick={() => enviarAlerta(seleccionada.id)}
                    disabled={pending || !alertaTexto.trim()}
                    className="mt-2 flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-[12.5px] font-medium transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" /> Enviar alerta
                  </button>
                  {alertaOk && <p className="text-[11.5px] text-emerald-600 mt-1.5">Alerta enviada.</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
