"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Ticket, Send, CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import type { TicketAdminUI, TicketStatus } from "@/lib/maestro-soporte-data";
import { responderTicketAdminAction, cambiarEstadoTicketAction } from "./actions";

const formatFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const ESTADO_LABEL: Record<TicketStatus, string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En progreso",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
};

const ESTADO_COLOR: Record<TicketStatus, string> = {
  OPEN: "bg-amber-500/10 text-amber-600",
  IN_PROGRESS: "bg-blue-500/10 text-blue-600",
  RESOLVED: "bg-emerald-500/10 text-emerald-600",
  CLOSED: "bg-slate-200 text-slate-500",
};

const PRIORIDAD_COLOR: Record<string, string> = {
  LOW: "text-slate-400",
  NORMAL: "text-slate-500",
  HIGH: "text-amber-600",
  URGENT: "text-red-600",
};

const PRIORIDAD_LABEL: Record<string, string> = {
  LOW: "Baja",
  NORMAL: "Normal",
  HIGH: "Alta",
  URGENT: "Urgente",
};

type Filtro = "abiertos" | "todos" | "cerrados";

export default function SoporteClient({ tickets }: { tickets: TicketAdminUI[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filtro, setFiltro] = useState<Filtro>("abiertos");
  const [seleccionado, setSeleccionado] = useState<string | null>(
    tickets.find((t) => t.status === "OPEN" || t.status === "IN_PROGRESS")?.id ?? tickets[0]?.id ?? null
  );
  const [respuesta, setRespuesta] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    if (filtro === "todos") return tickets;
    if (filtro === "cerrados") return tickets.filter((t) => t.status === "CLOSED" || t.status === "RESOLVED");
    return tickets.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS");
  }, [tickets, filtro]);

  const ticketActivo = tickets.find((t) => t.id === seleccionado) ?? null;

  function enviarRespuesta() {
    if (!ticketActivo || !respuesta.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await responderTicketAdminAction({ ticketId: ticketActivo.id, body: respuesta });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRespuesta("");
      router.refresh();
    });
  }

  function cambiarEstado(status: TicketStatus) {
    if (!ticketActivo) return;
    setError(null);
    startTransition(async () => {
      const res = await cambiarEstadoTicketAction({ ticketId: ticketActivo.id, status });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  const abiertos = tickets.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS").length;

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-[11px] text-slate-500 mb-1">Total de tickets</p>
          <p className="text-2xl font-medium text-slate-800">{tickets.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-[11px] text-slate-500 mb-1">Necesitan atención</p>
          <p className="text-2xl font-medium text-amber-600">{abiertos}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <p className="text-[11px] text-slate-500 mb-1">Resueltos / cerrados</p>
          <p className="text-2xl font-medium text-slate-800">{tickets.length - abiertos}</p>
        </div>
      </div>

      <div className="flex gap-1.5 mb-3">
        {([
          { key: "abiertos", label: "Necesitan atención" },
          { key: "todos", label: "Todos" },
          { key: "cerrados", label: "Resueltos / cerrados" },
        ] as { key: Filtro; label: string }[]).map((c) => (
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

      {filtrados.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
          <Ticket className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-[13px] font-medium text-slate-700">No hay tickets en este filtro</p>
        </div>
      ) : (
        <div className="grid grid-cols-[300px_1fr] gap-4">
          {/* Lista */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden h-fit">
            {filtrados.map((t) => (
              <button
                key={t.id}
                onClick={() => setSeleccionado(t.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-slate-100 last:border-0 transition-colors ${
                  t.id === seleccionado ? "bg-[#4F46E5]/5" : "hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-medium text-slate-800 truncate">{t.subject}</p>
                  <span className={`text-[10px] font-medium flex-shrink-0 ${PRIORIDAD_COLOR[t.priority]}`}>
                    {PRIORIDAD_LABEL[t.priority]}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">{t.tenantName}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${ESTADO_COLOR[t.status]}`}>
                    {ESTADO_LABEL[t.status]}
                  </span>
                  <span className="text-[10px] text-slate-400">{formatFecha(t.updatedAt)}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Detalle */}
          {ticketActivo && (
            <div className="bg-white border border-slate-200 rounded-lg flex flex-col">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium text-slate-800">{ticketActivo.subject}</p>
                  <p className="text-[11px] text-slate-500">
                    <Link href={`/maestro/tenants/${ticketActivo.tenantSlug}`} className="hover:text-[#4F46E5]">
                      {ticketActivo.tenantName}
                    </Link>
                    {" · "}Abierto por {ticketActivo.abiertoPor} · Prioridad {PRIORIDAD_LABEL[ticketActivo.priority]}
                  </p>
                </div>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${ESTADO_COLOR[ticketActivo.status]}`}>
                  {ESTADO_LABEL[ticketActivo.status]}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[380px]">
                {ticketActivo.mensajes.map((m) => (
                  <div key={m.id} className={`flex ${m.esAdmin ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-lg px-3 py-2 ${
                      m.esAdmin ? "bg-[#4F46E5] text-white" : "bg-slate-100 text-slate-800"
                    }`}>
                      <p className="text-[12px] whitespace-pre-wrap">{m.body}</p>
                      <p className={`text-[10px] mt-1 ${m.esAdmin ? "text-white/70" : "text-slate-400"}`}>
                        {m.autor} · {formatFecha(m.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {error && <p className="text-[11px] text-red-600 px-4">{error}</p>}

              <div className="p-3 border-t border-slate-200 flex items-end gap-2">
                <textarea
                  value={respuesta}
                  onChange={(e) => setRespuesta(e.target.value)}
                  placeholder="Responder al negocio…"
                  rows={2}
                  disabled={ticketActivo.status === "CLOSED"}
                  className="flex-1 text-[12px] border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] disabled:bg-slate-50 disabled:text-slate-400"
                />
                <button
                  onClick={enviarRespuesta}
                  disabled={isPending || !respuesta.trim() || ticketActivo.status === "CLOSED"}
                  className="p-2.5 rounded-lg bg-[#4F46E5] text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-1.5 px-3 pb-3">
                {ticketActivo.status !== "RESOLVED" && ticketActivo.status !== "CLOSED" && (
                  <button
                    onClick={() => cambiarEstado("RESOLVED")}
                    disabled={isPending}
                    className="flex items-center gap-1 text-[11px] text-emerald-600 border border-emerald-200 hover:border-emerald-300 disabled:opacity-50 px-2 py-1 rounded transition-colors"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Marcar resuelto
                  </button>
                )}
                {ticketActivo.status !== "CLOSED" && (
                  <button
                    onClick={() => cambiarEstado("CLOSED")}
                    disabled={isPending}
                    className="flex items-center gap-1 text-[11px] text-slate-600 border border-slate-200 hover:border-slate-300 disabled:opacity-50 px-2 py-1 rounded transition-colors"
                  >
                    <XCircle className="w-3 h-3" />
                    Cerrar ticket
                  </button>
                )}
                {(ticketActivo.status === "RESOLVED" || ticketActivo.status === "CLOSED") && (
                  <button
                    onClick={() => cambiarEstado("OPEN")}
                    disabled={isPending}
                    className="flex items-center gap-1 text-[11px] text-[#4F46E5] border border-[#4F46E5]/30 hover:border-[#4F46E5] disabled:opacity-50 px-2 py-1 rounded transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reabrir
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
