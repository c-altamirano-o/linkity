"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateThemePreset, updateBusinessType } from "@/app/actions/tenant";
import { alternarModuloPropioAction, aplicarRecomendadoRubroAction } from "@/app/actions/modulos-tenant-actions";
import { subirLogoAction, eliminarLogoAction } from "@/app/actions/logo-actions";
import { BUSINESS_TYPE_OPTIONS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import { THEME_PRESETS, TENANT_THEME_ROOT_ID, type ThemePresetId } from "@/lib/theme-presets";
import {
  Palette, Check, Loader2, Briefcase, Lock, Eye, EyeOff, ArrowLeft, CheckCircle2,
  LayoutGrid, Sparkles, Image as ImageIcon,
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
function aplicarTemaEnVivo(themeId: string) {
  const preset = THEME_PRESETS[themeId as ThemePresetId];
  if (!preset) return;
  const nodo = document.getElementById(TENANT_THEME_ROOT_ID);
  if (!nodo) return;
  for (const [variable, valor] of Object.entries(preset)) {
    nodo.style.setProperty(variable, valor);
  }
}

const THEMES = [
  { id: "NEUTRAL_TECH", name: "Neutral Tech", color: "bg-slate-800" },
  { id: "BLACK_GOLD", name: "Black & Gold", color: "bg-amber-500" },
  { id: "EMERALD", name: "Esmeralda", color: "bg-emerald-500" },
  { id: "CORAL_WARM", name: "Coral Cálido", color: "bg-rose-500" },
  { id: "OCEAN_BLUE", name: "Azul Océano", color: "bg-blue-600" },
];

const SIN_RUBRO = "";

interface ModuloPersonalizable {
  code: string;
  name: string;
  activo: boolean;
}

interface ConfiguracionClientProps {
  tenantSlug: string;
  themePresetInicial: string;
  businessTypeInicial: string | null;
  modulos: ModuloPersonalizable[];
  recomendadosOff: string[];
  logoInicial: string | null;
}

export default function ConfiguracionClient({
  tenantSlug,
  themePresetInicial,
  businessTypeInicial,
  modulos,
  recomendadosOff,
  logoInicial,
}: ConfiguracionClientProps) {
  const router = useRouter();

  // ── Tema ──────────────────────────────────────────────────
  const [temaSeleccionado, setTemaSeleccionado] = useState(themePresetInicial);
  const [temaPending, startTemaTransition] = useTransition();
  const [temaMensaje, setTemaMensaje] = useState("");

  // Guarda cuál es el tema REALMENTE guardado en BD (no el que se está
  // previsualizando) — si el negocio sale de esta pantalla sin darle
  // "Guardar cambios", el efecto de limpieza de abajo revierte la vista
  // previa a este valor, para que un color nunca confirmado no se quede
  // "pegado" en el resto de la app.
  const temaConfirmadoRef = useRef(themePresetInicial);

  const seleccionarTema = (themeId: string) => {
    setTemaSeleccionado(themeId);
    aplicarTemaEnVivo(themeId); // vista previa instantánea, sin esperar a guardar
  };

  useEffect(() => {
    return () => aplicarTemaEnVivo(temaConfirmadoRef.current);
  }, []);

  const guardarTema = () => {
    startTemaTransition(async () => {
      const result = await updateThemePreset(tenantSlug, temaSeleccionado);
      setTemaMensaje(result.success ? "Tema actualizado correctamente." : "Error al actualizar el tema.");
      if (result.success) {
        temaConfirmadoRef.current = temaSeleccionado;
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
          <p className="text-sm text-muted-foreground mb-5">Selecciona la paleta de colores principal para tu interfaz.</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                onClick={() => seleccionarTema(theme.id)}
                className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                  temaSeleccionado === theme.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted"
                }`}
              >
                <div className={`w-10 h-10 rounded-full shadow-inner ${theme.color} flex items-center justify-center`}>
                  {temaSeleccionado === theme.id && <Check className="w-5 h-5 text-white" />}
                </div>
                <span className="text-xs font-medium text-foreground">{theme.name}</span>
              </button>
            ))}
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
