import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Enlace real al que deben apuntar los correos de Supabase Auth (Recovery,
 * y a futuro Magic Link / confirmación de correo) — Carlos reportó que el
 * link de "¿Olvidaste tu contraseña?" llegaba pero nunca lo mandaba a
 * escribir la contraseña nueva (2026-09-19).
 *
 * Causa real: lib/supabase/client.ts crea el cliente con createBrowserClient
 * de @supabase/ssr, que por defecto usa flowType "pkce". Con PKCE, un link
 * generado con la plantilla de correo por defecto ({{ .ConfirmationURL }})
 * redirige a redirectTo con un "?code=..." que el navegador NUNCA
 * intercambia solo — hace falta un paso de SERVIDOR que llame a Supabase
 * para crear la sesión real (cookies) antes de llegar a la pantalla final.
 * Como esa ruta no existía en la app, el navegador se quedaba sin sesión y
 * reset-password/page.tsx (que solo revisa si YA hay sesión con getUser())
 * mostraba "este enlace ya no es válido" — o, según a dónde cayera el
 * redirect, ni siquiera llegaba a esa pantalla.
 *
 * Este route handler es el patrón oficial de Supabase para apps con
 * @supabase/ssr (docs: supabase.com/guides/auth/server-side/nextjs, sección
 * "Email Templates"): la plantilla de correo debe apuntar aquí con
 * token_hash+type (NO con {{ .ConfirmationURL }}) — verifyOtp crea la
 * sesión del lado del servidor sin depender de PKCE ni de fragmentos de
 * URL, así que funciona sin importar el flowType configurado. Ese cambio de
 * plantilla se hace a mano en el dashboard de Supabase (Authentication →
 * Emails → Templates → Reset Password), no hay forma de automatizarlo
 * desde aquí.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/login";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Token inválido, expirado o ya usado — cae a /reset-password sin sesión,
  // que ya sabe mostrar "este enlace ya no es válido" en ese caso (ver
  // enlaceValido en ese archivo).
  return NextResponse.redirect(new URL("/reset-password", origin));
}
