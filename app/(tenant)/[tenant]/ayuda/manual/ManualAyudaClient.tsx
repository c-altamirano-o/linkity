"use client";

import { useState } from "react";
import Link from "next/link";
import { label, type LabelDictionary } from "@/lib/labels";
import { AYUDA_MODULO, AYUDA_SECCIONES, MODULO_ICON, MODULO_RUTA, PREGUNTAS_FRECUENTES } from "@/lib/ayuda-contenido";
import PreguntasFrecuentes from "@/components/tenant/PreguntasFrecuentes";
import { resolverTextoVocabulario, flujosVisibles } from "@/lib/textos-vocabulario";
import type { ModuloKey } from "@/lib/roles";
import { ChevronDown, LifeBuoy, PlayCircle } from "lucide-react";

interface ManualAyudaClientProps {
  tenantSlug: string;
  labels: LabelDictionary;
  businessType: string | null;
  modulosInactivos: Set<string>;
}

export default function ManualAyudaClient({ tenantSlug, labels, businessType, modulosInactivos }: ManualAyudaClientProps) {
  // Un solo módulo expandido a la vez por sección sería más restrictivo de
  // lo necesario — se guarda el set completo de los que están abiertos, sin
  // límite, para que explorar varios módulos a la vez no colapse el
  // anterior.
  const [expandidos, setExpandidos] = useState<Set<ModuloKey>>(new Set());

  const toggleExpandido = (modulo: ModuloKey) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(modulo)) next.delete(modulo);
      else next.add(modulo);
      return next;
    });
  };

  const resolverTexto = (texto: string) => resolverTextoVocabulario(texto, labels);

  const secciones = AYUDA_SECCIONES
    .map((seccion) => ({ ...seccion, modulos: seccion.modulos.filter((m) => !modulosInactivos.has(m)) }))
    .filter((seccion) => seccion.modulos.length > 0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Manual de referencia</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Todo lo que Linkity puede hacer, módulo por módulo — abre cualquiera para ver el detalle. Si solo quieres
          saber por dónde empezar,{" "}
          <Link href={`/${tenantSlug}/ayuda`} className="text-primary-text hover:underline">
            ve la Guía rápida
          </Link>
          .
        </p>
      </div>

      {secciones.map((seccion) => (
        <section key={seccion.titulo}>
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground mb-3">{seccion.titulo}</h2>
          <div className="space-y-2">
            {seccion.modulos.map((modulo) => {
              const contenido = AYUDA_MODULO[modulo];
              const Icon = MODULO_ICON[modulo];
              const ruta = MODULO_RUTA[modulo] ?? modulo;
              const abierto = expandidos.has(modulo);
              const flujos = flujosVisibles(contenido.flujos, labels, businessType);
              return (
                <div key={modulo} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="flex items-start gap-3 p-4">
                    <Icon className="w-4 h-4 text-primary-text shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/${tenantSlug}/${ruta}`} className="text-sm font-medium text-foreground hover:underline">
                          {label(labels, contenido.labelKey)}
                        </Link>
                        {(contenido.avanzado || flujos.length > 0) && (
                          <button
                            type="button"
                            onClick={() => toggleExpandido(modulo)}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0"
                            aria-expanded={abierto}
                          >
                            {abierto ? "Ver menos" : "Ver más"}
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} />
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{resolverTexto(contenido.esencial)}</p>
                      {abierto && (
                        <div className="mt-2 pt-2 border-t border-border space-y-3">
                          {contenido.avanzado && (
                            <p className="text-xs text-muted-foreground">{resolverTexto(contenido.avanzado)}</p>
                          )}
                          {flujos.map((flujo) => (
                            <div key={flujo.titulo}>
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <p className="text-xs font-medium text-foreground">{flujo.titulo}</p>
                                {flujo.tourId && (
                                  <Link
                                    href={`/${tenantSlug}/${ruta}?tour=${flujo.tourId}`}
                                    className="inline-flex items-center gap-1 text-[11px] text-primary-text hover:underline shrink-0"
                                  >
                                    <PlayCircle className="w-3.5 h-3.5" /> Muéstrame cómo
                                  </Link>
                                )}
                              </div>
                              <ol className="list-decimal list-inside space-y-0.5">
                                {flujo.pasos.map((paso, i) => (
                                  <li key={i} className="text-xs text-muted-foreground">{paso}</li>
                                ))}
                              </ol>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <PreguntasFrecuentes
        preguntas={PREGUNTAS_FRECUENTES.filter((p) => !modulosInactivos.has(p.modulo))}
        resolverTexto={resolverTexto}
      />

      <section className="pt-2 border-t border-border">
        <Link href={`/${tenantSlug}/soporte`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:underline">
          <LifeBuoy className="w-4 h-4" /> ¿Nada de esto resolvió tu duda? Abre un ticket
        </Link>
      </section>
    </div>
  );
}
