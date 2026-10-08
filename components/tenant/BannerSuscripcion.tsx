import { Clock, AlertTriangle } from "lucide-react";

/**
 * Aviso permanente (2026-10-06, a petición de Carlos: "debe haber mensajes
 * o notificaciones dentro del SaaS indicando los días restantes del periodo
 * de prueba") que TenantShell muestra bajo el encabezado, en TODAS las
 * pantallas del negocio, mientras la cuenta esté en prueba gratis o en los
 * días de gracia posteriores a un vencimiento de paga.
 *
 * El color sube de urgencia conforme se acerca el final: azul (8+ días),
 * ámbar (4–7) y rojo (3 o menos). El botón "Suscribirme" solo se ofrece al
 * administrador (modo "admin"); el personal que entra con PIN ve el mensaje
 * pero se le pide avisar al dueño — no tiene caso darle un botón de pago a
 * quien no es quien contrata.
 *
 * Sin estado ni efectos a propósito: los días se calculan en el servidor en
 * cada request (ver [tenant]/layout.tsx) y llegan ya resueltos como props
 * (TenantShell es un Client Component, así que este se renderiza ahí), por
 * lo que nunca se desfasan.
 */
export default function BannerSuscripcion({
  etapa,
  diasRestantes,
  puedeSuscribirse,
  checkoutUrl,
  contactoHref,
}: {
  etapa: "en_prueba" | "en_gracia";
  diasRestantes: number;
  puedeSuscribirse: boolean;
  checkoutUrl: string | null;
  contactoHref: string | null;
}) {
  const esPrueba = etapa === "en_prueba";
  const urgente = diasRestantes <= 3;
  const medio = diasRestantes <= 7;

  const clases = urgente
    ? "bg-red-50 border-red-200 text-red-800"
    : medio || !esPrueba
      ? "bg-amber-50 border-amber-200 text-amber-900"
      : "bg-sky-50 border-sky-200 text-sky-900";
  const claseBoton = urgente
    ? "bg-red-600 hover:bg-red-700"
    : medio || !esPrueba
      ? "bg-amber-600 hover:bg-amber-700"
      : "bg-sky-600 hover:bg-sky-700";

  let titulo: string;
  let detalle: string;
  if (esPrueba) {
    if (diasRestantes <= 1) {
      titulo = "Tu prueba gratis termina en menos de 24 horas.";
      detalle = "Suscríbete hoy para no perder el acceso. Tus datos se conservan.";
    } else {
      titulo = `Te quedan ${diasRestantes} días de prueba gratis.`;
      detalle = "Al terminar, el acceso se bloquea hasta que te suscribas. Tus datos se conservan.";
    }
  } else {
    titulo =
      diasRestantes <= 1
        ? "Tu suscripción venció — hoy es el último día de gracia."
        : `Tu suscripción venció — te quedan ${diasRestantes} días de gracia.`;
    detalle = "Renueva para evitar que se bloquee el acceso de todo tu equipo.";
  }

  const href = checkoutUrl ?? contactoHref;
  const Icono = urgente ? AlertTriangle : Clock;

  return (
    <div
      role="status"
      className={`flex-shrink-0 border-b px-4 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${clases}`}
    >
      <div className="flex items-start gap-2 min-w-0">
        <Icono className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p className="text-[13px] leading-snug min-w-0">
          <span className="font-semibold">{titulo}</span> <span className="opacity-90">{detalle}</span>
        </p>
      </div>
      {puedeSuscribirse ? (
        href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className={`self-start sm:self-auto flex-shrink-0 text-[13px] font-semibold text-white rounded-lg px-3 py-1.5 transition-colors ${claseBoton}`}
          >
            Suscribirme
          </a>
        )
      ) : (
        <p className="text-[12px] opacity-80 flex-shrink-0">Avisa al dueño del negocio para suscribirse.</p>
      )}
    </div>
  );
}
