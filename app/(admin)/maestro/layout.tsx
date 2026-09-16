import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  LayoutDashboard, Building2, Puzzle, CreditCard,
  Users, Ticket, BarChart3, Settings, LogOut, Link as LinkIcon, ShieldAlert
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/maestro-auth";
import { prisma } from "@/lib/prisma";
import { getSuscripcionesData } from "@/lib/suscripciones-data";

export const metadata: Metadata = {
  title: "Panel Maestro — Linkity",
};

// Antes estos dos badges ("12" negocios, "2" suscripciones) eran números
// fijos en el mockup, sin conexión a datos reales. Ahora "Negocios" cuenta
// los tenants reales y "Suscripciones" cuenta cuántos necesitan atención
// de cobro (vencidas + por vencer en los próximos 7 días) — mismo criterio
// de no fabricar datos que se usó en el resto del Panel Maestro.
function buildNavItems(totalNegocios: number, alertaSuscripciones: number) {
  return [
    {
      section: "PRINCIPAL",
      items: [
        { label: "Dashboard", href: "/maestro/dashboard", icon: LayoutDashboard, badge: null as string | null, badgeColor: undefined as string | undefined },
        { label: "Negocios", href: "/maestro/tenants", icon: Building2, badge: String(totalNegocios), badgeColor: undefined as string | undefined },
        { label: "Módulos", href: "/maestro/modulos", icon: Puzzle, badge: null as string | null, badgeColor: undefined as string | undefined },
        {
          label: "Suscripciones",
          href: "/maestro/suscripciones",
          icon: CreditCard,
          badge: alertaSuscripciones > 0 ? String(alertaSuscripciones) : null,
          badgeColor: "red" as string | undefined,
        },
      ]
    },
    {
      section: "GESTIÓN",
      items: [
        { label: "Usuarios", href: "/maestro/usuarios", icon: Users, badge: null as string | null, badgeColor: undefined as string | undefined },
        { label: "Soporte", href: "/maestro/soporte", icon: Ticket, badge: "3", badgeColor: "green" as string | undefined },
        { label: "Reportes", href: "/maestro/reportes", icon: BarChart3, badge: null as string | null, badgeColor: undefined as string | undefined },
      ]
    },
    {
      section: "SISTEMA",
      items: [
        { label: "Configuración", href: "/maestro/configuracion", icon: Settings, badge: null as string | null, badgeColor: undefined as string | undefined },
      ]
    }
  ];
}

export default async function MaestroLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Sin sesión: manda a iniciar sesión (login/page.tsx ya sabe mandar a un
  // superadmin a /maestro/dashboard en cuanto entra, ver isSuperAdminBySupabaseId
  // en app/(auth)/login/actions.ts). Con sesión pero sin fila en SuperAdmin:
  // se queda logueado en su cuenta normal, pero ve un "acceso no
  // autorizado" en vez del panel — así se evita el loop confuso de
  // mandarlo de vuelta a /login estando ya autenticado.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const resuelto = await requireSuperAdmin();

  if (!resuelto.ok) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 p-4">
        <div className="bg-white border border-slate-200 rounded-lg p-8 max-w-sm text-center">
          <ShieldAlert className="w-8 h-8 text-red-500 mx-auto mb-3" />
          <p className="text-[14px] font-medium text-slate-800 mb-1">Acceso no autorizado</p>
          <p className="text-[12px] text-slate-500 mb-4">
            Tu cuenta ({user.email}) no tiene permisos de administrador de Panel Maestro.
          </p>
          <Link href="/login" className="text-[12px] text-[#4F46E5] font-medium hover:underline">
            Volver al inicio de sesión
          </Link>
        </div>
      </div>
    );
  }

  // Badges reales del sidebar (antes eran números fijos en el mockup):
  // "Negocios" = total de tenants; "Suscripciones" = cuántos requieren
  // atención de cobro ahora mismo (ya vencidos + por vencer en ≤7 días).
  const [totalNegocios, suscripciones] = await Promise.all([
    prisma.tenant.count(),
    getSuscripcionesData(),
  ]);
  const alertaSuscripciones = suscripciones.resumen.vencidas + suscripciones.resumen.porVencerPronto;
  const navItems = buildNavItems(totalNegocios, alertaSuscripciones);

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">

      {/* Sidebar */}
      <aside className="w-52 bg-[#0F172A] flex flex-col flex-shrink-0">

        {/* Logo */}
        <div className="flex items-center gap-2 px-3.5 py-4 border-b border-white/8">
          <div className="w-7 h-7 bg-[#4F46E5] rounded-md flex items-center justify-center flex-shrink-0">
            <LinkIcon className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="text-white text-[13px] font-medium leading-none">Linkity</p>
            <p className="text-[#4F46E5] text-[9px] font-semibold tracking-widest mt-0.5">PANEL MAESTRO</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          {navItems.map((group) => (
            <div key={group.section}>
              <p className="px-3.5 pt-3 pb-1 text-[9px] font-semibold tracking-widest text-white/30">
                {group.section}
              </p>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2 mx-1.5 px-2.5 py-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/5 transition-colors text-[12px] group"
                >
                  <item.icon className="w-3.5 h-3.5 text-white/30 group-hover:text-[#4F46E5] transition-colors" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className={`text-white text-[9px] px-1.5 py-0.5 rounded-full font-medium
                      ${item.badgeColor === "red" ? "bg-red-500" : 
                        item.badgeColor === "green" ? "bg-emerald-500" : "bg-[#4F46E5]"}`}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/8 p-2">
          <button className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors text-[11px]">
            <LogOut className="w-3.5 h-3.5" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>

    </div>
  );
}