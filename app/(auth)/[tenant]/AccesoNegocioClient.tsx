"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { Building2, Delete, ArrowLeft, Lock, Mail, Eye, EyeOff, ShieldCheck, XCircle, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { reiniciarActividadAdmin } from "@/lib/actividad-admin";
import { getTenantAccesoBySupabaseId } from "../login/actions";
import { iniciarSesionPersonalAction } from "@/app/actions/acceso-personal-actions";
import { consultarSolicitudDispositivoAction } from "@/app/actions/dispositivos-actions";

/**
 * Pantalla única de entrada a un negocio (2026-09-23, a petición de Carlos —
 * ver el comentario largo en app/(auth)/[tenant]/page.tsx). Es TODO lo que
 * hay en /[tenant]: las dos fichas — Administrador (correo + contraseña
 * real, Supabase Auth) y Empleado (nombre + PIN de 6 dígitos) —
 * reemplazando lo que antes eran dos flujos separados (/login por un lado,
 * /entrada/[tenant] por otro). "Lo más intuitivo y minimalista posible",
 * como pidió Carlos: una sola tarjeta centrada, sin nada de más.
 *
 * Esta pantalla llevó al inicio, brevemente, una contraseña compartida de
 * "puerta" antes de las dos fichas — Carlos pidió quitarla el mismo día que
 * se agregó ("mientras menos le pregunten [al dueño]... mejor"), así que ya
 * no existe: la protección de este punto de entrada son las dos fichas en
 * sí, más el PIN de 6 dígitos (antes 4, subido el mismo día a petición de
 * Carlos — ver lib/staff-auth.ts, pinValido).
 *
 * 2026-10-01, rediseño a petición de Carlos (validado primero con un mockup
 * HTML aparte antes de tocar este archivo): ya no recibe el tema del
 * negocio (ver el comentario largo en page.tsx) — los colores son siempre
 * los de marca de Linkity. Lo único que identifica al negocio aquí es su
 * logo (logoUrl) si ya subió uno; si no, un ícono con su inicial hace de
 * respaldo en el MISMO lugar — nunca los dos a la vez. El nombre del
 * negocio ahora SIEMPRE se muestra como texto debajo de ese ícono (logo o
 * inicial), a diferencia del sidebar del dashboard (TenantShell.tsx) donde
 * logo y nombre son alternativos — aquí Carlos pidió explícitamente verlos
 * juntos, uno debajo del otro, ambos centrados.
 */

const PIN_LARGO = 6;

interface BranchOption {
  id: string;
  name: string;
}

interface EmpleadoOption {
  id: string;
  name: string;
  position: string | null;
  branchId: string;
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

// Fondo degradado muy sutil, a petición de Carlos al validar el mockup
// ("que no se sienta flotando sobre blanco liso") — dos radiales del morado
// de marca (var(--primary), SIEMPRE el de Linkity aquí, ver el comentario
// largo arriba) a muy baja opacidad, nunca el tema del negocio.
const FONDO_DEGRADADO: React.CSSProperties = {
  backgroundImage:
    "radial-gradient(circle at 15% 8%, color-mix(in oklch, var(--primary) 14%, transparent) 0%, transparent 45%), " +
    "radial-gradient(circle at 85% 95%, color-mix(in oklch, var(--primary) 10%, transparent) 0%, transparent 45%)",
};

// Inicial para el ícono de respaldo cuando el negocio no tiene logo — a
// propósito solo la PRIMERA letra (no "iniciales" de 2 letras como en el
// selector de empleado de abajo): en un ícono cuadrado de 52px una sola
// letra grande se lee mejor que dos chicas, más parecido a un ícono de app.
function inicialNegocio(nombre: string): string {
  return nombre.trim().charAt(0).toUpperCase() || "?";
}

export default function AccesoNegocioClient({
  tenantSlug,
  businessName,
  logoUrl,
  branches,
  empleados,
  sucursalInicial,
}: {
  tenantSlug: string;
  businessName: string;
  // Tenant.logo — null mientras el negocio no haya subido uno (mismo campo
  // que ya usa TenantShell.tsx/recibo-imprimible.ts).
  logoUrl: string | null;
  branches: BranchOption[];
  empleados: EmpleadoOption[];
  // ?sucursal=<branchId> de la URL (link fijo de una sucursal específica,
  // ver page.tsx) — si viene y es válido, la ficha de Empleado arranca ya
  // posicionada ahí en vez de pedir "¿en qué sucursal estás?".
  sucursalInicial: string | null;
}) {
  // ── Ficha activa ──────────────────────────────────────────────────────
  const [ficha, setFicha] = useState<"empleado" | "admin">("empleado");

  // ── Ficha Administrador ──────────────────────────────────────────────
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorAdmin, setErrorAdmin] = useState("");
  const [pendingAdmin, setPendingAdmin] = useState(false);

