"use client";

import { useEffect, useState, useTransition } from "react";
import type { PlanComercialUI } from "@/lib/planes-comerciales-data";
import {
  alternarFeaturePlanAction,
  actualizarHotmartPlanAction,
  actualizarLimitePlanAction,
  crearFuncionComercialAction,
  crearLimiteComercialAction,
} from "./actions";

/** "Reportes avanzados" -> "REPORTES_AVANZADOS" (sin acentos). */
function codigoDesdeNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

const CLASE_INPUT =
  "mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] text-slate-700 bg-white outline-none focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5]/20";

/**
 * Formulario para agregar una función o un límite al catálogo. El código se
 * sugiere solo a partir del nombre (editable) hasta que se escribe a mano.
 */
function NuevoElementoCatalogo({ tipo, onError }: { tipo: "funcion" | "limite"; onError: (m: string | null) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [codigoManual, setCodigoManual] = useState(false);
  const [descripcion, setDescripcion] = useState("");
  const [unidad, setUnidad] = useState("");
  const [alcance, setAlcance] = useState<"tenant" | "branch">("tenant");
  const [guardando, setGuardando] = useState(false);
  const [creado, setCreado] = useState<string | null>(null);

  const esFuncion = tipo === "funcion";

  function reiniciar() {
    setNombre("");
    setCodigo("");
    setCodigoManual(false);
    setDescripcion("");
    setUnidad("");
    setAlcance("tenant");
  }

  async function crear() {
    onError(null);
    setCreado(null);
    setGuardando(true);
    const resultado = esFuncion
      ? await crearFuncionComercialAction({ code: codigo, name: nombre, description: descripcion || null })
      : await crearLimiteComercialAction({
          code: codigo,
          name: nombre,
          description: descripcion || null,
          unit: unidad || null,
          scope: alcance,
        });
    setGuardando(false);

    if (!resultado.ok) {
      onError(resultado.error);
      return;
    }
    setCreado(`${esFuncion ? "Función" : "Límite"} «${nombre.trim()}» creado.`);
    reiniciar();
    setAbierto(false);
  }

  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-white">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-slate-700">{esFuncion ? "Nueva función" : "Nuevo límite"}</p>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="text-[12px] font-medium text-[#4F46E5] hover:underline"
        >
          {abierto ? "Cancelar" : "Agregar"}
        </button>
      </div>
      <p className="text-[11.5px] text-slate-400 mt-0.5">
        {esFuncion
          ? "Nace habilitada en todos los planes, así nadie pierde nada; luego la apagas donde no aplique."
          : "Nace ilimitado en todos los planes, así no recorta a nadie; luego fijas el número de cada plan."}
      </p>
      {creado && <p className="text-[12px] text-emerald-600 mt-1.5">{creado}</p>}

      {abierto && (
        <div className="mt-3 space-y-2.5">
          <div>
            <label className="text-[12px] font-medium text-slate-500">Nombre</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
                if (!codigoManual) setCodigo(codigoDesdeNombre(e.target.value));
              }}
              placeholder={esFuncion ? "Ej. Reportes avanzados" : "Ej. Máximo de productos"}
              className={CLASE_INPUT}
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-slate-500">Código (no se puede cambiar después)</label>
            <input
              type="text"
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value.toUpperCase());
                setCodigoManual(true);
              }}
              placeholder="REPORTES_AVANZADOS"
              className={`${CLASE_INPUT} font-mono`}
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-slate-500">Descripción (opcional)</label>
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className={CLASE_INPUT}
            />
          </div>
          {!esFuncion && (
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[12px] font-medium text-slate-500">Unidad (opcional)</label>
                <input
                  type="text"
                  value={unidad}
                  onChange={(e) => setUnidad(e.target.value)}
                  placeholder="productos"
                  className={CLASE_INPUT}
                />
              </div>
              <div>
                <label className="text-[12px] font-medium text-slate-500">Se cuenta</label>
                <select
                  value={alcance}
                  onChange={(e) => setAlcance(e.target.value as "tenant" | "branch")}
                  className={CLASE_INPUT}
                >
                  <option value="tenant">Por negocio</option>
                  <option value="branch">Por sucursal</option>
                </select>
              </div>
            </div>
          )}
          <button
            type="button"
            disabled={guardando || !nombre.trim() || !codigo.trim()}
            onClick={crear}
            className="px-3 py-2 rounded-lg bg-[#4F46E5] text-white text-[12.5px] font-medium disabled:opacity-50"
          >
            {guardando ? "Creando..." : esFuncion ? "Crear función" : "Crear límite"}
          </button>
        </div>
      )}
    </div>
  );
}

type LimiteUI = PlanComercialUI["limits"][number];

