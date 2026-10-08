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
 *
 * 2026-10-06 (prueba gratis): la etapa "prueba_vencida" tiene su propio
 * mensaje ("tu prueba gratis terminó") y el botón principal lleva al pago en
 * Hotmart (HOTMART_CHECKOUT_URL) en vez del contacto manual — ver
 * lib/enlaces-suscripcion.ts. Si el link de Hotmart todavía no está
 * configurado, cae al contacto por WhatsApp/correo de siempre, y si
 * tampoco, a un mensaje genérico (nunca un botón roto).
 */
export default function CuentaBloqueada({
  etapa,
  tenantSlug,
  checkoutUrl = null,
  contactoHref = null,
  correoCuenta = null,
}: {
  etapa: EtapaCiclo;
  tenantSlug: string;
  checkoutUrl?: string | null;
  contactoHref?: string | null;
  // Correo de la cuenta que está viendo esta pantalla (solo si es el
  // administrador con sesión real) — el pago en Hotmart se liga al negocio
  // POR CORREO, así que se le recuerda usar este mismo.
  correoCuenta?: string | null;
}) {
  const esCancelada = etapa === "cancelada";
  const esPrueba = etapa === "prueba_vencida";

  // Cancelada/suspendida a mano: no se ofrece el pago automático (fue una
  // decisión de Carlos, no una falta de pago) — solo contacto.
  const puedePagar = !esCancelada && etapa !== "suspendida_manual" && !!checkoutUrl;
  const href = puedePagar ? checkoutUrl : contactoHref;
  const textoBoton = puedePagar ? "Suscribirme ahora" : esPrueba ? "Contactar para suscribirme" : "Contactar para renovar";

  const titulo = esCancelada ? "Esta cuenta fue cancelada" : esPrueba ? "Tu prueba gratis terminó" : "Cuenta bloqueada";
  const mensaje = esCancelada
    ? "Tu suscripción a Linkity fue cancelada. Contáctanos si quieres reactivar tu negocio."
    : esPrueba
      ? "Tu mes de prueba gratis en Linkity ya terminó y el acceso quedó bloqueado. Todo lo que capturaste (ventas, clientes, inventario) sigue guardado — en cuanto te suscribas, recuperas el acceso de inmediato."
      : "Tu suscripción a Linkity está vencida y el acceso quedó bloqueado. Tus datos siguen guardados — en cuanto renueves, recuperas el acceso de inmediato.";

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
        <div className="mx-auto w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
          <Lock className="w-6 h-6 text-red-500" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900 mb-2">{titulo}</h1>
        <p className="text-sm text-slate-600 mb-6">{mensaje}</p>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-block w-full bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:bg-slate-800 transition-colors"
          >
            {textoBoton}
          </a>
        ) : (
          <p className="text-xs text-slate-400">Contacta a Linkity Soluciones para reactivar tu cuenta.</p>
        )}
        {puedePagar && (
          <p className="text-xs text-slate-500 mt-3">
            Paga con {correoCuenta ? <span className="font-medium text-slate-700">{correoCuenta}</span> : "el mismo correo con el que te registraste"} para que
            tu cuenta se active sola. Si ya pagaste, puede tardar unos minutos.
          </p>
        )}
        {puedePagar && contactoHref && (
          <a href={contactoHref} target="_blank" rel="noreferrer" className="block mt-3 text-xs text-slate-500 underline hover:text-slate-700">
            ¿Problemas con el pago? Escríbenos
          </a>
        )}
        <Link href={`/${tenantSlug}`} className="block mt-4 text-xs text-slate-400 hover:text-slate-600">
          Volver
        </Link>
      </div>
    </div>
  );
}
