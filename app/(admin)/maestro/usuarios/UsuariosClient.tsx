"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Ban, CheckCircle2 } from "lucide-react";
import type { UsuarioRow } from "@/lib/usuarios-data";
import { alternarUsuarioActivoAction } from "./actions";

const formatFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

type Filtro = "todos" | "activos" | "inactivos";

export default function UsuariosClient({ usuarios }: { usuarios: UsuarioRow[] }) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [isPending, startTransition] = useTransition();
  const [gestionando, setGestionando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return usuarios.filter((u) => {
      if (filtro === "activos" && !u.isActive) return false;
      if (filtro === "inactivos" && u.isActive) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.tenantName.toLowerCase().includes(q)
      );
    });
  }, [usuarios, busqueda, filtro]);

  function alternar(userId: string, activo: boolean) {
    setError(null);
    setGestionando(userId);
    startTransition(async () => {
      const res = await alternarUsuarioActivoAction({ userId, activo });
      setGestionando(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  const activos = usuarios.filter((u) => u.isActive).length;
  const inactivos = usuarios.length - activos;

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-[12.5px] text-slate-500 mb-1">Total de cuentas</p>
          <p className="text-2xl font-medium text-slate-800">{usuarios.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-[12.5px] text-slate-500 mb-1">Activas</p>
          <p className="text-2xl font-medium text-emerald-600">{activos}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-[12.5px] text-slate-500 mb-1">Desactivadas</p>
          <p className="text-2xl font-medium text-slate-800">{inactivos}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, correo o negocio…"
            className="w-full pl-8 pr-3 py-1.5 text-[13.5px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
          />
        </div>
        <div className="flex gap-1.5">
          {([
            { key: "todos", label: "Todos" },
            { key: "activos", label: "Activos" },
            { key: "inactivos", label: "Desactivados" },
          ] as { key: Filtro; label: string }[]).map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFiltro(c.key)}
              className={`text-[12.5px] px-2.5 py-1 rounded-full border transition-colors ${
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

      {error && <p className="text-[12.5px] text-red-600 mb-2">{error}</p>}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left text-[12.5px] font-medium text-slate-500 px-4 py-2.5">Usuario</th>
              <th className="text-left text-[12.5px] font-medium text-slate-500 px-4 py-2.5">Negocio</th>
              <th className="text-left text-[12.5px] font-medium text-slate-500 px-4 py-2.5">Rol</th>
              <th className="text-left text-[12.5px] font-medium text-slate-500 px-4 py-2.5">Desde</th>
              <th className="text-left text-[12.5px] font-medium text-slate-500 px-4 py-2.5">Estado</th>
              <th className="text-left text-[12.5px] font-medium text-slate-500 px-4 py-2.5">Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[13.5px] text-slate-400">
                  No hay usuarios que coincidan con la búsqueda.
                </td>
              </tr>
            ) : (
              filtrados.map((u) => {
                const enCurso = isPending && gestionando === u.id;
                return (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <p className="text-[13.5px] font-medium text-slate-800">{u.name}</p>
                      <p className="text-[12.5px] text-slate-400">{u.email}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/maestro/tenants/${u.tenantSlug}`} className="text-[13.5px] text-slate-600 hover:text-[#4F46E5]">
                        {u.tenantName}
                      </Link>
                      {u.branchName && <p className="text-[12.5px] text-slate-400">{u.branchName}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-[13.5px] text-slate-600">{u.roleName ?? "Sin rol"}</td>
                    <td className="px-4 py-2.5 text-[13.5px] text-slate-600">{formatFecha(u.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[12.5px] font-medium px-2 py-0.5 rounded-full ${
                        u.isActive ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-200 text-slate-500"
                      }`}>
                        {u.isActive ? "Activo" : "Desactivado"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {u.isActive ? (
                        <button
                          type="button"
                          disabled={enCurso}
                          onClick={() => alternar(u.id, false)}
                          className="text-[12.5px] text-red-600 border border-red-200 hover:border-red-300 disabled:opacity-50 px-2 py-1 rounded transition-colors flex items-center gap-1"
                        >
                          <Ban className="w-3 h-3" />
                          {enCurso ? "Desactivando…" : "Desactivar"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={enCurso}
                          onClick={() => alternar(u.id, true)}
                          className="text-[12.5px] text-emerald-600 border border-emerald-200 hover:border-emerald-300 disabled:opacity-50 px-2 py-1 rounded transition-colors flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {enCurso ? "Reactivando…" : "Reactivar"}
                        </button>
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
