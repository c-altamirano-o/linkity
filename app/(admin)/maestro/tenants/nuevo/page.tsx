"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, User, Mail, Phone, MapPin, Package, Check } from "lucide-react";

const modulosDisponibles = [
  { code: "M1", name: "Acceso Universal", desc: "Acceso desde cualquier dispositivo" },
  { code: "M2", name: "Bóveda de Datos", desc: "Aislamiento multi-tenant" },
  { code: "M3", name: "Login Seguro", desc: "Autenticación de usuarios" },
  { code: "M4", name: "Permisos", desc: "Roles y permisos granulares" },
  { code: "M5", name: "Multi-Sucursal", desc: "Gestión de múltiples locales" },
  { code: "M6", name: "Catálogo", desc: "Productos, refacciones y servicios" },
  { code: "M7", name: "Clientes", desc: "Fidelización y garantías" },
  { code: "M8", name: "Punto de Venta", desc: "POS ultra rápido" },
  { code: "M9", name: "Reparaciones", desc: "Taller con WhatsApp" },
  { code: "M10", name: "Control de Caja", desc: "Caja blindada" },
  { code: "M11", name: "Personal", desc: "Empleados y comisiones" },
  { code: "M12", name: "Inventario", desc: "Logística y almacén" },
  { code: "M13", name: "Dashboard", desc: "Métricas del negocio" },
  { code: "M14", name: "Facturación CFDI", desc: "Facturas electrónicas" },
];

const planes = ["Básico", "Pro", "Enterprise"];

export default function NuevoTenantPage() {
  const [modulosActivos, setModulosActivos] = useState<string[]>(["M1", "M2", "M3", "M4"]);
  const [plan, setPlan] = useState("Pro");
  const [loading, setLoading] = useState(false);

  const toggleModulo = (code: string) => {
    setModulosActivos(prev =>
      prev.includes(code) ? prev.filter(m => m !== code) : [...prev, code]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => setLoading(false), 1500);
  };

  return (
    <>
      {/* Topbar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3">
        <Link href="/maestro/dashboard" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-[15px] font-medium text-slate-800">Registrar nuevo negocio</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-3 gap-4">

            {/* Columna izquierda — datos del negocio */}
            <div className="col-span-2 space-y-4">

              {/* Datos del negocio */}
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-4 h-4 text-[#4F46E5]" />
                  <h2 className="text-[13px] font-medium text-slate-700">Datos del negocio</h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Nombre del negocio *</label>
                    <input type="text" placeholder="Ej. Cell Express Delicias" required
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">RFC</label>
                    <input type="text" placeholder="XAXX010101000"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Teléfono</label>
                    <input type="tel" placeholder="614 000 0000"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Ciudad</label>
                    <input type="text" placeholder="Cd. Delicias"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Estado</label>
                    <input type="text" placeholder="Chihuahua"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
                  </div>
                </div>
              </div>

              {/* Datos del dueño */}
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-4">
                  <User className="w-4 h-4 text-[#4F46E5]" />
                  <h2 className="text-[13px] font-medium text-slate-700">Datos del dueño</h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Nombre completo *</label>
                    <input type="text" placeholder="Juan Pérez García" required
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Correo electrónico *</label>
                    <input type="email" placeholder="juan@negocio.com" required
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Teléfono</label>
                    <input type="tel" placeholder="614 000 0000"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
                  </div>
                </div>
              </div>

              {/* Módulos */}
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Package className="w-4 h-4 text-[#4F46E5]" />
                  <h2 className="text-[13px] font-medium text-slate-700">Módulos activos</h2>
                  <span className="ml-auto text-[11px] text-slate-400">{modulosActivos.length}/14 seleccionados</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {modulosDisponibles.map((m) => {
                    const isActive = modulosActivos.includes(m.code);
                    return (
                      <button
                        key={m.code}
                        type="button"
                        onClick={() => toggleModulo(m.code)}
                        className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all ${
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
                          <p className={`text-[11px] font-medium ${isActive ? "text-[#4F46E5]" : "text-slate-600"}`}>
                            {m.code} — {m.name}
                          </p>
                          <p className="text-[10px] text-slate-400">{m.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Columna derecha — plan y acciones */}
            <div className="space-y-4">

              {/* Plan */}
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <h2 className="text-[13px] font-medium text-slate-700 mb-3">Plan de suscripción</h2>
                <div className="space-y-2">
                  {planes.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPlan(p)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-all ${
                        plan === p
                          ? "border-[#4F46E5] bg-[#4F46E5]/5"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <span className={`text-[12px] font-medium ${plan === p ? "text-[#4F46E5]" : "text-slate-600"}`}>
                        {p}
                      </span>
                      {plan === p && <Check className="w-3.5 h-3.5 text-[#4F46E5]" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Periodo de prueba */}
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <h2 className="text-[13px] font-medium text-slate-700 mb-3">Periodo de prueba</h2>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Días de prueba</label>
                  <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]">
                    <option>Sin periodo de prueba</option>
                    <option>7 días</option>
                    <option>14 días</option>
                    <option>30 días</option>
                  </select>
                </div>
              </div>

              {/* Resumen */}
              <div className="bg-[#4F46E5]/5 border border-[#4F46E5]/20 rounded-lg p-4">
                <h2 className="text-[13px] font-medium text-[#4F46E5] mb-2">Resumen</h2>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[11px] text-slate-500">Plan</span>
                    <span className="text-[11px] font-medium text-slate-700">{plan}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[11px] text-slate-500">Módulos</span>
                    <span className="text-[11px] font-medium text-slate-700">{modulosActivos.length}/14</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[11px] text-slate-500">Acceso</span>
                    <span className="text-[11px] font-medium text-emerald-600">Inmediato</span>
                  </div>
                </div>
              </div>

              {/* Botones */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#4F46E5] hover:bg-[#4338CA] text-white font-medium py-2.5 rounded-lg text-[13px] transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : "Crear negocio y enviar invitación"}
              </button>

              <Link href="/maestro/dashboard"
                className="w-full block text-center text-[12px] text-slate-400 hover:text-slate-600 transition-colors py-1">
                Cancelar
              </Link>

            </div>
          </div>
        </form>
      </div>
    </>
  );
}