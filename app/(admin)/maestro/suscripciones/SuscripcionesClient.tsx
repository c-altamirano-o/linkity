"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Settings, AlertTriangle } from "lucide-react";
import type { SuscripcionesData, SuscripcionRow } from "@/lib/suscripciones-data";
import { alternarSuscripcionAction } from "../dashboard/actions";
import { ETAPA_LABEL } from "@/lib/ciclo-suscripcion";

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const formatFecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—";

const CICLO_LABEL: Record<string, string> = {
  MENSUAL: "mensual",
  TRIMESTRAL: "trimestral",
  SEMESTRAL: "semestral",
  ANUAL: "anual",
};

const ESTADO_CONFIG: Record<string, { label: string; classes: string }> = {
  ACTIVE: { label: "Activo", classes: "bg-emerald-500/10 text-emerald-600" },
  TRIAL: { label: "Prueba", classes: "bg-cyan-500/10 text-cyan-600" },
  SUSPENDED: { label: "Suspendido", classes: "bg-slate-200 text-slate-500" },
  CANCELLED: { label: "Cancelado", classes: "bg-slate-200 text-slate-400" },
};

function urgenciaBadge(row: SuscripcionRow): { label: string; classes: string } | null {
  const d = row.diasRestantes ?? 0;
  if (row.urgencia === "vencida") {
    const dias = Math.abs(d);
    return { label: `Vencida hace ${dias} día${dias === 1 ? "" : "s"}`, classes: "bg-red-500/10 text-red-600" };
  }
  if (row.urgencia === "por_vencer") {
    return { label: d === 0 ? "Vence hoy" : `Vence en ${d} día${d === 1 ? "" : "s"}`, classes: "bg-amber-500/10 text-amber-600" };
  }
  return null;
}

type Filtro = "todos" | "vencidas" | "por_vencer" | "activos" | "listos_para_eliminar";

