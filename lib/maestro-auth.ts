import "server-only";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

/**
 * Guard de acceso a Panel Maestro (/maestro/*). Antes de este cambio,
 * NADA verificaba que quien entrara a estas rutas fuera realmente un
 * administrador de la plataforma — ni el layout, ni las Server Actions de
 * crear negocio o suspender/reactivar suscripciones. Cualquiera que
 * conociera las URLs (autenticado o no) podía, en teoría, ejecutarlas.
 *
 * Se centraliza aquí a propósito, rompiendo la convención del resto del
 * proyecto de duplicar el resolver en cada actions.ts: esto es código de
 * seguridad usado tanto por Server Actions como por un Server Component
 * (el layout), y una función compartida es más fácil de auditar y mantener
 * correcta que la misma lógica de autorización copiada tres veces.
 *
 * Ver el modelo SuperAdmin en prisma/schema.prisma y scripts/set-superadmin.ts
 * para cómo se promueve una cuenta a administrador (no hay UI para esto).
 */

export type SuperAdminResult =
  | { ok: true; admin: { id: string; email: string; name: string } }
  | { ok: false; error: string };

export async function requireSuperAdmin(): Promise<SuperAdminResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión no válida, vuelve a iniciar sesión" };

  const admin = await prisma.superAdmin.findUnique({
    where: { supabaseId: user.id },
    select: { id: true, email: true, name: true, isActive: true },
  });
  if (!admin || !admin.isActive) {
    return { ok: false, error: "Tu cuenta no tiene permisos de administrador de Panel Maestro" };
  }

  return { ok: true, admin: { id: admin.id, email: admin.email, name: admin.name } };
}
