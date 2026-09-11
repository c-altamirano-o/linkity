"use server";

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODULE_CATALOG, ALL_MODULE_CODES } from "@/lib/modules-catalog";
import { calcularVigencia, type BillingCycle } from "@/lib/subscripcion";

/**
 * Alta de un negocio nuevo por auto-registro público (app/(auth)/register).
 *
 * Flujo real acordado con Carlos: formulario de datos → pantalla de pago
 * (simulada — no hay PAC ni pasarela de pago real conectada, mismo
 * criterio que el timbrado CFDI) → hasta que se "paga" se crea la cuenta.
 * Por eso esta acción solo se llama desde el paso de pago del wizard, no
 * desde el primer paso — igual que si un cliente real solo obtiene acceso
 * después de pagar.
 *
 * Dos diferencias contra createTenantAction de Panel Maestro:
 * 1. Aquí SÍ se captura businessType (rubro) desde el propio formulario —
 *    Panel Maestro no lo pide todavía (gap encontrado de paso, no es
 *    parte de este cambio arreglarlo ahí, queda documentado).
 * 2. La suscripción nace ACTIVA (no TRIAL) con la vigencia y el ciclo de
 *    cobro que el cliente eligió en el paso de pago — respetando la
 *    aclaración de Carlos de que aquí SÍ hay una compra real de por
 *    medio, aunque el cobro en sí sea simulado por ahora.
 *
 * El visitante nunca escribe una contraseña en este formulario: la cuenta
 * de Supabase se crea con una contraseña temporal generada por el
 * servidor (igual que Panel Maestro) y con el flag
 * user_metadata.must_change_password=true — RegisterPage.tsx usa esa
 * contraseña (que el servidor le regresa) para iniciar sesión al
 * visitante automáticamente y mandarlo a /primer-acceso, donde SÍ teclea
 * su propia contraseña nueva él mismo antes de llegar a su negocio.
 *
 * Todo negocio que se auto-registra empieza con todos los módulos
 * activos (a diferencia de Panel Maestro, donde el admin de Linkity
 * elige módulos a mano) — es más simple para un cliente nuevo ver todo
 * el sistema desde el día uno.
 */

interface RegistrarNegocioInput {
  businessName: string;
  businessType: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string;
  plan: string;
  billingCycle: BillingCycle;
  autoRenew: boolean;
}

interface RegistrarNegocioResult {
  success: boolean;
  error?: string;
  tenantSlug?: string;
  ownerEmail?: string;
  tempPassword?: string;
}

const PLAN_PRICES: Record<string, number> = {
  Basico: 499,
  Pro: 999,
  Enterprise: 1999,
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function generateTempPassword(): string {
  return "Temp" + Math.random().toString(36).slice(-8) + "!1";
}

export async function registrarNegocioAction(
  input: RegistrarNegocioInput
): Promise<RegistrarNegocioResult> {
  try {
    if (!input.businessName.trim() || !input.ownerName.trim() || !input.ownerEmail.trim()) {
      return { success: false, error: "Faltan campos obligatorios." };
    }
    if (!input.businessType) {
      return { success: false, error: "Selecciona el giro de tu negocio." };
    }

    const baseSlug = slugify(input.businessName);
    if (!baseSlug) {
      return { success: false, error: "El nombre del negocio no es válido." };
    }

    const existingTenant = await prisma.tenant.findUnique({ where: { slug: baseSlug } });
    if (existingTenant) {
      return { success: false, error: "Ya existe un negocio registrado con ese nombre." };
    }

    const existingUser = await prisma.user.findFirst({ where: { email: input.ownerEmail.trim() } });
    if (existingUser) {
      return { success: false, error: "Ya existe una cuenta con ese correo." };
    }

    const supabaseAdmin = createAdminClient();
    const tempPassword = generateTempPassword();

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: input.ownerEmail.trim(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: { must_change_password: true },
    });

    if (authError || !authData.user) {
      return {
        success: false,
        error: `No se pudo crear tu cuenta: ${authError?.message ?? "error desconocido"}`,
      };
    }

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: input.businessName.trim(),
          slug: baseSlug,
          businessType: input.businessType,
          email: input.ownerEmail.trim(),
          phone: input.ownerPhone?.trim() || null,
        },
      });

      const branch = await tx.branch.create({
        data: { tenantId: tenant.id, name: "Sucursal Principal" },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          email: input.ownerEmail.trim(),
          name: input.ownerName.trim(),
          supabaseId: authData.user!.id,
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

      await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });

      const price = PLAN_PRICES[input.plan] ?? PLAN_PRICES.Basico;
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          plan: input.plan,
          status: "ACTIVE",
          price,
          billingCycle: input.billingCycle,
          autoRenew: input.autoRenew,
          endDate: calcularVigencia(input.billingCycle),
        },
      });

      for (const code of ALL_MODULE_CODES) {
        const info = MODULE_CATALOG[code];
        const mod = await tx.module.upsert({
          where: { code },
          update: {},
          create: { code, name: info.name, isCore: info.isCore },
        });
        await tx.tenantModule.create({ data: { tenantId: tenant.id, moduleId: mod.id } });
      }

      return tenant;
    });

    return { success: true, tenantSlug: result.slug, ownerEmail: input.ownerEmail.trim(), tempPassword };
  } catch (err) {
    console.error("Error en auto-registro de negocio:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}
