"use server";

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { generarPasswordTemporal } from "@/lib/password-temporal";
import { correoConfigurado, correoAccesoTemporal, enviarCorreo } from "@/lib/correo-transaccional";
import { permitirIntento, LIMITE_REENVIO, MENSAJE_DEMASIADOS_INTENTOS } from "@/lib/limite-intentos";

/**
 * Reenvía la contraseña temporal a quien todavía no fijó la suya (2026-10-08: movida
 * aquí desde el antiguo registro; la usa la pantalla de inicio de sesión). Sirve
 * para el cliente que se suscribió en Hotmart y al que no le llegó el correo con
 * su acceso.
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
    if (!(await permitirIntento(LIMITE_REENVIO))) {
      return { ok: false, mensaje: MENSAJE_DEMASIADOS_INTENTOS };
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
