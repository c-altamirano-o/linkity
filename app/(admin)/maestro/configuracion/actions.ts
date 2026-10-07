"use server";

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/maestro-auth";

export interface SuperAdminListItem {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
}

export interface SuperAdminActionResult {
  ok: boolean;
  error?: string;
}

export async function listarSuperAdminsAction(): Promise<SuperAdminListItem[]> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return [];

  return prisma.superAdmin.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function alternarSuperAdminAction(params: {
  id: string;
  activo: boolean;
}): Promise<SuperAdminActionResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  if (params.id === resuelto.admin.id) {
    return {
      ok: false,
      error: "No puedes desactivar tu propia cuenta.",
    };
  }

  const admin = await prisma.superAdmin.findUnique({
    where: { id: params.id },
    select: { id: true },
  });

  if (!admin) {
    return { ok: false, error: "Administrador no encontrado." };
  }

  try {
    await prisma.superAdmin.update({
      where: { id: params.id },
      data: { isActive: params.activo },
    });

    return { ok: true };
  } catch (err) {
    console.error("Error actualizando SuperAdmin:", err);
    return {
      ok: false,
      error: "No se pudo actualizar el administrador.",
    };
  }
}

export async function invitarSuperAdminAction(params: {
  name: string;
  email: string;
}): Promise<SuperAdminActionResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  const name = params.name.trim();
  const email = params.email.trim().toLowerCase();

  if (!name) {
    return { ok: false, error: "El nombre es obligatorio." };
  }

  if (!email || !email.includes("@")) {
    return { ok: false, error: "Ingresa un correo electrónico válido." };
  }

  const existente = await prisma.superAdmin.findUnique({
    where: { email },
    select: { id: true, isActive: true },
  });

  if (existente) {
    return {
      ok: false,
      error: existente.isActive
        ? "Ese correo ya pertenece a un administrador del sistema."
        : "Ese correo pertenece a un administrador desactivado. Puedes reactivarlo desde la lista.",
    };
  }

  const usuarioNegocio = await prisma.user.findFirst({
    where: { email },
    select: { id: true },
  });

  if (usuarioNegocio) {
    return {
      ok: false,
      error: "Ese correo ya está asociado a una cuenta de un negocio y no puede utilizarse para un administrador del sistema.",
    };
  }

  const supabaseAdmin = createAdminClient();

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: "https://linkity-phi.vercel.app/auth/invitacion",
      data: {
        name,
        role: "superadmin",
      },
    }
  );

  if (error || !data.user) {
    console.error("Error enviando invitación de SuperAdmin:", error);
    return {
      ok: false,
      error: error?.message ?? "No se pudo enviar la invitación.",
    };
  }

  try {
    await prisma.superAdmin.create({
      data: {
        supabaseId: data.user.id,
        email,
        name,
        isActive: true,
      },
    });

    return { ok: true };
  } catch (err) {
    console.error("Error registrando SuperAdmin después de invitación:", err);

    await supabaseAdmin.auth.admin.deleteUser(data.user.id);

    return {
      ok: false,
      error: "La invitación no pudo registrarse correctamente. No se creó el administrador.",
    };
  }
}

