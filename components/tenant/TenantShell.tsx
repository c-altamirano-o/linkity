"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  LayoutDashboard, ShoppingCart, Wrench, Users, Package,
  Warehouse, DollarSign, UserCog, BarChart3, FileText,
  GitBranch, BookOpen, LogOut, Bell, ChevronDown,
  Menu, X, ChevronLeft, ChevronRight
} from "lucide-react";

const navItems = [
  {
    section: "PRINCIPAL",
    items: [
      { label: "Inicio", href: "dashboard", icon: LayoutDashboard },
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

export default function TenantShell({
  children,
  tenant,
}: {
  children: React.ReactNode;
  tenant: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  const businessName = decodeURIComponent(tenant)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setMobileOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isActive = (href: string) => pathname.includes(href);

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">

      {/* Overlay móvil */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-50 lg:z-auto
        flex flex-col bg-white border-r border-slate-200
        transition-all duration-300 ease-in-out flex-shrink-0
        ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        ${collapsed ? "lg:w-16" : "w-64 lg:w-56"}
      `}>

        {/* Logo */}
        <div className={`border-b border-slate-100 ${collapsed ? "p-3" : "px-4 py-4"}`}>
          {collapsed ? (
            <div className="flex justify-center">
              <div className="w-8 h-8 rounded-lg bg-[#4F46E5]/10 flex items-center justify-center border border-[#4F46E5]/20">
                <Image src="/images/logo-icon.png" alt="Logo" width={22} height={22} className="object-contain" />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-[#4F46E5]/10 flex items-center justify-center flex-shrink-0 border border-[#4F46E5]/20">
                  <Image src="/images/logo-icon.png" alt="Logo" width={28} height={28} className="object-contain" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800 leading-tight truncate">{businessName}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <p className="text-xs text-slate-400">Sistema activo</p>
                  </div>
                </div>
                <button
                  className="lg:hidden p-1 rounded-md hover:bg-slate-100"
                  onClick={() => setMobileOpen(false)}
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                <p className="text-[10px] text-slate-400">by Linkity Solutions</p>
                <Image src="/images/favicon.svg" alt="Linkity" width={12} height={12} className="opacity-40" />
              </div>
            </>
          )}
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto py-2 px-1.5">
          {navItems.map((group) => (
            <div key={group.section} className="mb-2">
              {collapsed
                ? <div className="my-2 border-t border-slate-100" />
                : <p className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-widest text-slate-400">{group.section}</p>
              }
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={`/${tenant}/${item.href}`}
                    title={collapsed ? item.label : undefined}
                    className={`
                      flex items-center gap-2.5 px-2 py-2.5 rounded-lg mb-0.5 transition-colors text-sm
                      ${collapsed ? "justify-center" : ""}
                      ${active
                        ? "bg-[#4F46E5]/10 text-[#4F46E5] font-medium"
                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                      }
                    `}
                  >
                    <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-[#4F46E5]" : "text-slate-400"}`} />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer sidebar */}
        <div className="border-t border-slate-100 p-1.5">
          {!collapsed && (
            <div className="flex items-center gap-2 px-2 py-2 mb-1">
              <div className="w-7 h-7 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                JP
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">Juan Pérez</p>
                <p className="text-[10px] text-slate-400">Administrador</p>
              </div>
            </div>
          )}
          <button className={`
            flex items-center gap-2 w-full px-2 py-2.5 rounded-lg
            text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors text-sm
            ${collapsed ? "justify-center" : ""}
          `}>
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </div>

        {/* Botón colapsar — solo desktop */}
        <button
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 bg-white border border-slate-200 rounded-full items-center justify-center shadow-sm hover:bg-slate-50 transition-colors z-10"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed
            ? <ChevronRight className="w-3 h-3 text-slate-400" />
            : <ChevronLeft className="w-3 h-3 text-slate-400" />
          }
        </button>
      </aside>

      {/* Contenido principal */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Topbar */}
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-5 h-5 text-slate-500" />
            </button>
            <span className="lg:hidden text-sm font-semibold text-slate-700 truncate max-w-[160px]">
              {businessName}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors">
              <Bell className="w-4 h-4 text-slate-500" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white" />
            </button>
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 cursor-pointer">
              <div className="w-7 h-7 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-xs font-medium">
                JP
              </div>
              <span className="hidden sm:block text-sm text-slate-600">Juan Pérez</span>
              <ChevronDown className="hidden sm:block w-3 h-3 text-slate-400" />
            </div>
          </div>
        </div>

        {/* Contenido de la página */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}