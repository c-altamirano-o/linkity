"use client";

import { useMemo, useState, useTransition } from "react";
import {
  X, Sparkles, ArrowRight, ArrowLeft, Check, AlertTriangle, Users, Plus, ChevronDown, ChevronUp, RotateCcw,
} from "lucide-react";
import { MODULOS, MODULOS_BASE_EXCLUIDOS, nombreModulo, type ModuloKey, type RolTenantUI } from "@/lib/roles";
import {
  catalogoBaseParaRubro, plantillaOperadorUnico, detectarAdvertencias, type AdvertenciaAsistente,
} from "@/lib/asistente-roles";
import { aplicarAsistenteRolesAction } from "@/app/actions/roles-tenant-actions";
import { confirmarSalirSinGuardar, useAdvertirCierrePestaña } from "@/lib/confirmar-cierre";

/**
 * "Asistente de puestos" (2026-09-24, a petición de Carlos) — guía paso a
 * paso para decidir/afinar los puestos de un negocio, complementaria a
 * "Roles y permisos" (RolesManager.tsx), no un reemplazo: RolesManager sigue
 * siendo el editor libre para quien ya sabe exactamente qué quiere; este
 * wizard es para el que no sabe por dónde empezar (negocio nuevo) O para el
 * que ya armó sus puestos a mano y quiere una segunda opinión guiada
 * (negocio existente — "por si hicieron algo mal desde el principio",
 * palabras de Carlos).
 *
 * Idea central, posible porque este proyecto YA siembra el catálogo del
 * rubro completo desde el día uno (asegurarRolesRubro/asegurarRolBase, ver
 * lib/roles-server.ts): rolesIniciales SIEMPRE trae algo, nunca una lista
 * vacía — así que "empezar de cero" y "revisar lo que ya existe" terminan
 * siendo el mismo flujo (los pasos 2-4 de abajo), la única diferencia real
 * es el texto de bienvenida del paso 0. Este wizard nunca BORRA un rol ni
 * reasigna personal — solo crea el puesto nuevo de "una sola persona" (modo
 * solo) y ajusta módulos/nombre de los que ya existen; borrar un rol sin
 * personal sigue siendo cosa de RolesManager (papelera, ya con su propia
 * confirmación).
 *
 * Pasos: 0 bienvenida → 1 modo de operación (solo vs dividido) → 2 revisar/
 * editar puestos (una tarjeta única en modo solo, o la lista completa en
 * modo dividido, con nota de "difiere del sugerido" para los de catálogo) →
 * 3 advertencias de solapamiento/conflicto (se salta en modo solo: por
 * definición una sola persona hace de todo, adviertir sería ruido) → 4
 * confirmar y aplicar (una sola llamada a aplicarAsistenteRolesAction).
 */

interface PuestoEditable {
  roleId: string | null; // null = puesto nuevo, se crea al aplicar
  nombre: string;
  modulos: Set<ModuloKey>;
  verTodoTaller: boolean;
  verMontosCaja: boolean;
  verTodoNegocio: boolean;
  isSystem: boolean;
  cantidadEmpleados: number;
  expandido: boolean;
}

interface AsistentePersonalProps {
  tenantSlug: string;
  rolesIniciales: RolTenantUI[];
  businessType: string | null;
  modulosInactivos?: string[];
  onCerrar: () => void;
  onCambio: () => void;
}

function puestoDesdeRol(r: RolTenantUI): PuestoEditable {
  return {
    roleId: r.id,
    nombre: r.name,
    modulos: new Set(r.modulosPermitidos),
    verTodoTaller: r.verTodoTaller,
    verMontosCaja: r.verMontosCaja,
    verTodoNegocio: r.verTodoNegocio,
    isSystem: r.isSystem,
    cantidadEmpleados: r.cantidadEmpleados,
    expandido: false,
  };
}

