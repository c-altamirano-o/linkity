import "server-only";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
import { moduloPermitido, type ModuloKey } from "@/lib/roles";

/**
 * Resolutor de "quién está haciendo esta acción", compartido por todos los
 * Server Actions que antes reimplementaban su propio bloque de
 * `resolverTenantYUsuario` (uno por archivo — pos-actions.ts,
 * caja-actions.ts, reparaciones-actions.ts, etc., cada uno con su propia
 * copia casi idéntica del mismo bloque de Supabase Auth + búsqueda de
 * User). A partir de M11 (PIN de personal) hay DOS identidades posibles
 * detrás de una sesión:
 *
 * 1. Administrador/Gerente con cuenta real (Supabase Auth, /login) — acceso
 *    sin restricción de módulo (igual que siempre, ningún cambio de
 *    comportamiento para el dueño).
 * 2. Empleado con sesión de PIN (cookie firmada, /[tenant]/entrada) — el
 *    acceso se restringe módulo por módulo según su Role (lib/roles.ts).
 *
 * El tipo de retorno es a propósito IDÉNTICO al `ResolverResult` que ya
 * usaban esos archivos (`{ok:true, tenant:{id}, dbUser:{id,tenantId}}`),
 * así que reemplazar el cuerpo de su resolver local por una llamada a
 * `resolverActor` no obliga a tocar ninguna otra línea de esos archivos —
 * todo lo que ya usa `resuelto.tenant.id` / `resuelto.dbUser.id` sigue
 * funcionando sin cambios.
 */

export type ActorResult =
  | { ok: true; tenant: { id: string }; dbUser: { id: string; tenantId: string }; actor: "admin" | "staff"; roleName: string | null }
  | { ok: false; error: string };

export async function resolverActor(tenantSlug: string, modulo: ModuloKey): Promise<ActorResult> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  if (!tenant) return { ok: false, error: "Negocio no encontrado" };

  // 1. Sesión de administrador (Supabase Auth) — sin restricción de módulo,
  //    exactamente el mismo comportamiento que tenía cada resolver local.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const dbUser = await prisma.user.findUnique({ where: { supabaseId: user.id }, select: { id: true, tenantId: true } });
    if (dbUser && dbUser.tenantId === tenant.id) {
      return { ok: true, tenant, dbUser, actor: "admin", roleName: null };
    }
    // Sesión de Supabase válida pero de otro tenant (o sin User todavía) —
    // no se rechaza de inmediato: cae al intento de sesión de personal por
    // si el mismo navegador también tiene una sesión de PIN abierta.
  }

  // 2. Sesión de personal por PIN — verificarSesionPersonalVigente (en vez
  //    de leerSesionPersonal a secas) hace cumplir además el cierre
  //    automático al cambiar de día (lib/asistencia.ts).
  const sesion = await verificarSesionPersonalVigente();
  if (sesion && sesion.tenantId === tenant.id) {
    if (!moduloPermitido(sesion.roleName, modulo)) {
      return { ok: false, error: "Tu rol no tiene acceso a este módulo" };
    }
    return {
      ok: true,
      tenant,
      dbUser: { id: sesion.userId, tenantId: tenant.id },
      actor: "staff",
      roleName: sesion.roleName,
    };
  }

  return { ok: false, error: "Sesión no válida, vuelve a iniciar sesión" };
}
