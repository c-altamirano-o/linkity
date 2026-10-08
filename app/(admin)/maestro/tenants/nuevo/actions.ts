"use server";

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODULE_CATALOG } from "@/lib/modules-catalog";
import { requireSuperAdmin } from "@/lib/maestro-auth";
import { generarPasswordTemporal } from "@/lib/password-temporal";
import { canonizarCorreo } from "@/lib/correo-canonico";

interface CreateTenantInput {
  businessName: string;
  rfc: string;
  phone: string;
  city: string;
  state: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
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

    // Regla de Carlos (2026-10-08): nadie puede quedar ACTIVE sin plan. Todo
    // negocio nuevo nace en prueba gratis; para activarlo se usa «Renovar» en
    // su ficha, que obliga a elegir plan.
    if (!Number.isInteger(input.trialDays) || input.trialDays < 1 || input.trialDays > 90) {
      return { success: false, error: "Elige los días de prueba (de 1 a 90)." };
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
    const tempPassword = generarPasswordTemporal();

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
        },
      });

      // Carlos puede dar de alta a quien ya usó su prueba (decisión suya, no
      // se bloquea), pero igual queda registrado el correo — sin fallar si ya
      // estaba — para que no use además el auto-registro público.
      const correoCanonico = canonizarCorreo(input.ownerEmail);
      if (correoCanonico) {
        await tx.pruebaGratisUsada.upsert({
          where: { emailCanonico: correoCanonico },
          update: {},
          create: { emailCanonico: correoCanonico, emailOriginal: input.ownerEmail.trim(), tenantSlug: tenant.slug },
        });
      }

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
      // se rompan. Siempre nace en prueba gratis (TRIAL, sin plan ni límites);
      // pasa a ACTIVE con «Renovar», eligiendo plan.
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          plan: "Hotmart",
          status: "TRIAL",
          price: 0,
          endDate: new Date(Date.now() + input.trialDays * 24 * 60 * 60 * 1000),
        },
      });

      // Nota (2026-09-17, personalización por rubro): el enforcement real
      // de módulos ahora es "default abierto" — sin fila, o fila con
      // isActive:true, es un módulo ACTIVO; solo una fila explícita
      // isActive:false lo oculta (ver app/actions/modulos-tenant-actions.ts).
      // Por eso aquí se recorre TODO el catálogo, no solo input.modules:
      // los que Carlos marcó quedan con fila isActive:true (informativo,
      // mismo efecto que no tener fila) y los que NO marcó quedan con una
      // fila explícita isActive:false, para que su elección en este
      // formulario de verdad oculte algo en el negocio nuevo.
      const marcados = new Set(input.modules);
      for (const code of Object.keys(MODULE_CATALOG)) {
        const info = MODULE_CATALOG[code];

        const mod = await tx.module.upsert({
          where: { code },
          update: {},
          create: { code, name: info.name, isCore: info.isCore },
        });

        await tx.tenantModule.create({
          data: { tenantId: tenant.id, moduleId: mod.id, isActive: info.isCore || marcados.has(code) },
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