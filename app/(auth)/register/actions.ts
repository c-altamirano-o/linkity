"use server";

import { DIAS_PRUEBA } from "@/lib/ciclo-suscripcion";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODULE_CATALOG, ALL_MODULE_CODES } from "@/lib/modules-catalog";
import { modulosRecomendadosOff } from "@/lib/modulos-rubro";
import { asegurarRolesRubro } from "@/lib/roles-server";
import { generarPasswordTemporal } from "@/lib/password-temporal";
import { correoConfigurado, correoAccesoTemporal, enviarCorreo } from "@/lib/correo-transaccional";
import { eliminarTenantPorCompleto } from "@/lib/eliminar-tenant";
import { canonizarCorreo } from "@/lib/correo-canonico";

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
 * servidor y con el flag user_metadata.must_change_password=true.
 *
 * VERIFICACIÓN DE CORREO (2026-10-08, revisión de "una cuenta real por
 * negocio"): la contraseña temporal YA NO se devuelve al navegador. Se
 * envía por correo (Resend) al correo que se registró: quien no controle
 * ese buzón no puede entrar. Antes se mostraba en pantalla, así que
 * cualquiera podía registrarse con el correo de otra persona, ocupar ese
 * correo (la persona real ya no podía registrarse) y hasta recibir un pago
 * de Hotmart hecho con ese correo. Entrar con la temporal lleva a
 * /primer-acceso, donde el dueño teclea su propia contraseña. Si el correo
 * no sale, se deshace el alta completa (no queda nada a medias) y se pide
 * reintentar. Quien no recibió el correo puede pedir un reenvío
 * (reenviarContrasenaTemporalAction) mientras no haya fijado su propia
 * contraseña — eso también rescata a quien encuentre su correo ya
 * ocupado por un registro ajeno.
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
  /** El correo con la contraseña temporal salió bien. */
  correoEnviado?: boolean;
  /** Solo en desarrollo local SIN Resend configurado (nunca en producción). */
  tempPasswordDev?: string;
  /** Para que la pantalla ofrezca "reenviar contraseña" cuando el correo ya existe. */
  codigo?: "correo_existente";
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}


// Traduce los mensajes de Supabase Auth (siempre en inglés) a algo que un
// visitante real pueda leer — antes se mostraba el texto crudo de
// authError.message directo en el formulario (ej. "User already
// registered"), rompiendo el idioma y el tono del resto del flujo y sin
// decirle a la persona qué hacer. Los casos no reconocidos caen a un
// mensaje genérico en español en vez de filtrar el texto de Supabase.
const MENSAJE_CORREO_EXISTENTE =
  "Ya existe una cuenta con ese correo. Si todavía no has entrado por primera vez, reenvía tu contraseña temporal; si ya la tienes, inicia sesión.";

