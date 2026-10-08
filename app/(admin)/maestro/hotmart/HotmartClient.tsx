"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { HotmartPanelData, HotmartEventoUI } from "@/lib/hotmart-data";
import { marcarEventoAtendidoAction } from "./actions";

const RESULTADOS: Record<string, { label: string; clase: string }> = {
  activado: { label: "Cuenta activada", clase: "bg-emerald-50 text-emerald-700" },
  cuenta_creada: { label: "Cuenta creada", clase: "bg-emerald-50 text-emerald-700" },
  duplicado: { label: "Duplicado", clase: "bg-slate-100 text-slate-500" },
  cancelacion_registrada: { label: "Cancelación", clase: "bg-slate-100 text-slate-600" },
  suspendido: { label: "Suspendida", clase: "bg-red-50 text-red-700" },
  sin_negocio: { label: "Sin negocio", clase: "bg-amber-50 text-amber-700" },
  sin_plan: { label: "Sin plan", clase: "bg-amber-50 text-amber-700" },
  correo_ambiguo: { label: "Correo ambiguo", clase: "bg-amber-50 text-amber-700" },
  sin_suscripcion: { label: "Sin suscripción", clase: "bg-amber-50 text-amber-700" },
  ignorado: { label: "Ignorado", clase: "bg-slate-100 text-slate-500" },
  error: { label: "Error", clase: "bg-red-50 text-red-700" },
  recibido: { label: "Recibido", clase: "bg-slate-100 text-slate-500" },
};

function fecha(iso: string) {
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}

function Semaforo({ ok, textoOk, textoMal }: { ok: boolean; textoOk: string; textoMal: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <span className={`w-2 h-2 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />
      <span className={ok ? "text-slate-600" : "text-red-700"}>{ok ? textoOk : textoMal}</span>
    </div>
  );
}

export default function HotmartClient({ data }: { data: HotmartPanelData }) {
  const [soloPendientes, setSoloPendientes] = useState(data.pendientes > 0);
  const [error, setError] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const visibles = data.eventos.filter((e) => (soloPendientes ? e.needsAttention && !e.attended : true));
  const planesSinConfig = data.planes.filter((p) => p.isActive && !p.hotmartProductId && !p.hotmartOfferCode);

  function atender(e: HotmartEventoUI) {
    setError(null);
    setEnCurso(e.id);
    startTransition(async () => {
      const r = await marcarEventoAtendidoAction(e.id);
      if (!r.ok) setError(r.error);
      setEnCurso(null);
    });
  }

  return (
    <div className="space-y-4">
      {/* Estado de la configuración */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
          <p className="text-[13.5px] font-medium text-slate-800">Conexión con Hotmart</p>
          <Semaforo ok={data.hottokConfigurado} textoOk="Hottok guardado" textoMal="Falta el Hottok: el webhook rechazará todo" />
          <Semaforo ok={data.checkoutConfigurado} textoOk="Link de pago guardado" textoMal="Falta el link de pago: los clientes no tendrán a dónde pagar" />
          <p className="text-[12px] text-slate-400 pt-1">
            Para cambiarlo o ver la URL del webhook, entra a{" "}
            <Link href="/maestro/conexiones" className="text-[#4F46E5] hover:underline">Conexiones</Link>.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-[13.5px] font-medium text-slate-800 mb-2">Plan ↔ producto de Hotmart</p>
          <div className="space-y-1.5">
            {data.planes.map((p) => {
              const ok = !!(p.hotmartProductId || p.hotmartOfferCode);
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="text-slate-700">{p.name}</span>
                  {ok ? (
                    <span className="font-mono text-slate-500">
                      {p.hotmartProductId ? `prod ${p.hotmartProductId}` : ""}
                      {p.hotmartProductId && p.hotmartOfferCode ? " · " : ""}
                      {p.hotmartOfferCode ? `oferta ${p.hotmartOfferCode}` : ""}
                    </span>
                  ) : (
                    <span className="text-amber-700">sin configurar</span>
                  )}
                </div>
              );
            })}
          </div>
          {planesSinConfig.length > 0 && (
            <p className="mt-2 text-[12px] text-amber-700">
              Un plan sin códigos no puede identificarse en una compra: ese pago no activará la cuenta.{" "}
              <Link href="/maestro/planes-comerciales" className="underline">Configurar</Link>
            </p>
          )}
        </div>
      </div>

      {/* Bitácora */}
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <p className="text-[13.5px] font-medium text-slate-800">
            Eventos recibidos
            {data.pendientes > 0 && (
              <span className="ml-2 text-[11px] bg-red-500 text-white px-1.5 py-0.5 rounded-full">{data.pendientes} por revisar</span>
            )}
          </p>
          <label className="flex items-center gap-2 text-[12.5px] text-slate-600 cursor-pointer">
            <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
            Solo por revisar
          </label>
        </div>

        {error && <p className="px-4 py-2 text-[12.5px] text-red-600">{error}</p>}

        {visibles.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-slate-400">
            {data.eventos.length === 0 ? "Todavía no ha llegado ningún evento de Hotmart." : "Nada por revisar."}
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibles.map((e) => {
              const res = RESULTADOS[e.outcome] ?? { label: e.outcome, clase: "bg-slate-100 text-slate-500" };
              const pendiente = e.needsAttention && !e.attended;
              return (
                <div key={e.id} className={`px-4 py-3 ${pendiente ? "bg-amber-50/40" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] text-slate-400">{fecha(e.receivedAt)}</span>
                    <span className="text-[12.5px] font-mono text-slate-600">{e.event}</span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${res.clase}`}>{res.label}</span>
                    {e.attended && <span className="text-[11px] text-slate-400">atendido {e.attendedAt ? fecha(e.attendedAt) : ""}</span>}
                    {pendiente && (
                      <button
                        type="button"
                        disabled={enCurso === e.id}
                        onClick={() => atender(e)}
                        className="ml-auto text-[12px] px-2.5 py-1 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {enCurso === e.id ? "Guardando…" : "Marcar atendido"}
                      </button>
                    )}
                  </div>
                  <div className="mt-1 text-[12.5px] text-slate-600 flex flex-wrap gap-x-4 gap-y-0.5">
                    <span>Comprador: {e.buyerEmail ?? "—"}</span>
                    <span>Producto: {e.productId ?? "—"}</span>
                    <span>Oferta: {e.offerCode ?? "—"}</span>
                    {e.transaction && <span>Transacción: {e.transaction}</span>}
                    {e.planName && <span>Plan: {e.planName}</span>}
                    {e.tenantSlug && (
                      <span>
                        Negocio:{" "}
                        <Link href={`/maestro/tenants/${e.tenantSlug}`} className="text-[#4F46E5] hover:underline">
                          {e.tenantName ?? e.tenantSlug}
                        </Link>
                      </span>
                    )}
                  </div>
                  {e.note && <p className="mt-1 text-[12.5px] text-slate-500">{e.note}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
