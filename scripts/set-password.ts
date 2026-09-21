import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

/**
 * Utilidad de un solo uso (2026-09-19, pedida por Carlos) para fijarle una
 * contraseña a un usuario de Supabase Auth existente SIN mandar ningún
 * correo — así no cuenta contra el límite de envío de correos (el mismo
 * "over_email_send_rate_limit" que ya topamos probando el flujo de
 * "olvidé mi contraseña"). Usa la Admin API con el service_role key, igual
 * que prisma/seed-demo.ts y app/actions/personal-actions.ts.
 *
 * Uso:
 *   npx tsx scripts/set-password.ts correo@ejemplo.com NuevaPassword123
 *
 * A propósito NO toca user_metadata.must_change_password — deja la cuenta
 * lista para entrar directo por /login con la contraseña que le des, sin
 * pantallas extra de por medio.
 */
async function main() {
  const [, , email, nuevaPassword] = process.argv;

  if (!email || !nuevaPassword) {
    console.error("Uso: npx tsx scripts/set-password.ts <correo> <contraseña-nueva>");
    process.exit(1);
  }
  if (nuevaPassword.length < 8) {
    console.error("La contraseña debe tener al menos 8 caracteres (mismo mínimo que /reset-password).");
    process.exit(1);
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // listUsers + filtrar por correo — la Admin API no tiene un
  // "getUserByEmail" directo, mismo patrón que ya usa seed-demo.ts para
  // encontrar usuarios ya creados.
  let usuario = null;
  for (let page = 1; page <= 20 && !usuario; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error("Error al listar usuarios:", error.message);
      process.exit(1);
    }
    usuario = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
    if (data.users.length < 200) break; // última página
  }

  if (!usuario) {
    console.error(`No se encontró ningún usuario con el correo ${email}`);
    process.exit(1);
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(usuario.id, {
    password: nuevaPassword,
  });

  if (updateError) {
    console.error("Error al actualizar la contraseña:", updateError.message);
    process.exit(1);
  }

  console.log(`Listo. ${email} ya puede entrar por /login con la contraseña "${nuevaPassword}".`);
}

main();
