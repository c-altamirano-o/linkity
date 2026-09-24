"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { resolverActor } from "@/lib/actor";
import { ROL_ADMINISTRADOR, MODULOS, type ModuloKey, type RolTenantUI } from "@/lib/roles";
import { listarRolesTenant, guardarPermisosDeRol } from "@/lib/roles-server";

/**
 * Server Actions de "Roles y permisos" (2026-09-17) — el editor que le
 * permite a cada negocio crear sus propios puestos/roles y decidir a qué
 * módulos tiene acceso cada uno (a petición de Carlos: ver el comentario
 * largo en lib/roles-server.ts). Vive dentro de Personal, mismo guard que
 * el resto del módulo (resolverActor(tenantSlug, "personal")) — 100%
 * admin-only, ningún rol asignable incluye "personal" en su matriz.
 */

export type AccionRolResult = { ok: true } | { ok: false; error: string };
export type AccionListarRolesResult = { ok: true; roles: RolTenantUI[] } | { ok: false; error: string };

function validarModulos(modulos: string[]): ModuloKey[] {
  const validos = new Set<string>(MODULOS);
  return modulos.filter((m): m is ModuloKey => validos.has(m));
}

export async function listarRolesTenantAction(tenantSlug: string): Promise<AccionListarRolesResult> {
  const resuelto = await resolverActor(tenantSlug, "personal");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  try {
    const roles = await listarRolesTenant(resuelto.tenant.id);
    return { ok: true, roles };
  } catch (err) {
    console.error("Error al listar roles:", err);
    return { ok: false, error: "No se pudieron cargar los roles" };
  }
}

export async function crearRolAction(params: {
  tenantSlug: string;
  nombre: string;
  descripcion?: string | null;
  modulos: string[];
  verTodoTaller?: boolean;
  verMontosCaja?: boolean;
  verTodoNegocio?: boolean;
}): Promise<AccionRolResult> {
  const { tenantSlug, descripcion } = params;
  const nombre = params.nombre.trim();

  if (!nombre) return { ok: false, error: "El nombre del rol es obligatorio" };
  if (nombre === ROL_ADMINISTRADOR) return { ok: false, error: "Ese nombre está reservado" };

  const resuelto = await resolverActor(tenantSlug, "personal");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  try {
    const rol = await prisma.role.create({
      data: { tenantId: tenant.id, name: nombre, description: descripcion?.trim() || null, isSystem: false },
      select: { id: true },
    });
    await guardarPermisosDeRol(rol.id, validarModulos(params.modulos), params.verTodoTaller, params.verMontosCaja, params.verTodoNegocio);

    revalidatePath(`/${tenantSlug}/personal`);
    return { ok: true };
  } catch (err: any) {
    if (err?.code === "P2002") return { ok: false, error: "Ya existe un rol con ese nombre en tu negocio" };
    console.error("Error al crear rol:", err);
    return { ok: false, error: "No se pudo crear el rol" };
  }
}

export async function actualizarRolAction(params: {
  tenantSlug: string;
  roleId: string;
  nombre?: string;
  descripcion?: string | null;
  modulos: string[];
  verTodoTaller?: boolean;
  verMontosCaja?: boolean;
  verTodoNegocio?: boolean;
}): Promise<AccionRolResult> {
  const { tenantSlug, roleId, descripcion } = params;

  const resuelto = await resolverActor(tenantSlug, "personal");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  try {
    const rol = await prisma.role.findUnique({ where: { id: roleId }, select: { tenantId: true, isSystem: true, name: true } });
    if (!rol || rol.tenantId !== tenant.id) return { ok: false, error: "Rol no encontrado" };
    if (rol.name === ROL_ADMINISTRADOR) return { ok: false, error: "Ese rol no se puede editar" };

    // Los 3 roles base (isSystem) pueden ajustar sus permisos, pero no su
    // nombre — son el punto de partida que roles-server.ts reconoce por
    // nombre exacto para autorreparar tenants viejos (ver el comentario
    // largo ahí); renombrarlos rompería esa coincidencia.
    const nuevoNombre = params.nombre?.trim();
    if (nuevoNombre && !rol.isSystem && nuevoNombre !== rol.name) {
      await prisma.role.update({ where: { id: roleId }, data: { name: nuevoNombre } });
    }
    if (descripcion !== undefined) {
      await prisma.role.update({ where: { id: roleId }, data: { description: descripcion?.trim() || null } });
    }

    await guardarPermisosDeRol(roleId, validarModulos(params.modulos), params.verTodoTaller, params.verMontosCaja, params.verTodoNegocio);

    revalidatePath(`/${tenantSlug}/personal`);
    return { ok: true };
  } catch (err: any) {
    if (err?.code === "P2002") return { ok: false, error: "Ya existe un rol con ese nombre en tu negocio" };
    console.error("Error al actualizar rol:", err);
    return { ok: false, error: "No se pudo actualizar el rol" };
  }
}

export async function eliminarRolAction(params: { tenantSlug: string; roleId: string }): Promise<AccionRolResult> {
  const { tenantSlug, roleId } = params;

  const resuelto = await resolverActor(tenantSlug, "personal");
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const { tenant } = resuelto;

  try {
    const rol = await prisma.role.findUnique({
      where: { id: roleId },
      select: { tenantId: true, isSystem: true, name: true, _count: { select: { staff: true } } },
    });
    if (!rol || rol.tenantId !== tenant.id) return { ok: false, error: "Rol no encontrado" };
    if (rol.isSystem || rol.name === ROL_ADMINISTRADOR) return { ok: false, error: "Los roles base del sistema no se pueden eliminar" };
    if (rol._count.staff > 0) {
      return { ok: false, error: `Hay ${rol._count.staff} empleado(s) con este rol — reasígnalos a otro rol antes de eliminarlo` };
    }

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId } }),
      prisma.role.delete({ where: { id: roleId } }),
    ]);

    revalidatePath(`/${tenantSlug}/personal`);
    return { ok: true };
  } catch (err) {
    console.error("Error al eliminar rol:", err);
    return { ok: false, error: "No se pudo eliminar el rol" };
  }
}
