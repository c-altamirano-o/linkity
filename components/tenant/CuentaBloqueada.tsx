import Link from "next/link";
import { Lock } from "lucide-react";
import type { EtapaCiclo } from "@/lib/ciclo-suscripcion";

/**
 * Pantalla que ve TODO el negocio (dueño y personal por igual) cuando su
 * suscripción quedó bloqueada — 2026-09-22, a petición de Carlos. Se
 * renderiza directamente desde [tenant]/layout.tsx EN VEZ de TenantShell,
 * a propósito: no tiene sentido mostrar el menú completo de módulos si de
 * todos modos ninguno va a funcionar (los Server Actions también se
 * niegan, ver el guard en lib/actor.ts) — mejor un mensaje claro y sin
 * ambigüedad que un panel medio-roto.
 */
export default function CuentaBloqueada({ etapa, tenantSlug }: { etapa: EtapaCiclo; tenantSlug: string }) {
  const esCancelada = etapa === "cancelada";

  // Datos de contacto de LINKITY (la plataforma, no el negocio bloqueado)
  // — variables de entorno todavía sin llenar (Carlos: "deja todo
  // preparado para que cuando lo suba al sitio real pueda llenar esos
  // campos y funcione"), mismas que usa lib/notificaciones-suscripcion.ts
  // para el número de origen. Sin ellas, se muestra un mensaje genérico en
  // vez de un link roto.
  const whatsapp = process.env.LINKITY_CONTACT_WHATSAPP; // formato wa.me: solo dígitos con código de país, ej. "5215512345678"
  const correo = process.env.LINKITY_CONTACT_EMAIL;
  const contactoHref = whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent("Hola, quiero renovar mi suscripción a Linkity")}`
    : correo
      ? `mailto:${correo}?subject=${encodeURIComponent("Quiero renovar mi suscripción a Linkity")}`
      : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
        <div className="mx-auto w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
          <Lock className="w-6 h-6 text-red-500" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900 mb-2">
          {esCancelada ? "Esta cuenta fue cancelada" : "Cuenta bloqueada"}
        </h1>
        <p className="text-sm text-slate-600 mb-6">
          {esCancelada
            ? "Tu suscripción a Linkity fue cancelada. Contáctanos si quieres reactivar tu negocio."
            : "Tu suscripción a Linkity está vencida y el acceso quedó bloqueado. Tus datos siguen guardados — en cuanto renueves, recuperas el acceso de inmediato."}
        </p>
        {contactoHref ? (
          <a
            href={contactoHref}
            target="_blank"
            rel="noreferrer"
            className="inline-block w-full bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:bg-slate-800 transition-colors"
          >
            Contactar para renovar
          </a>
        ) : (
          <p className="text-xs text-slate-400">Contacta a Linkity Soluciones para renovar tu cuenta.</p>
        )}
        <Link href={`/entrada/${tenantSlug}`} className="block mt-4 text-xs text-slate-400 hover:text-slate-600">
          Volver
        </Link>
      </div>
    </div>
  );
}
