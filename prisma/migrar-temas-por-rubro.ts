import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Script de un solo uso (2026-09-23) — migra los negocios que se quedaron en
 * uno de los 5 temas viejos (NEUTRAL_TECH/BLACK_GOLD/EMERALD/CORAL_WARM/
 * OCEAN_BLUE, ver lib/theme-presets.ts) a uno de los 10 temas nuevos estilo
 * Windows Phone/Metro.
 *
 * Por qué hacía falta: los 5 temas viejos NUNCA definieron --chip-N ni
 * --tile-fg (esos tokens los inventó construirPresetWindowsPhone, solo para
 * los 10 temas nuevos) — así que cualquier negocio que no hubiera entrado a
 * Configuración a elegir uno de los temas nuevos se quedaba con el POS roto
 * (ficha blanca lisa, ícono negro, sin variedad de color), aunque el resto
 * de la interfaz se viera bien. Carlos lo reportó viendo el POS de
 * "demo-reparacion-celulares" recién desplegado el sistema de temas nuevo:
 * los 26 negocios que existían en ese momento (25 en el default de siempre
 * "Neutral Tech", 1 en "Azul Océano") estaban en ese estado, ninguno había
 * podido elegir un tema nuevo todavía porque el selector nuevo ni existía.
 *
 * Criterio de asignación (a petición explícita de Carlos: "asigna un tema
 * aleatorio, pero que concuerde con el rubro... que sea lo más parecido a la
 * elección de un dueño según su ramo"): cada rubro (Tenant.businessType) tiene
 * un tema fijo elegido a mano por su "vibra" (ej. consultorios → temas claros/
 * azules tipo clínico; talleres automotrices/motos → rojos/naranjas con
 * energía; joyería/spa → tonos ciruela elegantes) — no es aleatorio en el
 * sentido de Math.random(), es una asignación fija por rubro, pero VARIADA
 * entre rubros distintos (y entre dos negocios del MISMO rubro, ej. los tres
 * de "reparacion_celulares" quedaron en tres temas distintos) para que no se
 * vea como si todos hubieran quedado en el mismo default. Sin rubro asignado
 * (businessType null) cae en LUMIA_COBALT, el nuevo default general.
 *
 * Seguro de volver a correr: solo toca tenants que SIGAN en uno de los 5
 * temas viejos (WHERE themePreset IN (...)) — un negocio que ya entró a
 * Configuración y eligió un tema nuevo por su cuenta nunca se vuelve a tocar,
 * aunque este script se corra de nuevo después.
 *
 * Cómo correrlo: `npx tsx prisma/migrar-temas-por-rubro.ts`
 */

// value de BUSINESS_TYPE_OPTIONS (lib/labels.ts) → tema nuevo asignado.
const TEMA_POR_RUBRO: Record<string, string> = {
  reparacion_celulares: "LUMIA_COBALT",
  taller_autos: "CRIMSON_START",
  taller_motos: "MANGO_TANGERINE",
  electrodomesticos: "LUMIA_COBALT",
  computadoras: "LUMIA_COBALT",
  barberia: "MONOCHROME_METRO",
  consultorio_dental: "WINDOWS8_LIGHT",
  consultorio_medico: "SAPPHIRE_NIGHT",
  veterinaria: "LAWN_LIME",
  relojeria_joyeria: "DEEP_PLUM",
  zapateria: "WINDOWS8_LIGHT",
  refrigeracion_ac: "SAPPHIRE_NIGHT",
  bicicletas: "VIBRANT_LUMIA",
  cerrajeria: "MONOCHROME_METRO",
  tapiceria: "MANGO_TANGERINE",
  estetica: "METRO_MAGENTA",
  spa: "DEEP_PLUM",
  gimnasio: "VIBRANT_LUMIA",
  tatuajes: "MONOCHROME_METRO",
  comercio_retail: "WINDOWS8_LIGHT",
};

// Excepciones puntuales por slug (2026-09-23): cuando ya hay más de un
// negocio real/demo con el MISMO rubro, se varía a mano el segundo/tercero
// para que no los tres queden en el tema exacto del rubro — ver el
// comentario grande de arriba ("VARIADA... entre dos negocios del MISMO
// rubro"). Un slug que no aparezca aquí usa el default de su rubro tal cual.
const EXCEPCION_POR_SLUG: Record<string, string> = {
  "fix-expert": "MONOCHROME_METRO", // reparacion_celulares, junto con movilmart y demo-reparacion-celulares
  "movilmart": "SAPPHIRE_NIGHT", // reparacion_celulares
  "difussion-barberia": "CRIMSON_START", // barberia, junto con demo-barberia
};

const TEMA_SIN_RUBRO = "LUMIA_COBALT"; // businessType null (ej. negocios de prueba sin rubro asignado)

const TEMAS_VIEJOS = ["NEUTRAL_TECH", "BLACK_GOLD", "EMERALD", "CORAL_WARM", "OCEAN_BLUE"];

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: { themePreset: { in: TEMAS_VIEJOS as never[] } },
    select: { id: true, slug: true, name: true, businessType: true, themePreset: true },
    orderBy: { slug: "asc" },
  });

  if (tenants.length === 0) {
    console.log("✅ Ningún negocio sigue en un tema viejo — no hay nada que migrar.");
    return;
  }

  for (const t of tenants) {
    const temaNuevo =
      EXCEPCION_POR_SLUG[t.slug] ??
      (t.businessType ? TEMA_POR_RUBRO[t.businessType] : undefined) ??
      TEMA_SIN_RUBRO;

    await prisma.tenant.update({
      where: { id: t.id },
      data: { themePreset: temaNuevo as never, themeIntensity: 100 },
    });

    console.log(`✅ ${t.name} (${t.slug}, rubro: ${t.businessType ?? "sin rubro"}): ${t.themePreset} → ${temaNuevo}`);
  }

  console.log(`\nListo — ${tenants.length} negocio(s) migrado(s) a un tema nuevo.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
