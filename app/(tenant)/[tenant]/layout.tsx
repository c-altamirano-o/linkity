import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { CashSessionStatus } from "@prisma/client";
import TenantShell from "@/components/tenant/TenantShell";
import { resolverPresetTenant, TENANT_THEME_ROOT_ID } from "@/lib/theme-presets";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
import type { ModuloKey } from "@/lib/roles";
import { modulosPermitidosParaRolPorNombre } from "@/lib/roles-server";
import { getTenantLabels } from "@/lib/labels-server";
import type { LabelDictionary } from "@/lib/labels";
import { calcularEstadoCiclo } from "@/lib/ciclo-suscripcion";
import CuentaBloqueada from "@/components/tenant/CuentaBloqueada";
import { getNotificaciones, contarNotificacionesNoLeidas } from "@/lib/notificaciones";

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
  // real (Supabase Auth, el dueño/gerente) o una sesión de personal por PIN
  // (ver lib/staff-auth.ts). Sin ninguna de las dos, se manda a la puerta
  // única del negocio (/[tenant], app/(auth)/[tenant]/page.tsx — 2026-09-23,
  // reemplaza /entrada/[tenant]) — no a /login directo — porque en un
  // negocio real quien abre el sistema todos los días suele ser un
  // empleado, no el dueño; esa puerta ya incluye una ficha de administrador
  // con correo y contraseña para cuando sí es el dueño.
  // verificarSesionPersonalVigente (en vez de leerSesionPersonal a secas)
  // hace cumplir el cierre automático de la sesión de PIN al cambiar de día
  // calendario (lib/asistencia.ts) — así ninguna sesión de personal se
  // queda abierta de un día para otro sin que el empleado vuelva a teclear
  // su PIN.
  //
  // IMPORTANTE (2026-09-21, corregido a pedido de Carlos): esta llamada YA
  // NO se salta cuando hay un `user` de Supabase — antes decía
  // `user ? null : await verificarSesionPersonalVigente()`, lo que abría un
  // hueco de privilegios real. /[tenant]/entrada es una pantalla pensada
  // para una COMPUTADORA COMPARTIDA (mostrador, caja): si el administrador
  // alguna vez inició sesión ahí y solo cerró la pestaña sin cerrar sesión,
  // su cookie de Supabase Auth seguía viva, y cualquier empleado que
  // después entrara con su PIN en esa misma computadora heredaba el panel
  // COMPLETO de administrador — el PIN de 4 dígitos no protegía nada. Ahora
  // se revisan y resuelven ambas sesiones, y más abajo se le da prioridad a
  // la de personal cuando las dos existen (ver el "if" de abajo).
  const sesionPersonal = await verificarSesionPersonalVigente();

  if (!user && !sesionPersonal) {
    redirect(`/${tenant}`);
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
  // El valor por default (antes de conocer dbTenant) usa la misma función
  // que todo lo demás — resolverPresetTenant ya sabe caer a LUMIA_COBALT si
  // el string que recibe no es un tema válido. Así no hace falta mantener un
  // segundo "default" hardcodeado aparte de INTENSIDAD_DEFAULT.
  let activePreset: Record<string, string> = resolverPresetTenant("LUMIA_COBALT", 100);
  let modo: "admin" | "staff" = "admin";
  // Módulos que el rol de la sesión de PIN tiene permitido — se calcula una
  // sola vez más abajo (modo "staff") y se reusa tanto para el guard de ruta
  // del servidor como para el prop que filtra el menú en TenantShell; en
  // modo "admin" se queda en null, que TenantShell interpreta como "sin
  // restricción" (ve todo el menú, igual que siempre).
  let modulosPermitidosParaNav: ModuloKey[] | null = null;

  const dbTenant = await prisma.tenant.findUnique({
    where: { slug: tenant },
    select: { id: true, themePreset: true, themeIntensity: true, businessType: true, logo: true, subscription: { select: { status: true, endDate: true } } },
  });

  // Bloqueo por ciclo de vida de suscripción (2026-09-22, a petición de
  // Carlos — ver el comentario largo en lib/ciclo-suscripcion.ts). Se
  // revisa aquí, ANTES de armar el menú/labels/tema (ahorra ese trabajo
  // si de todos modos no se va a mostrar), y se renderiza directo la
  // pantalla de bloqueo EN VEZ de TenantShell — no tiene caso mostrar un
  // menú completo de módulos que de todos modos van a rechazar cualquier
  // acción (ver el mismo chequeo en lib/actor.ts). resolverActor cubre los
  // Server Actions; esto cubre la renderización de cualquier página.
  if (dbTenant) {
    const cicloSuscripcion = calcularEstadoCiclo(dbTenant.subscription);
    if (cicloSuscripcion.bloqueada) {
      return <CuentaBloqueada etapa={cicloSuscripcion.etapa} tenantSlug={tenant} />;
    }
  }

  if (dbTenant?.themePreset) {
    activePreset = resolverPresetTenant(dbTenant.themePreset, dbTenant.themeIntensity);
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
  // Panel de notificaciones en tiempo real (2026-09-22, a petición de
  // Carlos — ver el comentario largo en lib/notificaciones.ts): la
  // campanita de TenantShell.tsx necesita un estado inicial (lo que ya
  // pasó antes de que este panel se abriera) además de la suscripción en
  // vivo que arma el propio cliente — sin esto, alguien que entra al panel
  // después de que ya se abrió/cerró una caja no vería ese aviso nunca,
  // solo los que ocurran mientras la pestaña sigue abierta.
  let notificacionesIniciales: Awaited<ReturnType<typeof getNotificaciones>> = [];
  let notificacionesNoLeidas = 0;
  if (dbTenant) {
    const [labelsResueltos, inactivos, notifs, noLeidas] = await Promise.all([
      getTenantLabels(dbTenant.id, dbTenant.businessType),
      prisma.tenantModule.findMany({
        where: { tenantId: dbTenant.id, isActive: false },
        select: { module: { select: { code: true } } },
      }),
      getNotificaciones(dbTenant.id),
      contarNotificacionesNoLeidas(dbTenant.id),
    ]);
    labels = labelsResueltos;
    modulosInactivos = inactivos.map((tm) => tm.module.code);
    notificacionesIniciales = notifs;
    notificacionesNoLeidas = noLeidas;
  }

  // Prioridad: personal (PIN) primero, administrador como fallback — ver el
  // comentario largo junto a `sesionPersonal` arriba. Si en este navegador
  // hay AMBAS sesiones vivas (el caso real que reportó Carlos: dueño que no
  // cerró sesión + empleado que entra después por PIN en la misma
  // computadora), la de personal manda mientras dure — nunca se le da el
  // panel de administrador a alguien que solo tecleó un PIN de 4 dígitos.
  if (dbTenant && sesionPersonal) {
    // Mismo aislamiento multi-tenant que el bloque de administrador de
    // abajo, pero para una sesión de PIN: si por lo que sea trae el
    // tenantId de OTRO negocio (cookie vieja de una sesión anterior en el
    // mismo navegador/dispositivo compartido), se manda a la entrada del
    // negocio correcto en vez de dejarla pasar.
    if (sesionPersonal.tenantId !== dbTenant.id) {
      redirect(`/${tenant}`);
    }

    modo = "staff";
    userName = sesionPersonal.staffName;
    userRole = sesionPersonal.roleName;

    // Guard de ruta por rol: un empleado de PIN que cae en un módulo que su
    // rol no tiene permitido (ej. escribiendo /personal a mano en la URL)
    // se redirige al primer módulo que sí puede ver — el link ya está
    // oculto en TenantShell, esto es la verificación real del lado del
    // servidor, la que de verdad importa. El pathname llega vía un header
    // que proxy.ts sella en cada request (los layouts de Server Components
    // no lo reciben directo, solo params/searchParams).
    modulosPermitidosParaNav = await modulosPermitidosParaRolPorNombre(dbTenant.id, sesionPersonal.roleName);

    const headerList = await headers();
    const pathname = headerList.get("x-pathname") ?? "";
    const modulo = pathname.split("/").filter(Boolean)[1] as ModuloKey | undefined;
    if (modulo && !modulosPermitidosParaNav.includes(modulo)) {
      redirect(`/${tenant}/${modulosPermitidosParaNav[0] ?? "dashboard"}`);
    }

    // "Abrir caja" como primera tarea del turno (2026-09-23, a petición de
    // Carlos: "la primer pantalla que le debe aparecer es Abrir caja...
    // siempre debe ser la tarea inicial"). Solo aplica a personal de PIN
    // cuyo rol tiene Punto de Venta Y Caja permitidos (si un rol no tiene
    // Caja, ni siquiera puede abrir una, así que no tiene caso empujarlo
    // ahí) — un administrador con cuenta real nunca pasa por este bloque
    // (ve/opera varias sucursales a la vez, "abrir caja" no tiene una única
    // sucursal obvia para él). Se deja pasar libremente la propia pantalla
    // de Caja (si no, nunca podría llegar a abrirla) y Asistencia (para que
    // pueda registrar su salida si por lo que sea ya se fue sin cerrar —
    // caso raro, pero no tiene sentido atraparlo sin ver ni eso).
    if (
      modulo !== "caja" &&
      modulo !== "asistencia" &&
      modulosPermitidosParaNav.includes("pos") &&
      modulosPermitidosParaNav.includes("caja")
    ) {
      const cajaAbierta = await prisma.cashSession.findFirst({
        where: { tenantId: dbTenant.id, branchId: sesionPersonal.branchId, status: CashSessionStatus.OPEN },
        select: { id: true },
      });
      if (!cajaAbierta) {
        redirect(`/${tenant}/caja`);
      }
    }
  } else if (dbTenant && user) {
    // Modo administrador/gerente con cuenta real — mismo guard de siempre,
    // sin ningún cambio de comportamiento para el dueño cuando NO hay
    // ninguna sesión de personal compitiendo en este navegador.
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
      redirect(`/${tenant}`);
    } else if (dbUser.tenantId !== dbTenant.id) {
      redirect(`/${dbUser.tenant.slug}/dashboard`);
    }

    userName = dbUser.name;
    userRole = dbUser.role?.role.name ?? "";
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
        tenantId={dbTenant?.id ?? null}
        userName={userName}
        userRole={userRole}
        modo={modo}
        modulosPermitidos={modulosPermitidosParaNav}
        labels={labels}
        modulosInactivos={modulosInactivos}
        logoUrl={dbTenant?.logo ?? null}
        notificacionesIniciales={notificacionesIniciales}
        notificacionesNoLeidasIniciales={notificacionesNoLeidas}
      >
        {children}
      </TenantShell>
    </div>
  );
}