function mensajeErrorRegistro(authError: { message?: string } | null | undefined): string {
  const msg = authError?.message?.toLowerCase() ?? "";
  if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("already been registered")) {
    return MENSAJE_CORREO_EXISTENTE;
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
  // Revisión de "una cuenta real por negocio" (2026-10-08): si la cuenta de
  // Supabase Auth se crea pero el alta del negocio falla después (slug
  // repetido por dos registros simultáneos, caída de base de datos, etc.),
  // la cuenta quedaba HUÉRFANA: el correo ya estaba tomado ("ya existe una
  // cuenta, inicia sesión") pero iniciar sesión no llevaba a ningún negocio,
  // y el cliente no podía volver a registrarse. Ahora se borra en ese caso.
  let authUserIdCreado: string | null = null;
  let negocioCreado = false;
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

    // Sin envío de correo nadie podría recibir su contraseña: se rechaza ANTES
    // de crear nada. Solo en desarrollo local se permite seguir (la contraseña
    // se devuelve en tempPasswordDev para poder probar sin Resend).
    const esDesarrollo = process.env.NODE_ENV === "development";
    if (!correoConfigurado() && !esDesarrollo) {
      console.error("❌ Registro bloqueado: RESEND_API_KEY / RESEND_FROM_EMAIL no están configurados en este entorno.");
      return { success: false, error: "El registro no está disponible por el momento. Intenta de nuevo más tarde." };
    }

    const existingTenant = await prisma.tenant.findUnique({ where: { slug: baseSlug } });
    if (existingTenant) {
      return { success: false, error: "Ya existe un negocio registrado con ese nombre." };
    }

    const existingUser = await prisma.user.findFirst({ where: { email: input.ownerEmail.trim() } });
    if (existingUser) {
      return { success: false, error: MENSAJE_CORREO_EXISTENTE, codigo: "correo_existente" };
    }

    // UNA prueba gratis por persona, para siempre (política de Carlos,
    // 2026-10-08): se compara el correo en su forma canónica (sin
    // "+etiqueta" ni puntos de Gmail), y el registro sobrevive aunque el
    // negocio anterior se haya eliminado. Quien ya la usó debe suscribirse.
    const correoCanonico = canonizarCorreo(input.ownerEmail);
    if (!correoCanonico) {
      return { success: false, error: "El correo electrónico no es válido." };
    }
    const yaUsoPrueba = await prisma.pruebaGratisUsada.findUnique({ where: { emailCanonico: correoCanonico }, select: { id: true } });
    if (yaUsoPrueba) {
      const link = process.env.HOTMART_CHECKOUT_URL;
      return {
        success: false,
        error: `Este correo ya utilizó su prueba gratis de Linkity. Para seguir adelante, suscríbete${link ? ` aquí: ${link}` : " (escríbenos y te ayudamos)"}.`,
      };
    }

    const supabaseAdmin = createAdminClient();
    const tempPassword = generarPasswordTemporal();

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: input.ownerEmail.trim(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: { must_change_password: true, temp_sent_at: new Date().toISOString() },
    });

    if (authError || !authData.user) {
      return {
        success: false,
        error: mensajeErrorRegistro(authError),
        codigo: authError && mensajeErrorRegistro(authError) === MENSAJE_CORREO_EXISTENTE ? "correo_existente" : undefined,
      };
    }

    authUserIdCreado = authData.user.id;

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

      // Deja constancia de que este correo ya usó su prueba (misma
      // transacción: si el alta falla, tampoco se "gasta" la prueba).
      await tx.pruebaGratisUsada.create({
        data: { emailCanonico: correoCanonico, emailOriginal: input.ownerEmail.trim(), tenantSlug: tenant.slug },
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
    negocioCreado = true;

    try {
      await asegurarRolesRubro(result.id, input.businessType);
    } catch (errRoles) {
      // El negocio YA existe: si esto fallara y se reportara como error, el
      // cliente se quedaría con una cuenta creada pero creyendo que no se
      // registró. "Roles y permisos" los vuelve a crear solo (ver arriba).
      console.error("No se pudieron crear los roles del rubro (se crearán al abrir Roles y permisos):", errRoles);
    }

    // Envío de la contraseña temporal. Si falla, se DESHACE el alta (negocio y
    // cuenta de Auth) para no dejar un correo ocupado sin forma de entrar.
    if (correoConfigurado()) {
      const correo = correoAccesoTemporal({ password: tempPassword });
      const envio = await enviarCorreo({ to: input.ownerEmail.trim(), ...correo });
      if (!envio.ok) {
        console.error(`❌ No se pudo enviar el correo de acceso (${envio.motivo}); se deshace el alta de ${result.slug}.`);
        try {
          const { authIds } = await eliminarTenantPorCompleto(result.id);
          const admin = createAdminClient();
          for (const id of authIds) await admin.auth.admin.deleteUser(id);
        } catch (errLimpieza) {
          console.error("❌ No se pudo deshacer el alta tras fallar el correo:", errLimpieza);
        }
        return { success: false, error: "No pudimos enviar el correo con tu contraseña. Intenta de nuevo en unos minutos." };
      }
      return { success: true, tenantSlug: result.slug, ownerEmail: input.ownerEmail.trim(), correoEnviado: true };
    }

    // Solo desarrollo local (el bloqueo de arriba impide llegar aquí en producción).
    return { success: true, tenantSlug: result.slug, ownerEmail: input.ownerEmail.trim(), correoEnviado: false, tempPasswordDev: tempPassword };
  } catch (err) {
    // Mismo criterio que mensajeErrorRegistro arriba: nunca se le muestra al
    // visitante el texto crudo de un error interno (antes podía filtrar
    // mensajes de Prisma/DB sin traducir) — se registra en el log del
    // servidor y se responde con un mensaje genérico en español.
    console.error("Error en auto-registro de negocio:", err);
    if (authUserIdCreado && !negocioCreado) {
      await createAdminClient()
        .auth.admin.deleteUser(authUserIdCreado)
        .catch((e: unknown) => console.error("No se pudo borrar la cuenta huérfana del registro:", e));
    }
    return {
      success: false,
      error: "No se pudo crear tu cuenta. Intenta de nuevo en unos minutos.",
    };
  }
}

