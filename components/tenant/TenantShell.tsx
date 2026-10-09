"use client";

import { useState, useEffect, useRef } from "react";
import BannerSuscripcion from "@/components/tenant/BannerSuscripcion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { CLAVE_ULTIMA_ACTIVIDAD_ADMIN } from "@/lib/actividad-admin";
import type { ModuloKey } from "@/lib/roles";
import { label, DEFAULT_LABELS, type LabelDictionary } from "@/lib/labels";
import { cerrarSesionPersonalAction } from "@/app/actions/acceso-personal-actions";
import { marcarNotificacionesLeidasAction } from "@/app/actions/notificaciones-actions";
import { resolverSolicitudDispositivoAction } from "@/app/actions/dispositivos-actions";
import type { NotificacionUI } from "@/lib/notificaciones";
import {
  LayoutDashboard, ShoppingCart, Wrench, Users, Package,
  Warehouse, DollarSign, UserCog, BarChart3, FileText,
  GitBranch, BookOpen, LogOut, Bell, ChevronDown, Settings,
  Menu, X, ChevronLeft, ChevronRight, LifeBuoy, CalendarCheck, CalendarDays,
  Unlock, Lock, AlertTriangle, Smartphone, Check, ListChecks, CheckCircle2, Circle,
  HelpCircle, MessageSquareWarning,
} from "lucide-react";

// Tipo real de NotificacionUI (lib/notificaciones.ts) — se reusa aquí en
// vez de importar el enum NotificacionTipo de @prisma/client directo, para
// no depender de un import más en un componente de cliente.
type TipoNotificacion = NotificacionUI["tipo"];

// Ícono/color por tipo de aviso — Fase 1 (CAJA_ABIERTA/CERRADA, informativo)
// y Fase 2 (CAJA_NO_ABIERTA/CERRADA, incumplimiento de horario — 2026-09-22,
// a petición de Carlos). Los dos de Fase 2 van en rojo/urgente a propósito,
// para que se distingan a simple vista de un aviso meramente informativo
// (Carlos, al elegir el estilo de alerta: "mismo toast + campana, pero en
// rojo/urgente") — se usa tanto en los toasts como en la lista de la
// campanita, un solo lugar para no duplicar el mapeo.
const ESTILO_NOTIFICACION: Record<TipoNotificacion, { icon: typeof Unlock; bg: string; color: string }> = {
  CAJA_ABIERTA: { icon: Unlock, bg: "bg-emerald-50", color: "text-emerald-600" },
  CAJA_CERRADA: { icon: Lock, bg: "bg-slate-100", color: "text-slate-600" },
  CAJA_NO_ABIERTA: { icon: AlertTriangle, bg: "bg-red-50", color: "text-red-600" },
  CAJA_NO_CERRADA: { icon: AlertTriangle, bg: "bg-red-50", color: "text-red-600" },
  // Fase 3 (2026-09-23) — ver el comentario largo junto a
  // SolicitudDispositivo, schema.prisma. Azul para distinguirlo a simple
  // vista de los avisos de caja (verde/gris/rojo).
  DISPOSITIVO_PENDIENTE: { icon: Smartphone, bg: "bg-blue-50", color: "text-blue-600" },
  // "Capa 1" del sistema de alertas de taller (2026-10-01, a petición de
  // Carlos — ver el comentario largo en NotificacionTipo.ALERTA_TALLER,
  // schema.prisma). Ámbar: necesita atención, pero no es una falla del
  // negocio como CAJA_NO_ABIERTA/CAJA_NO_CERRADA (rojo) — es información
  // operativa que alguien debe atender, mismo criterio que
  // DISPOSITIVO_PENDIENTE (azul) pero con su propio color para distinguirse
  // a simple vista.
  ALERTA_TALLER: { icon: Wrench, bg: "bg-amber-50", color: "text-amber-600" },
  // 2026-10-05, a petición de Carlos ("necesito ver... por qué da el falso
  // positivo de enviado") — ver el comentario largo en
  // NotificacionTipo.WHATSAPP_FALLIDO, schema.prisma. Rosa/rojizo para
  // distinguirse a simple vista tanto de CAJA_NO_* (rojo, incumplimiento de
  // horario) como de ALERTA_TALLER (ámbar, informativo operativo) — esto es
  // una falla real de entrega hacia un cliente final.
  WHATSAPP_FALLIDO: { icon: MessageSquareWarning, bg: "bg-rose-50", color: "text-rose-600" },
};

function esAlertaUrgente(tipo: TipoNotificacion): boolean {
  return tipo === "CAJA_NO_ABIERTA" || tipo === "CAJA_NO_CERRADA" || tipo === "WHATSAPP_FALLIDO";
}

// Estructura fija (secciones, orden, ícono) — el NOMBRE de cada ítem ya no
// se escribe aquí a mano: sale del diccionario de labels (lib/labels.ts),
// resuelto por rubro/tenant en el layout del tenant y pasado como prop, así
// "Reparaciones" puede convertirse en "Órdenes de Servicio" para un taller
// automotriz sin tocar este archivo (ver labelKey de cada ítem, abajo).
//
// `href` acepta `ModuloKey | "ayuda"` (2026-10-02, manual de usuario a
// petición de Carlos) — "ayuda" NO se agregó a MODULOS/ModuloKey
// (lib/roles.ts) a propósito: ese tipo es el catálogo real de permisos que
// un dueño reparte por rol (RolesManager.tsx lo lista como checkbox) y
// "Ayuda" nunca debe aparecer ahí ni ser algo que se pueda desactivar por
// rol o por negocio — tiene que verla CUALQUIERA, siempre (ver el
// comentario largo junto al filtro de gruposVisibles más abajo, donde se
// exenta explícitamente de los 2 filtros que sí aplican al resto).
const NAV_STRUCTURE: { section: string; items: { labelKey: string; href: ModuloKey | "ayuda"; icon: typeof LayoutDashboard }[] }[] = [
  {
    section: "PRINCIPAL",
    items: [
      { labelKey: "module.dashboard.name", href: "dashboard", icon: LayoutDashboard },
      { labelKey: "module.pos.name", href: "pos", icon: ShoppingCart },
      { labelKey: "module.appointments.name", href: "citas", icon: CalendarDays },
      { labelKey: "module.repair.name", href: "reparaciones", icon: Wrench },
      // "taller" (2026-09-21) — la vista angosta de Reparaciones para el
      // técnico (ver el comentario de "taller" en lib/roles.ts). Label
      // PROPIO ("module.workshop.name", 2026-09-24 — antes compartía
      // "module.repair.name" con "reparaciones"/"aduana" asumiendo que "un
      // rol nunca tiene los dos módulos a la vez"; un rol que sí los tiene
      // ambos (ej. un puesto que recibe Y repara) mostraba dos pestañas
      // IDÉNTICAS — ver el comentario largo junto a esas dos keys en
      // lib/labels.ts).
      { labelKey: "module.workshop.name", href: "taller", icon: Wrench },
      // "aduana" (2026-09-22, corrección explícita de Carlos) — Recepción/
      // Aduana del taller central: asigna técnico, cambia estatus y ajusta
      // costo/piezas. Label propio también ("module.reception.name"),
      // mismo motivo que "taller" arriba.
      { labelKey: "module.reception.name", href: "aduana", icon: Wrench },
    ]
  },
  {
    section: "GESTIÓN",
    items: [
      { labelKey: "module.customers.name", href: "clientes", icon: Users },
      { labelKey: "module.catalog.name", href: "catalogo", icon: BookOpen },
      { labelKey: "module.inventory.name", href: "inventario", icon: Warehouse },
      { labelKey: "module.purchases.name", href: "compras", icon: Package },
    ]
  },
  {
    section: "OPERACIÓN",
    items: [
      { labelKey: "module.cash.name", href: "caja", icon: DollarSign },
      { labelKey: "module.staff.name", href: "personal", icon: UserCog },
      // Exclusivo del administrador (ningún rol de PIN lo ofrece como
      // casilla en "Roles y permisos" — ver RolesManager.tsx) — igual que
      // "Personal" ya lo era en la práctica, aquí queda explícito: staff
      // nunca ve este link porque modo==="staff" filtra navItems contra el
      // prop modulosPermitidos (ya resuelto en el servidor).
      { labelKey: "module.attendance.name", href: "asistencia", icon: CalendarCheck },
      { labelKey: "module.branches.name", href: "sucursales", icon: GitBranch },
    ]
  },
  {
    section: "REPORTES",
    items: [
      { labelKey: "module.reports.name", href: "reportes", icon: BarChart3 },
      { labelKey: "module.invoicing.name", href: "facturacion", icon: FileText },
    ]
  },
  {
    section: "AYUDA",
    items: [
      // "Ayuda" antes que "Soporte" a propósito — el manual (autoservicio)
      // es el primer paso; el centro de tickets es para cuando eso no
      // resolvió el problema.
      { labelKey: "module.help.name", href: "ayuda", icon: HelpCircle },
      { labelKey: "module.support.name", href: "soporte", icon: LifeBuoy },
    ]
  }
];

