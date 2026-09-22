"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import type { ModuloKey } from "@/lib/roles";
import { label, DEFAULT_LABELS, type LabelDictionary } from "@/lib/labels";
import { cerrarSesionPersonalAction } from "@/app/actions/acceso-personal-actions";
import {
  LayoutDashboard, ShoppingCart, Wrench, Users, Package,
  Warehouse, DollarSign, UserCog, BarChart3, FileText,
  GitBranch, BookOpen, LogOut, Bell, ChevronDown, Settings,
  Menu, X, ChevronLeft, ChevronRight, LifeBuoy, CalendarCheck, CalendarDays
} from "lucide-react";

// Estructura fija (secciones, orden, ícono) — el NOMBRE de cada ítem ya no
// se escribe aquí a mano: sale del diccionario de labels (lib/labels.ts),
// resuelto por rubro/tenant en el layout del tenant y pasado como prop, así
// "Reparaciones" puede convertirse en "Órdenes de Servicio" para un taller
// automotriz sin tocar este archivo (ver labelKey de cada ítem, abajo).
const NAV_STRUCTURE: { section: string; items: { labelKey: string; href: ModuloKey; icon: typeof LayoutDashboard }[] }[] = [
  {
    section: "PRINCIPAL",
    items: [
      { labelKey: "module.dashboard.name", href: "dashboard", icon: LayoutDashboard },
      { labelKey: "module.pos.name", href: "pos", icon: ShoppingCart },
      { labelKey: "module.appointments.name", href: "citas", icon: CalendarDays },
      { labelKey: "module.repair.name", href: "reparaciones", icon: Wrench },
      // "taller" (2026-09-21) — la vista angosta de Reparaciones para el
      // técnico (ver el comentario de "taller" en lib/roles.ts). Mismo
      // labelKey que "reparaciones" a propósito: un rol nunca tiene los dos
      // módulos a la vez en la práctica (el catálogo por rubro reparte uno u
      // otro), así que desde la barra lateral se ve igual — "Reparaciones"
      // (u "Órdenes de Servicio" para un taller automotriz) — apuntando a la
      // página que le corresponde a cada quien.
      { labelKey: "module.repair.name", href: "taller", icon: Wrench },
      // "aduana" (2026-09-22, corrección explícita de Carlos) — Recepción/
      // Aduana del taller central: asigna técnico, cambia estatus y ajusta
      // costo/piezas. Mismo labelKey que "reparaciones"/"taller" por el
      // mismo motivo (un rol nunca tiene más de uno de los tres a la vez).
      { labelKey: "module.repair.name", href: "aduana", icon: Wrench },
    ]
  },
  {
    section: "GESTIÓN",
    items: [
      { labelKey: "module.customers.name", href: "clientes", icon: Users },
      { labelKey: "module.catalog.name", href: "catalogo", icon: BookOpen },
      { labelKey: "module.inventory.name", href: "inventario", icon: Warehouse },
      { labelKey: "module.purchases.name", href: "compras", icon: Package },
    ]
  },
  {
    section: "OPERACIÓN",
    items: [
      { labelKey: "module.cash.name", href: "caja", icon: DollarSign },
      { labelKey: "module.staff.name", href: "personal", icon: UserCog },
      // Exclusivo del administrador (ningún rol de PIN lo ofrece como
      // casilla en "Roles y permisos" — ver RolesManager.tsx) — igual que
      // "Personal" ya lo era en la práctica, aquí queda explícito: staff
      // nunca ve este link porque modo==="staff" filtra navItems contra el
      // prop modulosPermitidos (ya resuelto en el servidor).
      { labelKey: "module.attendance.name", href: "asistencia", icon: CalendarCheck },
      { labelKey: "module.branches.name", href: "sucursales", icon: GitBranch },
    ]
  },
  {
    section: "REPORTES",
    items: [
      { labelKey: "module.reports.name", href: "reportes", icon: BarChart3 },
      { labelKey: "module.invoicing.name", href: "facturacion", icon: FileText },
    ]
  },
  {
    section: "AYUDA",
    items: [
      { labelKey: "module.support.name", href: "soporte", icon: LifeBuoy },
    ]
  }
];

