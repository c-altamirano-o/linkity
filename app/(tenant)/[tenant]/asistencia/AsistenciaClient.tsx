"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Search, Building2, Calendar, LogIn, LogOut, X, Info } from "lucide-react";
import type { RegistroAsistencia } from "@/lib/asistencia-data";
import { cerrarAsistenciaManualAction } from "@/app/actions/asistencia-actions";

interface BranchOption {
  id: string;
  name: string;
}

interface AsistenciaClientProps {
  registros: RegistroAsistencia[];
  branches: BranchOption[];
  tenantSlug: string;
}

const TODAS_SUCURSALES_ID = "__todas__";

const PERIODOS = ["Hoy", "Semana", "Mes", "Todo"] as const;
type Periodo = (typeof PERIODOS)[number];

// Mismo offset fijo (UTC-6) y mismo criterio de "día calendario" que usa el
// resto del proyecto para filtros de período (ver mxParts en
// CatalogoClient.tsx/DashboardClient.tsx) — duplicado aquí a propósito
// porque cada Client Component trae su propia copia chica de este helper,
// no hay un lib/fechas.ts compartido todavía.
const MX_OFFSET_MS = 6 * 60 * 60 * 1000;
function mxParts(d: Date) {
  const mx = new Date(d.getTime() - MX_OFFSET_MS);
  return { y: mx.getUTCFullYear(), m: mx.getUTCMonth(), day: mx.getUTCDate() };
}

function coincidePeriodo(fechaISO: string, periodo: Periodo): boolean {
  if (periodo === "Todo") return true;
  const fecha = new Date(fechaISO);
  const ahora = new Date();
  if (periodo === "Hoy") {
    const hoy = mxParts(ahora);
    const f = mxParts(fecha);
    return f.y === hoy.y && f.m === hoy.m && f.day === hoy.day;
  }
  if (periodo === "Semana") {
    const diffDias = Math.floor((ahora.getTime() - fecha.getTime()) / (24 * 3600 * 1000));
    return diffDias >= 0 && diffDias < 7;
  }
  // "Mes"
  const hoy = mxParts(ahora);
  const f = mxParts(fecha);
  return f.y === hoy.y && f.m === hoy.m;
}

function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatDuracion(checkInISO: string, checkOutISO: string | null): string {
  const inicio = new Date(checkInISO).getTime();
  const fin = checkOutISO ? new Date(checkOutISO).getTime() : Date.now();
  const minutos = Math.max(0, Math.round((fin - inicio) / 60_000));
  const horas = Math.floor(minutos / 60);
  const mins = minutos % 60;
  return horas === 0 ? `${mins} min` : `${horas}h ${mins}min`;
}

export default function AsistenciaClient({ registros, branches, tenantSlug }: AsistenciaClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sucursal, setSucursal] = useState(TODAS_SUCURSALES_ID);
  const [periodo, setPeriodo] = useState<Periodo>("Semana");
  const [busqueda, setBusqueda] = useState("");
  const [cerrando, setCerrando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return registros.filter((r) => {
      const matchSucursal = sucursal === TODAS_SUCURSALES_ID || r.branchId === sucursal;
      const matchPeriodo = coincidePeriodo(r.checkIn, periodo);
      const matchBusqueda = !q || r.staffName.toLowerCase().includes(q);
      return matchSucursal && matchPeriodo && matchBusqueda;
    });
  }, [registros, sucursal, periodo, busqueda]);

  const abiertosAhora = registros.filter((r) => r.abierta).length;

  function cerrarAhora(registroId: string) {
    setError(null);
    setCerrando(registroId);
    startTransition(async () => {
      const res = await cerrarAsistenciaManualAction({ tenantSlug, registroId });
      setCerrando(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="p-3 sm:p-4 flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <CalendarCheck className="w-5 h-5 text-primary" /> Asistencia
        </h1>
        <p className="text-sm text-muted-foreground">
          A qué hora entró y salió cada empleado de verdad, según su inicio de sesión con PIN — aparte del registro manual de nómina en Personal.
        </p>
      </div>

      <div className="flex items-start gap-2 px-3 py-2.5 bg-primary/5 border border-primary/20 rounded-xl">
        <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground">
          Cada sesión se cierra sola en cuanto cambia el día, así nadie puede quedar marcado como &quot;adentro&quot; de un día para otro sin volver a teclear su PIN. Si ves un registro sin salida el mismo día, puedes cerrarlo a mano con &quot;Cerrar ahora&quot;.
        </p>
      </div>

      {abiertosAhora > 0 && (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 w-fit">
          {abiertosAhora} sesión{abiertosAhora === 1 ? "" : "es"} activa{abiertosAhora === 1 ? "" : "s"} en este momento.
        </p>
      )}

      <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-2 sm:gap-3 p-3 bg-card border border-border rounded-xl">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar empleado…"
            className="w-full pl-7 pr-3 py-1.5 border border-border rounded-lg text-xs bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <select
            value={sucursal}
            onChange={(e) => setSucursal(e.target.value)}
            className="px-2 py-1.5 border border-border rounded-lg text-xs bg-muted focus:outline-none focus:border-primary"
          >
            <option value={TODAS_SUCURSALES_ID}>Todas las sucursales</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          {PERIODOS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                periodo === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-[11px] text-red-600">{error}</p>}

      <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-muted border-b border-border">
              <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2.5">Empleado</th>
              <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2.5">Sucursal</th>
              <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2.5">Entrada</th>
              <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2.5">Salida</th>
              <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2.5">Duración</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Sin registros de asistencia en este filtro.
                </td>
              </tr>
            ) : (
              filtrados.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="px-3 py-2.5 text-xs font-medium text-foreground">{r.staffName}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.branchName}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <LogIn className="w-3 h-3 text-emerald-500 flex-shrink-0" /> {formatFechaHora(r.checkIn)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {r.checkOut ? (
                      <span className="flex items-center gap-1">
                        <LogOut className="w-3 h-3 text-amber-500 flex-shrink-0" /> {formatFechaHora(r.checkOut)}
                        {r.closedBy === "DATE_ROLLOVER" && (
                          <span className="text-[9px] text-muted-foreground/70">(automático)</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600 font-medium">Sigue dentro</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{formatDuracion(r.checkIn, r.checkOut)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {r.abierta && (
                      <button
                        disabled={isPending && cerrando === r.id}
                        onClick={() => cerrarAhora(r.id)}
                        className="flex items-center gap-1 text-[10px] font-medium text-red-600 hover:text-red-700 disabled:opacity-50 ml-auto"
                      >
                        <X className="w-3 h-3" /> Cerrar ahora
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
