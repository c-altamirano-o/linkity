"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, Mail, Lock, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("Correo o contraseña incorrectos");
      setLoading(false);
      return;
    }

    window.location.href = "/cell-express/dashboard";
  };

  return (
    <div className="min-h-screen flex">

      {/* Panel izquierdo - Solo desktop */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#4F46E5] flex-col justify-between p-12 relative overflow-hidden">
        {/* Círculos decorativos */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

        {/* Logo */}
        <div>
          <Image
            src="/images/logo-white.svg"
            alt="Linkity Solutions"
            width={180}
            height={45}
            className="object-contain brightness-0 invert"
          />
        </div>

        {/* Contenido central */}
        <div className="relative z-10">
          <h2 className="text-3xl font-bold text-white mb-4 leading-tight">
            El ecosistema integral<br />para tu negocio
          </h2>
          <p className="text-white/60 text-sm mb-8 leading-relaxed">
            Todo lo que necesitas para vender, reparar y crecer,<br />en una sola pantalla.
          </p>

          <ul className="space-y-3">
            {[
              "Punto de venta ultra rápido",
              "Taller con notificaciones WhatsApp",
              "Control multi-sucursal",
              "Facturación CFDI integrada",
              "Dashboard en tiempo real",
            ].map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-white/80 text-sm">
                <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                </div>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <p className="text-white/30 text-xs relative z-10">
          © 2026 Linkity Solutions. Todos los derechos reservados.
        </p>
      </div>

      {/* Panel derecho - Formulario */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 bg-white dark:bg-[#0F172A]">
        <div className="w-full max-w-sm">

          {/* Logo móvil */}
          <div className="lg:hidden flex justify-center mb-8">
            <Image
              src="/images/favicon.svg"
              alt="Linkity"
              width={56}
              height={56}
              className="object-contain brightness-0 invert"
            />
          </div>

          {/* Header */}
          <div className="mb-8">
            <span className="inline-block bg-[#4F46E5]/10 text-[#4F46E5] text-xs font-semibold px-3 py-1 rounded-full mb-3 tracking-wide">
              BIENVENIDO DE VUELTA
            </span>
            <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white">
              Inicia sesión
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Accede a tu cuenta para continuar
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2.5 rounded-lg mb-4">
              {error}
            </div>
          )}

          {/* Formulario */}
          <form onSubmit={handleLogin} className="space-y-4">

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Correo electrónico
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@negocio.com"
                  required
                  className="w-full px-4 py-2.5 pl-10 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-slate-50 dark:bg-slate-800 text-[#0F172A] dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5] transition-all"
                />
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Contraseña
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-[#4F46E5] hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-2.5 pl-10 pr-10 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-slate-50 dark:bg-slate-800 text-[#0F172A] dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5] transition-all"
                />
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Botón submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#4F46E5] hover:bg-[#4338CA] text-white font-semibold py-2.5 rounded-lg text-sm transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-70"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Iniciar sesión
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

          </form>

          {/* Footer */}
          <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-6">
            ¿No tienes cuenta?{" "}
            <Link href="/register" className="text-[#4F46E5] font-medium hover:underline">
              Solicita acceso
            </Link>
          </p>

        </div>
      </div>

    </div>
  );
}