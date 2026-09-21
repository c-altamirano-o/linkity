import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Utilidad de un solo uso (2026-09-21) para corregir consentimientos de
 * demo YA SEMBRADOS con la firma de placeholder equivocada (el pixel negro
 * opaco reportado por Carlos, en vez del pixel transparente). El fix en
 * prisma/seed-demo.ts (FIRMA_DEMO_PNG) solo aplica a consentimientos
 * NUEVOS — el backfill de sembrarConsentimientos es idempotente (no
 * vuelve a sembrar si el tenant ya tiene consentimientos), así que
 * --refrescar no corrige los que ya existían con el valor viejo.
 *
 * Este script busca por el valor exacto de la firma vieja y la reemplaza
 * — no toca nada más, así que es seguro correrlo aunque ya hayas creado
 * consentimientos reales desde la app (una firma real dibujada a mano
 * nunca va a coincidir con este placeholder exacto).
 *
 * Uso: npx tsx scripts/fix-firma-demo.ts
 */

const FIRMA_VIEJA_MALA =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const FIRMA_NUEVA_BUENA =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==";

async function main() {
  // Mismo patrón que prisma/seed-demo.ts: este proyecto usa Prisma v7 con
  // driver adapters, así que un `new PrismaClient()` a secas (sin adapter)
  // no funciona — necesita PrismaPg + DIRECT_URL.
  const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const res = await prisma.informedConsent.updateMany({
      where: { patientSignature: FIRMA_VIEJA_MALA },
      data: { patientSignature: FIRMA_NUEVA_BUENA },
    });
    console.log(`Listo. ${res.count} consentimiento(s) corregido(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
