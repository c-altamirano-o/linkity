import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Script de un solo uso (2026-09-24) — migra los roles que YA EXISTEN en
 * los negocios reales al nuevo permiso Role.verMontosCaja ("nivel
 * supervisor: puede ver montos y totales de Caja").
 *
 * Por qué hacía falta: Carlos pidió revisar el módulo Caja "por seguridad
 * y evitar fraudes o posibles robos" — "ni empleado de mostrador, cajera o
 * técnico, debe conocer el monto de las ventas del día". Antes de este
 * cambio CUALQUIER rol con acceso al módulo "caja" veía el efectivo
 * esperado, las ventas del día y el panel completo de Detalle de
 * movimientos (KPIs, tabla, exportar) — no existía ningún nivel intermedio
 * entre "no entra a Caja" y "ve todo".
 *
 * Criterio de migración (a petición EXPLÍCITA de Carlos, elegido entre dos
 * opciones que se le presentaron): "Solo Gerente ve montos, todo lo demás
 * se oculta" — es decir, el default de la columna (false) se queda tal
 * cual para TODOS los roles existentes, y este script solo prende el
 * permiso para el rol semilla "Gerente" (isSystem:true, el único que
 * Carlos marcó como calificado por default). Esto incluye a propósito
 * dejar SIN el permiso a los puestos "de mando" del catálogo por rubro
 * (lib/roles-rubro.ts — "Jefe de Barberos", "Encargado de sucursal",
 * "Dentista", etc.): aunque conceptualmente son supervisores de su rubro,
 * Carlos fue explícito en que solo "Gerente" se prendiera por default —
 * cada negocio puede volver a prendérselo a cualquier otro rol desde
 * Personal → Roles y permisos → editar rol → "Nivel supervisor: puede ver
 * montos y totales de Caja".
 *
 * Seguro de volver a correr: solo actualiza roles con name = 'Gerente' Y
 * verMontosCaja todavía en false — un negocio que ya lo hubiera prendido a
 * mano (o que ya se migró antes) no se vuelve a tocar.
 *
 * Cómo correrlo: `npx tsx prisma/migrar-permiso-montos-caja.ts`
 * (después de `npx prisma db push`, nunca antes — la columna
 * Role.verMontosCaja tiene que existir ya en la base de datos).
 */

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const roles = await prisma.role.findMany({
    where: { name: "Gerente", isSystem: true, verMontosCaja: false },
    select: { id: true, tenantId: true, tenant: { select: { slug: true, name: true } } },
  });

  if (roles.length === 0) {
    console.log("✅ Ningún rol \"Gerente\" pendiente de migrar — no hay nada que hacer.");
    return;
  }

  for (const rol of roles) {
    await prisma.role.update({ where: { id: rol.id }, data: { verMontosCaja: true } });
    console.log(`✅ ${rol.tenant.name} (${rol.tenant.slug}): rol "Gerente" ahora puede ver montos de Caja.`);
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
