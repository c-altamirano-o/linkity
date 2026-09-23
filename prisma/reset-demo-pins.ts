import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomBytes, scryptSync } from "crypto";
import { writeFileSync } from "fs";

/**
 * Script de un solo uso (2026-09-23, a petición de Carlos: "En todos los
 * demos, al pin de los empleados coloca 111111 para evitar confusiones,
 * necesito que mi cliente vea las funciones. No que se quiebre la cabeza
 * tratando de adivinar que sigue") — pone el PIN de TODOS los empleados de
 * los 20 negocios demo en 111111.
 *
 * Por qué no basta con cambiar PINES en seed-demo.ts (ya se hizo, para
 * negocios demo NUEVOS): ese arreglo solo se usa al CREAR un negocio demo
 * (crearNegocioDemo) — los 20 negocios demo YA EXISTEN, así que
 * `npx tsx prisma/seed-demo.ts` los omite por completo (ver el comentario
 * grande al inicio de ese archivo: "si ese slug ya existe, se omite... no
 * lo duplica ni lo toca"), y el refresco semanal (`--refrescar` / el cron
 * de reseed-demo) tampoco toca pinHash — solo refresca ventas/caja/citas de
 * la semana operativa, nunca las credenciales de acceso (ver el comentario
 * en refrescarNegocioDemo sobre por qué reusa PINES solo para completar el
 * tipo EmpleadoCreado, sin escribirlo a la BD). Por eso hace falta este
 * script aparte, que sí actualiza directo el pinHash ya guardado de cada
 * empleado que ya existe.
 *
 * Usa el MISMO hashPin (scrypt) que lib/staff-auth.ts y seed-demo.ts — es
 * una copia local a propósito, igual que en esos dos archivos (server-only
 * no deja importar lib/staff-auth.ts fuera del bundler de Next).
 *
 * Identifica "negocio demo" por su slug empezando con "demo-" (igual que
 * los 20 slugs de RUBROS_DEMO en seed-demo.ts) — ningún negocio real de un
 * cliente real debería tener ese prefijo, así que este filtro nunca toca
 * datos reales.
 *
 * Cómo correrlo (una sola vez, desde tu compu, mismas variables de entorno
 * que seed-demo.ts): `npx tsx prisma/reset-demo-pins.ts`
 * Seguro de volver a correr: si algo falla a la mitad, correrlo de nuevo
 * simplemente vuelve a poner 111111 en todos — no duplica ni borra nada.
 * También regenera prisma/DEMO_CREDENCIALES.md a partir de lo que de
 * verdad hay en la base de datos en ese momento (nombres/puestos reales de
 * cada negocio demo), así ese archivo no queda desactualizado.
 */

function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

const PIN_UNIFORME = "111111";
const DEMO_PASSWORD = "Demo2026!";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const tenantsDemo = await prisma.tenant.findMany({
    where: { slug: { startsWith: "demo-" } },
    select: {
      id: true,
      name: true,
      slug: true,
      email: true,
      staff: {
        where: { pinHash: { not: null } },
        select: { id: true, name: true, position: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  if (tenantsDemo.length === 0) {
    console.log("⚠️  No se encontró ningún tenant con slug 'demo-*' — revisa que estés apuntando a la base de datos correcta.");
    return;
  }

  const pinHashNuevo = hashPin(PIN_UNIFORME);
  let totalEmpleados = 0;

  const lineas: string[] = [
    "# Credenciales de los 20 negocios DEMO",
    "",
    `Contraseña del dueño en los 20 negocios (misma para todos, fácil de copiar/pegar): **${DEMO_PASSWORD}**`,
    "",
    `El PIN de TODOS los empleados, en TODOS los negocios demo, es el mismo: **${PIN_UNIFORME}** — así nadie tiene que adivinar cuál PIN usar al mostrar el demo.`,
    "",
  ];

  for (const t of tenantsDemo) {
    if (t.staff.length === 0) {
      console.log(`⏭️  ${t.name} (${t.slug}) — sin empleados con PIN, se omite`);
      continue;
    }

    await prisma.staff.updateMany({
      where: { id: { in: t.staff.map((s) => s.id) } },
      data: { pinHash: pinHashNuevo },
    });
    totalEmpleados += t.staff.length;
    console.log(`✅ ${t.name} (${t.slug}) — ${t.staff.length} empleado(s) actualizado(s)`);

    lineas.push(`## ${t.name}`);
    lineas.push(`- URL: /${t.slug}`);
    lineas.push(`- Dueño: ${t.email ?? "(sin correo)"} / ${DEMO_PASSWORD}`);
    for (const s of t.staff) lineas.push(`- Empleado — ${s.name} (${s.position ?? "Personal"}): PIN ${PIN_UNIFORME}`);
    lineas.push("");
  }

  writeFileSync("prisma/DEMO_CREDENCIALES.md", lineas.join("\n"), "utf-8");

  console.log(`\n🎉 Listo — ${totalEmpleados} empleado(s) en ${tenantsDemo.length} negocio(s) demo ahora usan el PIN ${PIN_UNIFORME}.`);
  console.log("📄 prisma/DEMO_CREDENCIALES.md actualizado.");
}

main()
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
