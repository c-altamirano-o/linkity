"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
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
  userName = "Usuario",
  userRole = "",
}: {
  children: React.ReactNode;
  tenant: string;
  userName?: string;
  userRole?: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  const businessName = decodeURIComponent(tenant)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

  const initials = userName
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

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

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-50 lg:z-auto
        flex flex-col bg-sidebar border-r border-sidebar-border
        transition-all duration-300 ease-in-out flex-shrink-0
        ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        ${collapsed ? "lg:w-16" : "w-64 lg:w-56"}
      `}>

        <div className={`border-b border-sidebar-border ${collapsed ? "p-3" : "px-4 py-4"}`}>
          {collapsed ? (
            <div className="flex justify-center">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                <Image src="/images/logo-icon.png" alt="Logo" width={22} height={22} className="object-contain" />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 border border-primary/20">
                  <Image src="/images/logo-icon.png" alt="Logo" width={28} height={28} className="object-contain" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-sidebar-foreground leading-tight truncate">{businessName}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <p className="text-xs text-sidebar-foreground/60">Sistema activo</p>
                  </div>
                </div>
                <button
                  className="lg:hidden p-1 rounded-md hover:bg-sidebar-accent"
                  onClick={() => setMobileOpen(false)}
                >
                  <X className="w-4 h-4 text-sidebar-foreground/60" />
                </button>
              </div>
              <div className="mt-2 pt-2 border-t border-sidebar-border flex items-center justify-between">
                <p className="text-[10px] text-sidebar-foreground/50">by Linkity Soluciones</p>
                <Image src="/images/favicon.svg" alt="Linkity" width={12} height={12} className="opacity-40" />
              </div>
            </>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-1.5">
          {navItems.map((group) => (
            <div key={group.section} className="mb-2">
              {collapsed
                ? <div className="my-2 border-t border-sidebar-border" />
                : <p className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-widest text-sidebar-foreground/50">{group.section}</p>
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
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                      }
                    `}
                  >
                    <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-primary" : "text-sidebar-foreground/50"}`} />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-1.5">
          {!collapsed && (
            <div className="flex items-center gap-2 px-2 py-2 mb-1">
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-medium flex-shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground truncate">{userName}</p>
                <p className="text-[10px] text-sidebar-foreground/60">{userRole || "Administrador"}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className={`
              flex items-center gap-2 w-full px-2 py-2.5 rounded-lg
              text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors text-sm
              ${collapsed ? "justify-center" : ""}
            `}>
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </div>

        <button
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 bg-sidebar border border-sidebar-border rounded-full items-center justify-center shadow-sm hover:bg-sidebar-accent transition-colors z-10"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed
            ? <ChevronRight className="w-3 h-3 text-sidebar-foreground/60" />
            : <ChevronLeft className="w-3 h-3 text-sidebar-foreground/60" />
          }
        </button>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">

        <div className="bg-card border-b border-border px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-1.5 rounded-lg hover:bg-muted transition-colors"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-5 h-5 text-muted-foreground" />
            </button>
            <span className="lg:hidden text-sm font-semibold text-foreground truncate max-w-[160px]">
              {businessName}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button className="relative p-2 rounded-lg hover:bg-muted transition-colors">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-card" />
            </button>
            <div className="flex items-center gap-2 pl-2 border-l border-border cursor-pointer">
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-medium">
                {initials}
              </div>
              <span className="hidden sm:block text-sm text-muted-foreground">{userName}</span>
              <ChevronDown className="hidden sm:block w-3 h-3 text-muted-foreground" />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
