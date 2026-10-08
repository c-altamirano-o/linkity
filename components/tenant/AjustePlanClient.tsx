"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Building2, Check, Users } from "lucide-react";
import { resolverExcesoAction } from "@/app/actions/ajuste-plan-actions";
import type { DatosAjustePlan } from "@/lib/exceso-plan";

/**
 * Pantalla donde el administrador elige qué sucursales y qué empleados
 * conservar activos cuando su negocio excede lo que permite su plan (Paso 5,
 * 2026-10-08; reglas en lib/exceso-plan.ts).
 *
 * Dos usos:
 *  - modo "pagina": dentro del panel normal (ruta /[tenant]/ajustar-plan),
 *    mientras todavía corren los 7 días de gracia.
 *  - modo "bloqueo": [tenant]/layout.tsx la renderiza EN VEZ de todo el
 *    panel cuando los 7 días ya pasaron — es la única pantalla disponible
 *    hasta que el administrador decida.
 *
 * Aquí solo se arma la selección; el servidor recalcula el exceso y valida
 * cada id (ver resolverExcesoAction). Nada se borra: lo no elegido se
 * desactiva y puede reactivarse si el negocio sube de plan.
 */
export default function AjustePlanClient({
  tenantSlug,
  datos,
  modo,
}: {
  tenantSlug: string;
  datos: DatosAjustePlan;
  modo: "pagina" | "bloqueo";
}) {
  const { sucursales, limiteSucursales, limiteEmpleados, excedeSucursales } = datos;

  // Selección inicial razonable: las primeras N en el orden en que se crearon.
  const [sucSel, setSucSel] = useState<Set<string>>(() =>
    excedeSucursales && limiteSucursales !== null
      ? new Set(sucursales.slice(0, limiteSucursales).map((s) => s.id))
      : new Set(sucursales.map((s) => s.id))
  );
  const [empSel, setEmpSel] = useState<Record<string, Set<string>>>(() => {
    const inicial: Record<string, Set<string>> = {};
    if (limiteEmpleados !== null) {
      for (const s of sucursales) {
        if (s.excedeEmpleados) inicial[s.id] = new Set(s.empleados.slice(0, limiteEmpleados).map((e) => e.id));
      }
    }
    return inicial;
  });
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  // Sucursales que se quedan y que además tienen demasiados empleados.
  const sucursalesConEmpleados = useMemo(
    () => sucursales.filter((s) => s.excedeEmpleados && sucSel.has(s.id)),
    [sucursales, sucSel]
  );

  const sucursalesOk = !excedeSucursales || (limiteSucursales !== null && sucSel.size === limiteSucursales);
  const empleadosOk = sucursalesConEmpleados.every((s) => (empSel[s.id]?.size ?? 0) === limiteEmpleados);
  const listo = sucursalesOk && empleadosOk;

  const sucursalesADesactivar = sucursales.filter((s) => !sucSel.has(s.id));
  const empleadosADesactivar = sucursalesConEmpleados.reduce((n, s) => n + s.empleados.length - (empSel[s.id]?.size ?? 0), 0);
  const cajasAbiertasADesactivar = sucursalesADesactivar.filter((s) => s.cajaAbierta);

  function alternarSucursal(id: string) {
    setConfirmando(false);
    setSucSel((prev) => {
      const sig = new Set(prev);
      if (sig.has(id)) sig.delete(id);
      else if (limiteSucursales === null || sig.size < limiteSucursales) sig.add(id);
      return sig;
    });
  }

  function alternarEmpleado(branchId: string, empId: string) {
    setConfirmando(false);
    setEmpSel((prev) => {
      const actual = new Set(prev[branchId] ?? []);
      if (actual.has(empId)) actual.delete(empId);
      else if (limiteEmpleados === null || actual.size < limiteEmpleados) actual.add(empId);
      return { ...prev, [branchId]: actual };
    });
  }

  function guardar() {
    setError(null);
    const empleadosConservar: Record<string, string[]> = {};
    for (const s of sucursalesConEmpleados) empleadosConservar[s.id] = [...(empSel[s.id] ?? [])];
    iniciar(async () => {
      const r = await resolverExcesoAction({
        tenantSlug,
        sucursalesConservar: excedeSucursales ? [...sucSel] : sucursales.map((s) => s.id),
        empleadosConservar,
      });
      if (!r.ok) {
        setError(r.error);
        setConfirmando(false);
        return;
      }
      // Recarga completa para que el layout vuelva a evaluar el bloqueo.
      window.location.href = `/${tenantSlug}/dashboard`;
    });
  }

  const titulo = modo === "bloqueo" ? "Ajusta tu negocio a tu plan para continuar" : "Ajusta tu negocio a tu plan";
  const plazo = datos.vencido
    ? "El plazo de 7 días terminó: el sistema está en pausa hasta que elijas."
    : datos.diasRestantes !== null
      ? `Te ${datos.diasRestantes === 1 ? "queda 1 día" : `quedan ${datos.diasRestantes} días`} para elegir; después, el sistema se pausará hasta que lo hagas.`
      : "";

  const contenido = (
    <div className="max-w-2xl w-full bg-white border border-slate-200 rounded-2xl p-5 sm:p-8 shadow-sm">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-900">{titulo}</h1>
          <p className="text-sm text-slate-600 mt-1">
            Tu plan {datos.planNombre ? <span className="font-medium">{datos.planNombre}</span> : "actual"} permite
            {limiteSucursales !== null ? ` hasta ${limiteSucursales} sucursal(es) activa(s)` : " sucursales sin tope"}
            {limiteEmpleados !== null ? ` y ${limiteEmpleados} empleado(s) activo(s) por sucursal` : ""}, y hoy tienes más.{" "}
            {plazo}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            No se borra nada: lo que no elijas se <strong>desactiva</strong> y puedes volver a activarlo cuando subas de plan.
            Tu información (ventas, inventario, historial) se conserva.
          </p>
        </div>
      </div>

      {excedeSucursales && limiteSucursales !== null && (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Building2 className="w-4 h-4" /> Sucursales que se quedan activas
            <span className={`ml-auto text-xs font-medium ${sucSel.size === limiteSucursales ? "text-emerald-600" : "text-slate-500"}`}>
              {sucSel.size} de {limiteSucursales}
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">Elige exactamente {limiteSucursales}.</p>
          <ul className="mt-2 space-y-2">
            {sucursales.map((s) => {
              const marcada = sucSel.has(s.id);
              const bloqueada = !marcada && sucSel.size >= limiteSucursales;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => alternarSucursal(s.id)}
                    disabled={bloqueada || pendiente}
                    aria-pressed={marcada}
                    className={`w-full flex items-center gap-3 text-left rounded-lg border px-3 py-2.5 transition-colors ${
                      marcada ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"
                    } ${bloqueada ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span
                      className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                        marcada ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-300"
                      }`}
                    >
                      {marcada && <Check className="w-3.5 h-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900 truncate">
                        {s.name} {s.code ? <span className="text-slate-400 font-normal">· {s.code}</span> : null}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {s.empleados.length} empleado(s) activo(s){s.cajaAbierta ? " · caja abierta" : ""}
                      </span>
                    </span>
                    <span className={`text-xs font-medium ${marcada ? "text-emerald-700" : "text-slate-400"}`}>
                      {marcada ? "Se queda" : "Se desactiva"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {cajasAbiertasADesactivar.length > 0 && (
            <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              {cajasAbiertasADesactivar.map((s) => s.name).join(", ")}: tiene la caja abierta. Si la desactivas, la caja
              queda abierta hasta que reactives la sucursal y la cierres — considera cerrarla antes.
            </p>
          )}
        </section>
      )}

      {sucursalesConEmpleados.length > 0 && limiteEmpleados !== null && (
        <section className="mt-6 space-y-5">
          {sucursalesConEmpleados.map((s) => {
            const sel = empSel[s.id] ?? new Set<string>();
            return (
              <div key={s.id}>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Users className="w-4 h-4" /> Empleados que se quedan en {s.name}
                  <span className={`ml-auto text-xs font-medium ${sel.size === limiteEmpleados ? "text-emerald-600" : "text-slate-500"}`}>
                    {sel.size} de {limiteEmpleados}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">Elige exactamente {limiteEmpleados}. Los demás no podrán entrar con su PIN.</p>
                <ul className="mt-2 space-y-2">
                  {s.empleados.map((e) => {
                    const marcado = sel.has(e.id);
                    const bloqueado = !marcado && sel.size >= limiteEmpleados;
                    return (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => alternarEmpleado(s.id, e.id)}
                          disabled={bloqueado || pendiente}
                          aria-pressed={marcado}
                          className={`w-full flex items-center gap-3 text-left rounded-lg border px-3 py-2.5 transition-colors ${
                            marcado ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"
                          } ${bloqueado ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          <span
                            className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                              marcado ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-300"
                            }`}
                          >
                            {marcado && <Check className="w-3.5 h-3.5" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-slate-900 truncate">{e.name}</span>
                            {e.position ? <span className="block text-xs text-slate-500 truncate">{e.position}</span> : null}
                          </span>
                          <span className={`text-xs font-medium ${marcado ? "text-emerald-700" : "text-slate-400"}`}>
                            {marcado ? "Se queda" : "Se desactiva"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>
      )}

      {error && <p className="mt-5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

      <div className="mt-6">
        {!confirmando ? (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            disabled={!listo || pendiente}
            className="w-full bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Revisar y guardar
          </button>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-900">
              Se desactivarán <strong>{sucursalesADesactivar.length}</strong> sucursal(es) y <strong>{empleadosADesactivar}</strong> empleado(s)
              {sucursalesADesactivar.length > 0 ? ` (${sucursalesADesactivar.map((s) => s.name).join(", ")})` : ""}. ¿Confirmas?
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={guardar}
                disabled={pendiente}
                className="flex-1 bg-slate-900 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-slate-800 disabled:opacity-60"
              >
                {pendiente ? "Guardando…" : "Sí, confirmar"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                disabled={pendiente}
                className="flex-1 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg px-4 py-2 hover:bg-slate-50"
              >
                Volver
              </button>
            </div>
          </div>
        )}
        {!listo && <p className="mt-2 text-xs text-slate-500 text-center">Completa las selecciones para poder guardar.</p>}
      </div>

      <p className="mt-5 text-xs text-slate-500 text-center">
        ¿Prefieres mantener todo como está? Cambia a un plan superior y no tendrás que desactivar nada.
      </p>
    </div>
  );

  if (modo === "bloqueo") {
    return <div className="min-h-screen flex items-start sm:items-center justify-center bg-slate-50 px-4 py-6">{contenido}</div>;
  }
  return <div className="flex justify-center p-4 sm:p-6">{contenido}</div>;
}
