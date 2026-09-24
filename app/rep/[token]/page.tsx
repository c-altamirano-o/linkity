import { notFound } from "next/navigation";
import { CheckCircle2, Circle, MessageCircle, Wrench } from "lucide-react";
import { getReparacionPublica, PASOS_PROGRESO_TEXTO } from "@/lib/reparaciones-data";

/**
 * Página pública de seguimiento (2026-09-24, a petición de Carlos: "la
 * página pública sí debe existir... similar a como uno hace un pedido en
 * Amazon o pide comida en DiDi Food, que el cliente pueda tener un
 * seguimiento en tiempo real del estatus de su equipo"). Ver el comentario
 * largo en lib/reparaciones-data.ts (getReparacionPublica) para el porqué de
 * las decisiones de qué SÍ y qué NO se muestra aquí.
 *
 * Sin layout de tenant (no vive bajo app/(tenant)/[tenant]/) — no requiere
 * sesión, no aplica el tema del negocio, y es alcanzable sin importar cuál
 * sea el slug del tenant: el publicToken por sí solo identifica el equipo.
 * "rep" es un segmento literal — Next.js lo resuelve antes que el
 * [tenant] dinámico de app/(auth)/[tenant]/page.tsx, así que no hay
 * colisión (mismo criterio ya documentado ahí).
 *
 * Se manda un mensaje de WhatsApp automático por cada cambio de estatus:
 * pendiente (ver el hilo de esa conversación con Carlos, aún sin resolver
 * qué ruta de integración usar) — esta página es el destino al que
 * apuntará ese mensaje el día que se conecte.
 */
export default async function ReparacionPublicaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const rep = await getReparacionPublica(token);
  if (!rep) notFound();

  const formatoFecha = (iso: string) =>
    new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const formatoMoneda = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

  const cancelado = rep.estado === "CANCELLED";

  return (
    <div className="min-h-full bg-muted flex justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-1">
          <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{rep.negocio}</p>
          <h1 className="text-lg font-semibold text-foreground">Hola, {rep.clientePrimerNombre}</h1>
          <p className="text-xs text-muted-foreground">
            Folio {rep.folio} · {rep.marca} {rep.modelo}
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="text-center space-y-1">
            <p className={`text-base font-semibold ${cancelado ? "text-destructive" : "text-foreground"}`}>{rep.estadoTexto}</p>
            {rep.fechaEstimada && rep.estado !== "DELIVERED" && !cancelado && (
              <p className="text-xs text-muted-foreground">
                Fecha estimada de entrega: {new Date(rep.fechaEstimada).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}
              </p>
            )}
          </div>

          {!cancelado && (
            <div className="flex items-center justify-between">
              {PASOS_PROGRESO_TEXTO.map((texto, i) => (
                <div key={texto} className="flex-1 flex flex-col items-center gap-1">
                  <div className={`w-full h-1.5 rounded-full ${i === 0 ? "" : "ml-[-50%]"}`} />
                  {i <= rep.paso ? (
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground/40" />
                  )}
                  <span className={`text-[10px] text-center leading-tight ${i <= rep.paso ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {texto}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {rep.mensajeTaller && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
            <MessageCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-800">Mensaje del taller</p>
              <p className="text-xs text-amber-900 mt-0.5">{rep.mensajeTaller.texto}</p>
              <p className="text-[10px] text-amber-700/70 mt-1">{formatoFecha(rep.mensajeTaller.fecha)}</p>
            </div>
          </div>
        )}

        <div className="bg-card border border-border rounded-2xl p-5 space-y-2.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Costo estimado</span>
            <span className="font-medium text-foreground">{rep.costoEstimado != null ? formatoMoneda(rep.costoEstimado) : "—"}</span>
          </div>
          {rep.costoFinal != null && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Costo final</span>
              <span className="font-medium text-foreground">{formatoMoneda(rep.costoFinal)}</span>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-3">
            <Wrench className="w-3.5 h-3.5" /> Avance
          </p>
          <div className="space-y-3">
            {rep.checkpoints.map((c, i) => (
              <div key={i} className="flex gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-foreground">{c.texto}</p>
                  <p className="text-[10.5px] text-muted-foreground">{formatoFecha(c.fecha)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-[10.5px] text-muted-foreground pt-2">Powered by Linkity Soluciones</p>
      </div>
    </div>
  );
}
