"use client";

import Link from "next/link";
import { label, type LabelDictionary } from "@/lib/labels";
import { AYUDA_MODULO, PLACEHOLDER_REPARACIONES, MODULO_ICON, MODULO_RUTA } from "@/lib/ayuda-contenido";
import type { ModuloKey } from "@/lib/roles";
import type { EstadoPasosBienvenida } from "@/lib/onboarding";
import { LifeBuoy, CheckCircle2, Circle, ArrowRight, BookMarked } from "lucide-react";

interface AyudaClientProps {
  tenantSlug: string;
  modo: "admin" | "staff";
  userName: string | null;
  userRole: string | null;
  labels: LabelDictionary;
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
  modulosVisibles,
  onboarding,
  weekStartDay,
  cobrarEnDevolucion,
  tieneRfc,
}: AyudaClientProps) {
  const nombreReparaciones = label(labels, "module.repair.name");

  const resolverTexto = (texto: string) => texto.replaceAll(PLACEHOLDER_REPARACIONES, nombreReparaciones);

  const diasSemana = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

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
                : "todavía no capturas un RFC — sin esto, cualquier intento de facturar será rechazado."}
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
              return (
                <Link
                  key={modulo}
                  href={`/${tenantSlug}/${ruta}`}
                  className="rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon className="w-4 h-4 text-primary-text shrink-0" />
                    <span className="text-sm font-medium text-foreground">{label(labels, contenido.labelKey)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{resolverTexto(contenido.esencial)}</p>
                </Link>
              );
            })}
          </div>
        )}
      </section>

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
