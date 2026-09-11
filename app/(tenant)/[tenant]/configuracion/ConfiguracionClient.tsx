"use client";

import { useState, useTransition } from "react";
import { updateThemePreset, updateBusinessType } from "@/app/actions/tenant";
import { BUSINESS_TYPE_OPTIONS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import { Palette, Check, Loader2, Briefcase, Lock, Eye, EyeOff } from "lucide-react";

const THEMES = [
  { id: "NEUTRAL_TECH", name: "Neutral Tech", color: "bg-slate-800" },
  { id: "BLACK_GOLD", name: "Black & Gold", color: "bg-amber-500" },
  { id: "EMERALD", name: "Esmeralda", color: "bg-emerald-500" },
  { id: "CORAL_WARM", name: "Coral Cálido", color: "bg-rose-500" },
  { id: "OCEAN_BLUE", name: "Azul Océano", color: "bg-blue-600" },
];

const SIN_RUBRO = "";

interface ConfiguracionClientProps {
  tenantSlug: string;
  themePresetInicial: string;
  businessTypeInicial: string | null;
}

export default function ConfiguracionClient({
  tenantSlug,
  themePresetInicial,
  businessTypeInicial,
}: ConfiguracionClientProps) {
  // ── Tema ──────────────────────────────────────────────────
  const [temaSeleccionado, setTemaSeleccionado] = useState(themePresetInicial);
  const [temaPending, startTemaTransition] = useTransition();
  const [temaMensaje, setTemaMensaje] = useState("");

  const guardarTema = () => {
    startTemaTransition(async () => {
      const result = await updateThemePreset(tenantSlug, temaSeleccionado);
      setTemaMensaje(result.success ? "Tema actualizado correctamente." : "Error al actualizar el tema.");
      if (result.success) setTimeout(() => setTemaMensaje(""), 3000);
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
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Configuración del Sistema</h1>
        <p className="text-sm text-muted-foreground mt-1">Administra las preferencias visuales y de terminología de tu negocio.</p>
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
                onClick={() => setTemaSeleccionado(theme.id)}
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
    </div>
  );
}
