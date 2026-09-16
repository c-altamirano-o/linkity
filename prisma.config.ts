import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // migrate/db push/studio necesitan una conexión directa (no el pooler
    // de PgBouncer en DATABASE_URL) para poder crear la shadow database y
    // tomar locks de sesión — con el pooler, `migrate dev` se queda
    // colgado indefinidamente. La app en producción (lib/prisma.ts) no usa
    // este archivo para nada, sigue leyendo DATABASE_URL por su cuenta.
    url: process.env.DIRECT_URL!,
  },
});
