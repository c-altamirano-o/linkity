"use client";

import { useState } from "react";
import Link from "next/link";
import { label, type LabelDictionary } from "@/lib/labels";
import { AYUDA_MODULO, MODULO_ICON, MODULO_RUTA, PREGUNTAS_FRECUENTES } from "@/lib/ayuda-contenido";
import PreguntasFrecuentes from "@/components/tenant/PreguntasFrecuentes";
import { resolverTextoVocabulario, flujosVisibles } from "@/lib/textos-vocabulario";
import type { ModuloKey } from "@/lib/roles";
import type { EstadoPasosBienvenida } from "@/lib/onboarding";
import { LifeBuoy, CheckCircle2, Circle, ArrowRight, BookMarked, ChevronDown, ChevronRight, PlayCircle } from "lucide-react";

interface AyudaClientProps {
  tenantSlug: string;
  modo: "admin" | "staff";
  userName: string | null;
  userRole: string | null;
  labels: LabelDictionary;
  businessType: string | null;
  modulosVisibles: ModuloKey[];
  onboarding: EstadoPasosBienvenida | null;
  weekStartDay: number;
  cobrarEnDevolucion: boolean;
  tieneRfc: boolean;
}

export default function AyudaClient({
  tenantSlug,
  modo,
  userName,
  userRole,
  labels,
  businessType,
  modulosVisibles,
  onboarding,
  weekStartDay,
  cobrarEnDevolucion,
  tieneRfc,
}: AyudaClientProps) {
  const nombreReparaciones = label(labels, "module.repair.name");
  const resolverTexto = (texto: string) => resolverTextoVocabulario(texto, labels);

  const diasSemana = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

  // "Cómo lo harás" (2026-10-02, a petición de Carlos — revisó la primera
  // versión y señaló que explicar "para qué es cada menú" sin explicar "el
  // cómo" no reduce llamadas de soporte, que era justo el objetivo). Cada
  // tarjeta se puede expandir sin salir de /ayuda para ver los pasos
  // (AYUDA_MODULO[modulo].flujos) — "Ir al módulo" sigue siendo un link
  // aparte, nunca toda la tarjeta, para no competir con el toggle de expandir.
  const [expandidos, setExpandidos] = useState<Set<ModuloKey>>(new Set());
  const toggleExpandido = (modulo: ModuloKey) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(modulo)) next.delete(modulo);
      else next.add(modulo);
      return next;
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Guía rápida</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {modo === "admin"
            ? "Lo que necesitas configurar y saber para arrancar tu negocio en Linkity, sin perderte en todo lo que el sistema puede hacer."
            : `Hola${userName ? `, ${userName}` : ""} — esto es lo que tu rol${userRole ? ` (${userRole})` : ""} puede usar en Linkity.`}
        </p>
      </div>

      {modo === "admin" && onboarding && (
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Primeros pasos</h2>
            <span className="text-xs text-muted-foreground">{onboarding.completados} de {onboarding.total}</span>
          </div>
          <div className="space-y-2">
            {[
              { done: onboarding.personalizado, titulo: "Personaliza tu negocio", href: "configuracion" },
              { done: onboarding.tieneCatalogo, titulo: "Arma tu catálogo", href: "catalogo" },
              { done: onboarding.tieneEquipo, titulo: "Da de alta a tu equipo", href: "personal" },
              { done: onboarding.tieneCaja, titulo: "Abre tu caja", href: "caja" },
              { done: onboarding.tieneVenta, titulo: "Registra tu primera venta", href: "pos" },
            ].map((paso) => (
              <Link
                key={paso.titulo}
                href={`/${tenantSlug}/${paso.href}`}
                className="flex items-center gap-2 text-sm hover:underline"
              >
                {paso.done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <span className={paso.done ? "text-muted-foreground" : "text-foreground"}>{paso.titulo}</span>
              </Link>
            ))}
          </div>
          <Link href={`/${tenantSlug}/bienvenida`} className="inline-flex items-center gap-1 text-xs text-primary-text mt-4 hover:underline">
            Ver el checklist completo <ArrowRight className="w-3 h-3" />
          </Link>
        </section>
      )}

      {modo === "admin" && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Lo que no puedes omitir (y por qué)</h2>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li>
              <span className="text-foreground font-medium">Tipo de negocio (Configuración):</span> cambia los nombres
              y qué módulos están disponibles en TODO el sistema — por ejemplo, &quot;{nombreReparaciones}&quot; se
              llama distinto según el giro. Elígelo con cuidado antes de empezar a cargar información.
            </li>
            <li>
              <span className="text-foreground font-medium">Día de inicio de semana (Configuración):</span> hoy está en{" "}
              <strong className="text-foreground">{diasSemana[weekStartDay]}</strong> — de ahí parte el Dashboard, Personal
              y Asistencia para calcular &quot;esta semana&quot;. Cambiarlo más adelante corre el riesgo de que tus
              reportes de semanas pasadas se vean distintos a como los recuerdas.
            </li>
            <li>
              <span className="text-foreground font-medium">Cobrar en devolución (Configuración):</span>{" "}
              {cobrarEnDevolucion
                ? "está ACTIVO — cuando un equipo no se pudo reparar, el sistema manda a cobrar un monto a Punto de Venta antes de entregarlo."
                : "está apagado — cuando un equipo no se pudo reparar, se entrega sin cobrar nada. Actívalo en Configuración si tu negocio sí cobra por el diagnóstico."}{" "}
              Es una sola regla para todo el negocio, no por sucursal.
            </li>
            <li>
              <span className="text-foreground font-medium">Datos fiscales (Configuración/Facturación):</span>{" "}
              {tieneRfc
                ? "ya tienes un RFC capturado."
                : "todavía no capturas un RFC — captúralo cuanto antes. Hoy el sistema no te lo exige para generar o timbrar una factura (el timbrado de este módulo es simulado, sin PAC/SAT real conectado), pero sí lo necesitarás en cuanto ese CFDI tenga que ser real."}
            </li>
            <li>
              <span className="text-foreground font-medium">Da de alta a tu equipo con su rol correcto (Personal):</span>{" "}
              un rol mal configurado puede dejar a un empleado sin ver el módulo que necesita para trabajar, o
              dejarlo ver más de lo que debería (ej. montos de caja de otra sucursal).
            </li>
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">
          {modo === "admin" ? "Qué hace cada módulo" : "Tus módulos"}
        </h2>
        {modulosVisibles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Tu rol todavía no tiene ningún módulo asignado — pídele a tu administrador que revise tus permisos en
            Personal.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {modulosVisibles.map((modulo) => {
              const contenido = AYUDA_MODULO[modulo];
              const Icon = MODULO_ICON[modulo];
              const ruta = MODULO_RUTA[modulo] ?? modulo;
              const abierto = expandidos.has(modulo);
              const flujos = flujosVisibles(contenido.flujos, labels, businessType);
              const tienePasos = flujos.length > 0;
              return (
                <div key={modulo} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <Link href={`/${tenantSlug}/${ruta}`} className="flex items-center gap-2 min-w-0 hover:underline">
                      <Icon className="w-4 h-4 text-primary-text shrink-0" />
                      <span className="text-sm font-medium text-foreground truncate">{label(labels, contenido.labelKey)}</span>
                    </Link>
                    <Link href={`/${tenantSlug}/${ruta}`} className="text-xs text-muted-foreground hover:text-foreground shrink-0 inline-flex items-center gap-0.5">
                      Ir <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                  <p className="text-xs text-muted-foreground">{resolverTexto(contenido.esencial)}</p>
                  {tienePasos && (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleExpandido(modulo)}
                        className="inline-flex items-center gap-1 text-xs text-primary-text mt-2 hover:underline"
                        aria-expanded={abierto}
                      >
                        {abierto ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        {abierto ? "Ocultar cómo hacerlo" : "Ver cómo hacerlo"}
                      </button>
                      {abierto && (
                        <div className="mt-2 pt-2 border-t border-border space-y-3">
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
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <PreguntasFrecuentes
        preguntas={PREGUNTAS_FRECUENTES.filter((p) => modulosVisibles.includes(p.modulo))}
        resolverTexto={resolverTexto}
      />

      <section className="flex flex-wrap items-center gap-4 text-sm pt-2 border-t border-border">
        <Link href={`/${tenantSlug}/ayuda/manual`} className="inline-flex items-center gap-1.5 text-primary-text hover:underline">
          <BookMarked className="w-4 h-4" /> Ver el manual completo
        </Link>
        <Link href={`/${tenantSlug}/soporte`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:underline">
          <LifeBuoy className="w-4 h-4" /> ¿Nada de esto resolvió tu duda? Abre un ticket
        </Link>
      </section>
    </div>
  );
}
