import Link from "next/link";
import { Lock } from "lucide-react";

/**
 * Lo que ve el PERSONAL (sesión de PIN) cuando el plazo de 7 días para
 * ajustar el negocio a su plan ya venció (Paso 5, 2026-10-08): el sistema
 * está en pausa y solo el administrador puede reactivarlo eligiendo qué
 * sucursales y empleados conservar. Se renderiza desde [tenant]/layout.tsx
 * en lugar del panel, igual que CuentaBloqueada.
 */
export default function AjustePlanPendiente({ tenantSlug }: { tenantSlug: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-4">
          <Lock className="w-6 h-6 text-amber-600" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900 mb-2">El sistema está en pausa</h1>
        <p className="text-sm text-slate-600">
          El administrador del negocio debe elegir qué sucursales y empleados siguen activos según el plan contratado. En cuanto lo haga, podrás
          volver a entrar. Avísale por favor.
        </p>
        <Link href={`/${tenantSlug}`} className="block mt-5 text-xs text-slate-400 hover:text-slate-600">
          Volver
        </Link>
      </div>
    </div>
  );
}
