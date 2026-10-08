"use client";

import { useState } from "react";
import { Building2, ArrowRight, Loader2, PartyPopper } from "lucide-react";
import { BUSINESS_TYPE_OPTIONS } from "@/lib/labels";
import { guardarDatosNegocioAction } from "@/app/actions/datos-negocio-actions";

/**
 * Pantalla de primer acceso para negocios creados desde Hotmart: pide el
 * nombre real del negocio y su giro. La muestra el layout del negocio mientras
 * datosPendientes sea true (ver app/(tenant)/[tenant]/layout.tsx).
 */
export default function DatosNegocioClient({ tenantSlug }: { tenantSlug: string }) {
  const [nombre, setNombre] = useState("");
  const [giro, setGiro] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setGuardando(true);
    const res = await guardarDatosNegocioAction({ tenantSlug, businessName: nombre, businessType: giro });
    if (!res.ok) {
      setGuardando(false);
      setError(res.error);
      return;
    }
    // La dirección del negocio pudo cambiar con el nombre nuevo: se entra por la nueva.
    window.location.href = `/${res.slug}/bienvenida`;
  };

  const claseCampo =
    "w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-slate-50 dark:bg-slate-800 text-foreground dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all";

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-white dark:bg-foreground">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <PartyPopper className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground dark:text-white">¡Tu cuenta está lista!</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1.5">
            Solo falta saber cómo se llama tu negocio y a qué se dedica, para dejarlo preparado a tu medida.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2.5 rounded-lg mb-4">{error}</div>
        )}

        <form onSubmit={enviar} className="space-y-4">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              <Building2 className="w-3.5 h-3.5" /> Nombre del negocio
            </label>
            <input
              type="text"
              required
              maxLength={80}
              placeholder="Ej. Cell Express Delicias"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className={claseCampo}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
              Giro de tu negocio
            </label>
            <select required value={giro} onChange={(e) => setGiro(e.target.value)} className={claseCampo}>
              <option value="">Selecciona...</option>
              {BUSINESS_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={guardando}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 rounded-lg text-sm transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-70"
          >
            {guardando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Continuar <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-4">
          Podrás cambiar estos datos después desde Configuración.
        </p>
      </div>
    </div>
  );
}