export default function AsistentePersonal({ tenantSlug, rolesIniciales, businessType, modulosInactivos = [], onCerrar, onCambio }: AsistentePersonalProps) {
  const modulosInactivosSet = new Set(modulosInactivos);
  const MODULOS_ASIGNABLES: ModuloKey[] = MODULOS.filter(
    (m) => !MODULOS_BASE_EXCLUIDOS.includes(m) && !modulosInactivosSet.has(m)
  );
  const catalogo = useMemo(() => catalogoBaseParaRubro(businessType), [businessType]);
  const catalogoPorNombre = useMemo(() => new Map(catalogo.map((c) => [c.name, c])), [catalogo]);

  const hayPersonalAsignado = rolesIniciales.some((r) => r.cantidadEmpleados > 0);
  const hayMasDeUnPuestoConPersonal = rolesIniciales.filter((r) => r.cantidadEmpleados > 0).length > 1;

  const [paso, setPaso] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [modo, setModo] = useState<"solo" | "dividido" | null>(null);
  const [puestos, setPuestos] = useState<PuestoEditable[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useAdvertirCierrePestaña(true);

  const cancelar = () => {
    if (confirmarSalirSinGuardar()) onCerrar();
  };

  const elegirModo = (elegido: "solo" | "dividido") => {
    setModo(elegido);
    if (elegido === "solo") {
      const plantilla = plantillaOperadorUnico(businessType, MODULOS_ASIGNABLES);
      const yaExiste = rolesIniciales.find((r) => r.name === plantilla.name);
      setPuestos([{
        roleId: yaExiste?.id ?? null,
        nombre: plantilla.name,
        modulos: new Set(plantilla.modulos),
        verTodoTaller: yaExiste?.verTodoTaller ?? false,
        verMontosCaja: yaExiste?.verMontosCaja ?? true,
        verTodoNegocio: yaExiste?.verTodoNegocio ?? true,
        isSystem: false,
        cantidadEmpleados: yaExiste?.cantidadEmpleados ?? 0,
        expandido: true,
      }]);
    } else {
      setPuestos(rolesIniciales.map(puestoDesdeRol));
    }
    setPaso(2);
  };

  const toggleModulo = (idx: number, modulo: ModuloKey) => {
    setPuestos((prev) => prev.map((p, i) => {
      if (i !== idx) return p;
      const copia = new Set(p.modulos);
      if (copia.has(modulo)) copia.delete(modulo); else copia.add(modulo);
      return { ...p, modulos: copia };
    }));
  };

  const actualizarPuesto = (idx: number, cambios: Partial<PuestoEditable>) => {
    setPuestos((prev) => prev.map((p, i) => (i === idx ? { ...p, ...cambios } : p)));
  };

  const restaurarSugerido = (idx: number) => {
    setPuestos((prev) => prev.map((p, i) => {
      if (i !== idx) return p;
      const sugerido = catalogoPorNombre.get(p.nombre);
      if (!sugerido) return p;
      return {
        ...p,
        modulos: new Set(sugerido.modulos),
        verTodoTaller: sugerido.verTodoTaller ?? false,
        verMontosCaja: sugerido.verMontosCaja ?? false,
        verTodoNegocio: sugerido.verTodoNegocio ?? false,
      };
    }));
  };

  const agregarPuestoPersonalizado = () => {
    setPuestos((prev) => [...prev, {
      roleId: null, nombre: "", modulos: new Set(), verTodoTaller: false, verMontosCaja: false, verTodoNegocio: false,
      isSystem: false, cantidadEmpleados: 0, expandido: true,
    }]);
  };

  const quitarPuestoNuevo = (idx: number) => {
    // Solo se puede "quitar" un puesto que el propio wizard acaba de agregar
    // en esta sesión (roleId null, aún no existe en la BD) — un puesto que
    // ya existía se deja siempre en la lista (ver el comentario del
    // archivo: este wizard nunca borra); para eso ya está la papelera de
    // RolesManager.tsx.
    setPuestos((prev) => prev.filter((_, i) => i !== idx));
  };

  const puestosValidos = useMemo(
    () => puestos.filter((p) => p.nombre.trim().length > 0),
    [puestos]
  );

  const advertencias: AdvertenciaAsistente[] = useMemo(() => {
    if (modo === "solo") return [];
    return detectarAdvertencias(puestosValidos.map((p) => ({ name: p.nombre, modulos: Array.from(p.modulos) })));
  }, [modo, puestosValidos]);

  const irAAdvertenciasOConfirmar = () => {
    setError(null);
    if (puestosValidos.length === 0) { setError("Agrega al menos un puesto con nombre"); return; }
    if (new Set(puestosValidos.map((p) => p.nombre.trim())).size !== puestosValidos.length) {
      setError("Hay dos puestos con el mismo nombre — dales nombres distintos antes de continuar");
      return;
    }
    setPaso(modo === "solo" ? 4 : 3);
  };

  const aplicar = () => {
    setError(null);
    startTransition(async () => {
      const res = await aplicarAsistenteRolesAction({
        tenantSlug,
        cambios: puestosValidos.map((p) => ({
          roleId: p.roleId,
          nombre: p.nombre.trim(),
          modulos: Array.from(p.modulos),
          verTodoTaller: p.verTodoTaller,
          verMontosCaja: p.verMontosCaja,
          verTodoNegocio: p.verTodoNegocio,
        })),
      });
      if (res.ok) {
        onCambio();
        onCerrar();
      } else {
        setError(res.error);
      }
    });
  };

  const tituloPaso = ["Asistente de puestos", "¿Cómo trabaja tu equipo?", "Revisa tus puestos", "Antes de continuar", "Confirmar"][paso];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={cancelar}>
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <span className="text-sm font-medium text-foreground flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> {tituloPaso}</span>
          <button onClick={cancelar} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{error}</div>}

          {/* Paso 0 — bienvenida */}
          {paso === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-foreground">
                {hayPersonalAsignado
                  ? "Vamos a revisar los puestos que ya tienes y ayudarte a afinarlos — nada se borra ni se reasigna sin que tú lo decidas."
                  : "Vamos a definir los puestos de tu negocio en unos pasos — para que cada quien tenga acceso solo a lo que le corresponde."}
              </p>
              <p className="text-xs text-muted-foreground">
                Puedes salir en cualquier momento sin que se guarde nada, y siempre puedes volver a abrir este asistente después para hacer ajustes.
              </p>
              <button onClick={() => setPaso(1)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium">
                Comenzar <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Paso 1 — modo de operación */}
          {paso === 1 && (
            <div className="space-y-3">
              <button onClick={() => elegirModo("solo")}
                className="w-full text-left border border-border hover:border-primary hover:bg-primary/5 rounded-lg p-3">
                <p className="text-sm font-medium text-foreground">Una sola persona (o todo el equipo por igual) hace de todo</p>
                <p className="text-[11.5px] text-muted-foreground mt-0.5">Te armamos un solo puesto con acceso a todo lo operativo del negocio — sin tener que elegir entre varios puestos.</p>
              </button>
              <button onClick={() => elegirModo("dividido")}
                className="w-full text-left border border-border hover:border-primary hover:bg-primary/5 rounded-lg p-3">
                <p className="text-sm font-medium text-foreground">Cada quien tiene tareas específicas</p>
                <p className="text-[11.5px] text-muted-foreground mt-0.5">Revisamos los puestos sugeridos para tu tipo de negocio (y los que ya tengas) uno por uno.</p>
              </button>
              {hayMasDeUnPuestoConPersonal && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11.5px] text-amber-800 flex gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>Ya tienes varios puestos con gente asignada. Si eliges &quot;una sola persona hace de todo&quot;, nadie pierde su acceso, pero si quieres conservar la separación de tareas que ya armaste, elige la segunda opción.</span>
                </div>
              )}
            </div>
          )}

          {/* Paso 2 — revisar/editar puestos */}
          {paso === 2 && (
            <div className="space-y-2.5">
              {puestos.map((p, idx) => {
                const sugerido = catalogoPorNombre.get(p.nombre);
                const faltantes = sugerido ? sugerido.modulos.filter((m) => !p.modulos.has(m)) : [];
                const sobrantes = sugerido ? Array.from(p.modulos).filter((m) => !sugerido.modulos.includes(m) && m !== "dashboard") : [];
                const difiereDelSugerido = modo === "dividido" && sugerido && (faltantes.length > 0 || sobrantes.length > 0);

                return (
                  <div key={idx} className="border border-border rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {modo === "dividido" && p.isSystem ? (
                          <p className="text-sm font-medium text-foreground">{p.nombre} <span className="text-[10.5px] text-muted-foreground font-normal">(sugerido para tu rubro)</span></p>
                        ) : (
                          <input type="text" value={p.nombre} placeholder="Nombre del puesto"
                            onChange={(e) => actualizarPuesto(idx, { nombre: e.target.value })}
                            className="w-full px-2.5 py-1.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
                        )}
                        {modo === "dividido" && (
                          <p className="text-[11.5px] text-muted-foreground mt-0.5">{p.cantidadEmpleados} empleado(s) con este puesto</p>
                        )}
                        {difiereDelSugerido && (
                          <div className="mt-1.5 bg-primary/5 border border-primary/20 rounded-lg px-2 py-1.5 text-[11.5px] text-foreground flex items-start justify-between gap-2">
                            <span>
                              Difiere del sugerido:{faltantes.length > 0 && <> le falta {faltantes.map(nombreModulo).join(", ")}.</>}{sobrantes.length > 0 && <> tiene de más {sobrantes.map(nombreModulo).join(", ")}.</>}
                            </span>
                            <button onClick={() => restaurarSugerido(idx)} className="flex items-center gap-1 text-primary-text hover:underline whitespace-nowrap flex-shrink-0">
                              <RotateCcw className="w-3 h-3" /> Restaurar
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {modo === "dividido" && !p.roleId && (
                          <button onClick={() => quitarPuestoNuevo(idx)} className="p-1.5 text-muted-foreground hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                        )}
                        <button onClick={() => actualizarPuesto(idx, { expandido: !p.expandido })} className="p-1.5 text-muted-foreground hover:text-foreground">
                          {p.expandido ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {!p.expandido && (
                      <p className="text-[11.5px] text-muted-foreground mt-1.5">{Array.from(p.modulos).map(nombreModulo).join(", ") || "Sin módulos asignados"}</p>
                    )}

                    {p.expandido && (
                      <div className="mt-2 space-y-2">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                          {MODULOS_ASIGNABLES.map((m) => (
                            <label key={m} className="flex items-center gap-1.5 text-xs text-foreground">
                              <input type="checkbox" checked={p.modulos.has(m)} onChange={() => toggleModulo(idx, m)} />
                              {nombreModulo(m)}
                            </label>
                          ))}
                        </div>
                        {p.modulos.has("taller") && (
                          <label className="flex items-center gap-1.5 text-xs text-foreground border-t border-border pt-2">
                            <input type="checkbox" checked={p.verTodoTaller} onChange={(e) => actualizarPuesto(idx, { verTodoTaller: e.target.checked })} />
                            Ve TODAS las reparaciones asignadas del taller (no solo las propias)
                          </label>
                        )}
                        {p.modulos.has("caja") && (
                          <label className="flex items-center gap-1.5 text-xs text-foreground border-t border-border pt-2">
                            <input type="checkbox" checked={p.verMontosCaja} onChange={(e) => actualizarPuesto(idx, { verMontosCaja: e.target.checked })} />
                            Puede ver montos y totales de Caja
                          </label>
                        )}
                        {(p.modulos.has("reportes") || p.modulos.has("inventario") || p.modulos.has("caja") || p.modulos.has("sucursales")) && (
                          <label className="flex items-center gap-1.5 text-xs text-foreground border-t border-border pt-2">
                            <input type="checkbox" checked={p.verTodoNegocio} onChange={(e) => actualizarPuesto(idx, { verTodoNegocio: e.target.checked })} />
                            Ve Reportes/Inventario/Caja/Sucursales (y el Dashboard) de TODAS las sucursales, no solo la suya
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {modo === "dividido" && (
                <button onClick={agregarPuestoPersonalizado}
                  className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-border hover:bg-muted rounded-lg text-xs font-medium text-muted-foreground">
                  <Plus className="w-3.5 h-3.5" /> Agregar un puesto que no está en la lista
                </button>
              )}
            </div>
          )}

          {/* Paso 3 — advertencias (solo modo dividido) */}
          {paso === 3 && (
            <div className="space-y-2.5">
              {advertencias.length === 0 ? (
                <p className="text-sm text-foreground flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-600" /> No encontramos puestos duplicados ni combinaciones de riesgo — todo se ve bien.</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">Esto no bloquea nada — son solo puntos a tu criterio antes de continuar.</p>
                  {advertencias.map((a, i) => (
                    <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[12.5px] text-amber-800 flex gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{a.mensaje}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Paso 4 — confirmar */}
          {paso === 4 && (
            <div className="space-y-2.5">
              <p className="text-xs text-muted-foreground">Esto es lo que se va a guardar:</p>
              {puestosValidos.map((p, idx) => (
                <div key={idx} className="border border-border rounded-lg p-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      {p.nombre}
                      <span className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-normal">{p.roleId ? "se actualiza" : "puesto nuevo"}</span>
                    </p>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5">{Array.from(p.modulos).map(nombreModulo).join(", ") || "Sin módulos asignados"}</p>
                  </div>
                  <Users className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                </div>
              ))}
            </div>
          )}
        </div>

        {paso >= 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border flex-shrink-0">
            <button
              onClick={() => setPaso((p) => (p === 3 || (p === 4 && modo === "solo") ? 2 : ((p - 1) as typeof paso)))}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-3.5 h-3.5" /> Atrás
            </button>
            {paso === 2 && (
              <button onClick={irAAdvertenciasOConfirmar}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-medium">
                Continuar <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            {paso === 3 && (
              <button onClick={() => setPaso(4)}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-medium">
                Continuar <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            {paso === 4 && (
              <button disabled={pending} onClick={aplicar}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-xs font-medium">
                <Check className="w-3.5 h-3.5" /> {pending ? "Guardando..." : "Aplicar cambios"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
