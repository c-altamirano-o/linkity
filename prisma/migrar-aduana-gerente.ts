import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Script de un solo uso (2026-09-24) — le da el módulo "Aduana" al rol
 * semilla "Gerente" en los negocios reales que YA EXISTEN.
 *
 * Por qué hacía falta: validando el flujo de Reparaciones, Carlos fue
 * explícito en que "cualquier movimiento o cambio de estatus del equipo en
 * Taller lo debe hacer alguien con rol de aduana, recepcionista o superior
 * (gerente, supervisor, dueño)". El Dueño (cuenta real, Supabase Auth) ya
 * tiene acceso sin restricción de módulo — lo que faltaba era que un
 * "Gerente" con sesión de PIN también pudiera entrar a Aduana. Se agregó
 * "aduana" a MATRIZ_ACCESO_BASE.Gerente (lib/roles.ts), pero esa matriz solo
 * se usa para "autorreparar" un rol que tiene CERO filas en RolePermission
 * (ver el comentario largo en lib/roles-server.ts) — un "Gerente" que ya
 * tenía personal asignado en un negocio real YA tiene sus filas pobladas
 * (con la matriz vieja, sin "aduana"), así que nunca se autorrepara solo.
 * Este script le agrega esa fila puntual a los que les falta.
 *
 * Seguro de volver a correr: solo agrega la fila de Aduana a un rol
 * "Gerente" que todavía NO la tiene — un negocio que ya se migró (o que ya
 * se lo había prendido a mano desde Roles y permisos) no se vuelve a tocar
 * (skipDuplicates).
 *
 * Cómo correrlo: `npx tsx prisma/migrar-aduana-gerente.ts`
 * (después de `npx prisma db push`, nunca antes).
 */

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const permisoAduana = await prisma.permission.upsert({
    where: { module_action: { module: "aduana", action: "acceso" } },
    update: {},
    create: { module: "aduana", action: "acceso" },
    select: { id: true },
  });

  const roles = await prisma.role.findMany({
    where: {
      name: "Gerente",
      isSystem: true,
      // Ya tiene 0 filas Aduana → todavía no la tiene.
      permissions: { none: { permissionId: permisoAduana.id } },
    },
    select: { id: true, tenantId: true },
  });

  if (roles.length === 0) {
    console.log("✅ Ningún rol \"Gerente\" pendiente de migrar — no hay nada que hacer.");
    return;
  }

  const tenants = await prisma.tenant.findMany({
    where: { id: { in: roles.map((r) => r.tenantId) } },
    select: { id: true, slug: true, name: true },
  });
  const tenantPorId = new Map(tenants.map((t) => [t.id, t]));

  await prisma.rolePermission.createMany({
    data: roles.map((r) => ({ roleId: r.id, permissionId: permisoAduana.id })),
    skipDuplicates: true,
  });

  for (const rol of roles) {
    const t = tenantPorId.get(rol.tenantId);
    console.log(`✅ ${t?.name ?? rol.tenantId} (${t?.slug ?? "?"}): rol "Gerente" ahora puede entrar a Aduana.`);
  }

  console.log(`\nListo — ${roles.length} rol(es) "Gerente" migrado(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
