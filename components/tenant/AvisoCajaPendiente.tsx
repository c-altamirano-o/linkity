import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatoDiaMes } from "@/lib/corte-diario-puro";

/**
 * Aviso de cajas de un día anterior que quedaron abiertas (2026-10-09, a
 * petición de Carlos). Dos casos:
 * - bloqueante (personal de PIN): el layout ya lo dejó solo en Caja; el aviso
 *   explica por qué y que debe hacer el corte para continuar.
 * - informativo (administrador): nunca se bloquea; solo se le avisa qué
 *   sucursal no cerró caja y qué día.
 */
export default function AvisoCajaPendiente({
  tenantSlug,
  cajas,
  bloqueante,
}: {
  tenantSlug: string;
  cajas: { branchId: string; sucursal: string; abiertaPor: string; abiertaEn: Date }[];
  bloqueante: boolean;
}) {
  return (
    <div className="mx-4 mt-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
      <div className="min-w-0">
        {bloqueante ? (
          <>
            <p className="font-semibold">
              La caja de {cajas[0].sucursal} del {formatoDiaMes(cajas[0].abiertaEn)} no se cerró
            </p>
            <p className="mt-0.5 text-amber-800">
              La abrió {cajas[0].abiertaPor} y sigue abierta. Haz el corte de caja para poder continuar: mientras no se
              cierre, el resto del sistema permanece bloqueado.
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold">{cajas.length === 1 ? "Una sucursal no cerró caja" : "Hay sucursales que no cerraron caja"}</p>
            <ul className="mt-1 space-y-1">
              {cajas.map((c) => (
                <li key={c.branchId} className="text-amber-800">
                  {c.sucursal} no cerró caja el {formatoDiaMes(c.abiertaEn)} (la abrió {c.abiertaPor}).{" "}
                  <Link href={`/${tenantSlug}/caja?sucursal=${c.branchId}`} className="font-medium text-amber-900 underline">
                    Ir a esa caja
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
