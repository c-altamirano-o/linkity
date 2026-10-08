"use client";

import { useState, useTransition } from "react";
import type { PruebaUsadaUI } from "@/lib/pruebas-usadas-data";
import { permitirOtraPruebaAction } from "./actions";

export default function PruebasClient({ pruebas }: { pruebas: PruebaUsadaUI[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const q = busqueda.trim().toLowerCase();
  const visibles = q
    ? pruebas.filter((p) => p.emailCanonico.includes(q) || p.emailOriginal.toLowerCase().includes(q) || (p.tenantSlug ?? "").includes(q))
    : pruebas;

  function permitir(id: string) {
    setError(null);
    setEnCurso(id);
    startTransition(async () => {
      const r = await permitirOtraPruebaAction(id);
      if (!r.ok) setError(r.error);
      setEnCurso(null);
      setConfirmando(null);
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
        <p className="text-[13.5px] font-medium text-slate-800">{pruebas.length} correo(s) registrado(s)</p>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar correo o negocio…"
          className="w-64 px-3 py-1.5 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
        />
      </div>

      {error && <p className="px-4 py-2 text-[12.5px] text-red-600">{error}</p>}

      {visibles.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-slate-400">
          {pruebas.length === 0 ? "Todavía no hay pruebas registradas." : "Sin coincidencias."}
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {visibles.map((p) => (
            <div key={p.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] text-slate-800 truncate">{p.emailOriginal}</p>
                <p className="text-[12px] text-slate-400">
                  Se reconoce como <span className="font-mono">{p.emailCanonico}</span> · {new Date(p.createdAt).toLocaleDateString("es-MX")}
                  {p.tenantSlug ? ` · negocio ${p.tenantSlug}${p.negocioExiste ? "" : " (eliminado)"}` : ""}
                </p>
              </div>
              {confirmando === p.id ? (
                <div className="flex items-center gap-2 text-[12.5px]">
                  <span className="text-slate-500">¿Permitir otra prueba gratis?</span>
                  <button
                    type="button"
                    disabled={enCurso === p.id}
                    onClick={() => permitir(p.id)}
                    className="px-2.5 py-1 rounded-md bg-[#4F46E5] text-white disabled:opacity-50"
                  >
                    {enCurso === p.id ? "Guardando…" : "Sí, permitir"}
                  </button>
                  <button type="button" onClick={() => setConfirmando(null)} className="px-2.5 py-1 rounded-md border border-slate-300 text-slate-600">
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmando(p.id)}
                  className="text-[12.5px] px-2.5 py-1 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Permitir otra prueba
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
