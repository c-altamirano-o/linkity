import type { Metadata } from "next";
import Link from "next/link";
import { 
  LayoutDashboard, Building2, Puzzle, CreditCard, 
  Users, Ticket, BarChart3, Settings, LogOut, Link as LinkIcon
} from "lucide-react";

export const metadata: Metadata = {
  title: "Panel Maestro — Linkity",
};

const navItems = [
  {
    section: "PRINCIPAL",
    items: [
      { label: "Dashboard", href: "/maestro/dashboard", icon: LayoutDashboard, badge: null },
      { label: "Negocios", href: "/maestro/tenants", icon: Building2, badge: "12" },
      { label: "Módulos", href: "/maestro/modulos", icon: Puzzle, badge: null },
      { label: "Suscripciones", href: "/maestro/suscripciones", icon: CreditCard, badge: "2", badgeColor: "red" },
    ]
  },
  {
    section: "GESTIÓN",
    items: [
      { label: "Usuarios", href: "/maestro/usuarios", icon: Users, badge: null },
      { label: "Soporte", href: "/maestro/soporte", icon: Ticket, badge: "3", badgeColor: "green" },
      { label: "Reportes", href: "/maestro/reportes", icon: BarChart3, badge: null },
    ]
  },
  {
    section: "SISTEMA",
    items: [
      { label: "Configuración", href: "/maestro/configuracion", icon: Settings, badge: null },
    ]
  }
];

export default function MaestroLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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