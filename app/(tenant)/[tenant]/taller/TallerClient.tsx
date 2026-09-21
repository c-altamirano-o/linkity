"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wrench, Package, Plus, ChevronLeft, Clock, AlertCircle, ArrowRight } from "lucide-react";
import type { ReparacionesData, EstadoReparacion, PrioridadReparacion } from "@/lib/reparaciones-data";
import { label, type LabelDictionary } from "@/lib/labels";
import {
  agregarPiezaReparacionAction,
  avanzarEstadoAction,
  type NuevoEstadoReparacion,
} from "@/app/actions/reparaciones-actions";

/**
 * Vista del técnico reparador (módulo "taller", ver el comentario largo en
 * lib/roles.ts y en page.tsx de esta misma carpeta). A propósito angosta —
 * es un componente NUEVO, no una rama dentro de ReparacionesClient.tsx: solo
 * ofrece lo que un técnico de verdad necesita (ver sus reparaciones,
 * diagnosticar/agregar piezas, avanzar el estatus) y NUNCA muestra botón de
 * eliminar pieza, cambiar costo, cobrar/entregar ni contactar al cliente —
 * esos botones simplemente no existen aquí, y aunque alguien los recreara a
 * mano, el servidor los rechaza igual (ver reparaciones-actions.ts).
 */

interface TallerClientProps {
  data: ReparacionesData;
  labels: LabelDictionary;
  tenantSlug: string;
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

// Mismas transiciones que TRANSICIONES_VALIDAS en reparaciones-actions.ts —
// duplicado a propósito (solo para decidir qué botón mostrar): el servidor
// vuelve a validar esto en cada llamada, así que un valor equivocado aquí
// nunca podría saltarse un estatus, solo mostraría un botón que el servidor
// rechazaría.
const SIGUIENTES_ESTADOS: Partial<Record<EstadoReparacion, { estado: NuevoEstadoReparacion; texto: string; clases: string }[]>> = {
  RECEIVED: [{ estado: "IN_REPAIR", texto: "Iniciar reparación", clases: "bg-primary hover:bg-primary/90 text-primary-foreground" }],
  IN_REPAIR: [
    { estado: "WORKSHOP_READY", texto: "Marcar como reparado", clases: "bg-emerald-600 hover:bg-emerald-700 text-white" },
    { estado: "WORKSHOP_RETURN", texto: "No se pudo reparar", clases: "bg-orange-100 hover:bg-orange-200 text-orange-700" },
  ],
  WORKSHOP_READY: [{ estado: "SHOP_READY", texto: "Pasar a mostrador", clases: "bg-cyan-600 hover:bg-cyan-700 text-white" }],
  WORKSHOP_RETURN: [{ estado: "SHOP_RETURN", texto: "Pasar a mostrador (devolución)", clases: "bg-red-100 hover:bg-red-200 text-red-700" }],
};

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

export default function TallerClient({ data, labels, tenantSlug }: TallerClientProps) {
  const router = useRouter();
  const { productos, reparaciones } = data;
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const [soloActivas, setSoloActivas] = useState(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [piezaProductId, setPiezaProductId] = useState("");
  const [piezaCantidad, setPiezaCantidad] = useState("1");

  const activas = reparaciones.filter((r) => r.estado !== "DELIVERED" && r.estado !== "CANCELLED");
  const listaVisible = soloActivas ? activas : reparaciones;
  const seleccionada = reparaciones.find((r) => r.id === seleccionadaId) ?? null;

  function refrescarYRecargar() {
    router.refresh();
  }

  function avanzar(repairId: string, nuevoEstado: NuevoEstadoReparacion) {
    setError(null);
    startTransition(async () => {
      const res = await avanzarEstadoAction({ tenantSlug, repairId, nuevoEstado });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      refrescarYRecargar();
    });
  }

  function agregarPieza(repairId: string) {
    if (!piezaProductId || Number(piezaCantidad) <= 0) return;
    setError(null);
    startTransition(async () => {
      const res = await agregarPiezaReparacionAction({
        tenantSlug,
        repairId,
        productId: piezaProductId,
        quantity: Number(piezaCantidad),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPiezaProductId("");
      setPiezaCantidad("1");
      refrescarYRecargar();
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
            {entidadPlural} de tu sucursal — diagnostica, agrega piezas y avanza el estatus.
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
          {listaVisible.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-muted-foreground">
              No hay {entidadPlural.toLowerCase()} {soloActivas ? "activas" : "registradas"} en tu sucursal.
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
                </div>
              </button>
            ))
          )}
        </div>

        {/* Detalle */}
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
              </div>

              <div className="mt-3">
                <p className="text-[10.5px] text-muted-foreground mb-1">Falla reportada</p>
                <p className="text-[12.5px] text-foreground/90 bg-muted rounded-lg p-2.5">{seleccionada.falla}</p>
              </div>

              <div className="flex items-center gap-4 mt-3 text-[11.5px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Recibido {new Date(seleccionada.fechaRecibido).toLocaleDateString("es-MX")}
                </span>
                {seleccionada.costoEstimado != null && (
                  <span>Costo estimado: {formatMXN(seleccionada.costoEstimado)}</span>
                )}
              </div>

              {/* Piezas — agregar sí, eliminar/editar costo no (ver el
                  comentario en TallerClient de arriba y en
                  reparaciones-actions.ts) */}
              <div className="mt-4">
                <p className="text-[12.5px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" /> Piezas y servicios usados
                </p>
                {seleccionada.piezas.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground mb-2">Todavía no hay piezas registradas.</p>
                ) : (
                  <div className="flex flex-col gap-1.5 mb-2">
                    {seleccionada.piezas.map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-muted rounded-lg px-2.5 py-1.5 text-[12px]">
                        <span className="text-foreground/90">{p.productName} × {p.quantity}</span>
                        <span className="text-muted-foreground">{formatMXN(p.price * p.quantity)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {seleccionada.estado !== "DELIVERED" && seleccionada.estado !== "CANCELLED" && (
                  <div className="flex items-center gap-2">
                    <select
                      value={piezaProductId}
                      onChange={(e) => setPiezaProductId(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 border border-border rounded-lg text-[12px] bg-card focus:outline-none focus:border-primary"
                    >
                      <option value="">Selecciona pieza o servicio…</option>
                      {productos.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={piezaCantidad}
                      onChange={(e) => setPiezaCantidad(e.target.value)}
                      className="w-14 px-2 py-1.5 border border-border rounded-lg text-[12px] text-center bg-card focus:outline-none focus:border-primary"
                    />
                    <button
                      onClick={() => agregarPieza(seleccionada.id)}
                      disabled={pending || !piezaProductId}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-[12px] font-medium transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Agregar
                    </button>
                  </div>
                )}
              </div>

              {/* Avanzar estatus */}
              <div className="mt-5">
                {(SIGUIENTES_ESTADOS[seleccionada.estado] ?? []).length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {SIGUIENTES_ESTADOS[seleccionada.estado]!.map((opcion) => (
                      <button
                        key={opcion.estado}
                        onClick={() => avanzar(seleccionada.id, opcion.estado)}
                        disabled={pending}
                        className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-medium transition-colors disabled:opacity-50 ${opcion.clases}`}
                      >
                        {opcion.texto} <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-muted-foreground bg-muted rounded-lg p-2.5">
                    {seleccionada.estado === "SHOP_READY" || seleccionada.estado === "SHOP_RETURN"
                      ? "Esperando cobro/entrega en mostrador — eso lo hace Encargado o Recepción."
                      : "No hay un siguiente paso disponible desde aquí."}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
