-- Garantía en la base de datos de "un negocio = una cuenta real" (revisión
-- 2026-10-08). Hasta hoy solo el código lo cumplía: nada impedía que dos
-- filas de "User" con cuenta real de Supabase Auth apuntaran al mismo
-- negocio. Los empleados con PIN tienen una fila "User" técnica con
-- supabaseId sintético ("staff-placeholder-…") que NO cuenta: este índice
-- las excluye, así que solo puede existir UNA cuenta real por negocio.
--
-- Es un índice PARCIAL: Prisma no puede representarlo en schema.prisma. No
-- usar `prisma migrate dev`/`db push` sobre esta base sin revisar el
-- diff, porque intentaría borrarlo (ver nota en el modelo User).
CREATE UNIQUE INDEX IF NOT EXISTS "User_una_cuenta_real_por_negocio"
  ON "User" ("tenantId")
  WHERE "supabaseId" NOT LIKE 'staff-placeholder-%';
