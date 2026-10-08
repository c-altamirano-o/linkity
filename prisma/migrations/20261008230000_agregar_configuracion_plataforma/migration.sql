-- Configuración de la plataforma editable desde Panel Maestro (2026-10-08).
-- Por ahora guarda los datos de WhatsApp Business de Linkity (número, Phone
-- Number ID, token de acceso, App Secret, verify token, plantilla). Los
-- valores sensibles se guardan CIFRADOS (columna "cifrado" = true); la llave
-- de cifrado vive en la variable de entorno CONFIG_ENCRYPTION_KEY.
CREATE TABLE "ConfiguracionPlataforma" (
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "cifrado" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionPlataforma_pkey" PRIMARY KEY ("clave")
);

-- Seguridad: RLS activo sin políticas (solo el servidor puede tocarla).
ALTER TABLE "ConfiguracionPlataforma" ENABLE ROW LEVEL SECURITY;