/**
 * Una fila de límite con su propio estado. Se monta con `key` = plan + límite
 * + valor guardado, así al cambiar de plan (o al refrescar tras guardar)
 * muestra SIEMPRE el valor real de ese plan y nunca el de otro.
 */
function FilaLimite({
  planId,
  limit,
  onError,
}: {
  planId: string;
  limit: LimiteUI;
  onError: (mensaje: string | null) => void;
}) {
  const [valor, setValor] = useState(limit.value === null ? "" : String(limit.value));
  const [ilimitado, setIlimitado] = useState(limit.isUnlimited);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  async function guardar() {
    onError(null);
    setGuardado(false);

    let numero: number | null = null;
    if (!ilimitado) {
      const texto = valor.trim();
      if (texto === "" || !/^\d+$/.test(texto)) {
        onError(`"${limit.name}": escribe un número entero (0 o mayor) o marca Ilimitado.`);
        return;
      }
      numero = Number(texto);
    }

    setGuardando(true);
    const resultado = await actualizarLimitePlanAction({
      planId,
      limitId: limit.id,
      value: numero,
      isUnlimited: ilimitado,
    });
    setGuardando(false);

    if (!resultado.ok) {
      onError(resultado.error);
      return;
    }
    setGuardado(true);
  }

  return (
    <div className="px-3.5 py-2.5 flex items-center justify-between gap-4">
      <div>
        <p className="text-[13px] text-slate-700">{limit.name}</p>
        {limit.description && (
          <p className="text-[11.5px] text-slate-400">{limit.description}</p>
        )}
        {!limit.configured && (
          <p className="text-[11.5px] text-amber-600">
            Sin configurar en este plan: hoy no restringe nada.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="number"
          min="0"
          step="1"
          value={ilimitado ? "" : valor}
          onChange={(e) => {
            setValor(e.target.value);
            setGuardado(false);
          }}
          disabled={ilimitado || guardando}
          placeholder={ilimitado ? "∞" : ""}
          className="w-24 px-2.5 py-1.5 border border-slate-200 rounded-lg text-[13px] text-slate-700 bg-white disabled:bg-slate-100 disabled:text-slate-400 outline-none focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5]/20"
        />

        <label className="flex items-center gap-1.5 text-[12px] text-slate-500 whitespace-nowrap">
          <input
            type="checkbox"
            checked={ilimitado}
            disabled={guardando}
            onChange={(e) => {
              setIlimitado(e.target.checked);
              setGuardado(false);
            }}
          />
          Ilimitado
        </label>

        <button
          type="button"
          disabled={guardando}
          onClick={guardar}
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[12px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {guardando ? "..." : guardado ? "Guardado" : "Guardar"}
        </button>
      </div>
    </div>
  );
}

export default function PlanesComercialesClient({
  planes,
}: {
  planes: PlanComercialUI[];
}) {
  const [planSeleccionado, setPlanSeleccionado] = useState<string | null>(
    planes[0]?.id ?? null
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hotmartProductId, setHotmartProductId] = useState("");
  const [hotmartOfferCode, setHotmartOfferCode] = useState("");
  const [guardandoHotmart, setGuardandoHotmart] = useState(false);
  const [hotmartGuardado, setHotmartGuardado] = useState(false);

  const plan = planes.find((p) => p.id === planSeleccionado) ?? planes[0] ?? null;

  // Al cambiar de plan (o cuando el servidor devuelve lo guardado) los campos
  // de Hotmart se rellenan con el valor real de ESE plan.
  useEffect(() => {
    setHotmartProductId(plan?.hotmartProductId ?? "");
    setHotmartOfferCode(plan?.hotmartOfferCode ?? "");
    setHotmartGuardado(false);
  }, [plan?.id, plan?.hotmartProductId, plan?.hotmartOfferCode]);

  // Un mensaje de error de otro plan no debe quedarse al cambiar de plan.
  useEffect(() => {
    setError(null);
  }, [plan?.id]);

  function cambiarFeature(featureId: string, enabled: boolean) {
    if (!plan) return;

    setError(null);

    startTransition(async () => {
      const resultado = await alternarFeaturePlanAction({
        planId: plan.id,
        featureId,
        enabled,
      });

      if (!resultado.ok) {
        setError(resultado.error);
      }
    });
  }

  async function guardarHotmart() {
    if (!plan) return;
    setError(null);
    setHotmartGuardado(false);
    setGuardandoHotmart(true);

    const resultado = await actualizarHotmartPlanAction({
      planId: plan.id,
      hotmartProductId: hotmartProductId.trim() || null,
      hotmartOfferCode: hotmartOfferCode.trim() || null,
    });

    setGuardandoHotmart(false);

    if (!resultado.ok) {
      setError(resultado.error);
    } else {
      // Los campos se quedan con lo que se guardó (antes se vaciaban y
      // parecía que se había perdido el dato).
      setHotmartGuardado(true);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {planes.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPlanSeleccionado(p.id)}
            className={`text-left bg-white border rounded-lg p-4 transition-colors ${
              p.id === plan?.id
                ? "border-[#4F46E5] ring-1 ring-[#4F46E5]/20"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[14px] font-medium text-slate-800">{p.name}</p>
                <p className="text-[11.5px] text-slate-400">{p.code}</p>
              </div>
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                  p.isActive
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {p.isActive ? "Activo" : "Desactivado"}
              </span>
            </div>

            {p.description && (
              <p className="mt-2 text-[12.5px] text-slate-500">
                {p.description}
              </p>
            )}
          </button>
        ))}
      </div>

      {plan && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-[14.5px] font-medium text-slate-800">
              Configuración de {plan.name}
            </h2>
            <p className="text-[12px] text-slate-400 mt-0.5">
              Las capacidades comerciales del plan se administran desde aquí.
              Los precios y cobros viven en Hotmart.
            </p>
          </div>

          <div className="p-5 space-y-6">
            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-[12.5px] text-red-700">
                {error}
              </div>
            )}

            <section>
              <h3 className="text-[12.5px] font-medium text-slate-700 mb-3">
                Hotmart
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-medium text-slate-500">
                    Product ID
                  </label>
                  <input
                    type="text"
                    value={hotmartProductId}
                    onChange={(e) => {
                      setHotmartProductId(e.target.value);
                      setHotmartGuardado(false);
                    }}
                    placeholder="ID del producto en Hotmart"
                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] text-slate-700 bg-white outline-none focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5]/20"
                  />
                </div>

                <div>
                  <label className="text-[12px] font-medium text-slate-500">
                    Offer Code
                  </label>
                  <input
                    type="text"
                    value={hotmartOfferCode}
                    onChange={(e) => {
                      setHotmartOfferCode(e.target.value);
                      setHotmartGuardado(false);
                    }}
                    placeholder="Código de oferta en Hotmart"
                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] text-slate-700 bg-white outline-none focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5]/20"
                  />
                </div>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  disabled={guardandoHotmart}
                  onClick={guardarHotmart}
                  className="px-3 py-2 rounded-lg bg-[#4F46E5] text-white text-[12.5px] font-medium disabled:opacity-50"
                >
                  {guardandoHotmart ? "Guardando..." : "Guardar"}
                </button>
                {hotmartGuardado && (
                  <span className="text-[12px] text-emerald-600">Guardado</span>
                )}
              </div>
            </section>

            <section>
              <h3 className="text-[12.5px] font-medium text-slate-700 mb-3">
                Funciones habilitadas
              </h3>

              {plan.features.length === 0 ? (
                <p className="text-[12.5px] text-slate-400">
                  No hay funciones configuradas.
                </p>
              ) : (
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {plan.features.map((feature) => (
                    <div
                      key={`${plan.id}-${feature.id}`}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-4"
                    >
                      <div>
                        <p className="text-[13px] text-slate-700">
                          {feature.name}
                        </p>
                        {feature.description && (
                          <p className="text-[11.5px] text-slate-400">
                            {feature.description}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => cambiarFeature(feature.id, !feature.enabled)}
                        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                          feature.enabled
                            ? "bg-[#4F46E5]"
                            : "bg-slate-300"
                        }`}
                        aria-label={`${feature.enabled ? "Desactivar" : "Activar"} ${feature.name}`}
                      >
                        <span
                          className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow-sm transition-transform ${
                            feature.enabled
                              ? "translate-x-5"
                              : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-[12.5px] font-medium text-slate-700 mb-3">
                Límites
              </h3>

              {plan.limits.length === 0 ? (
                <p className="text-[12.5px] text-slate-400">
                  No hay límites configurados.
                </p>
              ) : (
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {plan.limits.map((limit) => (
                    <FilaLimite
                      key={`${plan.id}-${limit.id}-${limit.value ?? "x"}-${limit.isUnlimited}-${limit.configured}`}
                      planId={plan.id}
                      limit={limit}
                      onError={setError}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-[14.5px] font-medium text-slate-800">Catálogo</h2>
          <p className="text-[12px] text-slate-400 mt-0.5">
            Agrega funciones y límites nuevos sin tocar el código. Ojo: aquí solo se registran y se asignan a los
            planes; para que el sistema los haga cumplir, el punto que debe protegerse tiene que consultarlos
            (una línea de código por función o límite).
          </p>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          <NuevoElementoCatalogo tipo="funcion" onError={setError} />
          <NuevoElementoCatalogo tipo="limite" onError={setError} />
        </div>
      </div>
    </div>
  );
}
