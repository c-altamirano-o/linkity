"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Building2, User, ArrowRight, ArrowLeft, Check, Loader2, CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BUSINESS_TYPE_OPTIONS } from "@/lib/labels";
import { BILLING_CYCLE_LABEL, calcularTotalPago, type BillingCycle } from "@/lib/subscripcion";
import { registrarNegocioAction } from "./actions";

const PLANES = ["Basico", "Pro", "Enterprise"] as const;
const PLAN_LABEL: Record<string, string> = { Basico: "Básico", Pro: "Pro", Enterprise: "Enterprise" };
const PLAN_PRECIO_MENSUAL: Record<string, number> = { Basico: 499, Pro: 999, Enterprise: 1999 };
const CICLOS: BillingCycle[] = ["MENSUAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"];

type Paso = "datos" | "pago" | "listo";

export default function RegisterPage() {
  const [paso, setPaso] = useState<Paso>("datos");
  const [form, setForm] = useState({
    businessName: "",
    businessType: "",
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
  });
  const [plan, setPlan] = useState<string>("Basico");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("MENSUAL");
  const [autoRenew, setAutoRenew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<{ tenantSlug: string; tempPassword: string } | null>(null);

  const setField = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleContinuarDatos = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setPaso("pago");
  };

  const totalPago = calcularTotalPago(PLAN_PRECIO_MENSUAL[plan] ?? PLAN_PRECIO_MENSUAL.Basico, billingCycle);

  const handlePagar = async () => {
    setLoading(true);
    setError("");

    const res = await registrarNegocioAction({
      businessName: form.businessName,
      businessType: form.businessType,
      ownerName: form.ownerName,
      ownerEmail: form.ownerEmail,
      ownerPhone: form.ownerPhone,
      plan,
      billingCycle,
      autoRenew,
    });

    setLoading(false);

    if (!res.success || !res.tenantSlug || !res.tempPassword) {
      setError(res.error ?? "No se pudo crear tu cuenta.");
      return;
    }

    setResultado({ tenantSlug: res.tenantSlug, tempPassword: res.tempPassword });
    setPaso("listo");

    // Tu cuenta ya existe con la contraseña temporal que acaba de generar
    // el servidor — se usa aquí solo para dejarte entrando de inmediato,
    // nunca la escribes tú en ningún campo. Como la cuenta se crea con
    // must_change_password=true, el login te manda directo a
    // /primer-acceso para que definas tu propia contraseña.
    setEntrando(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: res.ownerEmail ?? form.ownerEmail,
      password: res.tempPassword,
    });

    if (signInError) {
      // No debería pasar, pero si falla te dejamos el resumen en pantalla
      // con el link manual a login en vez de quedarte trabado.
      setEntrando(false);
      return;
    }

    window.location.href = "/primer-acceso";
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
            Elige tu plan y vigencia —<br />sin instalar nada.
          </p>

          <ul className="space-y-3">
            {[
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

          {paso !== "listo" && (
            <div className="flex items-center gap-2 mb-6">
              {(["datos", "pago"] as const).map((p, i) => (
                <div key={p} className="flex items-center gap-2 flex-1">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 ${
                      paso === p
                        ? "bg-primary text-primary-foreground"
                        : (p === "datos" ? "bg-primary/20 text-primary" : "bg-slate-200 dark:bg-slate-700 text-slate-500")
                    }`}
                  >
                    {i + 1}
                  </div>
                  <span className={`text-xs ${paso === p ? "text-foreground dark:text-white font-medium" : "text-slate-400"}`}>
                    {p === "datos" ? "Tus datos" : "Pago"}
                  </span>
                  {i === 0 && <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />}
                </div>
              ))}
            </div>
          )}

          {paso === "listo" && resultado ? (
            <div>
              <div className="mb-6">
                <span className="inline-block bg-emerald-100 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full mb-3 tracking-wide">
                  ¡LISTO!
                </span>
                <h1 className="text-2xl font-bold text-foreground dark:text-white">Tu negocio ya está creado</h1>
              </div>

              {entrando ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Entrando para que definas tu contraseña...
                </div>
              ) : (
                <>
                  <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-sm space-y-1 mb-4">
                    <p className="text-slate-500 dark:text-slate-400">
                      No pudimos iniciar tu sesión automáticamente, pero tu cuenta ya existe. Guarda estos datos:
                    </p>
                    <p className="text-foreground dark:text-white">
                      Negocio: <span className="font-mono">{resultado.tenantSlug}</span>
                    </p>
                    <p className="text-foreground dark:text-white">
                      Correo: <span className="font-mono">{form.ownerEmail}</span>
                    </p>
                    <p className="text-foreground dark:text-white">
                      Contraseña temporal: <span className="font-mono">{resultado.tempPassword}</span>
                    </p>
                  </div>
                  <Link
                    href="/login"
                    className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 rounded-lg text-sm transition-all"
                  >
                    Iniciar sesión <ArrowRight className="w-4 h-4" />
                  </Link>
                </>
              )}
            </div>
          ) : paso === "datos" ? (
            <>
              <div className="mb-6">
                <span className="inline-block bg-primary/10 text-primary text-xs font-semibold px-3 py-1 rounded-full mb-3 tracking-wide">
                  CREA TU CUENTA
                </span>
                <h1 className="text-2xl font-bold text-foreground dark:text-white">Solicita acceso</h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                  Cuéntanos de tu negocio para continuar.
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2.5 rounded-lg mb-4">
                  {error}
                </div>
              )}

              <form onSubmit={handleContinuarDatos} className="space-y-4">
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
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 rounded-lg text-sm transition-all flex items-center justify-center gap-2 mt-2"
                >
                  Continuar <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-6">
                ¿Ya tienes cuenta?{" "}
                <Link href="/login" className="text-primary font-medium hover:underline">
                  Inicia sesión
                </Link>
              </p>
            </>
          ) : (
            <>
              <div className="mb-6">
                <span className="inline-block bg-primary/10 text-primary text-xs font-semibold px-3 py-1 rounded-full mb-3 tracking-wide">
                  ELIGE TU PLAN
                </span>
                <h1 className="text-2xl font-bold text-foreground dark:text-white">Plan y pago</h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                  {form.businessName || "Tu negocio"} — último paso.
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2.5 rounded-lg mb-4">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Plan</label>
                  <div className="grid grid-cols-3 gap-2">
                    {PLANES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPlan(p)}
                        className={`py-2 rounded-lg border text-xs font-medium transition-all ${
                          plan === p
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300"
                        }`}
                      >
                        {PLAN_LABEL[p]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Vigencia</label>
                  <div className="grid grid-cols-2 gap-2">
                    {CICLOS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setBillingCycle(c)}
                        className={`py-2 rounded-lg border text-xs font-medium transition-all ${
                          billingCycle === c
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300"
                        }`}
                      >
                        {BILLING_CYCLE_LABEL[c]}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRenew}
                    onChange={(e) => setAutoRenew(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Renovar automáticamente al vencer (te avisamos antes por si quieres cancelar)
                </label>

                <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-sm space-y-1">
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>Plan {PLAN_LABEL[plan]} · {BILLING_CYCLE_LABEL[billingCycle]}</span>
                    <span>${totalPago.toLocaleString("es-MX")} MXN</span>
                  </div>
                  <div className="flex justify-between font-semibold text-foreground dark:text-white pt-1 border-t border-slate-200 dark:border-slate-700 mt-1">
                    <span>Total a pagar hoy</span>
                    <span>${totalPago.toLocaleString("es-MX")} MXN</span>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 text-amber-700 text-[11px] px-3 py-2 rounded-lg">
                  Pago simulado: por ahora esta pantalla no está conectada a una pasarela de pago real, solo confirma tu plan y crea tu cuenta.
                </div>

                <button
                  type="button"
                  onClick={handlePagar}
                  disabled={loading}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 rounded-lg text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      Confirmar pago simulado
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setPaso("datos")}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-foreground dark:hover:text-white py-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Volver a mis datos
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
