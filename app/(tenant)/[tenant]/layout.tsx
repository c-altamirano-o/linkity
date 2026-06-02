import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard, ShoppingCart, Wrench, Users, Package,
  Warehouse, DollarSign, UserCog, BarChart3, FileText,
  GitBranch, BookOpen, LogOut, Bell, ChevronDown
} from "lucide-react";

export const metadata: Metadata = {
  title: "Linkity",
};

const navItems = [
  {
    section: "PRINCIPAL",
    items: [
      { label: "Dashboard", href: "dashboard", icon: LayoutDashboard },
      { label: "Punto de Venta", href: "pos", icon: ShoppingCart },
      { label: "Reparaciones", href: "reparaciones", icon: Wrench },
    ]
  },
  {
    section: "GESTIÓN",
    items: [
      { label: "Clientes", href: "clientes", icon: Users },
      { label: "Catálogo", href: "catalogo", icon: BookOpen },
      { label: "Inventario", href: "inventario", icon: Warehouse },
      { label: "Compras", href: "compras", icon: Package },
    ]
  },
  {
    section: "OPERACIÓN",
    items: [
      { label: "Caja", href: "caja", icon: DollarSign },
      { label: "Personal", href: "personal", icon: UserCog },
      { label: "Sucursales", href: "sucursales", icon: GitBranch },
    ]
  },
  {
    section: "REPORTES",
    items: [
      { label: "Reportes", href: "reportes", icon: BarChart3 },
      { label: "Facturación", href: "facturacion", icon: FileText },
    ]
  }
];

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;

  const businessName = decodeURIComponent(tenant)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">

      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-slate-200 flex flex-col flex-shrink-0">

        {/* Logo y nombre del negocio */}
        <div className="px-4 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-[#4F46E5]/10 flex items-center justify-center flex-shrink-0 overflow-hidden border border-[#4F46E5]/20">
              <Image
                src="/images/logo-icon.png"
                alt="Logo"
                width={30}
                height={30}
                className="object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-slate-800 leading-tight truncate">
                {businessName}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></div>
                <p className="text-[10px] text-slate-400">Sistema activo</p>
              </div>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
            <p className="text-[10px] text-slate-400">by Linkity Solutions</p>
            <Image
              src="/images/favicon.svg"
              alt="Linkity"
              width={14}
              height={14}
              className="object-contain opacity-40"
            />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          {navItems.map((group) => (
            <div key={group.section}>
              <p className="px-4 pt-3 pb-1 text-[9px] font-semibold tracking-widest text-slate-400">
                {group.section}
              </p>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={`/${tenant}/${item.href}`}
                  className="flex items-center gap-2.5 mx-2 px-2.5 py-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors text-[12px] group"
                >
                  <item.icon className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#4F46E5] transition-colors" />
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-100 p-2">
          <button className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors text-[11px]">
            <LogOut className="w-3.5 h-3.5" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Topbar */}
        <div className="bg-white border-b border-slate-200 px-5 py-2.5 flex items-center justify-between">
          <div />
          <div className="flex items-center gap-3">
            <button className="relative text-slate-400 hover:text-slate-600 transition-colors">
              <Bell className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full text-white text-[8px] flex items-center justify-center font-medium">3</span>
            </button>
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="w-7 h-7 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-[11px] font-medium">
                J
              </div>
              <span className="text-[12px] text-slate-600">Juan Pérez</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </div>
          </div>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>

      </main>
    </div>
  );
}