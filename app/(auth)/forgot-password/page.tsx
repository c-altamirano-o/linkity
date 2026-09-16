"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Mail, ArrowRight, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Antes esta ruta no existía: el link "¿Olvidaste tu contraseña?" de
 * login/page.tsx apuntaba aquí pero daba 404 — el único camino real para
 * recuperar acceso era que un desarrollador entrara al SQL Editor de
 * Supabase a mano, algo que ningún usuario piloto real va a poder hacer.
 *
 * Este formulario solo pide el correo y llama a
 * supabase.auth.resetPasswordForEmail — Supabase decide si ese correo
 * existe o no; a propósito mostramos el mismo mensaje de éxito en ambos
 * casos (no confirmamos ni negamos si una cuenta existe).
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);

    if (resetError) {
      setError("No se pudo procesar la solicitud. Intenta de nuevo en unos minutos.");
      return;
    }

    setEnviado(true);
  };

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

        {enviado ? (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground dark:text-white mb-2">Revisa tu correo</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              Si <span className="font-medium">{email}</span> tiene una cuenta con nosotros, te enviamos un enlace para elegir una nueva contraseña.
            </p>
            <Link href="/login" className="text-primary text-sm font-medium hover:underline inline-flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver al inicio de sesión
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-foreground dark:text-white">¿Olvidaste tu contraseña?</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                Escribe tu correo y te mandamos un enlace para elegir una nueva.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2.5 rounded-lg mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Correo electrónico
                </label>
                <div className="relative">
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@negocio.com"
                    required
                    className="w-full px-4 py-2.5 pl-10 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-slate-50 dark:bg-slate-800 text-foreground dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
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
                    Enviar enlace
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-6">
              <Link href="/login" className="text-primary font-medium hover:underline inline-flex items-center gap-1">
                <ArrowLeft className="w-3 h-3" />
                Volver al inicio de sesión
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
