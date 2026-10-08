"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Palette, UserCog, ArrowRight, PartyPopper, LayoutDashboard,
  BookOpen, DollarSign, ShoppingCart, CheckCircle2,
  Sparkles, Loader2,
} from "lucide-react";
import { cargarCatalogoArranqueAction } from "@/app/actions/catalogo-actions";

/**
 * Landing de onboarding que ve un negocio recién auto-registrado justo
 * después de definir su propia contraseña en /primer-acceso.
 *
 * Checklist de 5 pasos calculados a partir de datos reales del negocio
 * (nunca una bandera fabricada): cada "done" viene de un conteo real que
 * el server component (page.tsx) ya trajo con Prisma. Como esta pantalla
 * es de un solo uso (nadie vuelve aquí después del primer día), el estado
 * de "Saltar por ahora" vive solo en memoria del cliente — no hay columna
 * en BD para persistirlo, y no hace falta: si el negocio abandona la
 * página y regresa, simplemente vuelve a ver los pasos pendientes según
 * los datos reales, que es lo correcto.
 *
 * A propósito solo enlaza a pantallas que YA existen y funcionan. No se
 * fabricaron tarjetas de "roles" ni "módulos" porque todavía no hay una UI
 * real de gestión para ninguno de los dos: los módulos ya vienen todos
 * activos por defecto para negocios auto-registrados (sin toggle para
 * desactivarlos) y la gestión de permisos por rol (M4) nunca se construyó
 * como pantalla.
 *
 * 2026-10-08, regla de Carlos: un negocio tiene UNA sola cuenta real (la del
 * dueño/administrador). Los empleados NO se invitan por correo: el
 * administrador los da de alta en Personal con nombre, puesto, rol y PIN. Por
 * eso el paso "Equipo" ya no tiene formulario aquí, solo lleva a Personal.
 */

interface BienvenidaClientProps {
  tenantSlug: string;
  businessName: string;
  personalizado: boolean;
  tieneCatalogo: boolean;
  tieneArranque: boolean;
  tieneEquipo: boolean;
  tieneCaja: boolean;
  tieneVenta: boolean;
}

