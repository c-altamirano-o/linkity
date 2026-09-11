import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import TenantShell from "@/components/tenant/TenantShell";

export const metadata: Metadata = {
  title: "Linkity",
};

// Diccionario expandido: cubre TODOS los tokens de color del sistema
// (fondo, texto, tarjetas, popovers, secundario, muted, acento, bordes,
// inputs, anillo de foco y sidebar) para que un cambio de tema se note de
// verdad en toda la interfaz — no solo en el color primario.
//
// A propósito NO incluye "destructive": ese token (y, por separado, los
// colores de estatus rojo/ámbar/verde usados en badges, alertas y
// prioridades a lo largo de la app) se mantienen fijos sin importar el
// tema — "Mal/Medio/Bien" debe significar lo mismo en cualquier paleta.
const THEME_PRESETS = {
  NEUTRAL_TECH: {
    "--background": "oklch(0.985 0 0)",
    "--foreground": "oklch(0.145 0 0)",
    "--card": "oklch(1 0 0)",
    "--card-foreground": "oklch(0.145 0 0)",
    "--popover": "oklch(1 0 0)",
    "--popover-foreground": "oklch(0.145 0 0)",
    "--primary": "oklch(0.546 0.215 285.5)",
    "--primary-foreground": "oklch(1 0 0)",
    "--secondary": "oklch(0.97 0 0)",
    "--secondary-foreground": "oklch(0.205 0 0)",
    "--muted": "oklch(0.97 0 0)",
    "--muted-foreground": "oklch(0.556 0 0)",
    "--accent": "oklch(0.95 0.03 285.5)",
    "--accent-foreground": "oklch(0.205 0 0)",
    "--border": "oklch(0.922 0 0)",
    "--input": "oklch(0.922 0 0)",
    "--ring": "oklch(0.546 0.215 285.5)",
    "--sidebar": "oklch(1 0 0)",
    "--sidebar-foreground": "oklch(0.145 0 0)",
    "--sidebar-primary": "oklch(0.546 0.215 285.5)",
    "--sidebar-primary-foreground": "oklch(1 0 0)",
    "--sidebar-accent": "oklch(0.95 0.03 285.5)",
    "--sidebar-accent-foreground": "oklch(0.205 0 0)",
    "--sidebar-border": "oklch(0.922 0 0)",
    "--sidebar-ring": "oklch(0.708 0 0)",
  },
  BLACK_GOLD: {
    "--background": "oklch(0.145 0 0)", // Modo oscuro
    "--foreground": "oklch(0.985 0 0)",
    "--card": "oklch(0.205 0 0)",
    "--card-foreground": "oklch(0.985 0 0)",
    "--popover": "oklch(0.205 0 0)",
    "--popover-foreground": "oklch(0.985 0 0)",
    "--primary": "oklch(0.75 0.14 85)", // Dorado
    "--primary-foreground": "oklch(0.145 0 0)",
    "--secondary": "oklch(0.269 0 0)",
    "--secondary-foreground": "oklch(0.985 0 0)",
    "--muted": "oklch(0.269 0 0)",
    "--muted-foreground": "oklch(0.708 0 0)",
    "--accent": "oklch(0.3 0.08 85)",
    "--accent-foreground": "oklch(0.985 0 0)",
    "--border": "oklch(1 0 0 / 12%)",
    "--input": "oklch(1 0 0 / 15%)",
    "--ring": "oklch(0.75 0.14 85)",
    "--sidebar": "oklch(0.1 0 0)", // Sidebar ultra oscuro
    "--sidebar-foreground": "oklch(0.985 0 0)",
    "--sidebar-primary": "oklch(0.75 0.14 85)",
    "--sidebar-primary-foreground": "oklch(0.145 0 0)",
    "--sidebar-accent": "oklch(0.22 0.05 85)",
    "--sidebar-accent-foreground": "oklch(0.985 0 0)",
    "--sidebar-border": "oklch(0.269 0 0)",
    "--sidebar-ring": "oklch(0.556 0 0)",
  },
  EMERALD: {
    "--background": "oklch(0.98 0.01 160.3)", // Fondo tinte verde tenue
    "--foreground": "oklch(0.145 0 0)",
    "--card": "oklch(1 0 0)",
    "--card-foreground": "oklch(0.145 0 0)",
    "--popover": "oklch(1 0 0)",
    "--popover-foreground": "oklch(0.145 0 0)",
    "--primary": "oklch(0.627 0.135 160.3)", // Esmeralda
    "--primary-foreground": "oklch(1 0 0)",
    "--secondary": "oklch(0.95 0.02 160.3)",
    "--secondary-foreground": "oklch(0.205 0 0)",
    "--muted": "oklch(0.95 0.02 160.3)",
    "--muted-foreground": "oklch(0.5 0.02 160.3)",
    "--accent": "oklch(0.92 0.04 160.3)",
    "--accent-foreground": "oklch(0.205 0 0)",
    "--border": "oklch(0.9 0.02 160.3)",
    "--input": "oklch(0.9 0.02 160.3)",
    "--ring": "oklch(0.627 0.135 160.3)",
    "--sidebar": "oklch(0.25 0.05 160.3)", // Sidebar verde bosque
    "--sidebar-foreground": "oklch(0.98 0.01 160.3)",
    "--sidebar-primary": "oklch(0.75 0.12 160.3)",
    "--sidebar-primary-foreground": "oklch(0.145 0 0)",
    "--sidebar-accent": "oklch(0.32 0.06 160.3)",
    "--sidebar-accent-foreground": "oklch(0.98 0.01 160.3)",
    "--sidebar-border": "oklch(0.3 0.05 160.3)",
    "--sidebar-ring": "oklch(0.627 0.135 160.3)",
  },
  CORAL_WARM: {
    "--background": "oklch(0.98 0.01 40)", // Fondo cálido
    "--foreground": "oklch(0.145 0 0)",
    "--card": "oklch(1 0 0)",
    "--card-foreground": "oklch(0.145 0 0)",
    "--popover": "oklch(1 0 0)",
    "--popover-foreground": "oklch(0.145 0 0)",
    "--primary": "oklch(0.65 0.2 25)", // Coral
    "--primary-foreground": "oklch(1 0 0)",
    "--secondary": "oklch(0.95 0.02 40)",
    "--secondary-foreground": "oklch(0.205 0 0)",
    "--muted": "oklch(0.95 0.02 40)",
    "--muted-foreground": "oklch(0.5 0.02 40)",
    "--accent": "oklch(0.92 0.05 40)",
    "--accent-foreground": "oklch(0.205 0 0)",
    "--border": "oklch(0.9 0.02 40)",
    "--input": "oklch(0.9 0.02 40)",
    "--ring": "oklch(0.65 0.2 25)",
    "--sidebar": "oklch(1 0 0)",
    "--sidebar-foreground": "oklch(0.145 0 0)",
    "--sidebar-primary": "oklch(0.65 0.2 25)",
    "--sidebar-primary-foreground": "oklch(1 0 0)",
    "--sidebar-accent": "oklch(0.92 0.05 40)",
    "--sidebar-accent-foreground": "oklch(0.205 0 0)",
    "--sidebar-border": "oklch(0.9 0.02 40)",
    "--sidebar-ring": "oklch(0.65 0.2 25)",
  },
  OCEAN_BLUE: {
    "--background": "oklch(0.98 0.01 240)", // Fondo tinte azulado
    "--foreground": "oklch(0.145 0 0)",
    "--card": "oklch(1 0 0)",
    "--card-foreground": "oklch(0.145 0 0)",
    "--popover": "oklch(1 0 0)",
    "--popover-foreground": "oklch(0.145 0 0)",
    "--primary": "oklch(0.609 0.126 221.2)", // Azul Océano
    "--primary-foreground": "oklch(1 0 0)",
    "--secondary": "oklch(0.95 0.02 240)",
    "--secondary-foreground": "oklch(0.205 0 0)",
    "--muted": "oklch(0.95 0.02 240)",
    "--muted-foreground": "oklch(0.5 0.02 240)",
    "--accent": "oklch(0.92 0.04 240)",
    "--accent-foreground": "oklch(0.205 0 0)",
    "--border": "oklch(0.9 0.02 240)",
    "--input": "oklch(0.9 0.02 240)",
    "--ring": "oklch(0.609 0.126 221.2)",
    "--sidebar": "oklch(0.2 0.05 240)", // Sidebar azul profundo
    "--sidebar-foreground": "oklch(0.98 0.01 240)",
    "--sidebar-primary": "oklch(0.7 0.1 221.2)",
    "--sidebar-primary-foreground": "oklch(0.145 0 0)",
    "--sidebar-accent": "oklch(0.28 0.06 240)",
    "--sidebar-accent-foreground": "oklch(0.98 0.01 240)",
    "--sidebar-border": "oklch(0.25 0.05 240)",
    "--sidebar-ring": "oklch(0.609 0.126 221.2)",
  },
};

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

  // Cuentas creadas con contraseña temporal (Panel Maestro o
  // auto-registro) no pueden entrar a ningún módulo del negocio hasta que
  // cambien su contraseña en /primer-acceso — esa pantalla vive fuera de
  // este layout, así que no hay riesgo de loop.
  if (user?.user_metadata?.must_change_password) {
    redirect("/primer-acceso");
  }

  let userName = "Usuario";
  let userRole = "";
  let activePreset = THEME_PRESETS.NEUTRAL_TECH;

  const dbTenant = await prisma.tenant.findUnique({
    where: { slug: tenant },
    select: { themePreset: true },
  });

  if (dbTenant?.themePreset) {
    activePreset = THEME_PRESETS[dbTenant.themePreset as keyof typeof THEME_PRESETS] || THEME_PRESETS.NEUTRAL_TECH;
  }

  if (user) {
    const dbUser = await prisma.user.findUnique({
      where: { supabaseId: user.id },
      include: { role: { include: { role: true } } },
    });
    if (dbUser) {
      userName = dbUser.name;
      userRole = dbUser.role?.role.name ?? "";
    }
  }

  return (
    <div style={activePreset as React.CSSProperties} className="contents">
      <TenantShell tenant={tenant} userName={userName} userRole={userRole}>
        {children}
      </TenantShell>
    </div>
  );
}
