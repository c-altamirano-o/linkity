-- Caja rápida (POS): el dueño del negocio decide, desde Configuración, si el
-- punto de venta trabaja en modo de flujo continuo (tipo supermercado): el foco
-- siempre en el buscador y Enter con el buscador vacío cobra. Todos los negocios
-- existentes quedan en false (el POS se comporta exactamente igual que hoy).
--
-- IMPORTANTE: correr este SQL ANTES de desplegar el código que lo usa (el
-- código nuevo lee Tenant.cajaRapida al abrir el POS y Configuración).

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "cajaRapida" BOOLEAN NOT NULL DEFAULT false;
