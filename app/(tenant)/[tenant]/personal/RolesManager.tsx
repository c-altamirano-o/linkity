"use client";

import { useState, useTransition } from "react";
import { X, Plus, Trash2, Pencil, Check, Shield } from "lucide-react";
import { MODULOS, type ModuloKey, type RolTenantUI } from "@/lib/roles";
import { MODULE_CATALOG } from "@/lib/modules-catalog";
import {
  listarRolesTenantAction, crearRolAction, actualizarRolAction, eliminarRolAction,
} from "@/app/actions/roles-tenant-actions";
import { confirmarSalirSinGuardar, useAdvertirCierrePestaña } from "@/lib/confirmar-cierre";

/**
 * "Roles y permisos" (2026-09-17) — editor de los roles/puestos de este
 * negocio y de a qué módulos tiene acceso cada uno. Reemplaza la idea de un
 * catálogo fijo de 3 roles (pensado solo para un taller de celulares): cada
 * negocio puede tener sus propios puestos con el nombre y el acceso que le
 * corresponda (ej. una barbería con Recepcionista/Jefe de Barberos/Barbero,
 * cada uno viendo módulos distintos).
 *
 * "dashboard" nunca se ofrece como casilla — siempre está incluido (ver
 * guardarPermisosDeRol en lib/roles-server.ts), así ningún rol puede quedar
 * sin ningún módulo permitido (evita un loop de redirect infinito, ver el
 * comentario largo ahí). "personal", "asistencia", "facturacion" y
 * "configuracion" tampoco se ofrecen: son de acceso exclusivo del dueño con
 * cuenta real, nunca de un empleado con PIN — mismo criterio que ya regía
 * antes de este cambio (ver MATRIZ_ACCESO_BASE en lib/roles.ts).
 *
 * 2026-09-22 (a petición de Carlos: "tener información de más nos hace ver
 * como un multitenant barato creado al azar") — antes esta lista era fija
 * para CUALQUIER negocio: una barbería veía casillas de "Reparaciones",
 * "Taller" y "Aduana" entre las opciones para armar un rol, aunque ese
 * negocio nunca reciba un aparato a reparar. Ahora se filtra también contra
 * lo que este negocio en particular tiene activo (modulosInactivos, mismo
 * prop/criterio que ya usa TenantShell.tsx para el menú lateral).
 */

const MODULOS_BASE_EXCLUIDOS: ModuloKey[] = ["dashboard", "personal", "asistencia", "facturacion", "configuracion"];

interface RolesManagerProps {
  tenantSlug: string;
  rolesIniciales: RolTenantUI[];
  // Puestos sugeridos para el rubro de este negocio (lib/puestos-rubro.ts,
  // mismo catálogo que alimenta el <datalist> de "Puesto" en el formulario
  // de empleado) — aquí se ofrecen como chips de un clic para crear el rol
  // correspondiente, sin tener que escribir el nombre a mano.
  sugerenciasRoles?: string[];
  // Códigos de módulo desactivados para ESTE negocio (2026-09-22, ver el
  // comentario largo arriba) — mismo criterio "ausente de la lista = activo"
  // que ya usa TenantShell.tsx. "taller"/"aduana" no viven en
  // lib/modules-catalog.ts (no son una capacidad de negocio, ver su propio
  // comentario más abajo) así que no pueden aparecer aquí directo — el
  // padre (PersonalClient/page.tsx) ya los agrega a este arreglo cuando
  // "reparaciones" está inactivo, para que sigan la misma regla.
  modulosInactivos?: string[];
  onCerrar: () => void;
  onCambio: () => void;
}

