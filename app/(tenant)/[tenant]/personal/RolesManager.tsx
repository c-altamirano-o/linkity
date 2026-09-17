"use client";

import { useState, useTransition } from "react";
import { X, Plus, Trash2, Pencil, Check, Shield } from "lucide-react";
import { MODULOS, type ModuloKey, type RolTenantUI } from "@/lib/roles";
import { MODULE_CATALOG } from "@/lib/modules-catalog";
import {
  listarRolesTenantAction, crearRolAction, actualizarRolAction, eliminarRolAction,
} from "@/app/actions/roles-tenant-actions";

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
 */

const MODULOS_ASIGNABLES: ModuloKey[] = MODULOS.filter(
  (m) => !["dashboard", "personal", "asistencia", "facturacion", "configuracion"].includes(m)
);

interface RolesManagerProps {
  tenantSlug: string;
  rolesIniciales: RolTenantUI[];
  onCerrar: () => void;
  onCambio: () => void;
}

export default function RolesManager({ tenantSlug, rolesIniciales, onCerrar, onCambio }: RolesManagerProps) {
  const [roles, setRoles] = useState<RolTenantUI[]>(rolesIniciales);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEdit, setNombreEdit] = useState("");
  const [modulosEdit, setModulosEdit] = useState<Set<ModuloKey>>(new Set());
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [modulosNuevo, setModulosNuevo] = useState<Set<ModuloKey>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      const res = await crearRolAction({ tenantSlug, nombre: nombreNuevo, modulos: Array.from(modulosNuevo) });
      if (res.ok) {
        setCreando(false);
        setNombreNuevo("");
        setModulosNuevo(new Set());
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

  const nombreModulo = (m: ModuloKey) => MODULE_CATALOG[m]?.name ?? m;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={onCerrar}>
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-medium text-foreground flex items-center gap-1.5"><Shield className="w-4 h-4" /> Roles y permisos</span>
          <button onClick={onCerrar} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
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
                      {rol.name} {rol.isSystem && <span className="text-[9px] text-muted-foreground font-normal">(base)</span>}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {rol.modulosPermitidos.map(nombreModulo).join(", ")}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{rol.cantidadEmpleados} empleado(s) con este rol</p>
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
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {MODULOS_ASIGNABLES.map((m) => (
                  <label key={m} className="flex items-center gap-1.5 text-xs text-foreground">
                    <input type="checkbox" checked={modulosNuevo.has(m)} onChange={() => toggleModulo(modulosNuevo, setModulosNuevo, m)} />
                    {nombreModulo(m)}
                  </label>
                ))}
              </div>
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
