import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

/**
 * Prueba de las 6 plantillas de correo de Supabase Auth (2026-10-09, pedida por
 * Carlos): dispara de una vez cada correo que manda Supabase, todos hacia TU
 * propia bandeja usando alias con "+" (Gmail los entrega al mismo buzón), para
 * revisar de un vistazo que lleguen en español y con el remitente correcto.
 *
 * Uso:
 *   npx tsx scripts/probar-plantillas-correo.ts tucorreo@gmail.com
 *
 * Qué hace (todo con alias de tu correo, nunca con correos de clientes):
 *   1. Crea un usuario de prueba "+plantillas-acceso" (confirmado).
 *   2. Reset password   -> correo de "Restablecer contraseña"
 *   3. Magic link       -> correo de "Enlace de acceso" a "+plantillas-enlace"
 *   4. Invite user      -> correo de invitación a "+plantillas-invitar"
 *   5. Confirm sign up  -> correo de confirmación a "+plantillas-confirmar"
 *   6. Reauthentication -> correo con el código de verificación
 *   7. Change email     -> correo de cambio de correo a "+plantillas-nuevo"
 *   8. Borra al final SOLO los usuarios de prueba que este script creó.
 *
 * Usa las variables de .env que ya usa la app (NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY). No imprime claves.
 *
 * Si "Confirm sign up" no llega, es porque la confirmación de correo está
 * desactivada en Supabase (Sign In / Providers → Email): es normal.
 */

type Paso = { nombre: string; ok: boolean; detalle?: string };

async function main() {
  const [, , correoBase] = process.argv;
  if (!correoBase || !correoBase.includes("@")) {
    console.error("Uso: npx tsx scripts/probar-plantillas-correo.ts <tu-correo@gmail.com>");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY en .env");
    process.exit(1);
  }

  const [local, dominio] = correoBase.split("@");
  const alias = (sufijo: string) => `${local.split("+")[0]}+${sufijo}@${dominio}`;
  const acceso = alias("plantillas-acceso");
  const enlace = alias("plantillas-enlace");
  const invitar = alias("plantillas-invitar");
  const confirmar = alias("plantillas-confirmar");
  const nuevo = alias("plantillas-nuevo");
  const password = randomBytes(12).toString("base64url");

  console.log(`Proyecto de Supabase: ${new URL(url).host}`);
  console.log(`Los correos llegarán a la bandeja de ${correoBase}\n`);

  const opciones = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(url, serviceKey, opciones);
  const anon = () => createClient(url, anonKey, opciones);

  const resultados: Paso[] = [];
  const creados: string[] = []; // ids de usuarios creados por este script

  const paso = async (nombre: string, fn: () => Promise<string | void>) => {
    try {
      const detalle = await fn();
      resultados.push({ nombre, ok: true, detalle: detalle || undefined });
    } catch (e) {
      resultados.push({ nombre, ok: false, detalle: e instanceof Error ? e.message : String(e) });
    }
  };

  // 1. Usuario de prueba confirmado (necesario para reset, magic link, reauth y cambio de correo)
  let hayUsuarioAcceso = false;
  await paso("Crear usuario de prueba", async () => {
    const { data, error } = await admin.auth.admin.createUser({ email: acceso, password, email_confirm: true });
    if (error) throw new Error(error.message);
    creados.push(data.user.id);
    hayUsuarioAcceso = true;
  });

  // 2. Reset password
  if (hayUsuarioAcceso) {
    await paso("Reset password (Restablecer contraseña)", async () => {
      const { error } = await anon().auth.resetPasswordForEmail(acceso);
      if (error) throw new Error(error.message);
    });

  }

  // 3. Magic link — con OTRO usuario de prueba: Supabase solo deja pedir un
  // correo de este tipo por usuario cada ~60 s, y "acceso" ya recibió el de
  // Reset password hace un instante.
  await paso("Magic link (Enlace de acceso)", async () => {
    const { data, error: errorCrear } = await admin.auth.admin.createUser({
      email: enlace,
      password,
      email_confirm: true,
    });
    if (errorCrear) throw new Error(errorCrear.message);
    creados.push(data.user.id);
    const { error } = await anon().auth.signInWithOtp({ email: enlace, options: { shouldCreateUser: false } });
    if (error) throw new Error(error.message);
  });

  // 4. Invite user
  await paso("Invite user (Invitación)", async () => {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(invitar);
    if (error) throw new Error(error.message);
    if (data.user) creados.push(data.user.id);
  });

  // 5. Confirm sign up
  await paso("Confirm sign up (Confirmar cuenta)", async () => {
    const { data, error } = await anon().auth.signUp({ email: confirmar, password });
    if (error) throw new Error(error.message);
    if (data.user) creados.push(data.user.id);
  });

  // 6 y 7. Necesitan una sesión iniciada del usuario de prueba
  if (hayUsuarioAcceso) {
    const sesion = anon();
    let sesionLista = false;
    await paso("Iniciar sesión del usuario de prueba", async () => {
      const { error } = await sesion.auth.signInWithPassword({ email: acceso, password });
      if (error) throw new Error(error.message);
      sesionLista = true;
    });

    if (sesionLista) {
      await paso("Reauthentication (Código de verificación)", async () => {
        const { error } = await sesion.auth.reauthenticate();
        if (error) throw new Error(error.message);
      });
      await paso("Change email (Cambio de correo)", async () => {
        const { error } = await sesion.auth.updateUser({ email: nuevo });
        if (error) throw new Error(error.message);
      });
    }
  }

  // 8. Limpieza: solo los usuarios que este script creó
  let borrados = 0;
  for (const id of creados) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (!error) borrados++;
  }

  console.log("Resultado:");
  for (const r of resultados) {
    console.log(`  ${r.ok ? "OK   " : "ERROR"} ${r.nombre}${r.detalle ? ` — ${r.detalle}` : ""}`);
  }
  console.log(`\nUsuarios de prueba borrados: ${borrados} de ${creados.length}.`);
  console.log("Revisa tu bandeja (y Spam): deben llegar hasta 6-7 correos en español, de 'Linkity Soluciones'.");
  console.log("Los enlaces de estos correos ya no sirven (los usuarios de prueba se borraron); son solo para ver el diseño.");
  if (resultados.some((r) => !r.ok && /rate limit|over_email/i.test(r.detalle ?? ""))) {
    console.log("\nAlgún envío chocó con el límite de correos por hora de Supabase. Espera unos minutos y vuelve a correrlo.");
  }
}

main();
