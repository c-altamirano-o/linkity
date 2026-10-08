"use server";

import { DIAS_PRUEBA } from "@/lib/ciclo-suscripcion";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODULE_CATALOG, ALL_MODULE_CODES } from "@/lib/modules-catalog";
import { modulosRecomendadosOff } from "@/lib/modulos-rubro";
import { asegurarRolesRubro } from "@/lib/roles-server";

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
 * Cuántas sucursales y empleados puede tener un negocio ya no se decide aquí
 * ni con "esquemas": lo decide su PLAN COMERCIAL (lib/capacidades-comerciales.ts).
 * Todo negocio nuevo arranca en prueba gratis (TRIAL, sin límites ni plan);
 * el plan se asigna cuando Hotmart avisa del pago o a mano desde Panel Maestro.
 *
 * La Subscription se sigue creando (status TRIAL, precio 0) solo para que
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
 * Todo negocio que se auto-registra empieza con los módulos que
 * recomienda su rubro (2026-09-17, personalización por rubro — ver
 * lib/modulos-rubro.ts): la mayoría quedan activos desde el día uno igual
 * que antes, pero el o los módulos que no aplican a su giro (ej.
 * "Reparaciones" para una barbería) arrancan ya desactivados, en vez de
 * que el negocio tenga que descubrir y apagarlo él mismo después. Sigue
 * siendo una sugerencia, no un candado: el propio negocio puede reactivar
 * cualquier módulo desde Configuración cuando quiera.
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

// Traduce los mensajes de Supabase Auth (siempre en inglés) a algo que un
// visitante real pueda leer — antes se mostraba el texto crudo de
// authError.message directo en el formulario (ej. "User already
// registered"), rompiendo el idioma y el tono del resto del flujo y sin
// decirle a la persona qué hacer. Los casos no reconocidos caen a un
// mensaje genérico en español en vez de filtrar el texto de Supabase.
function mensajeErrorRegistro(authError: { message?: string } | null | undefined): string {
  const msg = authError?.message?.toLowerCase() ?? "";
  if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("already been registered")) {
    return "Ya existe una cuenta con ese correo — intenta iniciar sesión.";
  }
  if (msg.includes("password")) {
    return "La contraseña generada no cumple los requisitos de seguridad. Intenta de nuevo.";
  }
  if (msg.includes("email") && (msg.includes("invalid") || msg.includes("valid"))) {
    return "El correo electrónico no es válido.";
  }
  return "No se pudo crear tu cuenta. Intenta de nuevo en unos minutos.";
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
        error: mensajeErrorRegistro(authError),
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

      // Precio en 0 y plan fijo a "Hotmart": el cobro real ya no vive aquí.
      // Esta fila solo existe para que Suscripciones/Dashboard (Panel
      // Maestro) — que hoy asumen que todo tenant tiene una — no se rompan.
      //
      // 2026-10-06, a petición de Carlos: todo auto-registro arranca con la
      // PRUEBA GRATIS de 30 días que ya promete la landing (status TRIAL +
      // endDate a 30 días). Antes se creaba ACTIVE sin endDate — o sea,
      // acceso gratis para siempre y nunca se bloqueaba. Al terminar la
      // prueba el acceso se bloquea solo (ver lib/ciclo-suscripcion.ts) y se
      // reactiva cuando Hotmart avisa del pago (app/api/webhooks/hotmart).
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          plan: "Hotmart",
          status: "TRIAL",
          price: 0,
          endDate: new Date(Date.now() + DIAS_PRUEBA * 24 * 60 * 60 * 1000),
        },
      });

      const recomendadosOff = new Set(modulosRecomendadosOff(input.businessType));
      for (const code of ALL_MODULE_CODES) {
        const info = MODULE_CATALOG[code];
        const mod = await tx.module.upsert({
          where: { code },
          update: {},
          create: { code, name: info.name, isCore: info.isCore },
        });
        await tx.tenantModule.create({
          data: { tenantId: tenant.id, moduleId: mod.id, isActive: !recomendadosOff.has(code) },
        });
      }

      return tenant;
    });

    // Roles con jerarquía y permisos reales para el rubro elegido (lib/
    // roles-rubro.ts, 2026-09-21 a petición de Carlos) — fuera de la
    // transacción de arriba a propósito (no es una operación atómica con
    // el alta del tenant; si llegara a fallar, el negocio igual queda
    // creado y "Roles y permisos" los crea solo en el primer vistazo, ver
    // listarRolesTenant en lib/roles-server.ts).
    await asegurarRolesRubro(result.id, input.businessType);

    return { success: true, tenantSlug: result.slug, ownerEmail: input.ownerEmail.trim(), tempPassword };
  } catch (err) {
    // Mismo criterio que mensajeErrorRegistro arriba: nunca se le muestra al
    // visitante el texto crudo de un error interno (antes podía filtrar
    // mensajes de Prisma/DB sin traducir) — se registra en el log del
    // servidor y se responde con un mensaje genérico en español.
    console.error("Error en auto-registro de negocio:", err);
    return {
      success: false,
      error: "No se pudo crear tu cuenta. Intenta de nuevo en unos minutos.",
    };
  }
}
