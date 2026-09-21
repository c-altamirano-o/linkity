"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LifeBuoy, Plus, X, Send } from "lucide-react";
import type { TicketUI, TicketPriority, TicketStatus } from "@/lib/soporte-data";
import { crearTicketAction, responderTicketAction } from "@/app/actions/soporte-actions";

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

const PRIORIDAD_LABEL: Record<TicketPriority, string> = {
  LOW: "Baja",
  NORMAL: "Normal",
  HIGH: "Alta",
  URGENT: "Urgente",
};

export default function SoporteClient({ tickets, tenantSlug }: { tickets: TicketUI[]; tenantSlug: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [seleccionado, setSeleccionado] = useState<string | null>(tickets[0]?.id ?? null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState("");

  // Formulario de ticket nuevo
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("NORMAL");

  const ticketActivo = tickets.find((t) => t.id === seleccionado) ?? null;

  function abrirModal() {
    setSubject("");
    setBody("");
    setPriority("NORMAL");
    setError(null);
    setModalAbierto(true);
  }

  function crear() {
    setError(null);
    startTransition(async () => {
      const res = await crearTicketAction({ tenantSlug, subject, body, priority });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setModalAbierto(false);
      if (res.id) setSeleccionado(res.id);
      router.refresh();
    });
  }

  function enviarRespuesta() {
    if (!ticketActivo || !respuesta.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await responderTicketAction({ tenantSlug, ticketId: ticketActivo.id, body: respuesta });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRespuesta("");
      router.refresh();
    });
  }

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[16px] font-medium text-foreground">Soporte</h1>
          <p className="text-[13.5px] text-muted-foreground">Escríbele al equipo de Linkity si algo no funciona o tienes una duda</p>
        </div>
        <button
          onClick={abrirModal}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground text-[13.5px] font-medium px-3 py-2 rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
          Nuevo ticket
        </button>
      </div>

      {tickets.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-10 text-center">
          <LifeBuoy className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-[14px] font-medium text-foreground mb-1">Aún no has abierto ningún ticket</p>
          <p className="text-[13.5px] text-muted-foreground mb-4">Si tienes una duda o algo no está funcionando, cuéntanos.</p>
          <button
            onClick={abrirModal}
            className="text-[13.5px] font-medium text-primary hover:underline"
          >
            Abrir tu primer ticket
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-[280px_1fr] gap-4">
          {/* Lista */}
          <div className="bg-card border border-border rounded-lg overflow-hidden h-fit">
            {tickets.map((t) => (
              <button
                key={t.id}
                onClick={() => setSeleccionado(t.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-border last:border-0 transition-colors ${
                  t.id === seleccionado ? "bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <p className="text-[13.5px] font-medium text-foreground truncate">{t.subject}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`text-[11.5px] font-medium px-1.5 py-0.5 rounded-full ${ESTADO_COLOR[t.status]}`}>
                    {ESTADO_LABEL[t.status]}
                  </span>
                  <span className="text-[11.5px] text-muted-foreground">{formatFecha(t.updatedAt)}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Detalle */}
          {ticketActivo && (
            <div className="bg-card border border-border rounded-lg flex flex-col">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div>
                  <p className="text-[14.5px] font-medium text-foreground">{ticketActivo.subject}</p>
                  <p className="text-[12.5px] text-muted-foreground">
                    Abierto por {ticketActivo.abiertoPor} · Prioridad {PRIORIDAD_LABEL[ticketActivo.priority]}
                  </p>
                </div>
                <span className={`text-[12.5px] font-medium px-2 py-0.5 rounded-full ${ESTADO_COLOR[ticketActivo.status]}`}>
                  {ESTADO_LABEL[ticketActivo.status]}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[420px]">
                {ticketActivo.mensajes.map((m) => (
                  <div key={m.id} className={`flex ${m.esAdmin ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[75%] rounded-lg px-3 py-2 ${
                      m.esAdmin ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"
                    }`}>
                      <p className="text-[13.5px] whitespace-pre-wrap">{m.body}</p>
                      <p className={`text-[11.5px] mt-1 ${m.esAdmin ? "text-muted-foreground" : "text-primary-foreground/70"}`}>
                        {m.autor} · {formatFecha(m.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {error && <p className="text-[12.5px] text-red-600 px-4">{error}</p>}

              {ticketActivo.status === "CLOSED" ? (
                <p className="text-[12.5px] text-muted-foreground p-4 border-t border-border">
                  Este ticket está cerrado. Si necesitas algo más, abre uno nuevo.
                </p>
              ) : (
                <div className="p-3 border-t border-border flex items-end gap-2">
                  <textarea
                    value={respuesta}
                    onChange={(e) => setRespuesta(e.target.value)}
                    placeholder="Escribe tu mensaje…"
                    rows={2}
                    className="flex-1 text-[13.5px] border border-border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-background"
                  />
                  <button
                    onClick={enviarRespuesta}
                    disabled={isPending || !respuesta.trim()}
                    className="p-2.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-90 transition-opacity"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal nuevo ticket */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-[14.5px] font-medium text-foreground">Nuevo ticket de soporte</p>
              <button onClick={() => setModalAbierto(false)}>
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[12.5px] text-muted-foreground block mb-1">Asunto</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ej. No me deja registrar una venta"
                  className="w-full text-[13.5px] border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-background"
                />
              </div>
              <div>
                <label className="text-[12.5px] text-muted-foreground block mb-1">Prioridad</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TicketPriority)}
                  className="w-full text-[13.5px] border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-background"
                >
                  <option value="LOW">Baja</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">Alta</option>
                  <option value="URGENT">Urgente</option>
                </select>
              </div>
              <div>
                <label className="text-[12.5px] text-muted-foreground block mb-1">Mensaje</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  placeholder="Cuéntanos qué pasó, con el mayor detalle posible…"
                  className="w-full text-[13.5px] border border-border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-background"
                />
              </div>
              {error && <p className="text-[12.5px] text-red-600">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button
                onClick={() => setModalAbierto(false)}
                className="text-[13.5px] text-muted-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={crear}
                disabled={isPending || !subject.trim() || !body.trim()}
                className="text-[13.5px] font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-lg disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {isPending ? "Enviando…" : "Enviar ticket"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
