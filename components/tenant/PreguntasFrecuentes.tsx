"use client";

import type { PreguntaFrecuente } from "@/lib/ayuda-contenido";
import { ChevronDown, HelpCircle } from "lucide-react";

interface PreguntasFrecuentesProps {
  preguntas: PreguntaFrecuente[];
  /** Función opcional para resolver el vocabulario del negocio dentro del texto. */
  resolverTexto?: (texto: string) => string;
}

/**
 * Preguntas frecuentes en acordeón (`<details>` nativo: abre con clic o con
 * Enter/Espacio, sin estado en React). Compartido por la Guía rápida y el
 * Manual de referencia. Si no hay preguntas visibles no pinta nada.
 */
export default function PreguntasFrecuentes({ preguntas, resolverTexto }: PreguntasFrecuentesProps) {
  if (preguntas.length === 0) return null;
  const r = resolverTexto ?? ((t: string) => t);
  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
        <HelpCircle className="w-4 h-4 text-primary-text" /> Preguntas frecuentes
      </h2>
      <div className="space-y-2">
        {preguntas.map((p) => (
          <details key={p.pregunta} className="group rounded-xl border border-border bg-card px-4 py-3">
            <summary className="flex items-center justify-between gap-2 cursor-pointer list-none text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
              <span>{r(p.pregunta)}</span>
              <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">{r(p.respuesta)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