// 20 min elegidos por Carlos — ver el comentario largo junto al useEffect
// que la usa, más abajo.
const DURACION_INACTIVIDAD_ADMIN_MS = 20 * 60 * 1000;

export default function TenantShell({
  children,
  tenant,
  tenantId = null,
  userName = "Usuario",
  userRole = "",
  modo = "admin",
  modulosPermitidos = null,
  labels = DEFAULT_LABELS,
  modulosInactivos = [],
  modoSimpleActivo = false,
  logoUrl = null,
  notificacionesIniciales = [],
  notificacionesNoLeidasIniciales = 0,
  mostrarOnboarding = false,
  onboardingCompletados = 0,
  onboardingTotal = 0,
  onboardingPasos = [],
  avisoSuscripcion = null,
  checkoutUrl = null,
  contactoHref = null,
  soloCaja = false,
  fichaSuscripcion = null,
}: {
  children: React.ReactNode;
  tenant: string;
  // 2026-09-22, panel de notificaciones en tiempo real (a petición de
  // Carlos) — id real del tenant (no el slug) para armar el nombre del
  // canal de Supabase Realtime, ver el useEffect de suscripción más abajo.
  // null solo en el caso raro de un slug que no resolvió a ningún tenant
  // (ver TenantLayout) — ahí simplemente no se suscribe a nada.
  tenantId?: string | null;
  userName?: string;
  userRole?: string;
  // "admin" = cuenta real (Supabase Auth, dueño/gerente) — ve todo el menú,
  // sin cambios respecto al comportamiento de siempre. "staff" = sesión de
  // PIN de personal (M11) — el menú se filtra a los módulos que su rol
  // tiene permitido (lib/roles.ts) y "Cerrar sesión" cierra esa sesión de
  // PIN en vez de la de Supabase Auth (que ni siquiera tiene).
  modo?: "admin" | "staff";
  // Módulos que la sesión de PIN actual tiene permitido (ya resuelto en el
  // servidor por lib/roles-server.ts a partir del Role personalizable del
  // empleado — ver el comentario largo ahí). null en modo "admin" (sin
  // restricción, ve todo el menú); en modo "staff" siempre viene como
  // arreglo (puede estar vacío, aunque roles-server.ts ya garantiza que al
  // menos incluya "dashboard").
  modulosPermitidos?: ModuloKey[] | null;
  // Diccionario ya resuelto (rubro + overrides del tenant) para los
  // nombres de módulo del menú — lib/labels.ts. Default genérico por si
  // algún caller viejo no lo pasa todavía.
  labels?: LabelDictionary;
  // Códigos de módulo (mismas claves que ModuloKey) que este negocio tiene
  // desactivados — personalización por rubro (2026-09-17). "Ausente de
  // esta lista" = activo, tanto para el módulo recién agregado a la BD
  // como para uno que un negocio nunca desactivó, así que ningún tenant ya
  // en producción antes de este cambio pierde un link de golpe.
  modulosInactivos?: string[];
  // Modo Simple (2026-10-03, ver el comentario largo junto a
  // activarModoSimpleAction, app/actions/modulos-tenant-actions.ts) — ya
  // calculado en el servidor (layout.tsx). Solo tiene efecto en modo
  // "admin": oculta "Aduana" (labelKey "module.reception.name", la entrada
  // de menú que el dueño ve como "Taller") del menú, ahora que Reparaciones
  // ya trae fusionados esos mismos controles — ver OCULTOS_PARA_ADMIN más
  // abajo y ReparacionesClient.tsx. Nunca afecta el menú de personal de PIN
  // (Gerente sigue viendo "Aduana" con su panel de métricas completo,
  // tenga o no el dueño Modo Simple activado).
  modoSimpleActivo?: boolean;
  // Logo propio del negocio (2026-09-17) — el de Linkity en el sidebar de
  // arriba NUNCA se reemplaza (esa es la marca de la plataforma, igual para
  // todos los tenants); este es un logo aparte, distinto por negocio, que
  // se muestra en el área del encabezado superior que antes quedaba vacía
  // en pantallas grandes (a la izquierda, junto a la campana/usuario) —
  // null mientras el negocio no haya subido uno (app/actions/logo-actions.ts).
  logoUrl?: string | null;
  // Estado inicial de la campanita (lo que ya pasó antes de que este panel
  // se abriera) — ver el comentario largo junto a estos mismos parámetros
  // en TenantLayout.
  notificacionesIniciales?: NotificacionUI[];
  notificacionesNoLeidasIniciales?: number;
  // Indicador "Primeros pasos" (2026-09-29/30, a petición de Carlos) —
  // mostrarOnboarding es true cuando el negocio está en modo "admin"
  // (TenantLayout nunca lo calcula para "staff") y no está ya dentro de
  // /bienvenida. Se calcula en el servidor (TenantLayout, vía
  // lib/onboarding.ts) para no tener que volver a traer aquí los mismos
  // conteos con otra consulta. onboardingPasos trae el detalle de cada uno
  // de los 5 pasos (mismos textos que BienvenidaClient.tsx) para el
  // desplegable de abajo — 2026-09-30: "marcar en rojo cuando están
  // incompletos y en verde cuando esté listo... y desplegar una lista de
  // los que falten".
  mostrarOnboarding?: boolean;
  onboardingCompletados?: number;
  onboardingTotal?: number;
  onboardingPasos?: { id: string; titulo: string; done: boolean; href: string }[];
  // Aviso de días restantes de prueba gratis / gracia (2026-10-06, a
  // petición de Carlos) — ya calculado en el servidor (TenantLayout). null =
  // cuenta al corriente, no se muestra nada. Ver BannerSuscripcion.tsx.
  avisoSuscripcion?: { etapa: "en_prueba" | "en_gracia"; diasRestantes: number } | null;
  checkoutUrl?: string | null;
  contactoHref?: string | null;
  // Ficha "Suscripción actual" del pie del menú (solo administrador de cuenta de
  // paga; null en prueba gratis). Ya calculada en el servidor (TenantLayout).
  fichaSuscripcion?: { plan: string; estatus: "activa" | "por_vencer" | "en_gracia"; vigencia: string | null } | null;
  // 2026-10-09: hay una caja de un día anterior sin cerrar — el menú muestra
  // solo "Caja" hasta que se haga el corte (el layout del servidor también
  // redirige a /caja si alguien escribe otra URL a mano).
  soloCaja?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  // Menú de usuario y notificaciones del encabezado. La campana (2026-09-21,
  // a petición de Carlos: "tanto el nombre del usuario como las opciones
  // solo estan simuladas... y al hacer click no hace nada") empezó siendo
  // deliberadamente honesta: decía "no hay nada nuevo" en vez de simular un
  // punto rojo sin nada real detrás, porque no existía ningún generador de
  // notificaciones todavía. 2026-09-22: ya existe (lib/notificaciones.ts,
  // Fase 1 — apertura/cierre de caja), así que ahora sí es real: estado
  // inicial por props (lo que ya pasó antes de abrir el panel) + suscripción
  // en vivo a Supabase Realtime Broadcast para lo que pase MIENTRAS el panel
  // está abierto (ver el useEffect de abajo).
  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);
  const [menuNotifAbierto, setMenuNotifAbierto] = useState(false);
  // Desplegable del indicador "Primeros pasos" (2026-09-30) — mismo patrón
  // que la campanita de arriba (ref + cierre al hacer clic afuera).
  const [menuOnboardingAbierto, setMenuOnboardingAbierto] = useState(false);
  const menuUsuarioRef = useRef<HTMLDivElement>(null);
  const menuNotifRef = useRef<HTMLDivElement>(null);
  const menuOnboardingRef = useRef<HTMLDivElement>(null);

  // DISPOSITIVO_PENDIENTE solo debe verse y resolverse desde la cuenta de
  // administrador (resolverSolicitudDispositivoAction exige el módulo
  // "configuracion", que ningún rol de PIN tiene nunca — ver
  // MODULOS_BASE_EXCLUIDOS, lib/roles.ts). Antes este tipo llegaba igual a
  // cualquier sesión (admin o staff) con botones Aprobar/Rechazar que para
  // personal de PIN siempre fallaban con "Tu rol no tiene acceso a este
  // módulo" — un callejón sin salida. Se filtra aquí, en la fuente, para
  // que el personal ni siquiera vea el aviso (no solo los botones).
  const notificacionVisibleParaSesion = (tipo: TipoNotificacion) =>
    modo === "admin" || tipo !== "DISPOSITIVO_PENDIENTE";

  const [notificaciones, setNotificaciones] = useState<NotificacionUI[]>(() =>
    notificacionesIniciales.filter((n) => notificacionVisibleParaSesion(n.tipo))
  );
  // Para "staff" el contador de no leídas se recalcula sobre la lista ya
  // filtrada (en vez de usar notificacionesNoLeidasIniciales a secas, que
  // cuenta TODAS las no leídas del tenant sin distinguir tipo) — así el
  // número de la campana nunca incluye avisos que el personal ni siquiera
  // puede ver.
  const [notifNoLeidas, setNotifNoLeidas] = useState(() =>
    modo === "admin"
      ? notificacionesNoLeidasIniciales
      : notificacionesIniciales.filter((n) => notificacionVisibleParaSesion(n.tipo) && !n.leida).length
  );
  // Pop-ups efímeros (2026-09-22, a petición explícita de Carlos: "que
  // aparezca una alerta o pop up en la pantalla") — independientes de la
  // campanita: se ven aunque no la tengas abierta, y se autodesaparecen
  // solos. La campanita es la copia persistente; esto es solo el "aviso
  // ahora mismo".
  const [toasts, setToasts] = useState<
    { id: string; mensaje: string; tipo: TipoNotificacion; solicitudDispositivoId: string | null; url: string | null }[]
  >([]);
  // Ids de SolicitudDispositivo ya resueltas DESDE ESTA pestaña (2026-09-23)
  // — para ocultar los botones Aprobar/Rechazar apenas se usan, sin esperar
  // a que la campanita se vuelva a abrir. Solo es un ajuste visual local: la
  // fuente de verdad real es el status en la base de datos, que
  // resolverSolicitudDispositivoAction ya valida (rechaza si alguien más ya
  // la resolvió desde otra pestaña/dispositivo).
  const [solicitudesResueltas, setSolicitudesResueltas] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handleClickFuera = (e: MouseEvent) => {
      if (menuUsuarioRef.current && !menuUsuarioRef.current.contains(e.target as Node)) setMenuUsuarioAbierto(false);
      if (menuNotifRef.current && !menuNotifRef.current.contains(e.target as Node)) setMenuNotifAbierto(false);
      if (menuOnboardingRef.current && !menuOnboardingRef.current.contains(e.target as Node)) setMenuOnboardingAbierto(false);
    };
    document.addEventListener("mousedown", handleClickFuera);
    return () => document.removeEventListener("mousedown", handleClickFuera);
  }, []);

  // Suscripción en vivo (2026-09-22): un canal PÚBLICO por tenant (ver el
  // comentario largo de seguridad en lib/notificaciones.ts, crearNotificacionCaja)
  // — cualquier pestaña con este panel abierto, de cualquier persona logueada
  // en este negocio, recibe el aviso apenas se manda, sin recargar ni
  // preguntar al servidor. Si no hay tenantId (caso raro, ver arriba) no se
  // suscribe a nada.
  useEffect(() => {
    if (!tenantId) return;

    const supabase = createClient();
    const canal = supabase.channel(`notificaciones:${tenantId}`);

    const recibir = (tipo: TipoNotificacion) => (msg: {
      payload: { id: string; mensaje: string; branchName: string | null; fecha: string; solicitudDispositivoId?: string; url?: string };
    }) => {
      // Ver el comentario junto a notificacionVisibleParaSesion, arriba —
      // el personal de PIN nunca debe recibir este tipo, ni como toast ni
      // en la campana, así que se descarta antes de tocar ningún estado.
      if (!notificacionVisibleParaSesion(tipo)) return;

      const { id, mensaje, branchName, fecha, solicitudDispositivoId, url } = msg.payload;
      setNotificaciones((prev) =>
        // solicitudResuelta: false — esta notificación recién se creó en el
        // servidor como PENDIENTE (ver crearNotificacionDispositivo), así
        // que nunca llega aquí ya resuelta.
        [{ id, tipo, mensaje, branchName, leida: false, fecha, solicitudDispositivoId: solicitudDispositivoId ?? null, solicitudResuelta: false, url: url ?? null }, ...prev].slice(0, 30)
      );
      setNotifNoLeidas((n) => n + 1);

      // Los avisos de incumplimiento (Fase 2, "no reportó a tiempo") y de
      // dispositivo pendiente (Fase 3) se quedan más tiempo en pantalla que
      // los informativos de Fase 1 — son más importantes de no perderse de
      // vista (el de dispositivo, además, trae una acción con vencimiento).
      const toastId = `${id}-${Date.now()}`;
      setToasts((prev) => [...prev, { id: toastId, mensaje, tipo, solicitudDispositivoId: solicitudDispositivoId ?? null, url: url ?? null }]);
      const duracion = esAlertaUrgente(tipo) || tipo === "DISPOSITIVO_PENDIENTE" ? 15000 : 7000;
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), duracion);
    };

    canal
      .on("broadcast", { event: "caja_abierta" }, recibir("CAJA_ABIERTA"))
      .on("broadcast", { event: "caja_cerrada" }, recibir("CAJA_CERRADA"))
      // Fase 2 (2026-09-22) — ver app/api/cron/revisar-horarios-caja.
      .on("broadcast", { event: "caja_no_abierta" }, recibir("CAJA_NO_ABIERTA"))
      .on("broadcast", { event: "caja_no_cerrada" }, recibir("CAJA_NO_CERRADA"))
      // Fase 3 (2026-09-23) — ver dispositivos-actions.ts.
      .on("broadcast", { event: "dispositivo_pendiente" }, recibir("DISPOSITIVO_PENDIENTE"))
      // "Capa 1" de alertas de taller (2026-10-01) — ver lib/notificaciones.ts.
      .on("broadcast", { event: "alerta_taller" }, recibir("ALERTA_TALLER"))
      // Falla real de entrega de WhatsApp (2026-10-05) — ver
      // crearNotificacionWhatsappFallido, lib/notificaciones.ts.
      .on("broadcast", { event: "whatsapp_fallido" }, recibir("WHATSAPP_FALLIDO"))
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [tenantId]);

  // Abrir la campanita cuenta como "ya las vi" (mismo criterio que Gmail o
  // Slack) — no hace falta marcar una por una para esta primera versión.
  const handleToggleNotif = () => {
    setMenuNotifAbierto((abierto) => {
      const siguiente = !abierto;
      if (siguiente && notifNoLeidas > 0) {
        // Estado optimista: se guarda lo que había ANTES de marcar como
        // leídas, para poder revertirlo si el servidor no lo logró — antes
        // el .catch(() => {}) se quedaba vacío, así que si esta acción
        // fallaba el badge se quedaba en 0 (leídas) aunque en la base de
        // datos siguieran sin leer, sin que nadie se enterara del
        // desfase. Mismo criterio que resolverDispositivo: nunca asumir
        // éxito del servidor sin confirmación real.
        const notificacionesPrevias = notificaciones;
        const notifNoLeidasPrevias = notifNoLeidas;
        setNotifNoLeidas(0);
        setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })));
        marcarNotificacionesLeidasAction(tenant).catch(() => {
          setNotificaciones(notificacionesPrevias);
          setNotifNoLeidas(notifNoLeidasPrevias);
        });
      }
      return siguiente;
    });
  };

  // Aprobar/Rechazar un dispositivo pendiente — usable tanto desde el
  // pop-up como desde la lista de la campanita (2026-09-23). El "ok:false,
  // error: ya fue resuelta" no se muestra al usuario: significa que otro
  // administrador (u otra pestaña, u otro día) ya la resolvió, así que
  // basta con ocultar los botones aquí también, sin alarmar con un error.
  const resolverDispositivo = async (solicitudId: string, aprobar: boolean) => {
    // Defensa en profundidad: con el filtro de notificacionVisibleParaSesion
    // de arriba, personal de PIN ya nunca debería poder llegar a llamar
    // esto (el botón ni se renderiza), pero se deja este guard explícito
    // para que esta función nunca dependa únicamente de que el filtro de
    // arriba se aplicó correctamente en todos los casos.
    if (modo !== "admin") return;

    // 2026-09-23, corrección: antes esto marcaba la solicitud como
    // "resuelta" en pantalla (ocultando los botones Aprobar/Rechazar) SIN
    // esperar a saber si resolverSolicitudDispositivoAction de verdad
    // funcionó — si fallaba por cualquier motivo, el administrador veía
    // "Aprobar" desaparecer como si ya hubiera pasado, pero la solicitud
    // seguía PENDIENTE del lado del empleado, que nunca entraba solo (el
    // síntoma que reportó Carlos). Ahora solo se marca como resuelta cuando
    // el servidor de verdad confirma ok:true; si falla, se avisa el motivo
    // y los botones se quedan para poder reintentar.
    //
    // 2026-10-03, corrección de un bug real (reportado por Carlos: "le doy
    // aprobar y me dice que ya fue aprobada, pero sigue apareciendo como
    // alerta"): el comentario de arriba YA decía que "ya fue resuelta" no
    // debía mostrarse como error, pero el código de este `else` lo hacía de
    // todos modos con cualquier mensaje, SolicitudResuelta incluido — nunca
    // ocultaba los botones en ese caso. Ahora ese mensaje puntual se trata
    // igual que un ok:true (oculta los botones, sin alarmar); el resto de
    // errores reales (de conexión, de permisos) sigue avisando con el
    // alert de siempre. El campo `solicitudResuelta` nuevo en
    // NotificacionUI (lib/notificaciones.ts) ataca la otra mitad del mismo
    // bug: que un aviso viejo ya resuelto reapareciera con los botones
    // visibles desde una recarga de página, antes de siquiera dar clic.
    const YA_RESUELTA = "Esta solicitud ya fue resuelta";
    const res = await resolverSolicitudDispositivoAction({ tenantSlug: tenant, solicitudId, aprobar }).catch(
      (): { ok: false; error: string } => ({ ok: false, error: "No se pudo conectar con el servidor — inténtalo de nuevo." })
    );
    if (res.ok || (!res.ok && res.error === YA_RESUELTA)) {
      setSolicitudesResueltas((prev) => new Set(prev).add(solicitudId));
    } else {
      window.alert(res.error);
    }
  };

  const businessName = decodeURIComponent(tenant)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

  const initials = userName
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Cierre de sesión automático por inactividad — SOLO para "admin" (cuenta
  // real de Supabase Auth del dueño/gerente), 2026-09-23 a petición de
  // Carlos: "En mi navegador se queda muy accesible entrar como
  // administrador, ya que permite guardar contraseña. Debemos proteger a
  // nuestro cliente de empleados deshonestos" — eligió específicamente
  // "cierre por inactividad, con margen de 20 min" entre las opciones que se
  // le presentaron. El personal con PIN (modo "staff") NO se ve afectado a
  // propósito: su sesión ya expira sola a las 12h (DURACION_SESION_MS,
  // lib/staff-auth.ts) y un PIN de 6 dígitos nunca queda "recordado" por el
  // navegador de la misma forma que una contraseña real — el riesgo que esto
  // resuelve es específico de la cuenta con autofill, no del PIN.
  //
  // 2026-10-05, corregido a petición explícita de Carlos ("sello de
  // seguridad, no debe tener huecos ni bugs" — encontró una sesión de
  // administrador seguir abierta el lunes, habiéndola dejado el sábado): la
  // primera versión dependía de que un setTimeout de React sonara EXACTO
  // tras 20 minutos sin interrupción. Eso falla en la práctica: el
  // navegador/sistema operativo puede suspender o "descargar" una pestaña en
  // segundo plano (o la laptop dormirse) sin que eso cuente como cerrarla;
  // cuando pasa, el useEffect se desmonta y el temporizador se cancela —
  // al volver a activarse la pestaña, el efecto se vuelve a montar y el
  // conteo arranca otra vez desde cero, sin memoria de cuánto tiempo real
  // pasó. Mientras tanto la sesión de Supabase (el cookie) no expira sola
  // por inactividad — se renueva sola indefinidamente — así que nada del
  // lado del servidor forzaba el cierre.
  //
  // La corrección: en vez de confiar en que un temporizador suene exacto, se
  // guarda la hora real (reloj de pared, Date.now()) de la última actividad
  // en localStorage — sobrevive recargas y se comparte entre pestañas del
  // mismo navegador (así una pestaña inactiva no cierra la sesión mientras
  // el dueño sigue trabajando activamente en otra). Esa marca se compara
  // contra el reloj actual al montar, cada vez que la pestaña recupera
  // visibilidad/foco, y además cada 30s mientras sigue visible — si ya
  // pasaron 20 minutos o más DE VERDAD, se cierra la sesión de inmediato,
  // sin importar si algún temporizador "sobrevivió" o no. Esto es justo lo
  // que detecta el caso de Carlos: una pestaña que estuvo dormida/descargada
  // todo el fin de semana, al volver a activarse, lee que la última
  // actividad real fue hace días y cierra la sesión en el acto, en vez de
  // regalarle otros 20 minutos de gracia solo por haberse vuelto a montar.
  // Si localStorage no está disponible (algunos navegadores lo bloquean en
  // modo privado), se degrada a un respaldo en memoria — nunca peor que el
  // comportamiento original, nunca deja de haber ALGÚN cierre por
  // inactividad.
  useEffect(() => {
    if (modo !== "admin") return;

    const CLAVE_ULTIMA_ACTIVIDAD = CLAVE_ULTIMA_ACTIVIDAD_ADMIN;
    let ultimaActividadMemoria = Date.now();
    let sesionCerrada = false;

    const leerUltimaActividad = (): number => {
      try {
        const guardado = window.localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD);
        if (guardado) {
          const valor = parseInt(guardado, 10);
          if (Number.isFinite(valor)) return valor;
        }
      } catch {
        // localStorage no disponible (p.ej. modo privado) — se usa el
        // respaldo en memoria de abajo.
      }
      return ultimaActividadMemoria;
    };

    const escribirUltimaActividad = (ahora: number) => {
      ultimaActividadMemoria = ahora;
      try {
        window.localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, String(ahora));
      } catch {
        // Sin localStorage, el respaldo en memoria de arriba ya quedó al
        // día — degradado, pero sigue funcionando mientras la pestaña viva.
      }
    };

    const cerrarPorInactividad = async () => {
      if (sesionCerrada) return;
      sesionCerrada = true;
      const supabase = createClient();
      await supabase.auth.signOut();
      // alert() bloquea hasta que alguien lo cierre — si nadie está ahí (el
      // caso normal, es POR ESO que se cerró la sesión), simplemente se
      // queda esperando en la puerta del negocio sin sesión activa, que es
      // el objetivo; si el dueño vuelve, entiende de inmediato por qué ya
      // no está su sesión en vez de verlo como un error random.
      window.alert("Tu sesión se cerró automáticamente por 20 minutos de inactividad.");
      window.location.href = `/${tenant}`;
    };

    // Compara la ÚLTIMA ACTIVIDAD REAL contra el reloj actual — nunca asume
    // que pasó el tiempo correcto solo porque un temporizador sonó o porque
    // el componente se acaba de montar.
    const verificarInactividad = () => {
      if (sesionCerrada) return;
      const transcurrido = Date.now() - leerUltimaActividad();
      if (transcurrido >= DURACION_INACTIVIDAD_ADMIN_MS) {
        cerrarPorInactividad();
      }
    };

    let ultimoRegistro = 0;
    const registrarActividad = () => {
      if (sesionCerrada) return;
      const ahora = Date.now();
      // Throttle a 5s: mousemove/scroll pueden dispararse decenas de veces
      // por segundo — escribir en localStorage en cada uno sería puro
      // desperdicio frente a una ventana de 20 minutos, donde 5s de margen
      // no se nota.
      if (ahora - ultimoRegistro < 5000) return;
      ultimoRegistro = ahora;
      escribirUltimaActividad(ahora);
    };

    // Si no hay ninguna marca guardada todavía (primera vez que se monta
    // esta pestaña/sesión), se establece "ahora" como punto de partida — a
    // propósito NUNCA se pisa una marca YA EXISTENTE solo por montarse de
    // nuevo (eso sería regalar 20 minutos gratis cada vez que la pestaña se
    // recarga, sin que haya actividad real de por medio).
    try {
      if (window.localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD) == null) {
        escribirUltimaActividad(Date.now());
      }
    } catch {
      // Sin localStorage, ultimaActividadMemoria ya arrancó en "ahora".
    }

    // Verificación inmediata al montar — si la pestaña se estaba
    // recuperando de una suspensión larga (o se reabrió después de días),
    // esto detecta la inactividad real de inmediato.
    verificarInactividad();

    const eventos: (keyof DocumentEventMap)[] = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "wheel"];
    eventos.forEach((ev) => document.addEventListener(ev, registrarActividad, { passive: true }));

    const alVisible = () => {
      if (document.visibilityState === "visible") verificarInactividad();
    };
    document.addEventListener("visibilitychange", alVisible);
    window.addEventListener("focus", verificarInactividad);

    // Ping periódico mientras la pestaña sigue montada — no depende de que
    // el usuario cambie de pestaña o le dé foco para detectar la
    // inactividad: una pestaña que se queda sola, visible pero sin tocar
    // nada, también se cierra sola.
    const intervalo = setInterval(verificarInactividad, 30 * 1000);

    return () => {
      eventos.forEach((ev) => document.removeEventListener(ev, registrarActividad));
      document.removeEventListener("visibilitychange", alVisible);
      window.removeEventListener("focus", verificarInactividad);
      clearInterval(intervalo);
    };
  }, [modo, tenant]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setMobileOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Comparación exacta del segmento de ruta (antes era pathname.includes(href),
  // que disparaba por coincidencia de subcadena — ej. un tenant cuyo slug
  // contuviera "pos" o "caja" como parte del nombre marcaría ese ítem como
  // activo en cualquier pantalla). Se compara contra la MISMA ruta que arma
  // cada <Link href={`/${tenant}/${item.href}`}> de abajo, exacta o como
  // prefijo de carpeta (`/tenant/pos/algo-mas` sigue siendo "pos" activo).
  const isActive = (href: string) => {
    const ruta = `/${tenant}/${href}`;
    return pathname === ruta || pathname.startsWith(`${ruta}/`);
  };

  const modulosInactivosSet = new Set(modulosInactivos);

  // "taller" (2026-09-21) es la vista angosta de Reparaciones pensada para
  // un rol de PIN específico (el técnico solo ve lo suyo, sin poder editar
  // nada) — nunca hace falta para el dueño/gerente, que ya tiene todo eso y
  // más en "Reparaciones" completo. Se sigue ocultando en modo "admin" (que
  // no filtra por permisos, ve TODO lo que esté activo): no aporta nada a
  // quien ya tiene acceso total, solo sería una pestaña de solo-lectura de
  // más.
  //
  // "aduana" SÍ se le mostraba a admin hasta 2026-09-25 bajo el mismo
  // razonamiento ("ya tiene todo eso en Reparaciones") — pero ese supuesto
  // quedó desactualizado el 2026-09-22, cuando asignar técnico/cambiar
  // estatus/ajustar costo se sacaron de "reparaciones" y se volvieron
  // EXCLUSIVOS de "aduana" (ver el comentario largo de "aduana" en
  // lib/roles.ts). Desde entonces "Reparaciones" ya NO trae esos controles
  // para nadie, admin incluido — ocultar "Aduana" del menú dejaba al
  // dueño/administrador con el permiso de servidor (resolverActor ya lo
  // deja sin restricción) pero SIN ninguna forma de llegar ahí desde la UI,
  // salvo escribiendo /aduana a mano en la URL. Carlos lo reportó
  // explícitamente ("un administrador no puede cambiar el estatus de los
  // equipos... también debería poder hacerlo por default") — corregido
  // quitando "aduana" de este set.
  // "aduana" se suma a este set SOLO con Modo Simple activo (2026-10-03) —
  // ver el comentario largo junto a la prop modoSimpleActivo arriba. Sin
  // Modo Simple, el razonamiento de 2026-09-25 sigue intacto: "Aduana" es
  // la única forma de asignar técnico/cambiar estatus/ajustar costo, así
  // que se le sigue mostrando siempre a admin.
  const OCULTOS_PARA_ADMIN = new Set(modoSimpleActivo ? ["taller", "aduana"] : ["taller"]);

  // Primero se resuelve el nombre visible de cada ítem contra el
  // diccionario de labels (rubro + overrides del tenant), luego se filtra
  // por tres criterios independientes: (1) el módulo está desactivado para
  // ESTE negocio (personalización por rubro, aplica igual a admin y
  // staff), (2) en modo "staff", el rol de ese empleado no tiene permitido
  // ese módulo (lib/roles.ts) — se descarta el grupo completo si queda
  // vacío (ej. Cajero no ve nada de "GESTIÓN" — ese encabezado tampoco debe
  // aparecer) — y (3) en modo "admin", la vista de solo lectura del técnico
  // ("taller", ver OCULTOS_PARA_ADMIN arriba) no aparece de más; "Aduana" en
  // cambio sí se muestra siempre a admin (2026-09-25) porque es la única
  // forma de asignar técnico/cambiar estatus/ajustar costo, incluso para él.
  //
  // "ayuda" (2026-10-02) se exenta explícitamente de los filtros (1) y (2)
  // — nunca se apaga por negocio ni se recorta por rol, cualquier sesión la
  // ve siempre (ver el comentario largo junto a NAV_STRUCTURE arriba). El
  // `as ModuloKey` en el filtro (2) es seguro: ese `.includes` nunca llega a
  // evaluarse para "ayuda" gracias al `||` que lo antecede — el cast es
  // solo para que TypeScript acepte la expresión en la rama que sí aplica a
  // un ModuloKey real.
  const gruposVisibles = NAV_STRUCTURE
    .map((grupo) => ({
      section: grupo.section,
      items: grupo.items
        .filter((item) => item.href === "ayuda" || !modulosInactivosSet.has(item.href))
        .filter((item) => item.href === "ayuda" || modo !== "staff" || (modulosPermitidos?.includes(item.href as ModuloKey) ?? false))
        .filter((item) => modo !== "admin" || !OCULTOS_PARA_ADMIN.has(item.href))
        .filter((item) => !soloCaja || item.href === "caja")
        .map((item) => ({ ...item, label: label(labels, item.labelKey) })),
    }))
    .filter((grupo) => grupo.items.length > 0);

  const handleSignOut = async () => {
    if (modo === "staff") {
      // 2026-09-29, corregido a petición de Carlos (ver el comentario largo
      // en cerrarSesionPersonalAction): antes, si la sucursal tenía una
      // caja abierta, esta acción rechazaba el cierre y se mandaba al
      // empleado a /caja para que hiciera el corte — pero un empleado sin
      // permiso sobre Caja (ej. Asesor de Ventas) se quedaba sin ninguna
      // salida real, atascado. Ahora cerrarSesionPersonalAction YA NO
      // rechaza nada por esto — solo informa (cajaAbiertaEnSucursal) para
      // mostrar un recordatorio no bloqueante antes de continuar, así
      // cualquiera puede cambiar de usuario y que sea la siguiente persona
      // (con permiso sobre Caja) quien la cierre.
      const res = await cerrarSesionPersonalAction();
      if (!res.ok) {
        window.alert(res.error);
        return;
      }
      if (res.cajaAbiertaEnSucursal) {
        window.alert("Recuerda: la caja de esta sucursal sigue abierta. La próxima persona que entre con permiso sobre Caja debe hacer el corte.");
      }
      window.location.href = `/${tenant}`;
      return;
    }
    // 2026-09-23, a petición de Carlos ("debe existir una forma sencilla de
    // hacer logout y cambiar de usuarios"): tanto administrador como
    // empleado regresan a la MISMA puerta única del negocio
    // (app/(auth)/[tenant]/page.tsx) al cerrar sesión — desde ahí es un
    // toque entrar como alguien más (la otra ficha, o el siguiente PIN),
    // en vez de mandar al administrador a un /login genérico que ni
    // siquiera menciona el negocio.
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = `/${tenant}`;
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* Pop-ups de notificación (2026-09-22) — fixed, por encima de todo,
          independiente del layout de sidebar/contenido de abajo. */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 w-72 max-w-[calc(100vw-2rem)]">
          {toasts.map((t) => {
            const estilo = ESTILO_NOTIFICACION[t.tipo];
            const Icono = estilo.icon;
            // modo === "admin": defensa en profundidad — este tipo ya se
            // filtra en la fuente (notificacionVisibleParaSesion) y nunca
            // debería llegar aquí en modo "staff", pero la condición se
            // deja explícita para que el botón nunca pueda mostrarse sin
            // depender únicamente de ese filtro previo.
            const necesitaAccion =
              modo === "admin" &&
              t.tipo === "DISPOSITIVO_PENDIENTE" && t.solicitudDispositivoId && !solicitudesResueltas.has(t.solicitudDispositivoId);
            return (
              <div
                key={t.id}
                className={`bg-card border rounded-xl shadow-lg px-3 py-2.5 flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 ${
                  esAlertaUrgente(t.tipo) ? "border-red-200" : "border-border"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${estilo.bg} ${estilo.color}`}>
                    <Icono className="w-3.5 h-3.5" />
                  </div>
                  {/* Clicable solo si el aviso trae `url` (ver el comentario
                      largo en Notificacion.url, schema.prisma) — hoy
                      únicamente ALERTA_TALLER, lleva directo al folio en
                      Aduana en vez de que alguien tenga que buscarlo a mano. */}
                  {t.url ? (
                    <Link href={t.url} className="text-[12.5px] text-foreground leading-snug hover:underline">
                      {t.mensaje}
                    </Link>
                  ) : (
                    <p className="text-[12.5px] text-foreground leading-snug">{t.mensaje}</p>
                  )}
                  <button
                    onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                    className="ml-auto text-muted-foreground hover:text-foreground flex-shrink-0"
                    title="Cerrar aviso"
                    aria-label="Cerrar aviso"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {necesitaAccion && (
                  <div className="flex items-center gap-2 pl-8">
                    <button
                      onClick={() => resolverDispositivo(t.solicitudDispositivoId!, true)}
                      className="flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground text-[11.5px] font-medium px-2.5 py-1 rounded-lg transition-colors"
                    >
                      <Check className="w-3 h-3" /> Aprobar
                    </button>
                    <button
                      onClick={() => resolverDispositivo(t.solicitudDispositivoId!, false)}
                      className="text-[11.5px] font-medium text-muted-foreground hover:text-red-600 transition-colors px-2.5 py-1"
                    >
                      Rechazar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-50 lg:z-auto
        flex flex-col bg-sidebar border-r border-sidebar-border
        transition-all duration-300 ease-in-out flex-shrink-0
        ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        ${collapsed ? "lg:w-16" : "w-64 lg:w-56"}
      `}>

        <div className={`border-b border-sidebar-border ${collapsed ? "p-3" : "px-4 py-4"}`}>
          {collapsed ? (
            <div className="flex justify-center">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                <Image src="/images/logo-icon.png" alt="Logo" width={22} height={22} className="object-contain" />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 border border-primary/20">
                  <Image src="/images/logo-icon.png" alt="Logo" width={28} height={28} className="object-contain" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-sidebar-foreground leading-tight truncate">{businessName}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <p className="text-xs text-sidebar-foreground/60">Sistema activo</p>
                  </div>
                </div>
                <button
                  className="lg:hidden p-1 rounded-md hover:bg-sidebar-accent"
                  onClick={() => setMobileOpen(false)}
                  title="Cerrar menú"
                  aria-label="Cerrar menú"
                >
                  <X className="w-4 h-4 text-sidebar-foreground/60" />
                </button>
              </div>
              <div className="mt-2 pt-2 border-t border-sidebar-border flex items-center justify-between">
                <p className="text-[11.5px] text-sidebar-foreground/50">by Linkity Soluciones</p>
                <Image src="/images/favicon.svg" alt="Linkity" width={12} height={12} className="opacity-40" />
              </div>
            </>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-1.5">
          {gruposVisibles.map((group) => (
            <div key={group.section} className="mb-2">
              {collapsed
                ? <div className="my-2 border-t border-sidebar-border" />
                : <p className="px-2 pt-2 pb-1 text-[11.5px] font-semibold tracking-widest text-sidebar-foreground/50">{group.section}</p>
              }
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={`/${tenant}/${item.href}`}
                    title={collapsed ? item.label : undefined}
                    className={`
                      flex items-center gap-2.5 px-2 py-2.5 rounded-lg mb-0.5 transition-colors text-sm
                      ${collapsed ? "justify-center" : ""}
                      ${active
                        ? "bg-primary/10 text-primary-text font-medium"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                      }
                    `}
                  >
                    <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-primary-text" : "text-sidebar-foreground/50"}`} />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-1.5">
          {fichaSuscripcion && !collapsed && (
            <div className="mx-1 mt-1 mb-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2.5">
              <p className="text-[11.5px] font-semibold tracking-wide text-sidebar-foreground/60">Suscripción actual</p>
              <p className="mt-0.5 text-sm font-semibold text-sidebar-foreground truncate">{fichaSuscripcion.plan}</p>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
                <span className="text-sidebar-foreground/60">Estatus</span>
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${
                    fichaSuscripcion.estatus === "activa"
                      ? "bg-emerald-100 text-emerald-900"
                      : fichaSuscripcion.estatus === "por_vencer"
                        ? "bg-amber-100 text-amber-900"
                        : "bg-red-100 text-red-900"
                  }`}
                >
                  {fichaSuscripcion.estatus === "activa" ? "Activa" : fichaSuscripcion.estatus === "por_vencer" ? "Por vencer" : "En gracia"}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                <span className="text-sidebar-foreground/60">Vigencia</span>
                <span className="font-medium text-sidebar-foreground">{fichaSuscripcion.vigencia ?? "Sin vencimiento"}</span>
              </div>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className={`
              flex items-center gap-2 w-full px-2 py-2.5 rounded-lg
              text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors text-sm
              ${collapsed ? "justify-center" : ""}
            `}>
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>{modo === "staff" ? "Cambiar de usuario" : "Cerrar sesión"}</span>}
          </button>
        </div>

        <button
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 bg-sidebar border border-sidebar-border rounded-full items-center justify-center shadow-sm hover:bg-sidebar-accent transition-colors z-10"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expandir menú" : "Colapsar menú"}
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
        >
          {collapsed
            ? <ChevronRight className="w-3 h-3 text-sidebar-foreground/60" />
            : <ChevronLeft className="w-3 h-3 text-sidebar-foreground/60" />
          }
        </button>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">

        <div className="bg-card border-b border-border px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              className="lg:hidden p-1.5 rounded-lg hover:bg-muted transition-colors"
              onClick={() => setMobileOpen(true)}
              title="Abrir menú"
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5 text-muted-foreground" />
            </button>

            {/* Marca de Linkity, discreta, SOLO en mobile (lg:hidden) — en
                mobile el sidebar (donde vive el logo real de Linkity) queda
                fuera de pantalla hasta que se abre el menú, así que sin esto
                la marca de la plataforma no se ve nunca ahí. Mismo ícono y
                opacidad que ya se usa junto a "by Linkity Soluciones" en el
                pie del sidebar expandido — pensado para verse bien de
                tamaño chico, nunca compite con el logo/nombre del negocio
                de al lado. */}
            <Image
              src="/images/favicon.svg"
              alt="Linkity"
              width={14}
              height={14}
              className="lg:hidden opacity-40 flex-shrink-0"
            />

            {/* Identidad del negocio en mobile: su logo si ya subió uno
                (mismo criterio que el logo de escritorio, más abajo), o el
                nombre en texto mientras tanto — nunca los dos a la vez, para
                no competir por el mismo espacio angosto. */}
            {logoUrl ? (
              <div className="lg:hidden flex items-center h-7 max-w-[140px] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- logo subido por el negocio, dominio/tamaño no se conocen de antemano */}
                <img
                  src={logoUrl}
                  alt={`Logo de ${businessName}`}
                  className="max-h-7 max-w-full w-auto object-contain"
                />
              </div>
            ) : (
              <span className="lg:hidden text-sm font-semibold text-foreground truncate max-w-[140px]">
                {businessName}
              </span>
            )}

            {/* Logo propio del negocio en escritorio — área que antes
                quedaba vacía (ver comentario de logoUrl en las props). */}
            {logoUrl && (
              <div className="hidden lg:flex items-center h-9 max-w-[220px] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- logo subido por el negocio, dominio/tamaño no se conocen de antemano */}
                <img
                  src={logoUrl}
                  alt={`Logo de ${businessName}`}
                  className="max-h-9 max-w-full w-auto object-contain"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* "Primeros pasos" (2026-09-29, a petición de Carlos): antes,
                en cuanto salías de /bienvenida a completar un paso (ej. dar
                de alta artículos en Catálogo), no había forma de regresar
                al checklist — este indicador queda visible en CUALQUIER
                módulo mientras haya sesión de admin (mostrarOnboarding,
                calculado en TenantLayout). 2026-09-30, a petición de
                Carlos: en vez de solo un link, ahora es un botón que
                despliega la lista de lo que falta, y cambia de rojo
                (incompleto) a verde (los 5 pasos listos) en vez de
                desaparecer — así sigue sirviendo como confirmación de que
                ya quedó todo armado. */}
            {mostrarOnboarding && (
              <div className="relative" ref={menuOnboardingRef}>
                {(() => {
                  const listo = onboardingCompletados >= onboardingTotal && onboardingTotal > 0;
                  return (
                    <button
                      type="button"
                      onClick={() => setMenuOnboardingAbierto((v) => !v)}
                      className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12.5px] font-medium transition-colors flex-shrink-0 ${
                        listo
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                      }`}
                    >
                      {listo ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ListChecks className="w-3.5 h-3.5" />}
                      Primeros pasos
                      <span
                        className={`text-[10.5px] px-1.5 py-0.5 rounded-full ${listo ? "bg-emerald-100" : "bg-red-100"}`}
                      >
                        {onboardingCompletados}/{onboardingTotal}
                      </span>
                    </button>
                  );
                })()}

                {menuOnboardingAbierto && (
                  <div className="absolute right-0 top-full mt-1.5 w-72 bg-card border border-border rounded-xl shadow-lg z-30 overflow-hidden">
                    <p className="px-3 py-2 text-xs font-semibold text-foreground border-b border-border">
                      Primeros pasos
                    </p>
                    {onboardingCompletados >= onboardingTotal ? (
                      <p className="px-3 py-4 text-xs text-emerald-700 text-center flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> ¡Ya completaste los {onboardingTotal} pasos!
                      </p>
                    ) : (
                      <div className="divide-y divide-border">
                        {onboardingPasos.filter((p) => !p.done).map((p) => (
                          <Link
                            key={p.id}
                            href={p.href}
                            onClick={() => setMenuOnboardingAbierto(false)}
                            className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/60 transition-colors"
                          >
                            <Circle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                            <span className="text-[12.5px] text-foreground">{p.titulo}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                    <Link
                      href={`/${tenant}/bienvenida`}
                      onClick={() => setMenuOnboardingAbierto(false)}
                      className="block px-3 py-2 text-[11.5px] font-medium text-primary-text hover:underline border-t border-border"
                    >
                      Ver checklist completo
                    </Link>
                  </div>
                )}
              </div>
            )}

            <div className="relative" ref={menuNotifRef}>
              <button
                onClick={handleToggleNotif}
                className="relative p-2 rounded-lg hover:bg-muted transition-colors"
                title="Notificaciones"
                aria-label="Notificaciones"
              >
                <Bell className="w-4 h-4 text-muted-foreground" />
                {notifNoLeidas > 0 && (
                  <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-[3px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                    {notifNoLeidas > 9 ? "9+" : notifNoLeidas}
                  </span>
                )}
              </button>
              {menuNotifAbierto && (
                <div className="absolute right-0 top-full mt-1.5 w-72 bg-card border border-border rounded-xl shadow-lg z-30 overflow-hidden">
                  <p className="px-3 py-2 text-xs font-semibold text-foreground border-b border-border">Notificaciones</p>
                  {notificaciones.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-muted-foreground text-center">No tienes notificaciones nuevas por ahora.</p>
                  ) : (
                    <div className="max-h-80 overflow-y-auto divide-y divide-border">
                      {notificaciones.map((n) => {
                        const estilo = ESTILO_NOTIFICACION[n.tipo];
                        const Icono = estilo.icon;
                        // 2026-09-23: mismo criterio que el toast — un aviso
                        // de dispositivo pendiente se queda accionable aquí
                        // aunque su pop-up ya se haya desaparecido solo (p.
                        // ej. si el administrador no lo vio a tiempo).
                        // modo === "admin": misma defensa en profundidad que
                        // el toast de arriba.
                        const necesitaAccion =
                          modo === "admin" &&
                          n.tipo === "DISPOSITIVO_PENDIENTE" &&
                          n.solicitudDispositivoId &&
                          !n.solicitudResuelta &&
                          !solicitudesResueltas.has(n.solicitudDispositivoId);
                        // Clicable solo si trae `url` (ver el comentario largo
                        // en Notificacion.url, schema.prisma) — hoy
                        // únicamente ALERTA_TALLER. Cierra la campanita al
                        // dar clic, igual que cualquier link de navegación la
                        // cerraría de todos modos al cambiar de página.
                        const contenido = (
                          <div className="flex items-start gap-2">
                            <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${estilo.bg} ${estilo.color}`}>
                              <Icono className="w-3 h-3" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11.5px] text-foreground leading-snug">{n.mensaje}</p>
                              <p className="text-[10.5px] text-muted-foreground mt-0.5">
                                {new Date(n.fecha).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" })}
                              </p>
                            </div>
                          </div>
                        );
                        return (
                          <div key={n.id} className="px-3 py-2.5 flex flex-col gap-2 hover:bg-muted/60">
                            {n.url ? (
                              <Link href={n.url} onClick={() => setMenuNotifAbierto(false)}>
                                {contenido}
                              </Link>
                            ) : (
                              contenido
                            )}
                            {necesitaAccion && (
                              <div className="flex items-center gap-2 pl-7">
                                <button
                                  onClick={() => resolverDispositivo(n.solicitudDispositivoId!, true)}
                                  className="flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground text-[11.5px] font-medium px-2.5 py-1 rounded-lg transition-colors"
                                >
                                  <Check className="w-3 h-3" /> Aprobar
                                </button>
                                <button
                                  onClick={() => resolverDispositivo(n.solicitudDispositivoId!, false)}
                                  className="text-[11.5px] font-medium text-muted-foreground hover:text-red-600 transition-colors px-2.5 py-1"
                                >
                                  Rechazar
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="relative pl-2 border-l border-border" ref={menuUsuarioRef}>
              <button
                onClick={() => setMenuUsuarioAbierto((v) => !v)}
                className="flex items-center gap-2 py-1 pr-1 rounded-lg hover:bg-muted transition-colors cursor-pointer"
              >
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-medium">
                  {initials}
                </div>
                <span className="hidden sm:block text-sm text-muted-foreground">{userName}</span>
                <ChevronDown className={`hidden sm:block w-3 h-3 text-muted-foreground transition-transform ${menuUsuarioAbierto ? "rotate-180" : ""}`} />
              </button>
              {menuUsuarioAbierto && (
                <div className="absolute right-0 top-full mt-1.5 w-56 bg-card border border-border rounded-xl shadow-lg z-30 overflow-hidden">
                  <div className="px-3 py-2.5 border-b border-border">
                    <p className="text-xs font-medium text-foreground truncate">{userName}</p>
                    <p className="text-[11.5px] text-muted-foreground truncate">{userRole || "Administrador"}</p>
                  </div>
                  {/* "Configuración" (subir logo del negocio, elegir tema,
                      etc.) — ya existe completa en ConfiguracionClient.tsx,
                      solo faltaba un acceso real desde aquí. Exclusiva del
                      administrador (ningún rol de PIN la tiene permitida,
                      ver RolesManager.tsx), así que en modo "staff" ni se
                      ofrece — llevaría a un redirect inmediato. */}
                  {modo === "admin" && (
                    <Link
                      href={`/${tenant}/configuracion`}
                      onClick={() => setMenuUsuarioAbierto(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Settings className="w-3.5 h-3.5 text-muted-foreground" /> Configuración
                    </Link>
                  )}
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5 text-muted-foreground" /> {modo === "staff" ? "Cambiar de usuario" : "Cerrar sesión"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {avisoSuscripcion && (
          <BannerSuscripcion
            etapa={avisoSuscripcion.etapa}
            diasRestantes={avisoSuscripcion.diasRestantes}
            puedeSuscribirse={modo === "admin"}
            checkoutUrl={checkoutUrl}
            contactoHref={contactoHref}
          />
        )}

        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
