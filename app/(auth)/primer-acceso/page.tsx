"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getTenantSlugBySupabaseId } from "../login/actions";

/**
 * Paso obligatorio para cuentas nuevas (Panel Maestro o auto-registro) que
 * todavía traen una contraseña temporal — Supabase Auth guarda
 * user_metadata.must_change_password=true al crearlas. Mientras ese flag
 * siga en true, LoginPage y el layout de [tenant] mandan aquí en vez de
 * dejar pasar directo al negocio.
 *
 * Al guardar la nueva contraseña se limpia el flag
 * (must_change_password: false) y se manda al visitante a la pantalla de
 * bienvenida de su propio negocio.
 */
export default function PrimerAccesoPage() {
  const [checking, setChecking] = useState(true);
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const verificarSesion = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = "/login";
        return;
      }
      setNombre(data.user.email ?? "");
      setChecking(false);
    };
    verificarSesion();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { data: userData, error: updateError } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });

    if (updateError || !userData.user) {
      setLoading(false);
      setError("No se pudo actualizar tu contraseña. Intenta de nuevo.");
      return;
    }

    const tenantSlug = await getTenantSlugBySupabaseId(userData.user.id);
    setLoading(false);

    if (!tenantSlug) {
      setError("Tu cuenta no está asociada a ningún negocio.");
      return;
    }

    window.location.href = `/${tenantSlug}/bienvenida`;
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-white dark:bg-foreground">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Image
            src="/images/favicon.svg"
            alt="Linkity"
            width={56}
            height={56}
            className="object-contain brightness-0 invert"
          />
        </div>

        <div className="mb-6 text-center">
          <span className="inline-block bg-primary/10 text-primary text-xs font-semibold px-3 py-1 rounded-full mb-3 tracking-wide">
            ÚLTIMO PASO
          </span>
          <h1 className="text-2xl font-bold text-foreground dark:text-white">Crea tu contraseña</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Entraste con la contraseña temporal de {nombre}. Define la tuya para continuar.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2.5 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
              Nueva contraseña
            </label>
            <div className="relative">
              <input
                type={verPassword ? "text" : "password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="w-full px-4 py-2.5 pl-10 pr-10 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-slate-50 dark:bg-slate-800 text-foreground dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <button
                type="button"
                onClick={() => setVerPassword(!verPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {verPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
              Confirmar contraseña
            </label>
            <div className="relative">
              <input
                type={verPassword ? "text" : "password"}
                required
                minLength={8}
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                placeholder="Repite tu contraseña"
                className="w-full px-4 py-2.5 pl-10 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-slate-50 dark:bg-slate-800 text-foreground dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 rounded-lg text-sm transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-70"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Continuar <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
