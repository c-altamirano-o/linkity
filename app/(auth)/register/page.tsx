"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Building2, User, ArrowRight, Check, Loader2 } from "lucide-react";
import { BUSINESS_TYPE_OPTIONS } from "@/lib/labels";
import { registrarNegocioAction, reenviarContrasenaTemporalAction } from "./actions";

type Paso = "datos" | "listo";

export default function RegisterPage() {
  const [paso, setPaso] = useState<Paso>("datos");
  const [form, setForm] = useState({
    businessName: "",
    businessType: "",
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorCodigo, setErrorCodigo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ tenantSlug: string; correo: string; tempPasswordDev?: string } | null>(null);
  const [reenviando, setReenviando] = useState(false);
  const [mensajeReenvio, setMensajeReenvio] = useState("");

  // Reenvío de la contraseña temporal (correo que no llegó, o correo que ya
  // estaba ocupado por un registro hecho con tu dirección). La respuesta es
  // siempre la misma exista o no el correo — ver la acción.
  const handleReenviar = async (correo: string) => {
    setReenviando(true);
    setMensajeReenvio("");
    const r = await reenviarContrasenaTemporalAction(correo);
    setMensajeReenvio(r.mensaje);
    setReenviando(false);
  };

  const setField = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  // Antes este envío solo avanzaba a un segundo paso ("Plan y pago") donde
  // el visitante elegía plan/vigencia y "pagaba" (simulado) antes de crear
  // la cuenta. Con el cobro y los paquetes/usuarios adicionales gestionados
  // por Hotmart fuera de la plataforma, ese paso ya no existe: enviar este
  // formulario crea la cuenta directo — el esquema de capacidad (sucursales
  // / personal permitido) lo asigna Carlos desde Panel Maestro, no el
  // visitante (ver el comentario largo en app/(auth)/register/actions.ts).
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setErrorCodigo(null);
    setMensajeReenvio("");
    setLoading(true);

    const res = await registrarNegocioAction({
      businessName: form.businessName,
      businessType: form.businessType,
      ownerName: form.ownerName,
      ownerEmail: form.ownerEmail,
      ownerPhone: form.ownerPhone,
    });

    setLoading(false);

    if (!res.success || !res.tenantSlug) {
      setError(res.error ?? "No se pudo crear tu cuenta.");
      setErrorCodigo(res.codigo ?? null);
      return;
    }

    // La contraseña temporal ya NO llega al navegador: se manda por correo
    // (así solo entra quien controla ese buzón). Se muestra la pantalla de
    // "revisa tu correo" y la persona inicia sesión desde /login.
    setResultado({
      tenantSlug: res.tenantSlug,
      correo: res.ownerEmail ?? form.ownerEmail,
      tempPasswordDev: res.tempPasswordDev,
    });
    setPaso("listo");
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-primary flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

        <div>
          <Image
            src="/images/logo-white.svg"
            alt="Linkity Soluciones"
            width={180}
            height={45}
            className="object-contain brightness-0 invert"
          />
        </div>

        <div className="relative z-10">
          <h2 className="text-3xl font-bold text-white mb-4 leading-tight">
            Crea tu cuenta<br />en menos de dos minutos
          </h2>
          <p className="text-white/60 text-sm mb-8 leading-relaxed">
            Cuéntanos de tu negocio —<br />sin instalar nada.
          </p>

          <ul className="space-y-3">
            {[
              "1 mes de prueba gratis, sin tarjeta",
              "Todos los módulos activos desde el día uno",
              "Personalizado a tu giro de negocio",
              "Tus datos aislados de cualquier otro negocio",
              "Cancela cuando quieras",
            ].map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-white/80 text-sm">
                <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-white" />
                </div>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-white/30 text-xs relative z-10">
          (c) 2026 Linkity Soluciones. Todos los derechos reservados.
        </p>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 bg-white dark:bg-foreground overflow-y-auto">
        <div className="w-full max-w-sm py-8">
          <div className="lg:hidden flex justify-center mb-8">
            <Image
              src="/images/favicon.svg"
              alt="Linkity"
              width={56}
              height={56}
              className="object-contain brightness-0 invert"
            />
          </div>

          {paso === "listo" && resultado ? (
            <div>
              <div className="mb-6">
                <span className="inline-block bg-emerald-100 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full mb-3 tracking-wide">
                  ¡LISTO!
                </span>
                <h1 className="text-2xl font-bold text-foreground dark:text-white">Revisa tu correo</h1>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-sm space-y-2 mb-4">
                <p className="text-foreground dark:text-white">
                  Tu negocio ya está creado. Te enviamos una contraseña temporal a{" "}
                  <span className="font-mono">{resultado.correo}</span>.
                </p>
                <p className="text-slate-500 dark:text-slate-400">
                  Úsala para iniciar sesión; después te pediremos crear tu propia contraseña. Si no la ves en unos
                  minutos, revisa tu carpeta de spam.
                </p>
              </div>

              {resultado.tempPasswordDev && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                  Solo desarrollo (sin correo configurado). Contraseña temporal:{" "}
                  <span className="font-mono">{resultado.tempPasswordDev}</span>
                </p>
              )}

              <Link
                href="/login"
                className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 rounded-lg text-sm transition-all"
              >
                Ir a iniciar sesión <ArrowRight className="w-4 h-4" />
              </Link>

              <button
                type="button"
                disabled={reenviando}
                onClick={() => handleReenviar(resultado.correo)}
                className="mt-3 w-full flex items-center justify-center gap-2 text-sm text-primary hover:underline disabled:opacity-50"
              >
                {reenviando && <Loader2 className="w-4 h-4 animate-spin" />}
                ¿No te llegó? Reenviar contraseña
              </button>
              {mensajeReenvio && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{mensajeReenvio}</p>}
            </div>
          ) : (
            <>
              <div className="mb-6">
                <span className="inline-block bg-primary/10 text-primary text-xs font-semibold px-3 py-1 rounded-full mb-3 tracking-wide">
                  CREA TU CUENTA
                </span>
                <h1 className="text-2xl font-bold text-foreground dark:text-white">Solicita acceso</h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                  Cuéntanos de tu negocio para continuar. Tu primer mes es gratis.
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2.5 rounded-lg mb-4">
                  {error}
                  {errorCodigo === "correo_existente" && form.ownerEmail && (
                    <div className="mt-2">
                      <button
                        type="button"
                        disabled={reenviando}
                        onClick={() => handleReenviar(form.ownerEmail)}
                        className="font-medium underline disabled:opacity-50"
                      >
                        Reenviar contraseña temporal a este correo
                      </button>
                      {mensajeReenvio && <p className="mt-1 text-xs text-red-500">{mensajeReenvio}</p>}
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    <Building2 className="w-3.5 h-3.5" /> Nombre del negocio
                  </label>
                  <input
                    type="text" required
                    placeholder="Ej. Cell Express Delicias"
                    value={form.businessName}
                    onChange={setField("businessName")}
                    className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-slate-50 dark:bg-slate-800 text-foreground dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
                    Giro de tu negocio
                  </label>
                  <select
                    required
                    value={form.businessType}
                    onChange={(e) => setForm((p) => ({ ...p, businessType: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-slate-50 dark:bg-slate-800 text-foreground dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  >
                    <option value="">Selecciona...</option>
                    {BUSINESS_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    <User className="w-3.5 h-3.5" /> Tu nombre completo
                  </label>
                  <input
                    type="text" required
                    placeholder="Juan Pérez García"
                    value={form.ownerName}
                    onChange={setField("ownerName")}
                    className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-slate-50 dark:bg-slate-800 text-foreground dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
                      Correo electrónico
                    </label>
                    <input
                      type="email" required
                      placeholder="tu@negocio.com"
                      value={form.ownerEmail}
                      onChange={setField("ownerEmail")}
                      className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-slate-50 dark:bg-slate-800 text-foreground dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
                      Teléfono
                    </label>
                    <input
                      type="tel"
                      placeholder="614 000 0000"
                      value={form.ownerPhone}
                      onChange={setField("ownerPhone")}
                      className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-slate-50 dark:bg-slate-800 text-foreground dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    />
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
                      Crear mi cuenta <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-4">
                Al terminar tu mes gratis podrás suscribirte para seguir usando Linkity; si no, el acceso se pausa y tus datos se conservan.
              </p>

              <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-4">
                ¿Ya tienes cuenta?{" "}
                <Link href="/login" className="text-primary font-medium hover:underline">
                  Inicia sesión
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
