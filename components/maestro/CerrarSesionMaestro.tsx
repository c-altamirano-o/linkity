"use client";

import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Botón "Cerrar sesión" del sidebar de Panel Maestro (2026-09-22) — antes
 * era un <button> sin onClick, decorativo desde que se armó el layout, así
 * que nunca cerró nada. Mismo patrón que handleSignOut en
 * components/tenant/TenantShell.tsx para el modo "admin" (dueño/gerente):
 * cierra la sesión de Supabase Auth y manda a /login. Es un Client
 * Component aparte porque app/(admin)/maestro/layout.tsx es un Server
 * Component (necesita await requireSuperAdmin() y las consultas a Prisma
 * para los badges del sidebar) y no puede tener un onClick directamente.
 */
export function CerrarSesionMaestro() {
  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors text-[12.5px]"
    >
      <LogOut className="w-3.5 h-3.5" />
      <span>Cerrar sesión</span>
    </button>
  );
}
