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