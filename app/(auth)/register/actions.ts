"use server";

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODULE_CATALOG, ALL_MODULE_CODES } from "@/lib/modules-catalog";
import { getEsquemaDefault } from "@/lib/esquemas-data";

/**
 * Alta de un negocio nuevo por auto-registro público (app/(auth)/register).
 *
 * Historia (2026-09): antes este flujo tenía un segundo paso donde el
 * visitante elegía Plan (Básico/Pro/Enterprise) + vigencia + auto-renovación,
 * y esta acción cobraba (de forma simulada) y creaba la Subscription con
 * ese plan/precio. Carlos decidió mover el cobro y los paquetes/usuarios
 * adicionales a Hotmart (gestionado por completo fuera de la plataforma),
 * así que el visitante ya no elige nada de eso aquí — el formulario es solo
 * el paso de datos, y la cuenta se crea directo al enviarlo.
 *
 * Lo que antes decidía el visitante (cuántas sucursales/empleados puede
 * tener) ahora lo decide Carlos desde Panel Maestro (/maestro/esquemas,
 * /maestro/tenants/[slug]): todo negocio nuevo recibe automáticamente el
 * esquema marcado como predeterminado (getEsquemaDefault(), lib/esquemas-data.ts)
 * — si Carlos no ha creado ningún esquema todavía, el negocio queda sin
 * esquema asignado (sin límite) hasta que le asigne uno a mano.
 *
 * La Subscription se sigue creando (status ACTIVE, precio 0) solo para que
 * las pantallas de Suscripciones/Dashboard de Panel Maestro — que ya
 * dependen de que exista una fila — sigan funcionando; el precio real que
 * paga el cliente ya no vive en esta base de datos, vive en Hotmart.
 *
 * Diferencia que se mantiene contra createTenantAction de Panel Maestro:
 * aquí SÍ se captura businessType (rubro) desde el propio formulario —
 * Panel Maestro no lo pide todavía (gap encontrado de paso, no es parte de
 * este cambio arreglarlo ahí, queda documentado).
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
}

interface RegistrarNegocioResult {
  success: boolean;
  error?: string;
  tenantSlug?: string;
  ownerEmail?: string;
  tempPassword?: string;
}

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

    const esquemaDefault = await getEsquemaDefault();

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: input.businessName.trim(),
          slug: baseSlug,
          businessType: input.businessType,
          email: input.ownerEmail.trim(),
          phone: input.ownerPhone?.trim() || null,
          esquemaId: esquemaDefault?.id ?? null,
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

      // Precio en 0 y plan fijo a "Hotmart": el cobro real ya no vive aquí.
      // Esta fila solo existe para que Suscripciones/Dashboard (Panel
      // Maestro) — que hoy asumen que todo tenant tiene una — no se rompan.
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          plan: "Hotmart",
          status: "ACTIVE",
          price: 0,
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
