-- Marca los negocios INTERNOS (de prueba, de Carlos): no cuentan en las métricas
-- de Panel Maestro. Todos los negocios existentes quedan en false.
--
-- IMPORTANTE: correr este SQL ANTES de desplegar el código que lo usa.

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "esInterno" BOOLEAN NOT NULL DEFAULT false;
