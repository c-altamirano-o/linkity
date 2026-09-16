import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import TenantShell from "@/components/tenant/TenantShell";
import { THEME_PRESETS, TENANT_THEME_ROOT_ID } from "@/lib/theme-presets";

export const metadata: Metadata = {
  title: "Linkity",
};

// Los valores de cada preset ahora viven en lib/theme-presets.ts (módulo
// neutral, sin imports de servidor) porque ConfiguracionClient.tsx también
// los necesita del lado del cliente para la vista previa en vivo del
// selector de tema — ver el comentario en ese archivo.

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sin esta verificación, cualquiera que adivinara o conociera el slug de
  // un negocio (ej. /difussion-barberia/dashboard) podía entrar sin haber
  // iniciado sesión — proxy.ts (el middleware) solo protege rutas bajo
  // /maestro, nunca protegió las rutas de negocio. Mismo criterio que ya
  // usa app/(admin)/maestro/layout.tsx.
  if (!user) {
    redirect("/login");
  }

  // Cuentas creadas con contraseña temporal (Panel Maestro o
  // auto-registro) no pueden entrar a ningún módulo del negocio hasta que
  // cambien su contraseña en /primer-acceso — esa pantalla vive fuera de
  // este layout, así que no hay riesgo de loop.
  if (user.user_metadata?.must_change_password) {
    redirect("/primer-acceso");
  }

  let userName = "Usuario";
  let userRole = "";
  // Tipado explícito como Record<string, string> (en vez de dejar que TS
  // infiera el tipo literal exacto de NEUTRAL_TECH) — THEME_PRESETS ahora
  // se declara `as const` en lib/theme-presets.ts para que ThemePresetId
  // se pueda derivar con keyof, pero eso vuelve cada preset un tipo
  // literal DISTINTO entre sí; sin esta anotación, la reasignación de
  // abajo a un preset distinto de NEUTRAL_TECH no compilaría.
  let activePreset: Record<string, string> = THEME_PRESETS.NEUTRAL_TECH;

  const dbTenant = await prisma.tenant.findUnique({
    where: { slug: tenant },
    select: { id: true, themePreset: true },
  });

  if (dbTenant?.themePreset) {
    activePreset = THEME_PRESETS[dbTenant.themePreset as keyof typeof THEME_PRESETS] || THEME_PRESETS.NEUTRAL_TECH;
  }

  const dbUser = await prisma.user.findUnique({
    where: { supabaseId: user.id },
    include: { role: { include: { role: true } }, tenant: { select: { slug: true } } },
  });

  // Aislamiento multi-tenant: sin esto, un usuario autenticado de OTRO
  // negocio podía entrar aquí con solo cambiar el slug en la URL (ej. un
  // empleado de "fix-expert" visitando /difussion-barberia/dashboard) y ver
  // los datos reales de un negocio ajeno — cada pantalla de adentro confía
  // en que este layout ya validó la pertenencia. También cierra la sesión
  // de una cuenta desactivada desde Panel Maestro (Usuarios) aunque ya
  // tuviera una sesión abierta.
  if (dbTenant) {
    if (!dbUser || !dbUser.isActive) {
      redirect("/login");
    } else if (dbUser.tenantId !== dbTenant.id) {
      redirect(`/${dbUser.tenant.slug}/dashboard`);
    }
  }

  if (dbUser) {
    userName = dbUser.name;
    userRole = dbUser.role?.role.name ?? "";
  }

  return (
    <div id={TENANT_THEME_ROOT_ID} style={activePreset as React.CSSProperties} className="contents">
      <TenantShell tenant={tenant} userName={userName} userRole={userRole}>
        {children}
      </TenantShell>
    </div>
  );
}
