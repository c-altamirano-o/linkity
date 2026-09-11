"use client";

import Link from "next/link";
import { Palette, UserCog, ArrowRight, PartyPopper, LayoutDashboard } from "lucide-react";

/**
 * Landing de onboarding que ve un negocio recién auto-registrado justo
 * después de definir su propia contraseña en /primer-acceso.
 *
 * A propósito solo enlaza a pantallas que YA existen y funcionan
 * (Configuración para tema/rubro, Personal para dar de alta empleados).
 * No se fabricaron tarjetas de "roles" ni "módulos" porque todavía no hay
 * una UI real de gestión para ninguno de los dos: los módulos ya vienen
 * todos activos por defecto para negocios auto-registrados (sin toggle
 * para desactivarlos) y la gestión de permisos por rol (M4) nunca se
 * construyó como pantalla — Carlos está al tanto de este límite.
 */
export default function BienvenidaClient({
  tenantSlug,
  businessName,
}: {
  tenantSlug: string;
  businessName: string;
}) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="text-center mb-10">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <PartyPopper className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">¡Bienvenido, {businessName}!</h1>
        <p className="text-muted-foreground text-sm mt-1.5">
          Tu negocio ya está activo. Estos dos pasos te toman un minuto y te dejan todo listo.
        </p>
      </div>

      <div className="space-y-3 mb-8">
        <Link
          href={`/${tenantSlug}/configuracion`}
          className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors group"
        >
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Palette className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Personaliza tu negocio</p>
            <p className="text-xs text-muted-foreground">Elige el tema de color y confirma tu giro</p>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
        </Link>

        <Link
          href={`/${tenantSlug}/personal`}
          className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors group"
        >
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <UserCog className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Da de alta a tu equipo</p>
            <p className="text-xs text-muted-foreground">Agrega a tus empleados para que puedan entrar</p>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
        </Link>
      </div>

      <div className="bg-muted/50 border border-border rounded-lg px-4 py-3 text-xs text-muted-foreground mb-8">
        Por ahora todos los módulos del sistema están activos para tu negocio y no hay una pantalla para
        personalizar permisos por rol todavía — cualquier empleado que agregues tiene el mismo nivel de acceso
        que tú. Si necesitas restringir accesos, coméntalo con tu proveedor.
      </div>

      <Link
        href={`/${tenantSlug}/dashboard`}
        className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-lg text-sm transition-all"
      >
        <LayoutDashboard className="w-4 h-4" />
        Ir a mi dashboard
      </Link>
    </div>
  );
}
