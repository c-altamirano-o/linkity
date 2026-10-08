-- Marca los negocios creados automáticamente desde Hotmart que todavía no han
-- capturado su nombre real y su giro (primer acceso).
--
-- IMPORTANTE: correr este SQL ANTES de desplegar el código que lo usa (el
-- código nuevo lee Tenant.datosPendientes en cada pantalla del negocio).
-- Es seguro: todos los negocios existentes quedan en false (no cambia nada para ellos).

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "datosPendientes" BOOLEAN NOT NULL DEFAULT false;
