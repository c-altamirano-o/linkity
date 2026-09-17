"use server";

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODULE_CATALOG } from "@/lib/modules-catalog";
import { requireSuperAdmin } from "@/lib/maestro-auth";

interface CreateTenantInput {
  businessName: string;
  rfc: string;
  phone: string;
  city: string;
  state: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  esquemaId: string | null;
  trialDays: number;
  modules: string[];
}

interface CreateTenantResult {
  success: boolean;
  error?: string;
  tenantSlug?: string;
  tempPassword?: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function generateTempPassword(): string {
  return "Temp" + Math.random().toString(36).slice(-8) + "!1";
}

export async function createTenantAction(
  input: CreateTenantInput
): Promise<CreateTenantResult> {
  // Server Actions son llamables por POST directo, sin pasar por el layout
  // de /maestro — el guard de la UI no alcanza a protegerlas por sí solo.
  // Ver lib/maestro-auth.ts.
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { success: false, error: resuelto.error };

  try {
    if (!input.businessName || !input.ownerName || !input.ownerEmail) {
      return { success: false, error: "Faltan campos obligatorios." };
    }

    const baseSlug = slugify(input.businessName);
    if (!baseSlug) {
      return { success: false, error: "El nombre del negocio no es valido." };
    }

    const existing = await prisma.tenant.findUnique({ where: { slug: baseSlug } });
    if (existing) {
      return { success: false, error: `Ya existe un negocio con el slug "${baseSlug}".` };
    }

    const supabaseAdmin = createAdminClient();
    const tempPassword = generateTempPassword();

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: input.ownerEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { must_change_password: true },
      });

    if (authError || !authData.user) {
      return {
        success: false,
        error: `Error creando usuario en Supabase: ${authError?.message ?? "desconocido"}`,
      };
    }

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: input.businessName,
          slug: baseSlug,
          rfc: input.rfc || null,
          phone: input.phone || null,
          city: input.city || null,
          state: input.state || null,
          email: input.ownerEmail,
          esquemaId: input.esquemaId,
        },
      });

      const branch = await tx.branch.create({
        data: { tenantId: tenant.id, name: "Sucursal Principal" },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          email: input.ownerEmail,
          name: input.ownerName,
          supabaseId: authData.user.id,
        },
      });

      const role = await tx.role.create({
        data: {
          tenantId: tenant.id,
          name: "Administrador",
          description: "Acceso completo",
          isSystem: true,
        },
      });

      await tx.userRole.create({
        data: { userId: user.id, roleId: role.id },
      });

      // Precio en 0 y plan fijo a "Hotmart": el cobro real lo gestiona
      // Hotmart fuera de la plataforma (ver comentario en
      // app/(auth)/register/actions.ts) — esta fila solo existe para que
      // Suscripciones/Dashboard, que asumen que todo tenant tiene una, no
      // se rompan. El período de prueba sigue siendo interno (no lo ve
      // Hotmart) porque Carlos lo usa para negocios que está probando antes
      // de mandarlos a Hotmart.
      const hasTrial = input.trialDays > 0;
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          plan: "Hotmart",
          status: hasTrial ? "TRIAL" : "ACTIVE",
          price: 0,
          endDate: hasTrial
            ? new Date(Date.now() + input.trialDays * 24 * 60 * 60 * 1000)
            : null,
        },
      });

      for (const code of input.modules) {
        const info = MODULE_CATALOG[code];
        if (!info) continue;

        const mod = await tx.module.upsert({
          where: { code },
          update: {},
          create: { code, name: info.name, isCore: info.isCore },
        });

        await tx.tenantModule.create({
          data: { tenantId: tenant.id, moduleId: mod.id },
        });
      }

      return tenant;
    });

    return { success: true, tenantSlug: result.slug, tempPassword };
  } catch (err) {
    console.error("Error creando tenant:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}