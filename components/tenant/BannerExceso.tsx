import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * Aviso durante los 7 días de gracia de un exceso de plan (Paso 5,
 * 2026-10-08; reglas en lib/exceso-plan.ts). Lo renderiza
 * [tenant]/layout.tsx envolviendo a `children`, así que aparece en todas las
 * pantallas del negocio sin tocar TenantShell.
 *
 * Al administrador se le ofrece el botón para elegir qué conservar; al
 * personal de PIN solo se le pide avisar al administrador (no puede decidir).
 */
export default function BannerExceso({
  tenantSlug,
  diasRestantes,
  esAdmin,
}: {
  tenantSlug: string;
  diasRestantes: number;
  esAdmin: boolean;
}) {
  const urgente = diasRestantes <= 2;
  const clases = urgente ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-900";
  const claseBoton = urgente ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700";
  const titulo =
    diasRestantes <= 1
      ? "Hoy es el último día para ajustar tu negocio a tu plan."
      : `Tienes ${diasRestantes} días para ajustar tu negocio a tu plan.`;

  return (
    <div role="status" className={`border-b px-4 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${clases}`}>
      <div className="flex items-start gap-2 min-w-0">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p className="text-[13px] leading-snug min-w-0">
          <span className="font-semibold">{titulo}</span>{" "}
          <span className="opacity-90">
            {esAdmin
              ? "Tienes más sucursales o empleados activos de los que permite tu plan. Elige cuáles conservar o cambia a un plan superior; si no, el sistema se pausará."
              : "El negocio tiene más sucursales o empleados activos de los que permite su plan. Avisa al administrador para que lo ajuste."}
          </span>
        </p>
      </div>
      {esAdmin && (
        <Link
          href={`/${tenantSlug}/ajustar-plan`}
          className={`self-start sm:self-auto flex-shrink-0 text-white text-xs font-medium rounded-md px-3 py-1.5 transition-colors ${claseBoton}`}
        >
          Elegir qué conservar
        </Link>
      )}
    </div>
  );
}
