import { notFound } from "next/navigation";
import { MessageCircle, Wrench } from "lucide-react";
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
            // 2026-09-29, rediseño a petición de Carlos (el círculo se
            // desalineaba cuando una etiqueta ocupaba 2 líneas, y la barra
            // "conectora" era un div vacío sin color, nunca se vio como tal).
            // Ahora es un grid de 2 filas: la fila de arriba (altura fija,
            // h-5) tiene la línea + los círculos superpuestos con posición
            // absoluta, así el texto de abajo nunca puede mover un círculo.
            // La línea se rellena del color del tema hasta la mitad del
            // segmento siguiente al último paso completado (igual que el
            // dibujo de referencia de Carlos), nunca hasta el punto
            // siguiente completo — eso se reserva para cuando ese paso en
            // verdad se complete.
            (() => {
              const segmentos = PASOS_PROGRESO_TEXTO.length - 1;
              const porcentajeSegmento = 80 / segmentos;
              const relleno = rep.paso >= segmentos ? 80 : rep.paso * porcentajeSegmento + porcentajeSegmento / 2;
              return (
                <div className="grid gap-y-1.5" style={{ gridTemplateColumns: `repeat(${PASOS_PROGRESO_TEXTO.length}, 1fr)` }}>
                  <div className="col-span-full relative h-5">
                    <div className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-muted" style={{ left: "10%", right: "10%" }} />
                    <div className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-primary" style={{ left: "10%", width: `${relleno}%` }} />
                    <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${PASOS_PROGRESO_TEXTO.length}, 1fr)` }}>
                      {PASOS_PROGRESO_TEXTO.map((texto, i) => (
                        <div key={texto} className="flex items-center justify-center">
                          <div
                            className={
                              i <= rep.paso
                                ? "w-5 h-5 rounded-full bg-primary"
                                : "w-5 h-5 rounded-full bg-card border-2 border-muted-foreground/40"
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  {PASOS_PROGRESO_TEXTO.map((texto, i) => (
                    <span
                      key={texto}
                      className={`text-[10px] text-center leading-tight ${i <= rep.paso ? "text-foreground font-bold" : "text-muted-foreground"}`}
                    >
                      {texto}
                    </span>
                  ))}
                </div>
              );
            })()
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
