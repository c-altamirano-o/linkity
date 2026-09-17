import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import TenantShell from "@/components/tenant/TenantShell";
import { THEME_PRESETS, TENANT_THEME_ROOT_ID } from "@/lib/theme-presets";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
import { moduloPermitido, primerModuloPermitido, type ModuloKey } from "@/lib/roles";
import { getTenantLabels } from "@/lib/labels-server";
import type { LabelDictionary } from "@/lib/labels";

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

  // A partir de M11 hay dos formas válidas de tener sesión aquí: una cuenta
  // real (Supabase Auth, el dueño/gerente que entró por /login) o una
  // sesión de personal por PIN (ver lib/staff-auth.ts, entra por
  // /entrada/[tenant]). Sin ninguna de las dos, se manda a la pantalla de
  // PIN — no a /login directo — porque en un negocio real quien abre el
  // sistema todos los días suele ser un empleado, no el dueño; /login sigue
  // ahí, con un link visible desde /entrada, para cuando sí es el dueño.
  // verificarSesionPersonalVigente (en vez de leerSesionPersonal a secas)
  // hace cumplir el cierre automático de la sesión de PIN al cambiar de día
  // calendario (lib/asistencia.ts) — así ninguna sesión de personal se
  // queda abierta de un día para otro sin que el empleado vuelva a teclear
  // su PIN.
  const sesionPersonal = user ? null : await verificarSesionPersonalVigente();

  if (!user && !sesionPersonal) {
    redirect(`/entrada/${tenant}`);
  }

  // Cuentas creadas con contraseña temporal (Panel Maestro o
  // auto-registro) no pueden entrar a ningún módulo del negocio hasta que
  // cambien su contraseña en /primer-acceso — esa pantalla vive fuera de
  // este layout, así que no hay riesgo de loop.
  if (user?.user_metadata?.must_change_password) {
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
  let modo: "admin" | "staff" = "admin";
  let roleNameParaNav: string | null = null;

  const dbTenant = await prisma.tenant.findUnique({
    where: { slug: tenant },
    select: { id: true, themePreset: true, businessType: true, logo: true },
  });

  if (dbTenant?.themePreset) {
    activePreset = THEME_PRESETS[dbTenant.themePreset as keyof typeof THEME_PRESETS] || THEME_PRESETS.NEUTRAL_TECH;
  }

  // Personalización por rubro (2026-09-17): labels ya resueltos (rubro +
  // overrides del propio tenant) para el menú, y el conjunto de módulos que
  // ESTE negocio desactivó (ver lib/modulos-rubro.ts / app/actions/
  // modulos-tenant-actions.ts). "Sin fila en TenantModule, o fila con
  // isActive:true" = módulo activo; solo una fila explícita isActive:false
  // lo oculta — así ningún negocio que ya estaba en producción antes de
  // este cambio pierde un módulo de golpe (nunca tuvo una fila así).
  let labels: LabelDictionary = {};
  let modulosInactivos: string[] = [];
  if (dbTenant) {
    const [labelsResueltos, inactivos] = await Promise.all([
      getTenantLabels(dbTenant.id, dbTenant.businessType),
      prisma.tenantModule.findMany({
        where: { tenantId: dbTenant.id, isActive: false },
        select: { module: { select: { code: true } } },
      }),
    ]);
    labels = labelsResueltos;
    modulosInactivos = inactivos.map((tm) => tm.module.code);
  }

  if (dbTenant && user) {
    // Modo administrador/gerente con cuenta real — mismo guard de siempre,
    // sin ningún cambio de comportamiento para el dueño.
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
    if (!dbUser || !dbUser.isActive) {
      redirect(`/entrada/${tenant}`);
    } else if (dbUser.tenantId !== dbTenant.id) {
      redirect(`/${dbUser.tenant.slug}/dashboard`);
    }

    userName = dbUser.name;
    userRole = dbUser.role?.role.name ?? "";
  } else if (dbTenant && sesionPersonal) {
    // Mismo aislamiento multi-tenant que arriba, pero para una sesión de
    // PIN: si por lo que sea trae el tenantId de OTRO negocio (cookie
    // vieja de una sesión anterior en el mismo navegador/dispositivo
    // compartido), se manda a la entrada del negocio correcto en vez de
    // dejarla pasar.
    if (sesionPersonal.tenantId !== dbTenant.id) {
      redirect(`/entrada/${tenant}`);
    }

    modo = "staff";
    userName = sesionPersonal.staffName;
    userRole = sesionPersonal.roleName;
    roleNameParaNav = sesionPersonal.roleName;

    // Guard de ruta por rol: un empleado de PIN que cae en un módulo que su
    // rol no tiene permitido (ej. escribiendo /personal a mano en la URL)
    // se redirige al primer módulo que sí puede ver — el link ya está
    // oculto en TenantShell, esto es la verificación real del lado del
    // servidor, la que de verdad importa. El pathname llega vía un header
    // que proxy.ts sella en cada request (los layouts de Server Components
    // no lo reciben directo, solo params/searchParams).
    const headerList = await headers();
    const pathname = headerList.get("x-pathname") ?? "";
    const modulo = pathname.split("/").filter(Boolean)[1] as ModuloKey | undefined;
    if (modulo && !moduloPermitido(sesionPersonal.roleName, modulo)) {
      redirect(`/${tenant}/${primerModuloPermitido(sesionPersonal.roleName)}`);
    }
  }

  // Guard de módulo desactivado por rubro/negocio (2026-09-17) — a
  // diferencia del guard de arriba (por ROL, solo aplica a personal de
  // PIN), este aplica a CUALQUIER sesión, incluido el dueño con cuenta
  // real: si el propio negocio apagó un módulo (ej. "Reparaciones" en una
  // barbería), nadie debe poder seguir usándolo solo por escribir la URL a
  // mano — el link ya está oculto en TenantShell, esto es la verificación
  // real del servidor. Se lee de nuevo el pathname (en vez de reusar el
  // del bloque de arriba) porque ese bloque solo corre en modo "staff".
  if (dbTenant && modulosInactivos.length > 0) {
    const headerList = await headers();
    const pathname = headerList.get("x-pathname") ?? "";
    const modulo = pathname.split("/").filter(Boolean)[1] as ModuloKey | undefined;
    if (modulo && modulosInactivos.includes(modulo)) {
      redirect(`/${tenant}/dashboard`);
    }
  }

  return (
    <div id={TENANT_THEME_ROOT_ID} style={activePreset as React.CSSProperties} className="contents">
      <TenantShell
        tenant={tenant}
        userName={userName}
        userRole={userRole}
        modo={modo}
        roleName={roleNameParaNav}
        labels={labels}
        modulosInactivos={modulosInactivos}
        logoUrl={dbTenant?.logo ?? null}
      >
        {children}
      </TenantShell>
    </div>
  );
}