export default function RolesManager({ tenantSlug, rolesIniciales, sugerenciasRoles = [], modulosInactivos = [], onCerrar, onCambio }: RolesManagerProps) {
  const modulosInactivosSet = new Set(modulosInactivos);
  const MODULOS_ASIGNABLES: ModuloKey[] = MODULOS.filter(
    (m) => !MODULOS_BASE_EXCLUIDOS.includes(m) && !modulosInactivosSet.has(m)
  );
  const [roles, setRoles] = useState<RolTenantUI[]>(rolesIniciales);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEdit, setNombreEdit] = useState("");
  const [modulosEdit, setModulosEdit] = useState<Set<ModuloKey>>(new Set());
  // "Jefe de técnicos" (2026-09-22, a petición de Carlos) — solo aplica
  // cuando el rol tiene "taller" entre sus módulos, ver Role.verTodoTaller.
  const [verTodoTallerEdit, setVerTodoTallerEdit] = useState(false);
  // "Puede ver montos de Caja" (2026-09-24, a petición de Carlos: seguridad
  // anti-fraude — ver el comentario largo en Role.verMontosCaja,
  // schema.prisma) — solo aplica cuando el rol tiene "caja" entre sus
  // módulos.
  const [verMontosCajaEdit, setVerMontosCajaEdit] = useState(false);
  // "Supervisor de Sucursales" (2026-09-24, a petición de Carlos) — solo
  // aplica cuando el rol tiene reportes/inventario/caja entre sus módulos,
  // ver Role.verTodoNegocio.
  const [verTodoNegocioEdit, setVerTodoNegocioEdit] = useState(false);
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [modulosNuevo, setModulosNuevo] = useState<Set<ModuloKey>>(new Set());
  const [verTodoTallerNuevo, setVerTodoTallerNuevo] = useState(false);
  const [verMontosCajaNuevo, setVerMontosCajaNuevo] = useState(false);
  const [verTodoNegocioNuevo, setVerTodoNegocioNuevo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Este componente SIEMPRE es el modal — el padre (PersonalClient) lo
  // monta/desmonta condicionalmente en vez de tener aquí un estado
  // "abierto/cerrado" propio — así que mientras esté montado, la pestaña
  // siempre debe advertir antes de cerrarse/recargarse (2026-09-22, ver
  // lib/confirmar-cierre.ts).
  useAdvertirCierrePestaña(true);

  // Cierra el modal por cualquier vía (fondo o X) — siempre pregunta, sin
  // dirty-tracking (mismo criterio que ya regía solo para el fondo).
  const cancelarModal = () => {
    if (confirmarSalirSinGuardar()) onCerrar();
  };

  const refrescar = () => {
    startTransition(async () => {
      const res = await listarRolesTenantAction(tenantSlug);
      if (res.ok) setRoles(res.roles);
      onCambio();
    });
  };

  const abrirEditar = (rol: RolTenantUI) => {
    setEditandoId(rol.id);
    setNombreEdit(rol.name);
    setModulosEdit(new Set(rol.modulosPermitidos));
    setVerTodoTallerEdit(rol.verTodoTaller);
    setVerMontosCajaEdit(rol.verMontosCaja);
    setVerTodoNegocioEdit(rol.verTodoNegocio);
    setCreando(false);
    setError(null);
  };

  const toggleModulo = (set: Set<ModuloKey>, setFn: (s: Set<ModuloKey>) => void, modulo: ModuloKey) => {
    const copia = new Set(set);
    if (copia.has(modulo)) copia.delete(modulo); else copia.add(modulo);
    setFn(copia);
  };

  const guardarEdicion = () => {
    if (!editandoId) return;
    setError(null);
    startTransition(async () => {
      const res = await actualizarRolAction({
        tenantSlug, roleId: editandoId, nombre: nombreEdit, modulos: Array.from(modulosEdit),
        verTodoTaller: verTodoTallerEdit, verMontosCaja: verMontosCajaEdit, verTodoNegocio: verTodoNegocioEdit,
      });
      if (res.ok) {
        setEditandoId(null);
        refrescar();
      } else {
        setError(res.error);
      }
    });
  };

  const crearRol = () => {
    if (!nombreNuevo.trim()) { setError("El nombre del rol es obligatorio"); return; }
    setError(null);
    startTransition(async () => {
      const res = await crearRolAction({
        tenantSlug, nombre: nombreNuevo, modulos: Array.from(modulosNuevo), verTodoTaller: verTodoTallerNuevo,
        verMontosCaja: verMontosCajaNuevo, verTodoNegocio: verTodoNegocioNuevo,
      });
      if (res.ok) {
        setCreando(false);
        setNombreNuevo("");
        setModulosNuevo(new Set());
        setVerTodoTallerNuevo(false);
        setVerMontosCajaNuevo(false);
        setVerTodoNegocioNuevo(false);
        refrescar();
      } else {
        setError(res.error);
      }
    });
  };

  const eliminarRol = (rol: RolTenantUI) => {
    if (!confirm(`¿Eliminar el rol "${rol.name}"? Esta acción no se puede deshacer.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await eliminarRolAction({ tenantSlug, roleId: rol.id });
      if (res.ok) refrescar();
      else setError(res.error);
    });
  };

  // "taller" (2026-09-21) a propósito NO vive en MODULE_CATALOG — ese
  // catálogo es para módulos que el NEGOCIO prende/apaga desde Configuración
  // (ver lib/modules-catalog.ts), y "taller" no es una capacidad de negocio
  // aparte: es la versión angosta de "Reparaciones" para el técnico, un
  // permiso de rol nada más (ver el comentario de "taller" en lib/roles.ts).
  // Necesita su propio nombre aquí para que en este selector de casillas se
  // distinga claramente de "Reparaciones" (control total).
  const nombreModulo = (m: ModuloKey) =>
    m === "taller" ? "Taller (solo ve lo asignado, sin editar)"
    : m === "aduana" ? "Recepción / Aduana de taller (asigna técnico, estatus y costo)"
    : MODULE_CATALOG[m]?.name ?? m;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"
      onClick={cancelarModal}>
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-medium text-foreground flex items-center gap-1.5"><Shield className="w-4 h-4" /> Roles y permisos</span>
          <button onClick={cancelarModal} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Define los puestos de tu negocio y a qué módulos tiene acceso cada uno. &quot;Dashboard&quot; siempre está incluido.
          </p>

          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{error}</div>}

          {roles.map((rol) => (
            <div key={rol.id} className="border border-border rounded-lg p-3">
              {editandoId === rol.id ? (
                <div className="space-y-2">
                  <input type="text" value={nombreEdit} disabled={rol.isSystem}
                    onChange={(e) => setNombreEdit(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary disabled:opacity-60" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {MODULOS_ASIGNABLES.map((m) => (
                      <label key={m} className="flex items-center gap-1.5 text-xs text-foreground">
                        <input type="checkbox" checked={modulosEdit.has(m)} onChange={() => toggleModulo(modulosEdit, setModulosEdit, m)} />
                        {nombreModulo(m)}
                      </label>
                    ))}
                  </div>
                  {modulosEdit.has("taller") && (
                    <label className="flex items-center gap-1.5 text-xs text-foreground border-t border-border pt-2">
                      <input type="checkbox" checked={verTodoTallerEdit} onChange={(e) => setVerTodoTallerEdit(e.target.checked)} />
                      Jefe de técnicos: ve TODAS las reparaciones asignadas del taller (no solo las propias)
                    </label>
                  )}
                  {modulosEdit.has("caja") && (
                    <label className="flex items-center gap-1.5 text-xs text-foreground border-t border-border pt-2">
                      <input type="checkbox" checked={verMontosCajaEdit} onChange={(e) => setVerMontosCajaEdit(e.target.checked)} />
                      Nivel supervisor: puede ver montos y totales de Caja (ventas del día, efectivo esperado, reportes)
                    </label>
                  )}
                  {(modulosEdit.has("reportes") || modulosEdit.has("inventario") || modulosEdit.has("caja")) && (
                    <label className="flex items-center gap-1.5 text-xs text-foreground border-t border-border pt-2">
                      <input type="checkbox" checked={verTodoNegocioEdit} onChange={(e) => setVerTodoNegocioEdit(e.target.checked)} />
                      Supervisor de sucursales: ve Reportes/Inventario/Caja de TODAS las sucursales, no solo la suya
                    </label>
                  )}
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditandoId(null)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
                    <button disabled={pending} onClick={guardarEdicion}
                      className="flex items-center gap-1 px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-xs font-medium">
                      <Check className="w-3 h-3" /> Guardar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {rol.name} {rol.isSystem && <span className="text-[10.5px] text-muted-foreground font-normal">(base)</span>}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5">
                      {rol.modulosPermitidos.map(nombreModulo).join(", ")}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground">{rol.cantidadEmpleados} empleado(s) con este rol</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => abrirEditar(rol)} className="p-1.5 border border-border hover:bg-muted rounded-lg text-foreground">
                      <Pencil className="w-3 h-3" />
                    </button>
                    {!rol.isSystem && (
                      <button onClick={() => eliminarRol(rol)} className="p-1.5 border border-border hover:bg-red-50 hover:text-red-600 rounded-lg text-foreground">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {creando ? (
            <div className="border border-dashed border-border rounded-lg p-3 space-y-2">
              <input type="text" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)}
                placeholder="Nombre del rol (ej. Barbero)"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary" />
              {sugerenciasRoles.filter((s) => !roles.some((r) => r.name === s)).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-[11.5px] text-muted-foreground mr-1">Sugeridos para tu rubro:</span>
                  {sugerenciasRoles.filter((s) => !roles.some((r) => r.name === s)).map((s) => (
                    <button key={s} type="button" onClick={() => setNombreNuevo(s)}
                      className="px-2 py-0.5 rounded-full bg-muted hover:bg-primary/10 hover:text-primary text-[11.5px] text-foreground">
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {MODULOS_ASIGNABLES.map((m) => (
                  <label key={m} className="flex items-center gap-1.5 text-xs text-foreground">
                    <input type="checkbox" checked={modulosNuevo.has(m)} onChange={() => toggleModulo(modulosNuevo, setModulosNuevo, m)} />
                    {nombreModulo(m)}
                  </label>
                ))}
              </div>
              {modulosNuevo.has("taller") && (
                <label className="flex items-center gap-1.5 text-xs text-foreground border-t border-border pt-2">
                  <input type="checkbox" checked={verTodoTallerNuevo} onChange={(e) => setVerTodoTallerNuevo(e.target.checked)} />
                  Jefe de técnicos: ve TODAS las reparaciones asignadas del taller (no solo las propias)
                </label>
              )}
              {modulosNuevo.has("caja") && (
                <label className="flex items-center gap-1.5 text-xs text-foreground border-t border-border pt-2">
                  <input type="checkbox" checked={verMontosCajaNuevo} onChange={(e) => setVerMontosCajaNuevo(e.target.checked)} />
                  Nivel supervisor: puede ver montos y totales de Caja (ventas del día, efectivo esperado, reportes)
                </label>
              )}
              {(modulosNuevo.has("reportes") || modulosNuevo.has("inventario") || modulosNuevo.has("caja")) && (
                <label className="flex items-center gap-1.5 text-xs text-foreground border-t border-border pt-2">
                  <input type="checkbox" checked={verTodoNegocioNuevo} onChange={(e) => setVerTodoNegocioNuevo(e.target.checked)} />
                  Supervisor de sucursales: ve Reportes/Inventario/Caja de TODAS las sucursales, no solo la suya
                </label>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => setCreando(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
                <button disabled={pending} onClick={crearRol}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-xs font-medium">
                  <Check className="w-3 h-3" /> Crear rol
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setCreando(true); setError(null); }}
              className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-border hover:bg-muted rounded-lg text-xs font-medium text-muted-foreground">
              <Plus className="w-3.5 h-3.5" /> Crear rol personalizado
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
