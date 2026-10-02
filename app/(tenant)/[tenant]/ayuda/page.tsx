import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getTenantLabels } from "@/lib/labels-server";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
import { modulosPermitidosParaRolPorNombre } from "@/lib/roles-server";
import { obtenerEstadoPasosBienvenida } from "@/lib/onboarding";
import { MODULOS, type ModuloKey } from "@/lib/roles";
import AyudaClient from "./AyudaClient";

// Guía rápida ("Ayuda", 2026-10-02, a petición de Carlos — ver el comentario
// largo en lib/ayuda-contenido.ts). Mismo patrón de page.tsx que
// dashboard/page.tsx: cada ruta recalcula lo que necesita, nunca recibe
// props del layout (TenantShell solo recibe `children`, no al revés).
export default async function AyudaPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, businessType: true, themePreset: true, weekStartDay: true, cobrarEnDevolucion: true, rfc: true },
  });

  if (!tenant) notFound();

  // Mismo criterio de prioridad "personal (PIN) primero, administrador como
  // fallback" que layout.tsx — ver el comentario largo ahí.
  const sesionPersonal = await verificarSesionPersonalVigente();
  const sesionValida = sesionPersonal && sesionPersonal.tenantId === tenant.id ? sesionPersonal : null;
  const modo: "admin" | "staff" = sesionValida ? "staff" : "admin";

  // Módulos "activos" para este negocio (el mismo criterio "default
  // abierto" que layout.tsx/dashboard/page.tsx: sin fila en TenantModule, o
  // fila con isActive:true, cuenta como activo).
  const inactivos = await prisma.tenantModule.findMany({
    where: { tenantId: tenant.id, isActive: false },
    select: { module: { select: { code: true } } },
  });
  // Anotación explícita (tm: { module: { code: string } }) — el cliente de
  // Prisma roto de este sandbox (ver la nota de artefactos conocidos en el
  // resto del proyecto) infiere "any" implícito aquí aunque el shape real de
  // `inactivos` es perfectamente concreto; sin la anotación, tsc truena.
  const modulosInactivos = new Set(inactivos.map((tm: { module: { code: string } }) => tm.module.code));

  // En modo staff, solo los módulos que su ROL tiene permitido (mismo
  // criterio que el guard de ruta de layout.tsx) — "Ayuda" nunca filtra por
  // rol, pero SÍ debe mostrar únicamente lo que ese rol puede de verdad usar,
  // para no generar fricción explicando un módulo al que no tiene acceso. En
  // modo admin, el dueño ve el manual de TODOS los módulos que el negocio
  // tiene activos, sin importar que todavía no haya asignado ningún rol.
  const modulosPermitidos: ModuloKey[] = sesionValida
    ? await modulosPermitidosParaRolPorNombre(tenant.id, sesionValida.roleName)
    : (MODULOS as unknown as ModuloKey[]);

  const modulosVisibles = modulosPermitidos.filter((m) => !modulosInactivos.has(m));

  const labels = await getTenantLabels(tenant.id, tenant.businessType);

  // Checklist de "Primeros pasos" — mismo cálculo que ya usan /bienvenida y
  // el desplegable del encabezado (lib/onboarding.ts), para que la Guía
  // rápida de Ayuda nunca pueda mostrar un avance distinto al resto del
  // sistema. Solo tiene sentido para el administrador (ver el mismo criterio
  // en layout.tsx).
  const onboarding = modo === "admin" ? await obtenerEstadoPasosBienvenida(tenant.id, tenant.themePreset) : null;

  return (
    <AyudaClient
      tenantSlug={tenantSlug}
      modo={modo}
      userName={modo === "staff" ? sesionValida!.staffName : null}
      userRole={modo === "staff" ? sesionValida!.roleName : null}
      labels={labels}
      modulosVisibles={modulosVisibles}
      onboarding={onboarding}
      weekStartDay={tenant.weekStartDay}
      cobrarEnDevolucion={tenant.cobrarEnDevolucion}
      tieneRfc={!!tenant.rfc}
    />
  );
}
