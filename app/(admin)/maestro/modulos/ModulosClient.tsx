"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ModuloAdopcionRow } from "@/lib/modulos-data";

export default function ModulosClient({ modulos }: { modulos: ModuloAdopcionRow[] }) {
  const [expandido, setExpandido] = useState<string | null>(null);

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Módulo</th>
            <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Adopción</th>
            <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {modulos.map((m) => {
            const abierto = expandido === m.code;
            const pct = m.totalTenants > 0 ? Math.round((m.activosCount / m.totalTenants) * 100) : 0;
            return (
              <Fragment key={m.code}>
                <tr
                  onClick={() => setExpandido(abierto ? null : m.code)}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-2.5">
                    <p className="text-[12px] font-medium text-slate-800">
                      {m.name}
                      {m.isCore && <span className="text-[10px] text-slate-400 font-normal"> · núcleo (todos lo tienen)</span>}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-28 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-[#4F46E5]" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11px] text-slate-500">{m.activosCount}/{m.totalTenants}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {abierto ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 inline" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 inline" />}
                  </td>
                </tr>
                {abierto && (
                  <tr key={`${m.code}-detalle`} className="bg-slate-50/60 border-b border-slate-100">
                    <td colSpan={3} className="px-4 py-3">
                      <div className="grid grid-cols-2 gap-4 text-[12px]">
                        <div>
                          <p className="text-slate-400 mb-1.5">Lo tienen activo ({m.tenantsActivos.length})</p>
                          {m.tenantsActivos.length === 0 ? (
                            <p className="text-slate-300">Ninguno todavía.</p>
                          ) : (
                            <div className="space-y-1">
                              {m.tenantsActivos.map((t) => (
                                <Link key={t.id} href={`/maestro/tenants/${t.slug}`} className="block text-slate-700 hover:text-[#4F46E5]">
                                  {t.name}
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-slate-400 mb-1.5">No lo tienen ({m.tenantsInactivos.length})</p>
                          {m.tenantsInactivos.length === 0 ? (
                            <p className="text-slate-300">Todos lo tienen.</p>
                          ) : (
                            <div className="space-y-1">
                              {m.tenantsInactivos.map((t) => (
                                <Link key={t.id} href={`/maestro/tenants/${t.slug}`} className="block text-slate-500 hover:text-[#4F46E5]">
                                  {t.name}
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
