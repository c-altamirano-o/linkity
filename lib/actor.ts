import "server-only";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
import type { ModuloKey } from "@/lib/roles";
import { modulosPermitidosParaRolPorNombre } from "@/lib/roles-server";

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
 *
 * ORDEN DE PRIORIDAD (2026-09-21, corregido a pedido de Carlos tras
 * encontrar el hueco): se revisa PRIMERO la sesión de personal por PIN, y
 * solo si no hay ninguna se cae al fallback de administrador. Antes era al
 * revés, y eso abría un hueco de privilegios real: /[tenant]/entrada es una
 * pantalla pensada para una COMPUTADORA COMPARTIDA (mostrador, caja) — si
 * el administrador alguna vez inició sesión ahí y solo cerró la pestaña sin
 * cerrar sesión (la cookie de Supabase Auth sigue viva), cualquier empleado
 * que después entrara con su PIN en esa misma computadora heredaba acceso
 * total de administrador sin restricción, en vez de quedar limitado a su
 * rol — el PIN de 4 dígitos dejaba de significar nada. Con el personal
 * primero, una sesión de PIN activa SIEMPRE manda mientras dure (hasta
 * "Cambiar de usuario"), sin importar qué otra cookie ande viva en el
 * navegador — así el PIN cumple lo que promete. Un administrador que entra
 * por /login normal, sin haber pasado nunca por /entrada, no se ve
 * afectado: nunca tiene sesión de personal que revisar primero.
 */

export type ActorResult =
  | { ok: true; tenant: { id: string }; dbUser: { id: string; tenantId: string }; actor: "admin" | "staff"; roleName: string | null }
  | { ok: false; error: string };

export async function resolverActor(tenantSlug: string, modulo: ModuloKey): Promise<ActorResult> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  if (!tenant) return { ok: false, error: "Negocio no encontrado" };

  // 1. Sesión de personal por PIN — se revisa PRIMERO (ver comentario de
  //    arriba). verificarSesionPersonalVigente (en vez de leerSesionPersonal
  //    a secas) hace cumplir además el cierre automático al cambiar de día
  //    (lib/asistencia.ts).
  const sesion = await verificarSesionPersonalVigente();
  if (sesion && sesion.tenantId === tenant.id) {
    const modulosPermitidos = await modulosPermitidosParaRolPorNombre(tenant.id, sesion.roleName);
    if (!modulosPermitidos.includes(modulo)) {
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

  // 2. Sin sesión de personal vigente para ESTE tenant — fallback a sesión
  //    de administrador (Supabase Auth), sin restricción de módulo.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const dbUser = await prisma.user.findUnique({ where: { supabaseId: user.id }, select: { id: true, tenantId: true } });
    if (dbUser && dbUser.tenantId === tenant.id) {
      return { ok: true, tenant, dbUser, actor: "admin", roleName: null };
    }
  }

  return { ok: false, error: "Sesión no válida, vuelve a iniciar sesión" };
}
