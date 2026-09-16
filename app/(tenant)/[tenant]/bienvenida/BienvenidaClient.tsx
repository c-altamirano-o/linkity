"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Palette, UserCog, ArrowRight, PartyPopper, LayoutDashboard,
  BookOpen, DollarSign, ShoppingCart, CheckCircle2,
  Sparkles, Loader2, Copy, Check, ChevronDown, ChevronUp,
} from "lucide-react";
import { cargarCatalogoArranqueAction } from "@/app/actions/catalogo-actions";
import { invitarEmpleadoAction } from "@/app/actions/personal-actions";

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
 * como pantalla — Carlos está al tanto de este límite, por eso cualquier
 * empleado que se invite desde aquí queda con el mismo nivel de acceso
 * que el dueño (ver invitarEmpleadoAction).
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

  // ── Paso "Equipo": alta rápida de un empleado desde aquí ─────────
  const [formEquipoAbierto, setFormEquipoAbierto] = useState(false);
  const [nombreEmpleado, setNombreEmpleado] = useState("");
  const [correoEmpleado, setCorreoEmpleado] = useState("");
  const [puestoEmpleado, setPuestoEmpleado] = useState("");
  const [invitando, setInvitando] = useState(false);
  const [errorInvitar, setErrorInvitar] = useState<string | null>(null);
  const [resultadoInvitar, setResultadoInvitar] = useState<{ email: string; tempPassword: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  function invitarEmpleado() {
    setErrorInvitar(null);
    setInvitando(true);
    startTransition(async () => {
      const res = await invitarEmpleadoAction({
        tenantSlug,
        name: nombreEmpleado,
        email: correoEmpleado,
        position: puestoEmpleado || null,
      });
      setInvitando(false);
      if (!res.ok) {
        setErrorInvitar(res.error);
        return;
      }
      setResultadoInvitar({ email: res.email, tempPassword: res.tempPassword });
      setNombreEmpleado("");
      setCorreoEmpleado("");
      setPuestoEmpleado("");
      router.refresh();
    });
  }

  async function copiarCredenciales() {
    if (!resultadoInvitar) return;
    const texto = `Usuario: ${resultadoInvitar.email}\nContraseña temporal: ${resultadoInvitar.tempPassword}`;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Portapapeles no disponible (ej. sin HTTPS) — no es crítico, las
      // credenciales igual se ven en pantalla para copiarlas a mano.
    }
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
          <PartyPopper className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">¡Bienvenido, {businessName}!</h1>
        <p className="text-muted-foreground text-sm mt-1.5">
          Completa estos pasos para dejar tu negocio listo para vender. Puedes saltarte cualquiera y volver
          después desde el menú.
        </p>
        <p className="text-xs font-medium text-primary mt-2">{completados} de {totalPasos} completados</p>
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
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline flex-shrink-0"
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
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                Ir a Catálogo <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            {errorArranque && <p className="text-[10px] text-red-600 max-w-[220px] text-right">{errorArranque}</p>}
          </div>
        </PasoShell>

        {/* 3. Equipo */}
        <PasoShell
          numero={3}
          icon={UserCog}
          titulo="Da de alta a tu equipo"
          descripcion="Invita a tus empleados para que puedan entrar"
          done={tieneEquipo}
          omitido={omitidos.has("equipo")}
          onOmitir={() => omitir("equipo")}
          onDeshacerOmitir={() => deshacerOmitir("equipo")}
        >
          <button
            onClick={() => setFormEquipoAbierto((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline flex-shrink-0"
          >
            Invitar ahora {formEquipoAbierto ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </PasoShell>

        {formEquipoAbierto && (
          <div className="ml-[52px] -mt-2 mb-1 p-3 bg-muted/50 border border-border rounded-lg">
            {resultadoInvitar ? (
              <div>
                <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-medium mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Cuenta creada — comparte estos datos con tu empleado
                </div>
                <div className="bg-card border border-border rounded-lg p-2.5 text-[11px] font-mono text-foreground space-y-0.5">
                  <p>Usuario: {resultadoInvitar.email}</p>
                  <p>Contraseña temporal: {resultadoInvitar.tempPassword}</p>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Se le pedirá cambiarla la primera vez que inicie sesión.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={copiarCredenciales}
                    className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    {copiado ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiado ? "Copiado" : "Copiar"}
                  </button>
                  <button
                    onClick={() => { setResultadoInvitar(null); setFormEquipoAbierto(false); }}
                    className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    Cerrar
                  </button>
                  <button
                    onClick={() => setResultadoInvitar(null)}
                    className="text-[11px] font-medium text-muted-foreground hover:text-foreground ml-auto"
                  >
                    Invitar a alguien más
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  value={nombreEmpleado}
                  onChange={(e) => setNombreEmpleado(e.target.value)}
                  placeholder="Nombre del empleado"
                  className="px-2.5 py-1.5 border border-border rounded-lg text-xs bg-card focus:outline-none focus:border-primary"
                />
                <input
                  value={correoEmpleado}
                  onChange={(e) => setCorreoEmpleado(e.target.value)}
                  placeholder="Correo (con el que iniciará sesión)"
                  type="email"
                  className="px-2.5 py-1.5 border border-border rounded-lg text-xs bg-card focus:outline-none focus:border-primary"
                />
                <input
                  value={puestoEmpleado}
                  onChange={(e) => setPuestoEmpleado(e.target.value)}
                  placeholder="Puesto (opcional)"
                  className="px-2.5 py-1.5 border border-border rounded-lg text-xs bg-card focus:outline-none focus:border-primary"
                />
                {errorInvitar && <p className="text-[11px] text-red-600">{errorInvitar}</p>}
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => setFormEquipoAbierto(false)}
                    className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={invitarEmpleado}
                    disabled={invitando || !nombreEmpleado.trim() || !correoEmpleado.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-[11px] font-medium transition-colors"
                  >
                    {invitando && <Loader2 className="w-3 h-3 animate-spin" />}
                    {invitando ? "Creando…" : "Crear cuenta"}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Le generamos una contraseña temporal automáticamente — no necesitas pedírsela ni definirla tú.
                  El sueldo y esquema de comisión se configuran después en Personal.
                </p>
              </div>
            )}
          </div>
        )}

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
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline flex-shrink-0"
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
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline flex-shrink-0"
          >
            Ir a Punto de Venta <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </PasoShell>
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
        {done ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Icono className="w-5 h-5 text-primary" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-muted-foreground/70">Paso {numero}</span>
          {done && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-medium">Listo</span>}
          {mostrarComoOmitido && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">Saltado</span>}
        </div>
        <p className="text-sm font-semibold text-foreground">{titulo}</p>
        <p className="text-xs text-muted-foreground">{descripcion}</p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {!done && children}
        {!done && (
          mostrarComoOmitido ? (
            <button onClick={onDeshacerOmitir} className="text-[10px] text-muted-foreground hover:text-foreground">
              Deshacer
            </button>
          ) : (
            <button onClick={onOmitir} className="text-[10px] text-muted-foreground/70 hover:text-muted-foreground">
              Saltar por ahora
            </button>
          )
        )}
      </div>
    </div>
  );
}