/**
 * Reenvía la contraseña temporal a quien todavía no fijó la suya. Sirve para
 * (a) el cliente al que no le llegó el correo y (b) quien encuentra su
 * correo ocupado por un registro hecho con su dirección por otra persona:
 * al recibir la contraseña (solo llega a su buzón) toma control de la cuenta.
 *
 * Responde SIEMPRE lo mismo, exista o no el correo, para que no sirva para
 * averiguar qué correos están registrados. Solo actúa si la cuenta sigue
 * con must_change_password=true (nunca toca una cuenta que ya tiene su propia
 * contraseña) y como máximo una vez cada 10 minutos por cuenta (evita usarlo
 * para llenar de correos el buzón de alguien).
 */
const MS_ESPERA_REENVIO = 10 * 60 * 1000;
const MENSAJE_REENVIO = "Si ese correo tiene un registro pendiente de primer acceso, te enviamos una nueva contraseña temporal. Revisa también tu carpeta de spam.";

export async function reenviarContrasenaTemporalAction(emailEntrada: string): Promise<{ ok: boolean; mensaje: string }> {
  const respuesta = { ok: true, mensaje: MENSAJE_REENVIO };
  try {
    const email = String(emailEntrada ?? "").trim();
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, mensaje: "Escribe un correo electrónico válido." };
    }
    if (!correoConfigurado()) {
      console.error("❌ Reenvío de contraseña imposible: Resend no está configurado.");
      return { ok: false, mensaje: "No se pudo enviar el correo por el momento. Intenta más tarde." };
    }

    const usuario = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, NOT: { supabaseId: { startsWith: "staff-placeholder-" } } },
      select: { supabaseId: true, email: true },
    });
    if (!usuario) return respuesta;

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(usuario.supabaseId);
    const meta = data?.user?.user_metadata as Record<string, unknown> | undefined;
    if (error || !data?.user || meta?.must_change_password !== true) return respuesta;

    const ultimo = typeof meta.temp_sent_at === "string" ? Date.parse(meta.temp_sent_at) : NaN;
    if (Number.isFinite(ultimo) && Date.now() - ultimo < MS_ESPERA_REENVIO) return respuesta;

    const password = generarPasswordTemporal();
    const { error: errActualizar } = await admin.auth.admin.updateUserById(usuario.supabaseId, {
      password,
      user_metadata: { ...meta, must_change_password: true, temp_sent_at: new Date().toISOString() },
    });
    if (errActualizar) {
      console.error("❌ No se pudo actualizar la contraseña temporal:", errActualizar.message);
      return { ok: false, mensaje: "No se pudo reenviar la contraseña. Intenta más tarde." };
    }

    const envio = await enviarCorreo({ to: usuario.email, ...correoAccesoTemporal({ password }) });
    if (!envio.ok) return { ok: false, mensaje: "No se pudo enviar el correo por el momento. Intenta más tarde." };
    return respuesta;
  } catch (err) {
    console.error("Error al reenviar la contraseña temporal:", err);
    return { ok: false, mensaje: "No se pudo reenviar la contraseña. Intenta más tarde." };
  }
}
