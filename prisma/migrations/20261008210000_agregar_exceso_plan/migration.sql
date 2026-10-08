-- Paso 5 (2026-10-08): exceso de plan. Fecha en que se detectó que el negocio
-- tiene más sucursales o empleados activos de los que permite su plan (inicia
-- el plazo de 7 días para elegir qué conservar) y marcas de los avisos por
-- correo ya enviados. Todas NULL = sin exceso; no cambia a ningún negocio
-- existente.
ALTER TABLE "Subscription" ADD COLUMN "excesoDetectadoAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "excesoNoticeSentAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "excesoFinalNoticeSentAt" TIMESTAMP(3);
