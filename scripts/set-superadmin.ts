import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Promueve una cuenta existente de Supabase Auth a administrador de Panel
 * Maestro (tabla SuperAdmin — ver prisma/schema.prisma y lib/maestro-auth.ts).
 *
 * No hay UI para esto a propósito: por ahora solo Carlos necesita entrar a
 * /maestro, así que basta un script que él mismo corre localmente. Si en
 * el futuro hay más de un administrador, este mismo script sirve para
 * promover cuentas adicionales (correr una vez por cada correo).
 *
 * Uso (desde la raíz del proyecto, con el .env local ya configurado):
 *   npx tsx scripts/set-superadmin.ts tu-correo@ejemplo.com
 *
 * La cuenta de Supabase Auth con ese correo debe existir YA (por ejemplo,
 * la que uses para entrar a cualquier negocio de prueba, o una que crees
 * desde /register). El script no crea la cuenta de Auth — solo la conecta
 * con la tabla SuperAdmin.
 *
 * No usa las rutas "@/lib/..." del proyecto a propósito: tsx no resuelve
 * los alias de tsconfig fuera de Next.js, así que este script reimplementa
 * en pocas líneas lo mínimo de lib/supabase/admin.ts (cliente admin de
 * Supabase) — mismo patrón ya usado en prisma/seed.ts para Prisma.
 */

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Uso: npx tsx scripts/set-superadmin.ts correo@ejemplo.com");
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en tu .env local.");
    process.exit(1);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Buscando la cuenta de Supabase Auth con correo ${email}...`);

  // La Admin API de Supabase no tiene un "getUserByEmail" directo — hay
  // que paginar listUsers() y comparar el correo a mano.
  let authUser: { id: string; email?: string } | null = null;
  for (let page = 1; !authUser; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error("Error consultando Supabase Auth:", error.message);
      process.exit(1);
    }
    authUser = data.users.find((u) => u.email?.toLowerCase() === email) ?? null;
    if (data.users.length < 200) break; // ya no hay más páginas
  }

  if (!authUser) {
    console.error(`\nNo existe ninguna cuenta de Supabase Auth con el correo ${email}.`);
    console.error("Crea la cuenta primero (por ejemplo, iniciando el flujo de /register o desde");
    console.error("Panel Maestro > Nuevo negocio con ese correo) y vuelve a correr este script.");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
  const prisma = new PrismaClient({ adapter });

  const admin = await prisma.superAdmin.upsert({
    where: { supabaseId: authUser.id },
    update: { email, isActive: true },
    create: {
      supabaseId: authUser.id,
      email,
      name: email.split("@")[0],
      isActive: true,
    },
  });

  console.log(`\n✅ ${email} ahora es administrador de Panel Maestro (SuperAdmin id: ${admin.id}).`);
  console.log("Ya puedes iniciar sesión con esa cuenta en /login y entrarás directo a /maestro/dashboard.");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
