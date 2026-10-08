import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Catálogo comercial INICIAL de Linkity (planes, funciones y límites).
 *
 * Este seed es NO DESTRUCTIVO a propósito (2026-10-08): solo CREA lo que
 * falta y nunca borra ni sobrescribe nada. Así se puede volver a correr
 * cuando se agregue algo al catálogo sin pisar lo que ya se configuró desde
 * Panel Maestro (nombres, descripciones, qué funciones incluye cada plan,
 * valores de los límites). Antes borraba y recreaba los límites y las
 * funciones en cada corrida, lo que habría deshecho esos cambios.
 *
 * Reglas:
 *  - Un plan / función / límite que ya existe NO se toca.
 *  - Los vínculos plan↔función y plan↔límite por defecto (tablas de abajo)
 *    solo se crean cuando el plan, la función o el límite se acaba de crear
 *    en esta corrida. Si ya existían, no se vuelve a vincular nada: lo que
 *    se haya quitado o cambiado desde Panel Maestro se respeta.
 *
 * Los precios NO viven aquí ni en CommercialPlan: Hotmart es la fuente de
 * verdad de precios y pagos (Subscription.price guarda el real/histórico).
 */

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const PLANES = [
  { code: "BASICO", name: "Básico", description: "Para negocios con una sucursal.", displayOrder: 1 },
  { code: "PRO", name: "Pro", description: "Para negocios en crecimiento con varias sucursales.", displayOrder: 2 },
  { code: "ENTERPRISE", name: "Enterprise", description: "Para negocios con 5 o más sucursales.", displayOrder: 3 },
];

// `planes` = en qué planes nace habilitada la función.
const FUNCIONES = [
  {
    code: "API_FACTURACION",
    name: "API de facturación",
    description: "Acceso a la API de facturación.",
    category: "Facturación",
    moduleCode: "facturacion",
    displayOrder: 1,
    planes: ["PRO", "ENTERPRISE"],
  },
];

// `valores`: por plan, un número o "ILIMITADO".
const LIMITES = [
  {
    code: "MAX_SUCURSALES",
    name: "Máximo de sucursales",
    description: "Cantidad máxima de sucursales activas.",
    unit: "sucursales",
    scope: "tenant",
    displayOrder: 1,
    valores: { BASICO: 1, PRO: 4, ENTERPRISE: "ILIMITADO" } as Record<string, number | "ILIMITADO">,
  },
  {
    code: "MAX_EMPLEADOS_POR_SUCURSAL",
    name: "Máximo de empleados por sucursal",
    description: "Cantidad máxima de empleados activos por sucursal.",
    unit: "empleados",
    scope: "branch",
    displayOrder: 2,
    valores: { BASICO: 2, PRO: 5, ENTERPRISE: "ILIMITADO" } as Record<string, number | "ILIMITADO">,
  },
];

async function main() {
  const resumen = { planes: 0, funciones: 0, limites: 0, vinculosFuncion: 0, vinculosLimite: 0 };

  // --- Planes (solo los que falten) ---
  const planesNuevos = new Set<string>();
  for (const plan of PLANES) {
    const existente = await prisma.commercialPlan.findUnique({ where: { code: plan.code }, select: { id: true } });
    if (existente) continue;
    await prisma.commercialPlan.create({ data: { ...plan, isActive: true } });
    planesNuevos.add(plan.code);
    resumen.planes++;
  }

  // --- Funciones (solo las que falten) ---
  const funcionesNuevas = new Set<string>();
  for (const f of FUNCIONES) {
    const existente = await prisma.commercialFeature.findUnique({ where: { code: f.code }, select: { id: true } });
    if (existente) continue;
    await prisma.commercialFeature.create({
      data: {
        code: f.code,
        name: f.name,
        description: f.description,
        category: f.category,
        moduleCode: f.moduleCode,
        displayOrder: f.displayOrder,
        isActive: true,
      },
    });
    funcionesNuevas.add(f.code);
    resumen.funciones++;
  }

  // --- Límites (solo los que falten) ---
  const limitesNuevos = new Set<string>();
  for (const l of LIMITES) {
    const existente = await prisma.commercialLimit.findUnique({ where: { code: l.code }, select: { id: true } });
    if (existente) continue;
    await prisma.commercialLimit.create({
      data: {
        code: l.code,
        name: l.name,
        description: l.description,
        unit: l.unit,
        scope: l.scope,
        displayOrder: l.displayOrder,
        isActive: true,
      },
    });
    limitesNuevos.add(l.code);
    resumen.limites++;
  }

  // --- Vínculos por defecto: solo si el plan o la función/límite es NUEVO ---
  const planes = await prisma.commercialPlan.findMany({ where: { code: { in: PLANES.map((p) => p.code) } } });
  const funciones = await prisma.commercialFeature.findMany({ where: { code: { in: FUNCIONES.map((f) => f.code) } } });
  const limites = await prisma.commercialLimit.findMany({ where: { code: { in: LIMITES.map((l) => l.code) } } });

  for (const f of FUNCIONES) {
    const feature = funciones.find((x) => x.code === f.code);
    if (!feature) continue;
    for (const codePlan of f.planes) {
      const plan = planes.find((p) => p.code === codePlan);
      if (!plan) continue;
      if (!planesNuevos.has(codePlan) && !funcionesNuevas.has(f.code)) continue;
      const r = await prisma.commercialPlanFeature.createMany({
        data: [{ planId: plan.id, featureId: feature.id }],
        skipDuplicates: true,
      });
      resumen.vinculosFuncion += r.count;
    }
  }

  for (const l of LIMITES) {
    const limit = limites.find((x) => x.code === l.code);
    if (!limit) continue;
    for (const [codePlan, valor] of Object.entries(l.valores)) {
      const plan = planes.find((p) => p.code === codePlan);
      if (!plan) continue;
      if (!planesNuevos.has(codePlan) && !limitesNuevos.has(l.code)) continue;
      const r = await prisma.commercialPlanLimit.createMany({
        data: [
          {
            planId: plan.id,
            limitId: limit.id,
            value: valor === "ILIMITADO" ? null : valor,
            isUnlimited: valor === "ILIMITADO",
          },
        ],
        skipDuplicates: true,
      });
      resumen.vinculosLimite += r.count;
    }
  }

  console.log("Catálogo comercial revisado. Creado en esta corrida:", resumen);
  if (Object.values(resumen).every((n) => n === 0)) {
    console.log("(Nada que crear: el catálogo ya estaba completo y no se modificó.)");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