export default function TenantShell({
  children,
  tenant,
  userName = "Usuario",
  userRole = "",
  modo = "admin",
  modulosPermitidos = null,
  labels = DEFAULT_LABELS,
  modulosInactivos = [],
  logoUrl = null,
}: {
  children: React.ReactNode;
  tenant: string;
  userName?: string;
  userRole?: string;
  // "admin" = cuenta real (Supabase Auth, dueño/gerente) — ve todo el menú,
  // sin cambios respecto al comportamiento de siempre. "staff" = sesión de
  // PIN de personal (M11) — el menú se filtra a los módulos que su rol
  // tiene permitido (lib/roles.ts) y "Cerrar sesión" cierra esa sesión de
  // PIN en vez de la de Supabase Auth (que ni siquiera tiene).
  modo?: "admin" | "staff";
  // Módulos que la sesión de PIN actual tiene permitido (ya resuelto en el
  // servidor por lib/roles-server.ts a partir del Role personalizable del
  // empleado — ver el comentario largo ahí). null en modo "admin" (sin
  // restricción, ve todo el menú); en modo "staff" siempre viene como
  // arreglo (puede estar vacío, aunque roles-server.ts ya garantiza que al
  // menos incluya "dashboard").
  modulosPermitidos?: ModuloKey[] | null;
  // Diccionario ya resuelto (rubro + overrides del tenant) para los
  // nombres de módulo del menú — lib/labels.ts. Default genérico por si
  // algún caller viejo no lo pasa todavía.
  labels?: LabelDictionary;
  // Códigos de módulo (mismas claves que ModuloKey) que este negocio tiene
  // desactivados — personalización por rubro (2026-09-17). "Ausente de
  // esta lista" = activo, tanto para el módulo recién agregado a la BD
  // como para uno que un negocio nunca desactivó, así que ningún tenant ya
  // en producción antes de este cambio pierde un link de golpe.
  modulosInactivos?: string[];
  // Logo propio del negocio (2026-09-17) — el de Linkity en el sidebar de
  // arriba NUNCA se reemplaza (esa es la marca de la plataforma, igual para
  // todos los tenants); este es un logo aparte, distinto por negocio, que
  // se muestra en el área del encabezado superior que antes quedaba vacía
  // en pantallas grandes (a la izquierda, junto a la campana/usuario) —
  // null mientras el negocio no haya subido uno (app/actions/logo-actions.ts).
  logoUrl?: string | null;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  // Menú de usuario y notificaciones del encabezado (2026-09-21, a petición
  // de Carlos: "tanto el nombre del usuario como las opciones solo estan
  // simuladas... y al hacer click no hace nada, tambien muestra una flecha
  // para abrir un menu y no abre nada") — antes ninguno de los dos tenía
  // onClick. La campana a propósito NO abre un sistema de notificaciones
  // real (no existe todavía ningún generador de notificaciones en el
  // proyecto) — solo dice honestamente que no hay nada nuevo, en vez de
  // seguir mostrando un punto rojo que no corresponde a nada real.
  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);
  const [menuNotifAbierto, setMenuNotifAbierto] = useState(false);
  const menuUsuarioRef = useRef<HTMLDivElement>(null);
  const menuNotifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickFuera = (e: MouseEvent) => {
      if (menuUsuarioRef.current && !menuUsuarioRef.current.contains(e.target as Node)) setMenuUsuarioAbierto(false);
      if (menuNotifRef.current && !menuNotifRef.current.contains(e.target as Node)) setMenuNotifAbierto(false);
    };
    document.addEventListener("mousedown", handleClickFuera);
    return () => document.removeEventListener("mousedown", handleClickFuera);
  }, []);

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

  const modulosInactivosSet = new Set(modulosInactivos);

  // "taller" y "aduana" (2026-09-21/22) son vistas angostas de Reparaciones
  // pensadas para un rol de PIN específico (el técnico solo ve lo suyo en
  // "taller"; recepción asigna técnico/costo en "aduana") — nunca para el
  // dueño/gerente, que ya tiene todo eso y más en "Reparaciones" completo.
  // Como comparten labelKey con "reparaciones" a propósito (ver
  // NAV_STRUCTURE arriba), sin este filtro el modo "admin" (que no filtra
  // por permisos, ve TODO lo que esté activo) terminaba mostrando 2-3
  // enlaces "Reparaciones" idénticos apuntando a páginas distintas — bug
  // que Carlos reportó ("existen 2 módulos llamado Reparaciones"). En modo
  // "staff" no hace falta excluirlos aquí: modulosPermitidos ya garantiza
  // que un rol nunca tiene más de uno de los tres a la vez.
  const OCULTOS_PARA_ADMIN = new Set(["taller", "aduana"]);

  // Primero se resuelve el nombre visible de cada ítem contra el
  // diccionario de labels (rubro + overrides del tenant), luego se filtra
  // por tres criterios independientes: (1) el módulo está desactivado para
  // ESTE negocio (personalización por rubro, aplica igual a admin y
  // staff), (2) en modo "staff", el rol de ese empleado no tiene permitido
  // ese módulo (lib/roles.ts) — se descarta el grupo completo si queda
  // vacío (ej. Cajero no ve nada de "GESTIÓN" — ese encabezado tampoco debe
  // aparecer) — y (3) en modo "admin", las vistas angostas de Reparaciones
  // (ver OCULTOS_PARA_ADMIN arriba) nunca aparecen duplicadas junto al
  // "Reparaciones" completo.
  const gruposVisibles = NAV_STRUCTURE
    .map((grupo) => ({
      section: grupo.section,
      items: grupo.items
        .filter((item) => !modulosInactivosSet.has(item.href))
        .filter((item) => modo !== "staff" || (modulosPermitidos?.includes(item.href) ?? false))
        .filter((item) => modo !== "admin" || !OCULTOS_PARA_ADMIN.has(item.href))
        .map((item) => ({ ...item, label: label(labels, item.labelKey) })),
    }))
    .filter((grupo) => grupo.items.length > 0);

  const handleSignOut = async () => {
    if (modo === "staff") {
      await cerrarSesionPersonalAction();
      window.location.href = `/entrada/${tenant}`;
      return;
    }
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
                <p className="text-[11.5px] text-sidebar-foreground/50">by Linkity Soluciones</p>
                <Image src="/images/favicon.svg" alt="Linkity" width={12} height={12} className="opacity-40" />
              </div>
            </>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-1.5">
          {gruposVisibles.map((group) => (
            <div key={group.section} className="mb-2">
              {collapsed
                ? <div className="my-2 border-t border-sidebar-border" />
                : <p className="px-2 pt-2 pb-1 text-[11.5px] font-semibold tracking-widest text-sidebar-foreground/50">{group.section}</p>
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
                <p className="text-[11.5px] text-sidebar-foreground/60">{userRole || "Administrador"}</p>
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
            {!collapsed && <span>{modo === "staff" ? "Cambiar de usuario" : "Cerrar sesión"}</span>}
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
          <div className="flex items-center gap-2">
            <button
              className="lg:hidden p-1.5 rounded-lg hover:bg-muted transition-colors"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-5 h-5 text-muted-foreground" />
            </button>

            {/* Marca de Linkity, discreta, SOLO en mobile (lg:hidden) — en
                mobile el sidebar (donde vive el logo real de Linkity) queda
                fuera de pantalla hasta que se abre el menú, así que sin esto
                la marca de la plataforma no se ve nunca ahí. Mismo ícono y
                opacidad que ya se usa junto a "by Linkity Soluciones" en el
                pie del sidebar expandido — pensado para verse bien de
                tamaño chico, nunca compite con el logo/nombre del negocio
                de al lado. */}
            <Image
              src="/images/favicon.svg"
              alt="Linkity"
              width={14}
              height={14}
              className="lg:hidden opacity-40 flex-shrink-0"
            />

            {/* Identidad del negocio en mobile: su logo si ya subió uno
                (mismo criterio que el logo de escritorio, más abajo), o el
                nombre en texto mientras tanto — nunca los dos a la vez, para
                no competir por el mismo espacio angosto. */}
            {logoUrl ? (
              <div className="lg:hidden flex items-center h-7 max-w-[140px] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- logo subido por el negocio, dominio/tamaño no se conocen de antemano */}
                <img
                  src={logoUrl}
                  alt={`Logo de ${businessName}`}
                  className="max-h-7 max-w-full w-auto object-contain"
                />
              </div>
            ) : (
              <span className="lg:hidden text-sm font-semibold text-foreground truncate max-w-[140px]">
                {businessName}
              </span>
            )}

            {/* Logo propio del negocio en escritorio — área que antes
                quedaba vacía (ver comentario de logoUrl en las props). */}
            {logoUrl && (
              <div className="hidden lg:flex items-center h-9 max-w-[220px] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- logo subido por el negocio, dominio/tamaño no se conocen de antemano */}
                <img
                  src={logoUrl}
                  alt={`Logo de ${businessName}`}
                  className="max-h-9 max-w-full w-auto object-contain"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative" ref={menuNotifRef}>
              <button onClick={() => setMenuNotifAbierto((v) => !v)} className="relative p-2 rounded-lg hover:bg-muted transition-colors">
                <Bell className="w-4 h-4 text-muted-foreground" />
              </button>
              {menuNotifAbierto && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-card border border-border rounded-xl shadow-lg z-30 overflow-hidden">
                  <p className="px-3 py-2 text-xs font-semibold text-foreground border-b border-border">Notificaciones</p>
                  <p className="px-3 py-4 text-xs text-muted-foreground text-center">No tienes notificaciones nuevas por ahora.</p>
                </div>
              )}
            </div>
            <div className="relative pl-2 border-l border-border" ref={menuUsuarioRef}>
              <button
                onClick={() => setMenuUsuarioAbierto((v) => !v)}
                className="flex items-center gap-2 py-1 pr-1 rounded-lg hover:bg-muted transition-colors cursor-pointer"
              >
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-medium">
                  {initials}
                </div>
                <span className="hidden sm:block text-sm text-muted-foreground">{userName}</span>
                <ChevronDown className={`hidden sm:block w-3 h-3 text-muted-foreground transition-transform ${menuUsuarioAbierto ? "rotate-180" : ""}`} />
              </button>
              {menuUsuarioAbierto && (
                <div className="absolute right-0 top-full mt-1.5 w-56 bg-card border border-border rounded-xl shadow-lg z-30 overflow-hidden">
                  <div className="px-3 py-2.5 border-b border-border">
                    <p className="text-xs font-medium text-foreground truncate">{userName}</p>
                    <p className="text-[11.5px] text-muted-foreground truncate">{userRole || "Administrador"}</p>
                  </div>
                  {/* "Configuración" (subir logo del negocio, elegir tema,
                      etc.) — ya existe completa en ConfiguracionClient.tsx,
                      solo faltaba un acceso real desde aquí. Exclusiva del
                      administrador (ningún rol de PIN la tiene permitida,
                      ver RolesManager.tsx), así que en modo "staff" ni se
                      ofrece — llevaría a un redirect inmediato. */}
                  {modo === "admin" && (
                    <Link
                      href={`/${tenant}/configuracion`}
                      onClick={() => setMenuUsuarioAbierto(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Settings className="w-3.5 h-3.5 text-muted-foreground" /> Configuración
                    </Link>
                  )}
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5 text-muted-foreground" /> {modo === "staff" ? "Cambiar de usuario" : "Cerrar sesión"}
                  </button>
                </div>
              )}
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
