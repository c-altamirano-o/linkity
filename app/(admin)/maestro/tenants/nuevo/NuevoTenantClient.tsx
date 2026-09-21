"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, User, Package, Check, Layers } from "lucide-react";
import type { EsquemaOption } from "@/lib/esquemas-data";
import { MODULE_CATALOG } from "@/lib/modules-catalog";
import { createTenantAction } from "./actions";

// Antes tenía su propia lista de códigos "M1".."M14" (desincronizada del
// catálogo real desde hace tiempo — le faltaban Compras/Soporte/Asistencia
// por completo). Ahora usa MODULE_CATALOG directo (lib/modules-catalog.ts)
// — una sola fuente de verdad, la misma que ya usa el menú del tenant y el
// toggle de Panel Maestro/Configuración.
const modulosDisponibles = Object.entries(MODULE_CATALOG).map(([code, info]) => ({
  code,
  name: info.name,
  isCore: info.isCore,
}));

export default function NuevoTenantClient({ esquemas }: { esquemas: EsquemaOption[] }) {
  const [form, setForm] = useState({
    businessName: "",
    rfc: "",
    phone: "",
    city: "",
    state: "",
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
  });
  // Default: todos los módulos activos (antes eran los 4 conceptos de
  // "núcleo" viejos, M1-M4, que ya no existen como tal — ver
  // lib/modules-catalog.ts) — Carlos desmarca lo que ese negocio en
  // particular no necesite.
  const [modulosActivos, setModulosActivos] = useState<string[]>(modulosDisponibles.map((m) => m.code));
  // El default es el esquema marcado como predeterminado (el mismo que se
  // le asigna a un negocio que se auto-registra) — Carlos puede cambiarlo
  // aquí mismo antes de crear el negocio, o después desde su ficha.
  const [esquemaId, setEsquemaId] = useState<string>(esquemas.find((e) => e.isActive)?.id ?? "");
  const [trialDays, setTrialDays] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    error?: string;
    tenantSlug?: string;
    tempPassword?: string;
  } | null>(null);

  const setField = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const toggleModulo = (code: string) => {
    setModulosActivos((prev) =>
      prev.includes(code) ? prev.filter((m) => m !== code) : [...prev, code]
    );
  };

  const esquemaSeleccionado = esquemas.find((e) => e.id === esquemaId) ?? null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    const res = await createTenantAction({
      businessName: form.businessName,
      rfc: form.rfc,
      phone: form.phone,
      city: form.city,
      state: form.state,
      ownerName: form.ownerName,
      ownerEmail: form.ownerEmail,
      ownerPhone: form.ownerPhone,
      esquemaId: esquemaId || null,
      trialDays,
      modules: modulosActivos,
    });

    setLoading(false);
    setResult(res);
  };

  return (
    <>
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3">
        <Link href="/maestro/dashboard" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-[15px] font-medium text-slate-800">Registrar nuevo negocio</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {result && (
          <div
            className={`mb-4 p-4 rounded-lg border text-[14.5px] ${
              result.success
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-red-50 border-red-200 text-red-800"
            }`}
          >
            {result.success ? (
              <div className="space-y-1">
                <p className="font-medium">Negocio creado correctamente.</p>
                <p>Tenant: <span className="font-mono">{result.tenantSlug}</span></p>
                <p>Password temporal: <span className="font-mono">{result.tempPassword}</span></p>
                <Link
                  href={`/${result.tenantSlug}/dashboard`}
                  className="inline-block mt-2 text-[#4F46E5] underline"
                >
                  Ir al negocio
                </Link>
              </div>
            ) : (
              <p>Error: {result.error}</p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-4">
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-4 h-4 text-[#4F46E5]" />
                  <h2 className="text-[14.5px] font-medium text-slate-700">Datos del negocio</h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[12.5px] font-medium text-slate-500 mb-1">Nombre del negocio *</label>
                    <input type="text" placeholder="Ej. Cell Express Delicias" required
                      value={form.businessName} onChange={setField("businessName")}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[14.5px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
                  </div>
                  <div>
                    <label className="block text-[12.5px] font-medium text-slate-500 mb-1">RFC</label>
                    <input type="text" placeholder="XAXX010101000"
                      value={form.rfc} onChange={setField("rfc")}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[14.5px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
                  </div>
                  <div>
                    <label className="block text-[12.5px] font-medium text-slate-500 mb-1">Telefono</label>
                    <input type="tel" placeholder="614 000 0000"
                      value={form.phone} onChange={setField("phone")}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[14.5px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
                  </div>
                  <div>
                    <label className="block text-[12.5px] font-medium text-slate-500 mb-1">Ciudad</label>
                    <input type="text" placeholder="Cd. Delicias"
                      value={form.city} onChange={setField("city")}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[14.5px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
                  </div>
                  <div>
                    <label className="block text-[12.5px] font-medium text-slate-500 mb-1">Estado</label>
                    <input type="text" placeholder="Chihuahua"
                      value={form.state} onChange={setField("state")}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[14.5px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-4">
                  <User className="w-4 h-4 text-[#4F46E5]" />
                  <h2 className="text-[14.5px] font-medium text-slate-700">Datos del dueno</h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12.5px] font-medium text-slate-500 mb-1">Nombre completo *</label>
                    <input type="text" placeholder="Juan Perez Garcia" required
                      value={form.ownerName} onChange={setField("ownerName")}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[14.5px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
                  </div>
                  <div>
                    <label className="block text-[12.5px] font-medium text-slate-500 mb-1">Correo electronico *</label>
                    <input type="email" placeholder="juan@negocio.com" required
                      value={form.ownerEmail} onChange={setField("ownerEmail")}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[14.5px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
                  </div>
                  <div>
                    <label className="block text-[12.5px] font-medium text-slate-500 mb-1">Telefono</label>
                    <input type="tel" placeholder="614 000 0000"
                      value={form.ownerPhone} onChange={setField("ownerPhone")}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[14.5px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Package className="w-4 h-4 text-[#4F46E5]" />
                  <h2 className="text-[14.5px] font-medium text-slate-700">Modulos activos</h2>
                  <span className="ml-auto text-[12.5px] text-slate-400">{modulosActivos.length}/14 seleccionados</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {modulosDisponibles.map((m) => {
                    const isActive = modulosActivos.includes(m.code);
                    return (
                      <button
                        key={m.code}
                        type="button"
                        disabled={m.isCore}
                        onClick={() => toggleModulo(m.code)}
                        title={m.isCore ? "Los módulos núcleo siempre quedan activos" : undefined}
                        className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                          isActive
                            ? "border-[#4F46E5] bg-[#4F46E5]/5"
                            : "border-slate-200 hover:border-slate-300 bg-slate-50"
                        }`}
                      >
                        <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${
                          isActive ? "bg-[#4F46E5]" : "bg-slate-200"
                        }`}>
                          {isActive && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <div>
                          <p className={`text-[12.5px] font-medium ${isActive ? "text-[#4F46E5]" : "text-slate-600"}`}>
                            {m.name}
                            {m.isCore && <span className="text-slate-400 font-normal"> · núcleo</span>}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="w-4 h-4 text-[#4F46E5]" />
                  <h2 className="text-[14.5px] font-medium text-slate-700">Esquema</h2>
                </div>
                {esquemas.length === 0 ? (
                  <p className="text-[12.5px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    Todavía no defines ningún esquema en /maestro/esquemas — este negocio se creará sin límite de
                    sucursales/personal hasta que le asignes uno.
                  </p>
                ) : (
                  <select
                    value={esquemaId}
                    onChange={(e) => setEsquemaId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[14.5px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                  >
                    <option value="">Sin esquema (sin límite)</option>
                    {esquemas.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} — {e.maxBranches} sucursal(es), {e.maxStaffPerBranch} personal c/u
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <h2 className="text-[14.5px] font-medium text-slate-700 mb-3">Periodo de prueba</h2>
                <div>
                  <label className="block text-[12.5px] font-medium text-slate-500 mb-1">Dias de prueba</label>
                  <select
                    value={trialDays}
                    onChange={(e) => setTrialDays(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[14.5px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]">
                    <option value={0}>Sin periodo de prueba</option>
                    <option value={7}>7 dias</option>
                    <option value={14}>14 dias</option>
                    <option value={30}>30 dias</option>
                  </select>
                </div>
              </div>

              <div className="bg-[#4F46E5]/5 border border-[#4F46E5]/20 rounded-lg p-4">
                <h2 className="text-[14.5px] font-medium text-[#4F46E5] mb-2">Resumen</h2>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[12.5px] text-slate-500">Esquema</span>
                    <span className="text-[12.5px] font-medium text-slate-700">{esquemaSeleccionado?.name ?? "Sin límite"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[12.5px] text-slate-500">Modulos</span>
                    <span className="text-[12.5px] font-medium text-slate-700">{modulosActivos.length}/14</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[12.5px] text-slate-500">Acceso</span>
                    <span className="text-[12.5px] font-medium text-emerald-600">Inmediato</span>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#4F46E5] hover:bg-[#4338CA] text-white font-medium py-2.5 rounded-lg text-[14.5px] transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : "Crear negocio y enviar invitacion"}
              </button>

              <Link href="/maestro/dashboard"
                className="w-full block text-center text-[13.5px] text-slate-400 hover:text-slate-600 transition-colors py-1">
                Cancelar
              </Link>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
