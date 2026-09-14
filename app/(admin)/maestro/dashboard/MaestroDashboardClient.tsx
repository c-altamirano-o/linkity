"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import type { MaestroTenantRow } from "@/lib/maestro-data";
import { alternarSuscripcionAction } from "./actions";

const statusConfig: Record<string, { label: string; classes: string }> = {
  ACTIVE: { label: "Activo", classes: "bg-emerald-500/10 text-emerald-600" },
  TRIAL: { label: "Prueba", classes: "bg-cyan-500/10 text-cyan-600" },
  SUSPENDED: { label: "Suspendido", classes: "bg-red-500/10 text-red-600" },
  CANCELLED: { label: "Cancelado", classes: "bg-slate-200 text-slate-500" },
};

export default function MaestroDashboardClient({ tenants }: { tenants: MaestroTenantRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [gestionando, setGestionando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-5">
      {error && <p className="text-[11px] text-red-600 px-4 pt-2">{error}</p>}
      <table className="w-full">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Negocio</th>
            <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Plan</th>
            <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Estado</th>
            <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Módulos</th>
            <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Acción</th>
          </tr>
        </thead>
        <tbody>
          {tenants.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-[12px] text-slate-400">
                Todavía no hay negocios registrados.
              </td>
            </tr>
          ) : (
            tenants.map((t) => {
              const cfg = t.subscriptionStatus ? statusConfig[t.subscriptionStatus] : null;
              const puedeSuspender = t.subscriptionStatus === "ACTIVE";
              const puedeReactivar = t.subscriptionStatus === "SUSPENDED";
              return (
                <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5">
                    <p className="text-[12px] font-medium text-slate-800">{t.name}</p>
                    <p className="text-[11px] text-slate-400">{[t.city, t.state].filter(Boolean).join(", ") || "Sin ubicación"}</p>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-slate-600">{t.plan ?? "Sin plan"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${cfg?.classes ?? "bg-slate-100 text-slate-400"}`}>
                      {cfg?.label ?? "Sin suscripción"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-slate-600">{t.modulosActivos}/{t.modulosTotal}</td>
                  <td className="px-4 py-2.5">
                    {puedeSuspender ? (
                      <button
                        disabled={isPending && gestionando === t.id}
                        onClick={() => alternar(t.id, "SUSPENDED")}
                        className="text-[11px] text-red-600 border border-red-200 hover:border-red-300 disabled:opacity-50 px-2 py-1 rounded transition-colors flex items-center gap-1"
                      >
                        <Settings className="w-3 h-3" />
                        {isPending && gestionando === t.id ? "Suspendiendo…" : "Suspender"}
                      </button>
                    ) : puedeReactivar ? (
                      <button
                        disabled={isPending && gestionando === t.id}
                        onClick={() => alternar(t.id, "ACTIVE")}
                        className="text-[11px] text-emerald-600 border border-emerald-200 hover:border-emerald-300 disabled:opacity-50 px-2 py-1 rounded transition-colors flex items-center gap-1"
                      >
                        <Settings className="w-3 h-3" />
                        {isPending && gestionando === t.id ? "Reactivando…" : "Reactivar"}
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-300" title="Sin acciones disponibles para este estatus">
                        Sin acciones
                      </span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
