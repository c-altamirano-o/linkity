"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cerrarSesionPersonalAction } from "@/app/actions/acceso-personal-actions";

/**
 * Pantalla completa para quien entra y NO puede cerrar la caja pendiente (por
 * ejemplo, un empleado cuyo rol no tiene el módulo Caja). 2026-10-09, a
 * petición de Carlos: no se le deja avanzar, pero tampoco se le deja sin
 * salida — solo puede avisar a quien sí tenga acceso a Caja y cerrar su sesión.
 */
export default function CajaPendienteBloqueo({
  tenantSlug,
  modo,
  sucursal,
  fecha,
}: {
  tenantSlug: string;
  modo: "admin" | "staff";
  sucursal: string;
  fecha: string;
}) {
  const [saliendo, setSaliendo] = useState(false);

  const salir = async () => {
    setSaliendo(true);
    try {
      if (modo === "staff") {
        await cerrarSesionPersonalAction();
      } else {
        await createClient().auth.signOut();
      }
    } finally {
      window.location.href = `/${tenantSlug}`;
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center text-amber-900">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" />
        <h1 className="mt-3 text-lg font-bold">Hay una caja sin cerrar</h1>
        <p className="mt-2 text-sm">
          La caja de {sucursal} del {fecha} no se cerró. Tu puesto no tiene acceso a Caja, así que avisa a tu
          administrador o a quien pueda hacer el corte. Hasta que se cierre, el sistema no está disponible.
        </p>
        <button
          onClick={salir}
          disabled={saliendo}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {saliendo && <Loader2 className="h-4 w-4 animate-spin" />}
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
