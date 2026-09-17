"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { TenantListRow } from "@/lib/tenants-data";

const ESTADO_CONFIG: Record<string, { label: string; classes: string }> = {
  ACTIVE: { label: "Activo", classes: "bg-emerald-500/10 text-emerald-600" },
  TRIAL: { label: "Prueba", classes: "bg-cyan-500/10 text-cyan-600" },
  SUSPENDED: { label: "Suspendido", classes: "bg-slate-200 text-slate-500" },
  CANCELLED: { label: "Cancelado", classes: "bg-slate-200 text-slate-400" },
};

type FiltroEstado = "todos" | "ACTIVE" | "TRIAL" | "SUSPENDED" | "CANCELLED";

export default function TenantsClient({ tenants }: { tenants: TenantListRow[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroEstado>("todos");

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return tenants.filter((t) => {
      if (filtro !== "todos" && t.subscriptionStatus !== filtro) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        (t.city ?? "").toLowerCase().includes(q) ||
        (t.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [tenants, busqueda, filtro]);

  const chips: { key: FiltroEstado; label: string }[] = [
    { key: "todos", label: `Todos (${tenants.length})` },
    { key: "ACTIVE", label: `Activos (${tenants.filter((t) => t.subscriptionStatus === "ACTIVE").length})` },
    { key: "TRIAL", label: `Prueba (${tenants.filter((t) => t.subscriptionStatus === "TRIAL").length})` },
    { key: "SUSPENDED", label: `Suspendidos (${tenants.filter((t) => t.subscriptionStatus === "SUSPENDED").length})` },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, ciudad o correo…"
            className="w-full pl-8 pr-3 py-1.5 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
          />
        </div>
        <div className="flex gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFiltro(c.key)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                filtro === c.key
                  ? "bg-[#4F46E5] text-white border-[#4F46E5]"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Negocio</th>
              <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Esquema</th>
              <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Estado</th>
              <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Módulos</th>
              <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Sucursales</th>
              <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Usuarios</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[12px] text-slate-400">
                  No hay negocios que coincidan con la búsqueda.
                </td>
              </tr>
            ) : (
              filtrados.map((t) => {
                const cfg = t.subscriptionStatus ? ESTADO_CONFIG[t.subscriptionStatus] : null;
                return (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <Link href={`/maestro/tenants/${t.slug}`} className="text-[12px] font-medium text-slate-800 hover:text-[#4F46E5]">
                        {t.name}
                      </Link>
                      <p className="text-[11px] text-slate-400">{[t.city, t.state].filter(Boolean).join(", ") || "Sin ubicación"}</p>
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-slate-600">{t.esquemaName ?? "Sin límite"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${cfg?.classes ?? "bg-slate-100 text-slate-400"}`}>
                        {cfg?.label ?? "Sin suscripción"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-slate-600">{t.modulosActivos}/{t.modulosTotal}</td>
                    <td className="px-4 py-2.5 text-[12px] text-slate-600">
                      {t.branchesCount}{t.esquemaMaxBranches !== null ? `/${t.esquemaMaxBranches}` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-slate-600">{t.usersCount}</td>
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