export default function BienvenidaClient({
  tenantSlug,
  businessName,
  personalizado,
  tieneCatalogo,
  tieneArranque,
  tieneEquipo,
  tieneCaja,
  tieneVenta,
}: BienvenidaClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [omitidos, setOmitidos] = useState<Set<string>>(new Set());

  const omitir = (id: string) => setOmitidos((prev) => new Set(prev).add(id));
  const deshacerOmitir = (id: string) =>
    setOmitidos((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  // ── Paso "Catálogo": carga rápida del catálogo de arranque ──────
  const [cargandoArranque, setCargandoArranque] = useState(false);
  const [errorArranque, setErrorArranque] = useState<string | null>(null);

  function cargarArranque() {
    setErrorArranque(null);
    setCargandoArranque(true);
    startTransition(async () => {
      const res = await cargarCatalogoArranqueAction({ tenantSlug });
      setCargandoArranque(false);
      if (!res.ok) {
        setErrorArranque(res.error);
        return;
      }
      router.refresh();
    });
  }

  const pasos = [
    { id: "personalizacion", done: personalizado },
    { id: "catalogo", done: tieneCatalogo },
    { id: "equipo", done: tieneEquipo },
    { id: "caja", done: tieneCaja },
    { id: "venta", done: tieneVenta },
  ];
  const completados = pasos.filter((p) => p.done).length;
  const totalPasos = pasos.length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <PartyPopper className="w-7 h-7 text-primary-text" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">¡Bienvenido, {businessName}!</h1>
        <p className="text-muted-foreground text-sm mt-1.5">
          Completa estos pasos para dejar tu negocio listo para vender. Puedes saltarte cualquiera y volver
          después desde el menú.
        </p>
        <p className="text-xs font-medium text-primary-text mt-2">{completados} de {totalPasos} completados</p>
      </div>

      <div className="space-y-3 mb-8">

        {/* 1. Personalización */}
        <PasoShell
          numero={1}
          icon={Palette}
          titulo="Personaliza tu negocio"
          descripcion="Elige el tema de color y confirma tu giro"
          done={personalizado}
          omitido={omitidos.has("personalizacion")}
          onOmitir={() => omitir("personalizacion")}
          onDeshacerOmitir={() => deshacerOmitir("personalizacion")}
        >
          <Link
            href={`/${tenantSlug}/configuracion`}
            className="flex items-center gap-1.5 text-xs font-medium text-primary-text hover:underline flex-shrink-0"
          >
            Ir a Configuración <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </PasoShell>

        {/* 2. Catálogo */}
        <PasoShell
          numero={2}
          icon={BookOpen}
          titulo="Arma tu catálogo"
          descripcion="Agrega tus productos, refacciones o servicios"
          done={tieneCatalogo}
          omitido={omitidos.has("catalogo")}
          onOmitir={() => omitir("catalogo")}
          onDeshacerOmitir={() => deshacerOmitir("catalogo")}
        >
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-3 flex-shrink-0">
              {tieneArranque && !tieneCatalogo && (
                <button
                  onClick={cargarArranque}
                  disabled={cargandoArranque}
                  className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:underline disabled:opacity-60"
                >
                  {cargandoArranque ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {cargandoArranque ? "Cargando…" : "Cargar catálogo de ejemplo"}
                </button>
              )}
              <Link
                href={`/${tenantSlug}/catalogo`}
                className="flex items-center gap-1.5 text-xs font-medium text-primary-text hover:underline"
              >
                Ir a Catálogo <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            {errorArranque && <p className="text-[11.5px] text-red-600 max-w-[220px] text-right">{errorArranque}</p>}
          </div>
        </PasoShell>

        {/* 3. Equipo */}
        <PasoShell
          numero={3}
          icon={UserCog}
          titulo="Da de alta a tu equipo"
          descripcion="Registra a tus empleados con su puesto, rol y un PIN para entrar"
          done={tieneEquipo}
          omitido={omitidos.has("equipo")}
          onOmitir={() => omitir("equipo")}
          onDeshacerOmitir={() => deshacerOmitir("equipo")}
        >
          <Link
            href={`/${tenantSlug}/personal`}
            className="flex items-center gap-1.5 text-xs font-medium text-primary-text hover:underline flex-shrink-0"
          >
            Ir a Personal <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </PasoShell>

        {/* 4. Caja */}
        <PasoShell
          numero={4}
          icon={DollarSign}
          titulo="Abre tu caja"
          descripcion="Registra el fondo con el que empiezas el día"
          done={tieneCaja}
          omitido={omitidos.has("caja")}
          onOmitir={() => omitir("caja")}
          onDeshacerOmitir={() => deshacerOmitir("caja")}
        >
          <Link
            href={`/${tenantSlug}/caja`}
            className="flex items-center gap-1.5 text-xs font-medium text-primary-text hover:underline flex-shrink-0"
          >
            Ir a Caja <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </PasoShell>

        {/* 5. Primera venta */}
        <PasoShell
          numero={5}
          icon={ShoppingCart}
          titulo="Registra tu primera venta"
          descripcion="Prueba el punto de venta con un producto real"
          done={tieneVenta}
          omitido={omitidos.has("venta")}
          onOmitir={() => omitir("venta")}
          onDeshacerOmitir={() => deshacerOmitir("venta")}
        >
          <Link
            href={`/${tenantSlug}/pos`}
            className="flex items-center gap-1.5 text-xs font-medium text-primary-text hover:underline flex-shrink-0"
          >
            Ir a Punto de Venta <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </PasoShell>
      </div>

      <div className="bg-muted/50 border border-border rounded-lg px-4 py-3 text-xs text-muted-foreground mb-8">
        Tú eres la única cuenta con acceso completo. Tus empleados entran con su PIN y solo ven los módulos
        que permita su rol; puedes ajustar esos permisos en Personal, en «Roles y permisos».
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

function PasoShell({
  numero,
  icon: Icono,
  titulo,
  descripcion,
  done,
  omitido,
  onOmitir,
  onDeshacerOmitir,
  children,
}: {
  numero: number;
  icon: typeof Palette;
  titulo: string;
  descripcion: string;
  done: boolean;
  omitido: boolean;
  onOmitir: () => void;
  onDeshacerOmitir: () => void;
  children: React.ReactNode;
}) {
  // Un paso completado con datos reales siempre manda sobre "omitido" — no
  // tendría sentido mostrar como pendiente algo que el negocio ya hizo,
  // aunque en algún momento lo haya marcado "Saltar por ahora".
  const mostrarComoOmitido = omitido && !done;

  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
        done
          ? "border-emerald-200 bg-emerald-50/40"
          : mostrarComoOmitido
          ? "border-border bg-muted/30 opacity-60"
          : "border-border bg-card"
      }`}
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${done ? "bg-emerald-100" : "bg-primary/10"}`}>
        {done ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Icono className="w-5 h-5 text-primary-text" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11.5px] font-medium text-muted-foreground/70">Paso {numero}</span>
          {done && <span className="text-[10.5px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-medium">Listo</span>}
          {mostrarComoOmitido && <span className="text-[10.5px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">Saltado</span>}
        </div>
        <p className="text-sm font-semibold text-foreground">{titulo}</p>
        <p className="text-xs text-muted-foreground">{descripcion}</p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {!done && children}
        {!done && (
          mostrarComoOmitido ? (
            <button onClick={onDeshacerOmitir} className="btn-ghost -mx-1.5 px-1.5 py-0.5 rounded-md text-[11.5px]">
              Deshacer
            </button>
          ) : (
            <button onClick={onOmitir} className="text-[11.5px] text-muted-foreground/70 hover:text-muted-foreground">
              Saltar por ahora
            </button>
          )
        )}
      </div>
    </div>
  );
}
