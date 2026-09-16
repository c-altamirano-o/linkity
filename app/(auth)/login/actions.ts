"use server";

import { prisma } from "@/lib/prisma";

export async function getTenantSlugBySupabaseId(
  supabaseId: string
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { supabaseId },
    include: { tenant: true },
  });
  return user?.tenant.slug ?? null;
}

// Usado por el login en vez de getTenantSlugBySupabaseId de arriba: ese
// devuelve el slug sin importar si el usuario sigue activo, así que la
// pantalla de Usuarios de Panel Maestro (que ahora sí puede desactivar el
// acceso de alguien) no tenía ningún efecto real — la cuenta desactivada
// seguía pudiendo iniciar sesión igual. Se deja la función original intacta
// por si algo más la usa; el login usa esta.
export async function getTenantAccesoBySupabaseId(
  supabaseId: string
): Promise<{ tenantSlug: string | null; cuentaDesactivada: boolean }> {
  const user = await prisma.user.findUnique({
    where: { supabaseId },
    include: { tenant: true },
  });
  if (!user) return { tenantSlug: null, cuentaDesactivada: false };
  if (!user.isActive) return { tenantSlug: null, cuentaDesactivada: true };
  return { tenantSlug: user.tenant.slug, cuentaDesactivada: false };
}

// Un administrador de Panel Maestro (tabla SuperAdmin, ver
// lib/maestro-auth.ts) normalmente NO tiene ningún User de negocio — antes
// de esto, su login se rechazaba con "Tu cuenta no está asociada a ningún
// negocio" aunque la contraseña fuera correcta, porque el login solo sabía
// buscar en User/Tenant.
export async function isSuperAdminBySupabaseId(supabaseId: string): Promise<boolean> {
  const admin = await prisma.superAdmin.findUnique({
    where: { supabaseId },
    select: { isActive: true },
  });
  return !!admin?.isActive;
}