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
import { calcularEstadoCiclo, avisoParaPanel } from "@/lib/ciclo-suscripcion";
import CuentaBloqueada from "@/components/tenant/CuentaBloqueada";
import { obtenerEnlacesSuscripcion } from "@/lib/enlaces-suscripcion";
import { getNotificaciones, contarNotificacionesNoLeidas } from "@/lib/notificaciones";
import { obtenerEstadoPasosBienvenida } from "@/lib/onboarding";
import { MODULOS_OCULTOS_MODO_SIMPLE } from "@/lib/modules-catalog";
import { sincronizarExceso, obtenerDatosAjuste } from "@/lib/exceso-plan";
import { tieneFeature, FUNCION_API_FACTURACION } from "@/lib/capacidades-comerciales";
import { calcularEstadoExceso, type EstadoExceso } from "@/lib/exceso-plan-estado";
import AjustePlanClient from "@/components/tenant/AjustePlanClient";
import AjustePlanPendiente from "@/components/tenant/AjustePlanPendiente";
import BannerExceso from "@/components/tenant/BannerExceso";
import DatosNegocioClient from "@/components/tenant/DatosNegocioClient";
import AvisoCajaPendiente from "@/components/tenant/AvisoCajaPendiente";
import CajaPendienteBloqueo from "@/components/tenant/CajaPendienteBloqueo";
import { sesionAdminDeOtroDia, inicioDeHoyMXDe, formatoDiaMes, formatoFechaCompleta } from "@/lib/corte-diario-puro";

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
    select: { id: true, themePreset: true, themeIntensity: true, themeIntensityFondo: true, themeCustomColors: true, businessType: true, datosPendientes: true, logo: true, esInterno: true, subscription: { select: { status: true, endDate: true, excesoDetectadoAt: true, price: true, plan: true, commercialPlan: { select: { name: true } } } } },
  });

  // Bloqueo por ciclo de vida de suscripción (2026-09-22, a petición de
  // Carlos — ver el comentario largo en lib/ciclo-suscripcion.ts). Se
  // revisa aquí, ANTES de armar el menú/labels/tema (ahorra ese trabajo
  // si de todos modos no se va a mostrar), y se renderiza directo la
  // pantalla de bloqueo EN VEZ de TenantShell — no tiene caso mostrar un
  // menú completo de módulos que de todos modos van a rechazar cualquier
  // acción (ver el mismo chequeo en lib/actor.ts). resolverActor cubre los
  // Server Actions; esto cubre la renderización de cualquier página.
  const enlacesSuscripcion = await obtenerEnlacesSuscripcion();
  // Aviso de días restantes dentro del SaaS (2026-10-06, ver
  // components/tenant/BannerSuscripcion.tsx) — desde 2026-10-09 solo en los
  // días de gracia de una suscripción de pago vencida; durante la prueba
  // gratis no se muestra nada (ver avisoParaPanel en lib/ciclo-suscripcion.ts).
  let fichaSuscripcion: { plan: string; estatus: "activa" | "por_vencer" | "en_gracia"; vigencia: string | null } | null = null;
  let avisoSuscripcion: { etapa: "en_prueba" | "en_gracia"; diasRestantes: number } | null = null;
  // Exceso de plan (Paso 5, 2026-10-08 — ver lib/exceso-plan.ts): si el negocio
  // tiene más sucursales/empleados activos de los que permite su plan corren 7
  // días de gracia (banner) y después el sistema se pausa hasta que el
  // administrador elija qué conservar. La marca se sincroniza sola aquí.
  let estadoExceso: EstadoExceso = calcularEstadoExceso(null);
  if (dbTenant) {
    const cicloSuscripcion = calcularEstadoCiclo(dbTenant.subscription);
    if (cicloSuscripcion.bloqueada) {
      return (
        <CuentaBloqueada
          etapa={cicloSuscripcion.etapa}
          tenantSlug={tenant}
          checkoutUrl={enlacesSuscripcion.checkoutUrl}
          contactoHref={enlacesSuscripcion.contactoHref}
          correoCuenta={user?.email ?? null}
        />
      );
    }
    avisoSuscripcion = avisoParaPanel(cicloSuscripcion);
    // Ficha "Suscripción actual" (2026-10-09, a petición de Carlos): solo para
    // el administrador de una cuenta de paga. Queda vacía (null) en la prueba
    // gratis (TRIAL), en la prueba con tarjeta de Hotmart (ACTIVE con precio 0,
    // aún sin primer cobro) y en el negocio interno de pruebas.
    const sub = dbTenant.subscription;
    const esPruebaSinCobro = !sub || sub.status === "TRIAL" || Number(sub.price) <= 0;
    if (sub && modo === "admin" && !dbTenant.esInterno && !esPruebaSinCobro) {
      const diasParaVencer = sub.endDate ? Math.ceil((sub.endDate.getTime() - Date.now()) / 86400000) : null;
      fichaSuscripcion = {
        plan: sub.commercialPlan?.name ?? sub.plan,
        estatus:
          cicloSuscripcion.etapa === "en_gracia"
            ? "en_gracia"
            : diasParaVencer !== null && diasParaVencer <= 7
              ? "por_vencer"
              : "activa",
        vigencia: sub.endDate ? formatoFechaCompleta(sub.endDate) : null,
      };
    }
    if (dbTenant.subscription) {
      estadoExceso = await sincronizarExceso(dbTenant.id, {
        status: dbTenant.subscription.status,
        excesoDetectadoAt: dbTenant.subscription.excesoDetectadoAt,
      });
    }
  }

  if (dbTenant?.themePreset) {
    activePreset = resolverPresetTenant(dbTenant.themePreset, dbTenant.themeIntensity, dbTenant.themeIntensityFondo, dbTenant.themeCustomColors);
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
  // Modo Simple (2026-10-03) — ver el comentario largo donde se calcula,
  // unas líneas más abajo.
  let modoSimpleActivo = false;
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
    const [labelsResueltos, inactivos, notifs, noLeidas, incluyeFacturacion] = await Promise.all([
      getTenantLabels(dbTenant.id, dbTenant.businessType),
      prisma.tenantModule.findMany({
        where: { tenantId: dbTenant.id, isActive: false },
        select: { module: { select: { code: true } } },
      }),
      getNotificaciones(dbTenant.id),
      contarNotificacionesNoLeidas(dbTenant.id),
      // Funciones del plan comercial (2026-10-08): Facturación solo existe en
      // los planes que incluyen API_FACTURACION. Prueba gratis = todo incluido.
      tieneFeature(dbTenant.id, FUNCION_API_FACTURACION),
    ]);
    labels = labelsResueltos;
    modulosInactivos = inactivos.map((tm) => tm.module.code);
    // Modo Simple (2026-10-03, ver el comentario largo junto a
    // activarModoSimpleAction, app/actions/modulos-tenant-actions.ts) —
    // mismo cálculo que configuracion/page.tsx: "activo" = los 4 módulos que
    // apaga ya están, los 4, inactivos. Se usa más abajo para (a) ocultar
    // "Taller" (aduana) del menú del dueño — ver TenantShell, prop
    // modoSimpleActivo — y (b) redirigirlo de vuelta a Reparaciones si
    // entra a /aduana escribiendo la URL a mano, ahora que Reparaciones ya
    // trae los mismos controles (asignar técnico/costo/estatus) fusionados
    // — ver ReparacionesClient.tsx. Nunca afecta a personal de PIN (Gerente
    // sigue viendo "Aduana" en su propio menú, con su panel de métricas
    // completo) — Modo Simple es una simplificación pensada para el dueño.
    const modulosInactivosSet = new Set(modulosInactivos);
    modoSimpleActivo = MODULOS_OCULTOS_MODO_SIMPLE.every((code) => modulosInactivosSet.has(code));
    // Después del cálculo de Modo Simple (no debe verse afectado). Se agrega a
    // la lista de módulos inactivos para reutilizar el menú oculto y el guard
    // de ruta de más abajo; ver también facturacion/page.tsx y
    // facturacion-actions.ts, que lo vuelven a revisar del lado del servidor.
    if (!incluyeFacturacion && !modulosInactivos.includes("facturacion")) {
      modulosInactivos = [...modulosInactivos, "facturacion"];
    }
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
    const modulo = pathname.split("/").filter(Boolean)[1] as ModuloKey | "ayuda" | undefined;
    // "ayuda" (2026-10-02) se exenta de este guard — ver el comentario largo
    // junto al ítem "ayuda" en NAV_STRUCTURE, TenantShell.tsx: el manual
    // debe poder verlo CUALQUIER rol, nunca es parte de modulosPermitidosParaNav.
    if (modulo && modulo !== "ayuda" && !modulosPermitidosParaNav.includes(modulo)) {
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
    //
    // Nota (auditoría 2026-10-05): "asistencia" NUNCA puede estar en
    // modulosPermitidosParaNav para ningún rol de PIN — ese módulo está
    // excluido a propósito de todo el sistema de permisos (ver
    // MODULOS_BASE_EXCLUIDOS, lib/roles.ts, y el comentario de
    // "module.attendance.name" en TenantShell.tsx: "staff nunca ve este
    // link"). Eso significa que el guard de arriba (línea 206) ya redirige
    // fuera de /asistencia a CUALQUIER personal antes de que este segundo
    // bloque se evalúe siquiera — la excepción `modulo !== "asistencia"` de
    // abajo es hoy inalcanzable en la práctica. Se deja tal cual (en vez de
    // quitarla) a propósito: es inofensiva, documenta la intención original
    // ("que pueda registrar su salida"), y queda lista para activarse sola
    // el día que algún rol sí pueda tener "asistencia" sin tocar esta línea
    // — no se trata de código con efecto engañoso, solo de una excepción
    // hoy sin caso que la dispare.
    if (
      modulo !== "caja" &&
      modulo !== "asistencia" &&
      // "ayuda" (2026-10-02) también se deja pasar libre aquí — alguien
      // debe poder consultar "cómo abrir caja" ANTES de haberla abierto,
      // que es justo el escenario que este bloque empuja a resolver.
      modulo !== "ayuda" &&
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

    // Corte diario (2026-10-09, a petición de Carlos): "si se olvidan cerrar
    // sesión, el SaaS tiene que cerrarla al cambiar de fecha". El personal con
    // PIN ya lo tenía (verificarSesionPersonalVigente); aquí se aplica al
    // administrador con cuenta real, según el día (México) en que inició
    // sesión. Un Server Component no puede borrar cookies, así que se pasa por
    // una ruta que cierra la sesión y manda a la puerta del negocio.
    if (sesionAdminDeOtroDia(user.last_sign_in_at)) {
      redirect(`/api/sesion/cerrar?tenant=${encodeURIComponent(tenant)}`);
    }

    // Negocio creado desde Hotmart (2026-10-08): el checkout no pregunta el
    // nombre ni el giro, así que el dueño debe capturarlos antes de usar el
    // sistema (app/actions/datos-negocio-actions.ts). No hay redirect: se pinta
    // esta pantalla EN LUGAR de las páginas, sea cual sea la URL, y al guardar
    // el cliente entra por la dirección nueva. Solo el dueño con cuenta real la
    // ve; el personal de PIN no pasa por este bloque.
    if (dbTenant.datosPendientes) {
      return <DatosNegocioClient tenantSlug={tenant} />;
    }
  }

  // Exceso de plan VENCIDO (Paso 5): ya identificada la sesión, se pausa todo
  // el panel. El administrador (cuenta real) ve la pantalla para elegir qué
  // conservar; el personal de PIN solo un aviso. Los Server Actions se
  // bloquean aparte en lib/actor.ts.
  if (dbTenant && estadoExceso.vencido) {
    if (modo === "admin" && user) {
      const datosAjuste = await obtenerDatosAjuste(dbTenant.id, estadoExceso);
      return <AjustePlanClient tenantSlug={tenant} datos={datosAjuste} modo="bloqueo" />;
    }
    return <AjustePlanPendiente tenantSlug={tenant} />;
  }

  // Caja de un día anterior sin cerrar (2026-10-09, a petición de Carlos).
  // Una caja OPEN abierta antes de la medianoche de hoy (México) se trata así:
  // - Personal de PIN (cajero, tienda): SE BLOQUEA todo hasta hacer el corte de
  //   la caja de SU sucursal. Si su rol tiene el módulo Caja, solo ve Caja con
  //   un aviso; si no lo tiene, ve una pantalla que le pide avisar a quien sí.
  // - Administrador (cuenta real): NO se bloquea nunca. Solo ve una alerta con
  //   cada sucursal que no cerró caja y el día, para que lo atienda.
  // OJO: un layout no se vuelve a ejecutar al navegar entre páginas con el
  // menú, por eso TenantShell además recibe soloCaja (menú reducido a Caja) en
  // el caso del personal; al cerrar la caja, CajaClient hace router.refresh()
  // y esto se recalcula.
  let cajasPendientes: { branchId: string; sucursal: string; abiertaPor: string; abiertaEn: Date }[] = [];
  if (dbTenant) {
    const vencidas = await prisma.cashSession.findMany({
      where: {
        tenantId: dbTenant.id,
        status: CashSessionStatus.OPEN,
        openedAt: { lt: inicioDeHoyMXDe(Date.now()) },
        ...(modo === "staff" && sesionPersonal ? { branchId: sesionPersonal.branchId } : {}),
      },
      orderBy: { openedAt: "asc" },
      select: { branchId: true, openedAt: true, branch: { select: { name: true } }, user: { select: { name: true } } },
    });
    cajasPendientes = vencidas.map((c) => ({
      branchId: c.branchId,
      sucursal: c.branch.name,
      abiertaPor: c.user.name,
      abiertaEn: c.openedAt,
    }));

    if (modo === "staff" && cajasPendientes.length > 0) {
      const puedeCerrarCaja = modulosPermitidosParaNav?.includes("caja") ?? false;
      if (!puedeCerrarCaja) {
        return (
          <div id={TENANT_THEME_ROOT_ID} style={activePreset as React.CSSProperties} className="contents">
            <CajaPendienteBloqueo
              tenantSlug={tenant}
              modo="staff"
              sucursal={cajasPendientes[0].sucursal}
              fecha={formatoDiaMes(cajasPendientes[0].abiertaEn)}
            />
          </div>
        );
      }
      const headerList = await headers();
      const pathname = headerList.get("x-pathname") ?? "";
      if (pathname.split("/").filter(Boolean)[1] !== "caja") {
        redirect(`/${tenant}/caja`);
      }
    }
  }
  const bloqueoPorCaja = modo === "staff" && cajasPendientes.length > 0;

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

  // Modo Simple (2026-10-03) — "Aduana" (lo que el menú le muestra al dueño
  // como "Taller") deja de ser necesario en cuanto Reparaciones ya trae
  // fusionados sus mismos controles (asignar técnico/costo/estatus, ver
  // ReparacionesClient.tsx) — si el dueño llega ahí escribiendo /aduana a
  // mano (o por un link/favorito viejo), se le manda de regreso a
  // Reparaciones en vez de dejarlo en una pantalla que el propio menú ya no
  // ofrece. Solo aplica en modo "admin": Gerente (personal de PIN) sigue
  // entrando a /aduana con normalidad, con o sin Modo Simple — ver el
  // comentario largo junto a modoSimpleActivo más arriba.
  if (dbTenant && modo === "admin" && modoSimpleActivo) {
    const headerList = await headers();
    const pathname = headerList.get("x-pathname") ?? "";
    const modulo = pathname.split("/").filter(Boolean)[1];
    if (modulo === "aduana") {
      redirect(`/${tenant}/reparaciones`);
    }
  }

  // "Primeros pasos" — indicador en el encabezado, visible desde CUALQUIER
  // módulo, del avance del checklist de bienvenida (2026-09-29, a petición
  // de Carlos: "si das de alta artículos, ya no tienes como regresar a la
  // checklist de primeros pasos" — antes, en cuanto salías de /bienvenida a
  // completar un paso, no había forma de volver). Solo para "admin"
  // (dueño/gerente con cuenta real): el checklist está pensado para quien
  // arma el negocio, no para el personal de PIN que solo entra a operar un
  // módulo puntual. No se calcula si ya estás DENTRO de /bienvenida (no
  // tiene caso mostrar el mismo resumen de la pantalla en la que ya estás)
  // — se reusa el mismo header de pathname que ya leen los guards de
  // arriba. `onboardingPasos` (2026-09-30, a petición de Carlos: "marcar en
  // rojo/verde... y desplegar una lista de los que falten") trae el
  // detalle de cada paso para el desplegable de TenantShell — mismos 5
  // textos que BienvenidaClient.tsx, un solo lugar (lib/onboarding.ts) que
  // decide si cada uno ya está listo.
  let mostrarOnboarding = false;
  let onboardingCompletados = 0;
  let onboardingTotal = 0;
  let onboardingPasos: { id: string; titulo: string; done: boolean; href: string }[] = [];
  if (dbTenant && modo === "admin") {
    const headerList = await headers();
    const pathname = headerList.get("x-pathname") ?? "";
    const yaEnBienvenida = pathname === `/${tenant}/bienvenida`;
    if (!yaEnBienvenida) {
      const estado = await obtenerEstadoPasosBienvenida(dbTenant.id, dbTenant.themePreset);
      mostrarOnboarding = true;
      onboardingCompletados = estado.completados;
      onboardingTotal = estado.total;
      onboardingPasos = [
        { id: "personalizacion", titulo: "Personaliza tu negocio", done: estado.personalizado, href: `/${tenant}/configuracion` },
        { id: "catalogo", titulo: "Arma tu catálogo", done: estado.tieneCatalogo, href: `/${tenant}/catalogo` },
        { id: "equipo", titulo: "Da de alta a tu equipo", done: estado.tieneEquipo, href: `/${tenant}/personal` },
        { id: "caja", titulo: "Abre tu caja", done: estado.tieneCaja, href: `/${tenant}/caja` },
        { id: "venta", titulo: "Registra tu primera venta", done: estado.tieneVenta, href: `/${tenant}/pos` },
      ];
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
        modoSimpleActivo={modoSimpleActivo}
        logoUrl={dbTenant?.logo ?? null}
        notificacionesIniciales={notificacionesIniciales}
        notificacionesNoLeidasIniciales={notificacionesNoLeidas}
        mostrarOnboarding={mostrarOnboarding}
        onboardingCompletados={onboardingCompletados}
        onboardingTotal={onboardingTotal}
        onboardingPasos={onboardingPasos}
        avisoSuscripcion={avisoSuscripcion}
        fichaSuscripcion={fichaSuscripcion}
        checkoutUrl={enlacesSuscripcion.checkoutUrl}
        contactoHref={enlacesSuscripcion.contactoHref}
        soloCaja={bloqueoPorCaja}
      >
        {cajasPendientes.length > 0 && (
          <AvisoCajaPendiente tenantSlug={tenant} cajas={cajasPendientes} bloqueante={bloqueoPorCaja} />
        )}
        {estadoExceso.activo && estadoExceso.diasRestantes !== null && (
          <BannerExceso tenantSlug={tenant} diasRestantes={estadoExceso.diasRestantes} esAdmin={modo === "admin"} />
        )}
        {children}
      </TenantShell>
    </div>
  );
}
