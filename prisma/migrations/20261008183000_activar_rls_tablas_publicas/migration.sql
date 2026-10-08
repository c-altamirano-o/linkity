-- SEGURIDAD (2026-10-08): activar RLS en las 29 tablas del esquema public que
-- lo tenían apagado. Supabase da permisos completos a los roles públicos
-- (anon / authenticated) sobre toda tabla del esquema public; sin RLS,
-- quien tenga la llave pública del proyecto (va dentro del navegador)
-- podría leer o modificar estas tablas directo contra la API REST de
-- Supabase, saltándose la aplicación — incluido "SuperAdmin" (podría
-- darse de alta como administrador de Panel Maestro).
--
-- Con RLS activo y SIN políticas, los roles públicos no pueden hacer nada.
-- La aplicación NO se afecta: Prisma se conecta con un rol que se salta RLS
-- (igual que ya ocurre con Tenant, User y Subscription, que tienen RLS
-- activo y sin políticas desde antes).
--
-- Es idempotente: se puede correr más de una vez sin problema.

ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClinicalNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommercialFeature" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommercialLimit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommercialPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommercialPlanFeature" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommercialPlanLimit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Discount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiscountCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiscountProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InformedConsent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notificacion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OdontogramaTooth" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlanEsquema" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Prescription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PushSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaleMixedPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SolicitudDispositivo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffLoginSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SuperAdmin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportTicket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportTicketMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantLabel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TreatmentPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TreatmentPlanItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsappMensajeEnviado" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsappNumeroConfirmado" ENABLE ROW LEVEL SECURITY;

-- Función get_current_tenant_id: fijar el search_path para evitar que un
-- esquema ajeno la secuestre (aviso "function_search_path_mutable" del
-- asesor de seguridad de Supabase). Se fija a public, pg_temp.
ALTER FUNCTION public.get_current_tenant_id() SET search_path = public, pg_temp;