export default function SuscripcionesClient({ data }: { data: SuscripcionesData }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [isPending, startTransition] = useTransition();
  const [gestionando, setGestionando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    switch (filtro) {
      case "vencidas":
        return data.rows.filter((r) => r.urgencia === "vencida");
      case "por_vencer":
        return data.rows.filter((r) => r.urgencia === "por_vencer");
      case "activos":
        return data.rows.filter((r) => r.status === "ACTIVE");
      case "listos_para_eliminar":
        return data.rows.filter((r) => r.etapaCiclo === "lista_para_eliminar");
      default:
        return data.rows;
    }
  }, [data.rows, filtro]);

  function alternar(tenantId: string, nuevoEstado: "ACTIVE" | "SUSPENDED") {
    setError(null);
    setGestionando(tenantId);
    startTransition(async () => {
      const res = await alternarSuscripcionAction({ tenantId, nuevoEstado });
      setGestionando(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  const { resumen } = data;

  const cards: { key: Filtro; label: string; value: string; alert: boolean; noFilter: boolean }[] = [
    { key: "activos", label: "Activas", value: String(resumen.activas), alert: false, noFilter: false },
    { key: "por_vencer", label: "Por vencer (≤7 días)", value: String(resumen.porVencerPronto), alert: resumen.porVencerPronto > 0, noFilter: false },
    { key: "vencidas", label: "Vencidas — te deben el pago", value: String(resumen.vencidas), alert: resumen.vencidas > 0, noFilter: false },
    { key: "todos", label: "Ingresos MRR", value: formatMXN(resumen.mrr), alert: false, noFilter: true },
  ];

  return (
    <div>
      {/* Alerta de negocios sin respuesta tras 90+ días bloqueados (ver
          lib/ciclo-suscripcion.ts) — Carlos decide a mano si los borra desde
          la pantalla de detalle de cada negocio (Zona de peligro); esto solo
          avisa, nunca borra nada por sí sola. */}
      {resumen.listosParaEliminar > 0 && (
        <button
          type="button"
          onClick={() => setFiltro("listos_para_eliminar")}
          className={`w-full text-left flex items-start gap-3 bg-red-50 border rounded-lg p-3.5 mb-4 transition-colors ${
            filtro === "listos_para_eliminar" ? "border-red-400" : "border-red-200 hover:border-red-300"
          }`}
        >
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13.5px] font-medium text-red-700">
              {resumen.listosParaEliminar} negocio{resumen.listosParaEliminar === 1 ? "" : "s"} sin respuesta —
              lleva{resumen.listosParaEliminar === 1 ? "" : "n"} 90+ días bloqueado
              {resumen.listosParaEliminar === 1 ? "" : "s"} sin renovar
            </p>
            <p className="text-[12.5px] text-red-500 mt-0.5">
              Ya se les avisó por correo/WhatsApp en los 3 plazos (7, 30 y 90 días). Revisa cada negocio y, si
              decides no conservar su información, puedes borrarlo desde su pantalla de detalle.
            </p>
          </div>
        </button>
      )}

      {/* Tarjetas resumen — clic para filtrar la tabla */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {cards.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => !c.noFilter && setFiltro(c.key)}
            className={`text-left bg-white border rounded-lg p-3 transition-colors ${
              filtro === c.key ? "border-[#4F46E5]" : "border-slate-200"
            } ${c.noFilter ? "cursor-default" : "hover:border-slate-300"}`}
          >
            <p className="text-[12.5px] text-slate-500 mb-1">{c.label}</p>
            <p className={`text-2xl font-medium ${c.alert ? "text-red-600" : "text-slate-800"}`}>{c.value}</p>
          </button>
        ))}
      </div>

      {filtro !== "todos" && (
        <button
          type="button"
          onClick={() => setFiltro("todos")}
          className="text-[12.5px] text-[#4F46E5] hover:underline mb-2"
        >
          Ver todos los negocios
        </button>
      )}

      {error && <p className="text-[12.5px] text-red-600 mb-2">{error}</p>}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left text-[12.5px] font-medium text-slate-500 px-4 py-2.5">Negocio</th>
              <th className="text-left text-[12.5px] font-medium text-slate-500 px-4 py-2.5">Plan</th>
              <th className="text-left text-[12.5px] font-medium text-slate-500 px-4 py-2.5">Precio</th>
              <th className="text-left text-[12.5px] font-medium text-slate-500 px-4 py-2.5">Vence</th>
              <th className="text-left text-[12.5px] font-medium text-slate-500 px-4 py-2.5">Estado</th>
              <th className="text-left text-[12.5px] font-medium text-slate-500 px-4 py-2.5">Auto-renovación</th>
              <th className="text-left text-[12.5px] font-medium text-slate-500 px-4 py-2.5">Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-[13.5px] text-slate-400">
                  No hay negocios en este filtro.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const estadoCfg = r.status ? ESTADO_CONFIG[r.status] : null;
                const urgCfg = urgenciaBadge(r);
                const puedeSuspender = r.status === "ACTIVE";
                const puedeReactivar = r.status === "SUSPENDED";
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/maestro/tenants/${r.slug}`}
                        className="text-[13.5px] font-medium text-slate-800 hover:text-[#4F46E5] hover:underline"
                      >
                        {r.name}
                      </Link>
                      <p className="text-[12.5px] text-slate-400">{[r.city, r.state].filter(Boolean).join(", ") || "Sin ubicación"}</p>
                    </td>
                    <td className="px-4 py-2.5 text-[13.5px] text-slate-600">
                      {r.plan ?? "Sin plan"}
                      {r.billingCycle && <span className="text-slate-400"> · {CICLO_LABEL[r.billingCycle]}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-[13.5px] text-slate-600">
                      {r.price !== null ? `${formatMXN(r.price)} / ${CICLO_LABEL[r.billingCycle ?? "MENSUAL"]}` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="text-[13.5px] text-slate-600">{formatFecha(r.endDate)}</p>
                      {urgCfg && (
                        <span className={`inline-block mt-0.5 text-[11.5px] font-medium px-1.5 py-0.5 rounded-full ${urgCfg.classes}`}>
                          {urgCfg.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[12.5px] font-medium px-2 py-0.5 rounded-full ${estadoCfg?.classes ?? "bg-slate-100 text-slate-400"}`}>
                        {estadoCfg?.label ?? "Sin suscripción"}
                      </span>
                      {(r.etapaCiclo === "en_gracia" || r.etapaCiclo === "bloqueada" || r.etapaCiclo === "lista_para_eliminar") && (
                        <span
                          className={`block mt-1 text-[11.5px] font-medium ${
                            r.etapaCiclo === "lista_para_eliminar" ? "text-red-600" : "text-amber-600"
                          }`}
                        >
                          {ETAPA_LABEL[r.etapaCiclo]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[13.5px] text-slate-600">{r.autoRenew ? "Sí" : "No"}</td>
                    <td className="px-4 py-2.5">
                      {puedeSuspender ? (
                        <button
                          type="button"
                          disabled={isPending && gestionando === r.id}
                          onClick={() => alternar(r.id, "SUSPENDED")}
                          className="text-[12.5px] text-red-600 border border-red-200 hover:border-red-300 disabled:opacity-50 px-2 py-1 rounded transition-colors flex items-center gap-1"
                        >
                          <Settings className="w-3 h-3" />
                          {isPending && gestionando === r.id ? "Suspendiendo…" : "Suspender"}
                        </button>
                      ) : puedeReactivar ? (
                        <button
                          type="button"
                          disabled={isPending && gestionando === r.id}
                          onClick={() => alternar(r.id, "ACTIVE")}
                          className="text-[12.5px] text-emerald-600 border border-emerald-200 hover:border-emerald-300 disabled:opacity-50 px-2 py-1 rounded transition-colors flex items-center gap-1"
                        >
                          <Settings className="w-3 h-3" />
                          {isPending && gestionando === r.id ? "Reactivando…" : "Reactivar"}
                        </button>
                      ) : (
                        <span className="text-[12.5px] text-slate-300">Sin acciones</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
