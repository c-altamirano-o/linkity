-- CreateTable
CREATE TABLE "PruebaGratisUsada" (
    "id" TEXT NOT NULL,
    "emailCanonico" TEXT NOT NULL,
    "emailOriginal" TEXT NOT NULL,
    "tenantSlug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PruebaGratisUsada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PruebaGratisUsada_emailCanonico_key" ON "PruebaGratisUsada"("emailCanonico");

-- Seguridad: RLS activo sin políticas (solo el servidor puede tocarla).
ALTER TABLE "PruebaGratisUsada" ENABLE ROW LEVEL SECURITY;
