"use client";

import { useState } from "react";
import { Lock, Eye, EyeOff, Shield } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Antes no existía ninguna forma de cambiar tu propia contraseña de
 * SuperAdmin sin entrar al SQL Editor de Supabase a mano — así se
 * desbloqueó tu acceso la primera vez. Este formulario usa
 * supabase.auth.updateUser (self-service: tú escribes tu propia
 * contraseña, nunca pasa por mí ni por ningún backend intermedio) — mismo
 * mecanismo que ya usa primer-acceso/page.tsx para negocios nuevos.
 */
export default function ConfiguracionClient({
  admin,
}: {
  admin: { id: string; email: string; name: string };
}) {
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setExito(false);

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
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError("No se pudo actualizar tu contraseña. Intenta de nuevo.");
      return;
    }

    setPassword("");
    setConfirmar("");
    setExito(true);
  };

  return (
    <div className="max-w-lg space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <p className="text-[14.5px] font-medium text-slate-700 mb-3 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-slate-400" />
          Tu cuenta
        </p>
        <dl className="space-y-2 text-[13.5px]">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400">Nombre</dt>
            <dd className="text-slate-700">{admin.name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400">Correo</dt>
            <dd className="text-slate-700">{admin.email}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400">Rol</dt>
            <dd className="text-slate-700">Administrador de Panel Maestro</dd>
          </div>
        </dl>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <p className="text-[14.5px] font-medium text-slate-700 mb-1">Cambiar contraseña</p>
        <p className="text-[12.5px] text-slate-400 mb-3">Se aplica de inmediato — la vas a necesitar la próxima vez que inicies sesión.</p>

        {error && <p className="text-[12.5px] text-red-600 mb-3">{error}</p>}
        {exito && <p className="text-[12.5px] text-emerald-600 mb-3">Contraseña actualizada correctamente.</p>}

        <form onSubmit={handleSubmit} className="space-y-3 max-w-xs">
          <div>
            <label className="text-[12.5px] font-medium text-slate-500 mb-1 block">Nueva contraseña</label>
            <div className="relative">
              <input
                type={verPassword ? "text" : "password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="w-full px-3 py-2 pl-9 pr-9 border border-slate-200 rounded-lg text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
              />
              <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <button
                type="button"
                onClick={() => setVerPassword(!verPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {verPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-[12.5px] font-medium text-slate-500 mb-1 block">Confirmar contraseña</label>
            <div className="relative">
              <input
                type={verPassword ? "text" : "password"}
                required
                minLength={8}
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                placeholder="Repite la contraseña"
                className="w-full px-3 py-2 pl-9 border border-slate-200 rounded-lg text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
              />
              <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[13.5px] font-medium px-3.5 py-2 rounded-lg transition-colors disabled:opacity-60"
          >
            {loading ? "Guardando…" : "Guardar contraseña"}
          </button>
        </form>
      </div>
    </div>
  );
}
