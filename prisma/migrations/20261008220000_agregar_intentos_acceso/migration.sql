-- Límite de intentos por IP para el registro público y el reenvío de
-- contraseña (2026-10-08). Guarda un hash de la IP (nunca la IP en claro) y
-- la hora del intento; se limpia a diario desde el cron.
CREATE TABLE "IntentoAcceso" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "claveHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntentoAcceso_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntentoAcceso_tipo_claveHash_createdAt_idx" ON "IntentoAcceso"("tipo", "claveHash", "createdAt");
CREATE INDEX "IntentoAcceso_tipo_createdAt_idx" ON "IntentoAcceso"("tipo", "createdAt");

-- Seguridad: RLS activo sin políticas (solo el servidor puede tocarla).
ALTER TABLE "IntentoAcceso" ENABLE ROW LEVEL SECURITY;