  const enviarAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorAdmin("");
    setPendingAdmin(true);

    // Todo lo que sigue a signInWithPassword hace llamadas de red propias
    // (Server Action getTenantAccesoBySupabaseId, signOut) — si cualquiera
    // de ellas falla por conexión, antes se quedaba "Verificando..." para
    // siempre sin mensaje ni forma de reintentar. Con el try/catch, un
    // fallo de red muestra un error claro y vuelve a habilitar el botón.
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error || !data.user) {
        setErrorAdmin("Correo o contraseña incorrectos");
        setPendingAdmin(false);
        return;
      }

      const { tenantSlug: tenantDeLaCuenta, cuentaDesactivada } = await getTenantAccesoBySupabaseId(data.user.id);

      if (cuentaDesactivada) {
        setErrorAdmin("Tu cuenta fue desactivada. Contacta al administrador de tu negocio.");
        await supabase.auth.signOut();
        setPendingAdmin(false);
        return;
      }

      // Esta pantalla es la puerta de UN negocio específico (el de la URL) —
      // a diferencia de /login (genérico), aquí no tiene sentido dejar pasar
      // ni a un superadmin de Panel Maestro ni a un administrador de OTRO
      // negocio, aunque su correo/contraseña sean válidos en Supabase Auth.
      if (!tenantDeLaCuenta || tenantDeLaCuenta !== tenantSlug) {
        setErrorAdmin("Esta cuenta no pertenece a este negocio.");
        await supabase.auth.signOut();
        setPendingAdmin(false);
        return;
      }

      // Sesión nueva = actividad nueva (ver lib/actividad-admin.ts).
      reiniciarActividadAdmin();

      if (data.user.user_metadata?.must_change_password) {
        window.location.href = "/primer-acceso";
        return;
      }

      window.location.href = `/${tenantSlug}/dashboard`;
    } catch {
      setErrorAdmin("No se pudo conectar. Revisa tu conexión e intenta de nuevo.");
      setPendingAdmin(false);
    }
  };

  // ── Ficha Empleado ────────────────────────────────────────────────────
  const [sucursalId, setSucursalId] = useState<string | null>(
    branches.length === 1 ? branches[0].id : sucursalInicial
  );
  const [empleadoSel, setEmpleadoSel] = useState<EmpleadoOption | null>(null);
  const [pin, setPin] = useState("");
  const [errorEmpleado, setErrorEmpleado] = useState<string | null>(null);
  const [pendingEmpleado, startEmpleado] = useTransition();

  // ── Espera de autorización de dispositivo ────────────────────────────
  // 2026-09-23, a petición de Carlos ("que ningún empleado pueda entrar
  // desde otro lugar y fingir que está en la tienda") — ver el comentario
  // largo en acceso-personal-actions.ts. Cuando iniciarSesionPersonalAction
  // responde necesitaAutorizacion, se guarda el token + los datos del
  // intento (para reintentarlo solo, sin pedirle el PIN de nuevo) y se
  // entra en esta pantalla de espera con polling.
  const [espera, setEspera] = useState<{ token: string; staffId: string; pin: string; branchId: string } | null>(null);
  const [estadoEspera, setEstadoEspera] = useState<"pendiente" | "rechazado" | "expirado" | null>(null);

  useEffect(() => {
    if (!espera || estadoEspera !== "pendiente") return;
    const intervalo = setInterval(async () => {
      const res = await consultarSolicitudDispositivoAction(espera.token);
      if (!res.ok) return; // error de red/servidor — se reintenta en el próximo tick, sin tronar la espera.

      if (res.estado === "aprobado") {
        // La cookie de confianza ya quedó puesta por la propia consulta
        // (ver consultarSolicitudDispositivoAction) — reintentar el mismo
        // login con el PIN que ya se tenía en memoria, esta vez sí entra.
        const login = await iniciarSesionPersonalAction({
          tenantSlug,
          staffId: espera.staffId,
          pin: espera.pin,
          branchId: espera.branchId,
        });
        if (login.ok) {
          window.location.href = `/${tenantSlug}/dashboard`;
        } else if ("necesitaAutorizacion" in login && login.necesitaAutorizacion) {
          // Caso raro (ej. la cookie no cuajó a tiempo) — se sigue
          // esperando con el token nuevo en vez de dejar al empleado
          // colgado.
          setEspera({ ...espera, token: login.token });
        } else {
          setEstadoEspera(null);
          setEspera(null);
          setErrorEmpleado(login.error);
          setPin("");
        }
      } else if (res.estado === "rechazado" || res.estado === "expirado") {
        setEstadoEspera(res.estado);
      }
    }, 3000);
    return () => clearInterval(intervalo);
  }, [espera, estadoEspera, tenantSlug]);

  const cancelarEspera = () => {
    setEspera(null);
    setEstadoEspera(null);
    setPin("");
    setErrorEmpleado(null);
  };

  const empleadosDeSucursal = empleados.filter((e) => e.branchId === sucursalId);

  const elegirEmpleado = (emp: EmpleadoOption) => {
    setEmpleadoSel(emp);
    setPin("");
    setErrorEmpleado(null);
  };

  const volverAEmpleados = () => {
    setEmpleadoSel(null);
    setPin("");
    setErrorEmpleado(null);
  };

  const volverASucursales = () => {
    setSucursalId(null);
    setEmpleadoSel(null);
    setPin("");
    setErrorEmpleado(null);
  };

  const tecla = (d: string) => {
    if (pendingEmpleado || pin.length >= PIN_LARGO || !empleadoSel || !sucursalId) return;
    const siguiente = pin + d;
    setPin(siguiente);
    setErrorEmpleado(null);
    if (siguiente.length === PIN_LARGO) {
      startEmpleado(async () => {
        // Sin este try/catch, un fallo de red aquí dejaba el teclado
        // bloqueado en "Verificando..." sin ningún mensaje — el único
        // escape era "No soy {nombre}", sin que el empleado supiera que
        // fue un problema de conexión y no un PIN incorrecto.
        try {
          const res = await iniciarSesionPersonalAction({
            tenantSlug,
            staffId: empleadoSel.id,
            pin: siguiente,
            branchId: sucursalId,
          });
          if (res.ok) {
            window.location.href = `/${tenantSlug}/dashboard`;
          } else if ("necesitaAutorizacion" in res && res.necesitaAutorizacion) {
            setEspera({ token: res.token, staffId: empleadoSel.id, pin: siguiente, branchId: sucursalId });
            setEstadoEspera("pendiente");
          } else {
            setErrorEmpleado(res.error);
            setPin("");
          }
        } catch {
          setErrorEmpleado("No se pudo conectar. Intenta de nuevo.");
          setPin("");
        }
      });
    }
  };

  const borrar = () => {
    if (pendingEmpleado) return;
    setPin((p) => p.slice(0, -1));
    setErrorEmpleado(null);
  };

  // ── Render: esperando autorización del administrador ─────────────────
  if (espera) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6" style={FONDO_DEGRADADO}>
        <div className="w-full max-w-sm text-center">
          {estadoEspera === "pendiente" && (
            <>
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Clock className="w-5 h-5 text-primary-text" />
              </div>
              <h1 className="text-lg font-semibold text-foreground">Esperando autorización</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Este dispositivo no está autorizado todavía. Le avisamos al administrador — en cuanto lo apruebe,
                esta pantalla continúa sola.
              </p>
            </>
          )}
          {estadoEspera === "rechazado" && (
            <>
              <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <h1 className="text-lg font-semibold text-foreground">Solicitud rechazada</h1>
              <p className="text-sm text-muted-foreground mt-2">El administrador no autorizó este dispositivo.</p>
            </>
          )}
          {estadoEspera === "expirado" && (
            <>
              <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-5 h-5 text-amber-600" />
              </div>
              <h1 className="text-lg font-semibold text-foreground">La solicitud venció</h1>
              <p className="text-sm text-muted-foreground mt-2">Nadie respondió a tiempo — puedes intentar de nuevo.</p>
            </>
          )}
          <button onClick={cancelarEspera} className="btn-ghost mt-6 px-2.5 py-1 rounded-md text-xs">
            {estadoEspera === "pendiente" ? "Cancelar" : "Volver a intentar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6" style={FONDO_DEGRADADO}>
      <div className="w-full max-w-sm bg-card border border-border rounded-[22px] shadow-lg shadow-black/5 p-7">
        <div className="text-center mb-6">
          <div className="mb-3 flex items-center justify-center min-h-[52px]">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- logo subido por el negocio, dominio/tamaño no se conocen de antemano
              <img
                src={logoUrl}
                alt={`Logo de ${businessName}`}
                className="max-h-[52px] max-w-[220px] w-auto object-contain"
              />
            ) : (
              <div className="w-[52px] h-[52px] rounded-2xl bg-primary flex items-center justify-center text-primary-foreground text-xl font-bold">
                {inicialNegocio(businessName)}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground tracking-widest uppercase mb-1">{businessName}</p>
          <h1 className="text-xl font-semibold text-foreground">Iniciar sesión</h1>
        </div>

        <div className="grid grid-cols-2 gap-1 bg-muted rounded-lg p-1 mb-6">
          <button
            onClick={() => setFicha("empleado")}
            className={`py-2 rounded-md text-sm font-medium transition-colors ${
              ficha === "empleado" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Empleado
          </button>
          <button
            onClick={() => setFicha("admin")}
            className={`py-2 rounded-md text-sm font-medium transition-colors ${
              ficha === "admin" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Administrador
          </button>
        </div>

        {ficha === "admin" ? (
          <form onSubmit={enviarAdmin} className="space-y-3">
            <div className="relative">
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@negocio.com"
                required
                className="w-full px-4 py-2.5 pl-10 border border-border rounded-lg text-sm bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                required
                className="w-full px-4 py-2.5 pl-10 pr-10 border border-border rounded-lg text-sm bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {errorAdmin && <p className="text-xs text-red-600">{errorAdmin}</p>}

            <button
              type="submit"
              disabled={pendingAdmin}
              className="btn-primary w-full py-2.5 rounded-lg text-sm transition-all"
            >
              {pendingAdmin ? "Verificando..." : "Iniciar sesión"}
            </button>

            <p className="text-center text-xs text-muted-foreground pt-1">
              <a href="/forgot-password" className="hover:text-foreground hover:underline">
                ¿Olvidaste tu contraseña?
              </a>
            </p>
          </form>
        ) : branches.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
            Este negocio todavía no tiene sucursales activas.
          </div>
        ) : !sucursalId ? (
          // Más de una sucursal y ninguna elegida todavía: primero hay que
          // saber en cuál está el empleado (mismo criterio que la vieja
          // /entrada/[tenant]).
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground text-center mb-1">¿En qué sucursal estás?</p>
            {branches.map((b) => (
              <button
                key={b.id}
                onClick={() => setSucursalId(b.id)}
                className="flex items-center gap-3 bg-card border border-border rounded-xl p-4 hover:border-primary hover:bg-primary/5 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-4 h-4 text-primary-text" />
                </div>
                <p className="text-sm font-medium text-foreground">{b.name}</p>
              </button>
            ))}
          </div>
        ) : !empleadoSel ? (
          <>
            {branches.length > 1 && (
              <button
                onClick={volverASucursales}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3"
              >
                <ArrowLeft className="w-3 h-3" /> {branches.find((b) => b.id === sucursalId)?.name}
              </button>
            )}
            {empleadosDeSucursal.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
                Todavía no hay personal con acceso configurado en esta sucursal.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {empleadosDeSucursal.map((emp) => (
                  <button
                    key={emp.id}
                    onClick={() => elegirEmpleado(emp)}
                    className="flex flex-col items-center gap-2 bg-card border border-border rounded-xl p-4 hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold">
                      {iniciales(emp.name)}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground leading-tight">{emp.name}</p>
                      {emp.position && <p className="text-[12.5px] text-muted-foreground">{emp.position}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center">
            <p className="text-sm font-medium text-foreground mb-4">Hola, {empleadoSel.name.split(" ")[0]}</p>
            <div className="flex items-center gap-2 mb-6">
              {Array.from({ length: PIN_LARGO }, (_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full border-2 transition-colors ${
                    i < pin.length ? "bg-primary border-primary" : "border-border"
                  }`}
                />
              ))}
            </div>

            {errorEmpleado && <p className="text-xs text-red-600 mb-4">{errorEmpleado}</p>}
            {pendingEmpleado && <p className="text-xs text-muted-foreground mb-4">Verificando...</p>}

            <div className="grid grid-cols-3 gap-3 w-full max-w-[240px]">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button
                  key={d}
                  disabled={pendingEmpleado}
                  onClick={() => tecla(d)}
                  className="aspect-square rounded-xl bg-card border border-border text-lg font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                >
                  {d}
                </button>
              ))}
              <button
                disabled={pendingEmpleado}
                onClick={volverAEmpleados}
                className="aspect-square rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button
                disabled={pendingEmpleado}
                onClick={() => tecla("0")}
                className="aspect-square rounded-xl bg-card border border-border text-lg font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
              >
                0
              </button>
              <button
                disabled={pendingEmpleado}
                onClick={borrar}
                className="aspect-square rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            <button onClick={volverAEmpleados} className="mt-6 text-xs text-muted-foreground hover:text-foreground">
              No soy {empleadoSel.name.split(" ")[0]}
            </button>
          </div>
        )}

        {/* Marca de Linkity, discreta — mismo criterio que "by Linkity
            Soluciones" en el pie del sidebar (TenantShell.tsx), pero AQUÍ sí
            se muestra siempre (el sidebar la esconde si el negocio tiene
            logo propio): esta pantalla es la puerta del software antes de
            entrar a un negocio en particular, así que la marca de la
            plataforma nunca debería desaparecer, tenga o no logo el
            negocio. */}
        <p className="mt-8 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/60">
          <Image src="/images/favicon.svg" alt="" width={13} height={13} className="opacity-70" />
          Protegido por Linkity Soluciones
        </p>
      </div>
    </div>
  );
}
