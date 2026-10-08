-- Retiro del viejo "Esquema" de capacidad (PlanEsquema).
-- Los límites de sucursales/empleados y las funciones ahora los define el
-- PLAN COMERCIAL (Subscription.commercialPlanId, ver lib/capacidades-comerciales.ts).
--
-- IMPORTANTE: correr este SQL SOLO DESPUÉS de que el código nuevo ya esté
-- desplegado en producción. El código anterior todavía consulta Tenant.esquemaId.
-- Verificado antes: PlanEsquema sin filas y ningún Tenant con esquemaId.

ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "esquemaId";
DROP TABLE IF EXISTS "PlanEsquema";
