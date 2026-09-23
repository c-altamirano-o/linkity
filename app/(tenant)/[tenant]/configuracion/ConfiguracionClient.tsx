"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateThemePreset, updateBusinessType, updateWeekStartDay, updateSupportPhone, updateCobrarEnDevolucion } from "@/app/actions/tenant";
import { alternarModuloPropioAction, aplicarRecomendadoRubroAction } from "@/app/actions/modulos-tenant-actions";
import { subirLogoAction, eliminarLogoAction } from "@/app/actions/logo-actions";
import { listarSolicitudesPendientesAction, resolverSolicitudDispositivoAction } from "@/app/actions/dispositivos-actions";
import { BUSINESS_TYPE_OPTIONS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import {
  WINDOWS_THEMES, resolverPresetTenant, TENANT_THEME_ROOT_ID,
  INTENSIDAD_DEFAULT, INTENSIDAD_MIN, INTENSIDAD_MAX,
} from "@/lib/theme-presets";
import ActivarNotificacionesPush from "@/components/tenant/ActivarNotificacionesPush";
import {
  Palette, Check, Loader2, Briefcase, Lock, Eye, EyeOff, ArrowLeft, CheckCircle2,
  LayoutGrid, Sparkles, Image as ImageIcon, CalendarClock, Phone, Undo2,
  Bell, RefreshCw, Smartphone, X,
} from "lucide-react";

const TIPOS_LOGO_PERMITIDOS = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const TAMANO_MAXIMO_LOGO = 2 * 1024 * 1024; // 2 MB — mismo límite que valida logo-actions.ts en el servidor

// Aplica los tokens de color de un preset directo sobre el nodo que el
// layout del tenant ya usa para inyectar el tema real (mismo elemento,
// mismas variables) — así el cambio se ve al instante en TODA la interfaz
// (sidebar, botones, etc.), no solo en esta tarjeta, sin tocar la BD hasta
// que el negocio confirme con "Guardar cambios". Si el nodo no existe
// todavía (ej. muy al inicio del primer render) no hace nada — el layout
// ya lo habrá pintado con el valor real de la BD de cualquier forma.
//
// Llama a resolverPresetTenant — la MISMA función que usa el servidor para
// pintar el tema real — con el par (tema, intensidad) que el admin está
// eligiendo/arrastrando en este momento, para que la vista previa nunca
// pueda desincronizarse de lo que de verdad se va a guardar.
function aplicarTemaEnVivo(themeId: string, intensidad: number) {
  const preset = resolverPresetTenant(themeId, intensidad);
  const nodo = document.getElementById(TENANT_THEME_ROOT_ID);
  if (!nodo) return;
  for (const [variable, valor] of Object.entries(preset)) {
    nodo.style.setProperty(variable, valor);
  }
}

// Los 10 temas estilo Windows Phone/Metro que Carlos aprobó (ver el
// comentario largo en lib/theme-presets.ts) — el swatch de cada tarjeta usa
// backgroundColor (el color de fondo de toda la ventana del POS), que es lo
// que más distingue un tema de otro a simple vista.
const THEMES = Object.entries(WINDOWS_THEMES).map(([id, tema]) => ({
  id,
  name: tema.name,
  swatch: tema.backgroundColor,
}));

const SIN_RUBRO = "";

// 0=domingo…6=sábado — mismo índice que Tenant.weekStartDay (schema.prisma)
// y lib/periodo-laboral.ts.
const DIAS_SEMANA_COMPLETOS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

interface ModuloPersonalizable {
  code: string;
  name: string;
  activo: boolean;
}

interface ConfiguracionClientProps {
  tenantSlug: string;
  themePresetInicial: string;
  themeIntensityInicial: number;
  businessTypeInicial: string | null;
  modulos: ModuloPersonalizable[];
  recomendadosOff: string[];
  logoInicial: string | null;
  weekStartDayInicial: number;
  supportPhoneInicial: string | null;
  cobrarEnDevolucionInicial: boolean;
}

export default function ConfiguracionClient({
  tenantSlug,
  themePresetInicial,
  themeIntensityInicial,
  businessTypeInicial,
  modulos,
  recomendadosOff,
  logoInicial,
  weekStartDayInicial,
  supportPhoneInicial,
  cobrarEnDevolucionInicial,
}: ConfiguracionClientProps) {
  const router = useRouter();

  // ── Tema ──────────────────────────────────────────────────
  const [temaSeleccionado, setTemaSeleccionado] = useState(themePresetInicial);
  const [intensidadSeleccionada, setIntensidadSeleccionada] = useState(themeIntensityInicial ?? INTENSIDAD_DEFAULT);
  const [temaPending, startTemaTransition] = useTransition();
  const [temaMensaje, setTemaMensaje] = useState("");

  // Guarda cuál es el tema/intensidad REALMENTE guardados en BD (no lo que
  // se está previsualizando) — si el negocio sale de esta pantalla sin darle
  // "Guardar cambios", el efecto de limpieza de abajo revierte la vista
  // previa a estos valores, para que un color nunca confirmado no se quede
  // "pegado" en el resto de la app.
  const temaConfirmadoRef = useRef(themePresetInicial);
  const intensidadConfirmadaRef = useRef(themeIntensityInicial ?? INTENSIDAD_DEFAULT);

  const seleccionarTema = (themeId: string) => {
    setTemaSeleccionado(themeId);
    aplicarTemaEnVivo(themeId, intensidadSeleccionada); // vista previa instantánea, sin esperar a guardar
  };

  const cambiarIntensidad = (valor: number) => {
    setIntensidadSeleccionada(valor);
    aplicarTemaEnVivo(temaSeleccionado, valor); // vista previa instantánea, mientras se arrastra el slider
  };

  useEffect(() => {
    return () => aplicarTemaEnVivo(temaConfirmadoRef.current, intensidadConfirmadaRef.current);
  }, []);

  const guardarTema = () => {
    startTemaTransition(async () => {
      const result = await updateThemePreset(tenantSlug, temaSeleccionado, intensidadSeleccionada);
      setTemaMensaje(result.success ? "Tema actualizado correctamente." : "Error al actualizar el tema.");
      if (result.success) {
        temaConfirmadoRef.current = temaSeleccionado;
        intensidadConfirmadaRef.current = intensidadSeleccionada;
        router.refresh();
        setTimeout(() => setTemaMensaje(""), 3000);
      }
    });
  };

  // ── Rubro del negocio ─────────────────────────────────────
  const [rubroSeleccionado, setRubroSeleccionado] = useState(businessTypeInicial ?? SIN_RUBRO);
  const [rubroPending, startRubroTransition] = useTransition();
  const [rubroMensaje, setRubroMensaje] = useState("");

  const guardarRubro = () => {
    startRubroTransition(async () => {
      const result = await updateBusinessType(tenantSlug, rubroSeleccionado === SIN_RUBRO ? null : rubroSeleccionado);
      setRubroMensaje(result.success ? "Rubro actualizado correctamente." : "Error al actualizar el rubro.");
      if (result.success) setTimeout(() => setRubroMensaje(""), 3000);
    });
  };

  // ── Semana laboral ─────────────────────────────────────────
  // 2026-09-18, a petición de Carlos: cada negocio elige su propio corte de
  // semana (para "esta semana" en Dashboard, horas trabajadas en Personal,
  // y el filtro "Semana" de Asistencia) en vez de que el sistema imponga
  // uno solo — ver el comentario largo en Tenant.weekStartDay
  // (schema.prisma) y lib/periodo-laboral.ts.
  const [weekStartDaySeleccionado, setWeekStartDaySeleccionado] = useState(weekStartDayInicial);
  const [weekStartDayPending, startWeekStartDayTransition] = useTransition();
  const [weekStartDayMensaje, setWeekStartDayMensaje] = useState("");

  const guardarWeekStartDay = () => {
    startWeekStartDayTransition(async () => {
      const result = await updateWeekStartDay(tenantSlug, weekStartDaySeleccionado);
      setWeekStartDayMensaje(result.success ? "Semana laboral actualizada correctamente." : (result.error ?? "Error al actualizar."));
      if (result.success) {
        router.refresh();
        setTimeout(() => setWeekStartDayMensaje(""), 3000);
      }
    });
  };

  // ── Teléfono de soporte ────────────────────────────────────
  // 2026-09-21, a petición de Carlos: aparece en los tickets de Reparaciones
  // y Ventas (impresos y digitales) para que el cliente sepa a qué número
  // llamar. Guarda Tenant.phone, que ya existía en el schema pero no tenía
  // pantalla propia — antes solo el panel maestro/superadmin podía tocarlo.
  const [supportPhone, setSupportPhone] = useState(supportPhoneInicial ?? "");
  const [supportPhonePending, startSupportPhoneTransition] = useTransition();
  const [supportPhoneMensaje, setSupportPhoneMensaje] = useState("");

  const guardarSupportPhone = () => {
    startSupportPhoneTransition(async () => {
      const result = await updateSupportPhone(tenantSlug, supportPhone);
      setSupportPhoneMensaje(result.success ? "Teléfono actualizado correctamente." : (result.error ?? "Error al actualizar."));
      if (result.success) {
        router.refresh();
        setTimeout(() => setSupportPhoneMensaje(""), 3000);
      }
    });
  };

  // ── Cobro en devoluciones ──────────────────────────────────
  // 2026-09-22, a petición de Carlos, ejemplo "Fix Expres": "eso debe ser
  // configurable desde la pantalla del administrador" — una sola regla
  // para TODO el negocio ("una sola regla para todo el negocio", respuesta
  // explícita de Carlos), no por sucursal. Guarda Tenant.cobrarEnDevolucion,
  // usado en avanzarEstadoAction/cobrarYEntregarAction (reparaciones-
  // actions.ts) para exigir o no un cobro al entregar un equipo marcado
  // como devolución (no se pudo reparar).
  const [cobrarEnDevolucion, setCobrarEnDevolucion] = useState(cobrarEnDevolucionInicial);
  const [cobrarEnDevolucionPending, startCobrarEnDevolucionTransition] = useTransition();
  const [cobrarEnDevolucionMensaje, setCobrarEnDevolucionMensaje] = useState("");

  const alternarCobrarEnDevolucion = (valor: boolean) => {
    setCobrarEnDevolucion(valor); // optimista
    setCobrarEnDevolucionMensaje("");
    startCobrarEnDevolucionTransition(async () => {
      const result = await updateCobrarEnDevolucion(tenantSlug, valor);
      if (!result.success) {
        setCobrarEnDevolucion(!valor); // revierte si el servidor lo rechazó
        setCobrarEnDevolucionMensaje(result.error ?? "Error al actualizar.");
        return;
      }
      router.refresh();
      setCobrarEnDevolucionMensaje("Configuración actualizada correctamente.");
      setTimeout(() => setCobrarEnDevolucionMensaje(""), 3000);
    });
  };

  // ── Módulos de tu negocio ─────────────────────────────────
  // Personalización por rubro (2026-09-17): cada negocio decide qué
  // módulos ve en su menú — "modulos" ya viene resuelto del servidor
  // (activo = sin fila desactivada explícita, ver page.tsx). Se guarda una
  // copia local editable para reflejar el toggle al instante sin esperar
  // el refresh completo de la página.
  const [modulosState, setModulosState] = useState(modulos);
  const [moduloEnCurso, setModuloEnCurso] = useState<string | null>(null);
  const [modulosMensaje, setModulosMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [aplicandoRecomendado, startAplicarRecomendadoTransition] = useTransition();
  const [, startModulosTransition] = useTransition();

  const alternarModulo = (code: string, activar: boolean) => {
    setModuloEnCurso(code);
    setModulosMensaje(null);
    setModulosState((prev) => prev.map((m) => (m.code === code ? { ...m, activo: activar } : m)));
    startModulosTransition(async () => {
      const result = await alternarModuloPropioAction({ tenantSlug, moduleCode: code, activar });
      setModuloEnCurso(null);
      if (!result.ok) {
        // Revierte el cambio optimista si el servidor lo rechazó.
        setModulosState((prev) => prev.map((m) => (m.code === code ? { ...m, activo: !activar } : m)));
        setModulosMensaje({ tipo: "error", texto: result.error });
        return;
      }
      router.refresh();
    });
  };

  const aplicarRecomendado = () => {
    setModulosMensaje(null);
    startAplicarRecomendadoTransition(async () => {
      const result = await aplicarRecomendadoRubroAction({ tenantSlug });
      if (!result.ok) {
        setModulosMensaje({ tipo: "error", texto: result.error });
        return;
      }
      setModulosState((prev) => prev.map((m) => ({ ...m, activo: !recomendadosOff.includes(m.code) })));
      setModulosMensaje({ tipo: "ok", texto: "Se aplicó la recomendación para tu rubro." });
      router.refresh();
      setTimeout(() => setModulosMensaje(null), 4000);
    });
  };

  // ── Logo de tu negocio ────────────────────────────────────
  // Aparte del logo de Linkity en el sidebar (que nunca cambia) — este es
  // el logo propio de cada negocio, que se muestra en el encabezado
  // superior (ver TenantShell.tsx). Se sube a Supabase Storage vía
  // app/actions/logo-actions.ts, que ya valida tipo/tamaño en el servidor;
  // aquí se valida lo mismo del lado del cliente solo para dar el mensaje
  // de error al instante, sin esperar el viaje al servidor.
  const [logoUrl, setLogoUrl] = useState(logoInicial);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoPending, startLogoTransition] = useTransition();
  const [logoMensaje, setLogoMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Libera el object URL de la vista previa al reemplazarlo o al salir de
  // la pantalla — si no, cada archivo elegido se queda ocupando memoria del
  // navegador hasta recargar la página.
  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  const seleccionarLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    setLogoMensaje(null);
    if (!archivo) return;

    if (!TIPOS_LOGO_PERMITIDOS.includes(archivo.type)) {
      setLogoMensaje({ tipo: "error", texto: "Formato no soportado. Usa PNG, JPG, WEBP o SVG." });
      e.target.value = "";
      return;
    }
    if (archivo.size > TAMANO_MAXIMO_LOGO) {
      setLogoMensaje({ tipo: "error", texto: "La imagen no debe pesar más de 2 MB." });
      e.target.value = "";
      return;
    }

    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoFile(archivo);
    setLogoPreview(URL.createObjectURL(archivo));
  };

  const subirLogo = () => {
    if (!logoFile) return;
    setLogoMensaje(null);
    startLogoTransition(async () => {
      const formData = new FormData();
      formData.append("logo", logoFile);
      const result = await subirLogoAction(tenantSlug, formData);
      if (!result.ok) {
        setLogoMensaje({ tipo: "error", texto: result.error });
        return;
      }
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      setLogoUrl(result.url);
      setLogoFile(null);
      setLogoPreview(null);
      if (logoInputRef.current) logoInputRef.current.value = "";
      setLogoMensaje({ tipo: "ok", texto: "Logo actualizado correctamente." });
      router.refresh();
      setTimeout(() => setLogoMensaje(null), 4000);
    });
  };

  const quitarLogo = () => {
    setLogoMensaje(null);
    startLogoTransition(async () => {
      const result = await eliminarLogoAction(tenantSlug);
      if (!result.ok) {
        setLogoMensaje({ tipo: "error", texto: result.error });
        return;
      }
      setLogoUrl(null);
      setLogoMensaje({ tipo: "ok", texto: "Logo eliminado." });
      router.refresh();
      setTimeout(() => setLogoMensaje(null), 4000);
    });
  };

  // ── Cambiar contraseña ────────────────────────────────────
  // Se guarda directo contra Supabase Auth del lado del cliente (igual
  // que login/page.tsx), no vía Server Action — updateUser() actúa sobre
  // la sesión ya autenticada del propio usuario, así que no hace falta
  // pedirle su contraseña actual (a diferencia de un cambio de contraseña
  // hecho por un tercero/admin). Pensado sobre todo para el primer login
  // con la contraseña temporal que genera Panel Maestro/auto-registro al
  // dar de alta un negocio nuevo.
  const [nuevaContrasena, setNuevaContrasena] = useState("");
  const [confirmarContrasena, setConfirmarContrasena] = useState("");
  const [verContrasena, setVerContrasena] = useState(false);
  const [contrasenaPending, setContrasenaPending] = useState(false);
  const [contrasenaMensaje, setContrasenaMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const guardarContrasena = async (e: React.FormEvent) => {
    e.preventDefault();
    setContrasenaMensaje(null);

    if (nuevaContrasena.length < 8) {
      setContrasenaMensaje({ tipo: "error", texto: "La contraseña debe tener al menos 8 caracteres." });
      return;
    }
    if (nuevaContrasena !== confirmarContrasena) {
      setContrasenaMensaje({ tipo: "error", texto: "Las contraseñas no coinciden." });
      return;
    }

    setContrasenaPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: nuevaContrasena });
    setContrasenaPending(false);

    if (error) {
      setContrasenaMensaje({ tipo: "error", texto: "No se pudo actualizar tu contraseña. Intenta de nuevo." });
      return;
    }

    setNuevaContrasena("");
    setConfirmarContrasena("");
    setContrasenaMensaje({ tipo: "ok", texto: "Contraseña actualizada correctamente." });
    setTimeout(() => setContrasenaMensaje(null), 4000);
  };

  // ── Dispositivos pendientes ────────────────────────────────
  // 2026-09-23, a petición de Carlos: respaldo dentro de Configuración para
  // cuando la notificación en vivo (campanita/toast, TenantShell.tsx) o el
  // push no llegan a tiempo — mismas acciones (aprobar/rechazar), solo que
  // consultadas a demanda en vez de en vivo. Ver dispositivos-actions.ts.
  const [solicitudes, setSolicitudes] = useState<
    { id: string; branchName: string; userAgent: string | null; fecha: string }[]
  >([]);
  const [solicitudesCargando, setSolicitudesCargando] = useState(true);
  const [solicitudEnCurso, setSolicitudEnCurso] = useState<string | null>(null);

  const cargarSolicitudes = async () => {
    setSolicitudesCargando(true);
    const result = await listarSolicitudesPendientesAction(tenantSlug);
    setSolicitudesCargando(false);
    if (result.ok) setSolicitudes(result.solicitudes);
  };

  useEffect(() => {
    cargarSolicitudes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolverSolicitud = async (solicitudId: string, aprobar: boolean) => {
    setSolicitudEnCurso(solicitudId);
    // 2026-09-23, corrección: antes esto no revisaba res.ok — si
    // resolverSolicitudDispositivoAction fallaba por CUALQUIER motivo (la
    // sesión de quien hace clic no calificó como admin, la solicitud ya
    // había vencido, otro administrador ya la había resuelto, etc.), el
    // botón igual desaparecía de la lista como si hubiera funcionado, sin
    // avisar nada — Carlos reportó justo este síntoma ("aunque autentique
    // al usuario no ingresa automáticamente": aprobaba aquí, pero del otro
    // lado nunca se aprobaba de verdad). Ahora si falla se avisa con el
    // motivo real y se recarga la lista (por si de verdad ya se había
    // resuelto por otro lado, para que no se quede huérfana en pantalla).
    const res = await resolverSolicitudDispositivoAction({ tenantSlug, solicitudId, aprobar }).catch(
      (): { ok: false; error: string } => ({ ok: false, error: "No se pudo conectar con el servidor — inténtalo de nuevo." })
    );
    if (res.ok) {
      setSolicitudes((prev) => prev.filter((s) => s.id !== solicitudId));
    } else {
      window.alert(res.error);
      await cargarSolicitudes();
    }
    setSolicitudEnCurso(null);
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto w-full h-full overflow-y-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Configuración del Sistema</h1>
          <p className="text-sm text-muted-foreground mt-1">Administra las preferencias visuales y de terminología de tu negocio.</p>
        </div>
        <Link
          href={`/${tenantSlug}/dashboard`}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground flex-shrink-0 mt-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Volver al dashboard
        </Link>
      </div>

      {/* ── Apariencia y Tema ─────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mb-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <Palette className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Apariencia y Tema</h2>
        </div>

        <div className="p-5">
          <p className="text-sm text-muted-foreground mb-5">Selecciona la paleta de colores principal para tu interfaz, estilo Windows Phone.</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                onClick={() => seleccionarTema(theme.id)}
                className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                  temaSeleccionado === theme.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted"
                }`}
              >
                <div
                  className="w-10 h-10 rounded-full shadow-inner flex items-center justify-center"
                  style={{ backgroundColor: theme.swatch }}
                >
                  {temaSeleccionado === theme.id && <Check className="w-5 h-5 text-white drop-shadow" />}
                </div>
                <span className="text-xs font-medium text-foreground">{theme.name}</span>
              </button>
            ))}
          </div>

          {/* Intensidad (2026-09-23, a petición de Carlos: "hazlas
              personalizables para subir o bajar la intensidad de los
              colores") — escala solo la saturación de la paleta elegida
              arriba, ver escalarSaturacion en lib/theme-presets.ts. 100 =
              la paleta tal cual, sin tocar. */}
          <div className="mt-6 border-t border-border pt-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">Intensidad del color</label>
              <span className="text-xs font-semibold text-foreground tabular-nums">{intensidadSeleccionada}%</span>
            </div>
            <input
              type="range"
              min={INTENSIDAD_MIN}
              max={INTENSIDAD_MAX}
              step={5}
              value={intensidadSeleccionada}
              onChange={(e) => cambiarIntensidad(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-muted-foreground">Apagado</span>
              <span className="text-[11px] text-muted-foreground">Original</span>
              <span className="text-[11px] text-muted-foreground">Vivo</span>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-4 border-t border-border pt-5">
            <button
              onClick={guardarTema}
              disabled={temaPending}
              className="px-5 py-2.5 bg-primary hover:opacity-90 text-primary-foreground text-sm font-medium rounded-lg transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {temaPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {temaPending ? "Aplicando..." : "Guardar cambios"}
            </button>
            {temaMensaje && <span className="text-sm font-medium text-emerald-600 animate-in fade-in">{temaMensaje}</span>}
          </div>
        </div>
      </div>

      {/* ── Giro del negocio ──────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <Briefcase className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Giro del negocio</h2>
        </div>

        <div className="p-5">
          <p className="text-sm text-muted-foreground mb-5">
            Elige el giro de tu negocio para que el sistema use la terminología correcta en todos los módulos
            — por ejemplo, &quot;Reparaciones&quot; se convierte en &quot;Órdenes de Servicio&quot; para un taller
            automotriz. Si más adelante quieres un nombre distinto para tu negocio en particular, puedes
            personalizarlo aparte.
          </p>

          <div className="max-w-sm">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Rubro</label>
            <select
              value={rubroSeleccionado}
              onChange={(e) => setRubroSeleccionado(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value={SIN_RUBRO}>Sin especificar / Genérico</option>
              {BUSINESS_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="mt-8 flex items-center gap-4 border-t border-border pt-5">
            <button
              onClick={guardarRubro}
              disabled={rubroPending}
              className="px-5 py-2.5 bg-primary hover:opacity-90 text-primary-foreground text-sm font-medium rounded-lg transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {rubroPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {rubroPending ? "Aplicando..." : "Guardar cambios"}
            </button>
            {rubroMensaje && <span className="text-sm font-medium text-emerald-600 animate-in fade-in">{rubroMensaje}</span>}
          </div>
        </div>
      </div>

      {/* ── Semana laboral ─────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mt-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <CalendarClock className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Semana laboral</h2>
        </div>

        <div className="p-5">
          <p className="text-sm text-muted-foreground mb-5">
            Elige en qué día empieza tu semana de trabajo. Este es el día que usa el sistema para calcular
            &quot;ventas de esta semana&quot; en el Dashboard, las horas trabajadas de tu personal, y el filtro
            &quot;Semana&quot; de Asistencia — para que coincida con tu corte real de nómina, no con un calendario
            genérico.
          </p>

          <div className="max-w-sm">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tu semana laboral empieza el</label>
            <select
              value={weekStartDaySeleccionado}
              onChange={(e) => setWeekStartDaySeleccionado(Number(e.target.value))}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              {DIAS_SEMANA_COMPLETOS.map((nombre, i) => (
                <option key={nombre} value={i}>{nombre}</option>
              ))}
            </select>
          </div>

          <div className="mt-8 flex items-center gap-4 border-t border-border pt-5">
            <button
              onClick={guardarWeekStartDay}
              disabled={weekStartDayPending}
              className="px-5 py-2.5 bg-primary hover:opacity-90 text-primary-foreground text-sm font-medium rounded-lg transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {weekStartDayPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {weekStartDayPending ? "Aplicando..." : "Guardar cambios"}
            </button>
            {weekStartDayMensaje && <span className="text-sm font-medium text-emerald-600 animate-in fade-in">{weekStartDayMensaje}</span>}
          </div>
        </div>
      </div>

      {/* ── Teléfono de soporte ────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mt-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <Phone className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Teléfono de soporte</h2>
        </div>

        <div className="p-5">
          <p className="text-sm text-muted-foreground mb-5">
            Aparece en los tickets de reparación y venta (impresos y digitales) para que tus clientes
            sepan a qué número comunicarse.
          </p>

          <div className="max-w-sm">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Teléfono</label>
            <input
              type="tel"
              value={supportPhone}
              onChange={(e) => setSupportPhone(e.target.value)}
              placeholder="Ej. 55 1234 5678"
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="mt-8 flex items-center gap-4 border-t border-border pt-5">
            <button
              onClick={guardarSupportPhone}
              disabled={supportPhonePending}
              className="px-5 py-2.5 bg-primary hover:opacity-90 text-primary-foreground text-sm font-medium rounded-lg transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {supportPhonePending && <Loader2 className="w-4 h-4 animate-spin" />}
              {supportPhonePending ? "Aplicando..." : "Guardar cambios"}
            </button>
            {supportPhoneMensaje && <span className="text-sm font-medium text-emerald-600 animate-in fade-in">{supportPhoneMensaje}</span>}
          </div>
        </div>
      </div>

      {/* ── Cobro en devoluciones ──────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mt-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <Undo2 className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Cobro en devoluciones</h2>
        </div>

        <div className="p-5">
          <p className="text-sm text-muted-foreground mb-5">
            Cuando un equipo no se pudo reparar y se marca como devolución, decide si tu negocio cobra algo al
            cliente (por ejemplo, por el diagnóstico o el intento de reparación) antes de entregárselo. Esta
            regla aplica a TODAS tus sucursales por igual.
          </p>

          <label className="flex items-start gap-3 max-w-md cursor-pointer">
            <input
              type="checkbox"
              checked={cobrarEnDevolucion}
              disabled={cobrarEnDevolucionPending}
              onChange={(e) => alternarCobrarEnDevolucion(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-primary disabled:opacity-50"
            />
            <span className="text-sm text-foreground">
              Cobrar al entregar una devolución
              <span className="block text-xs text-muted-foreground mt-0.5">
                {cobrarEnDevolucion
                  ? "Activado — entregar una devolución exige pasar por \"Cobrar y entregar\" en tienda."
                  : "Desactivado — una devolución se entrega directo, sin cargo."}
              </span>
            </span>
          </label>

          {cobrarEnDevolucionMensaje && (
            <p className={`text-sm font-medium mt-4 animate-in fade-in ${cobrarEnDevolucionMensaje.startsWith("Error") || cobrarEnDevolucionMensaje.includes("No se pudo") ? "text-red-600" : "text-emerald-600"}`}>
              {cobrarEnDevolucionMensaje}
            </p>
          )}
        </div>
      </div>

      {/* ── Módulos de tu negocio ──────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mt-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <LayoutGrid className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Módulos de tu negocio</h2>
        </div>

        <div className="p-5">
          <p className="text-sm text-muted-foreground mb-5">
            Elige qué módulos aparecen en tu menú. Apagar uno no borra ninguna información que ya
            hayas capturado — solo deja de mostrarse hasta que lo vuelvas a activar.
          </p>

          {recomendadosOff.length > 0 && (
            <div className="mb-5 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3.5">
              <Sparkles className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-foreground">
                  Para el rubro que elegiste, recomendamos apagar:{" "}
                  {recomendadosOff.map((code) => modulosState.find((m) => m.code === code)?.name ?? code).join(", ")}.
                </p>
                <button
                  onClick={aplicarRecomendado}
                  disabled={aplicandoRecomendado}
                  className="mt-2 text-xs font-medium text-primary hover:underline disabled:opacity-50 flex items-center gap-1.5"
                >
                  {aplicandoRecomendado && <Loader2 className="w-3 h-3 animate-spin" />}
                  Aplicar recomendado para tu rubro
                </button>
              </div>
            </div>
          )}

          <div className="divide-y divide-border">
            {modulosState.map((m) => (
              <div key={m.code} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-foreground">{m.name}</span>
                <button
                  type="button"
                  disabled={moduloEnCurso === m.code}
                  onClick={() => alternarModulo(m.code, !m.activo)}
                  className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
                    m.activo ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      m.activo ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>

          {modulosMensaje && (
            <p
              className={`mt-4 text-sm font-medium animate-in fade-in ${
                modulosMensaje.tipo === "ok" ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {modulosMensaje.texto}
            </p>
          )}
        </div>
      </div>

      {/* ── Logo de tu negocio ─────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mt-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <ImageIcon className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Logo de tu negocio</h2>
        </div>

        <div className="p-5">
          <p className="text-sm text-muted-foreground mb-5">
            Sube el logo de tu negocio para que se muestre en tu sistema, junto al de Linkity Soluciones.
            Recomendado: imagen horizontal, PNG/JPG/WEBP/SVG, máximo 2 MB.
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-40 h-16 rounded-lg border border-dashed border-border bg-muted/40 flex items-center justify-center overflow-hidden flex-shrink-0">
              {logoPreview || logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo subido por el negocio, dominio/tamaño no se conocen de antemano
                <img
                  src={logoPreview ?? logoUrl ?? ""}
                  alt="Logo del negocio"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <span className="text-xs text-muted-foreground px-2 text-center">Sin logo todavía</span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={seleccionarLogo}
                className="block w-full text-xs text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 file:cursor-pointer cursor-pointer"
              />

              <div className="mt-4 flex items-center gap-3 flex-wrap">
                <button
                  onClick={subirLogo}
                  disabled={!logoFile || logoPending}
                  className="px-5 py-2.5 bg-primary hover:opacity-90 text-primary-foreground text-sm font-medium rounded-lg transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {logoPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {logoPending ? "Guardando..." : "Subir logo"}
                </button>
                {logoUrl && !logoFile && (
                  <button
                    onClick={quitarLogo}
                    disabled={logoPending}
                    className="px-4 py-2.5 border border-border hover:bg-muted text-muted-foreground text-sm font-medium rounded-lg transition-all disabled:opacity-50"
                  >
                    Quitar logo
                  </button>
                )}
              </div>

              {logoMensaje && (
                <p
                  className={`mt-3 text-sm font-medium animate-in fade-in ${
                    logoMensaje.tipo === "ok" ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {logoMensaje.texto}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Notificaciones y dispositivos ──────────────────────── */}
      {/* 2026-09-23, a petición de Carlos ("que ningún empleado pueda
          entrar desde otro lugar y fingir que está en la tienda"): cada
          dispositivo (PC/tablet/navegador) se autoriza una sola vez por
          sucursal — ver el comentario largo en lib/dispositivos-confianza.ts
          y en SolicitudDispositivo (schema.prisma). Esta tarjeta junta las
          dos formas de aprobar un dispositivo nuevo: la notificación con
          push (arriba) y este listado de respaldo (abajo). */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mt-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <Bell className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Notificaciones y dispositivos</h2>
        </div>

        <div className="p-5">
          <ActivarNotificacionesPush tenantSlug={tenantSlug} />

          <div className="mt-6 border-t border-border pt-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-foreground">Dispositivos pendientes de autorizar</h3>
              <button
                onClick={cargarSolicitudes}
                disabled={solicitudesCargando}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${solicitudesCargando ? "animate-spin" : ""}`} /> Actualizar
              </button>
            </div>

            {solicitudesCargando && solicitudes.length === 0 ? (
              <p className="text-xs text-muted-foreground flex items-center gap-2 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando solicitudes…
              </p>
            ) : solicitudes.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No hay dispositivos esperando autorización por ahora.</p>
            ) : (
              <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                {solicitudes.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 px-3.5 py-3 flex-wrap">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Smartphone className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground">Sucursal: {s.branchName}</p>
                        <p className="text-[10.5px] text-muted-foreground mt-0.5 truncate max-w-[220px]">
                          {s.userAgent ?? "Dispositivo sin identificar"}
                        </p>
                        <p className="text-[10.5px] text-muted-foreground mt-0.5">
                          {new Date(s.fecha).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => resolverSolicitud(s.id, true)}
                        disabled={solicitudEnCurso === s.id}
                        className="flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground text-[11.5px] font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Check className="w-3 h-3" /> Aprobar
                      </button>
                      <button
                        onClick={() => resolverSolicitud(s.id, false)}
                        disabled={solicitudEnCurso === s.id}
                        className="flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground hover:text-red-600 transition-colors px-2.5 py-1.5 disabled:opacity-50"
                      >
                        <X className="w-3 h-3" /> Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Seguridad: cambiar contraseña ─────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mt-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <Lock className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Seguridad</h2>
        </div>

        <div className="p-5">
          <p className="text-sm text-muted-foreground mb-5">
            Cambia tu contraseña de acceso — hazlo sobre todo si todavía usas la contraseña temporal
            con la que se creó tu cuenta.
          </p>

          <form onSubmit={guardarContrasena} className="max-w-sm space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nueva contraseña</label>
              <div className="relative">
                <input
                  type={verContrasena ? "text" : "password"}
                  autoComplete="new-password"
                  value={nuevaContrasena}
                  onChange={(e) => setNuevaContrasena(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full px-3 py-2.5 pr-10 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setVerContrasena((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {verContrasena ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Confirmar nueva contraseña</label>
              <input
                type={verContrasena ? "text" : "password"}
                autoComplete="new-password"
                value={confirmarContrasena}
                onChange={(e) => setConfirmarContrasena(e.target.value)}
                placeholder="Repite la contraseña"
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <div className="flex items-center gap-4 border-t border-border pt-5">
              <button
                type="submit"
                disabled={contrasenaPending}
                className="px-5 py-2.5 bg-primary hover:opacity-90 text-primary-foreground text-sm font-medium rounded-lg transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {contrasenaPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {contrasenaPending ? "Guardando..." : "Actualizar contraseña"}
              </button>
              {contrasenaMensaje && (
                <span
                  className={`text-sm font-medium animate-in fade-in ${
                    contrasenaMensaje.tipo === "ok" ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {contrasenaMensaje.texto}
                </span>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* ── Listo ──────────────────────────────────────────────── */}
      <Link
        href={`/${tenantSlug}/dashboard`}
        className="mt-6 w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-lg text-sm transition-all"
      >
        <CheckCircle2 className="w-4 h-4" />
        Listo, volver al dashboard
      </Link>
    </div>
  );
}
