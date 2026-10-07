"use client";

import { useEffect, useState } from "react";
import {
  Lock,
  Eye,
  EyeOff,
  Shield,
  UserPlus,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  listarSuperAdminsAction,
  alternarSuperAdminAction,
  invitarSuperAdminAction,
  eliminarSuperAdminAction,
  type SuperAdminListItem,
} from "./actions";

export default function ConfiguracionClient({
  admin,
}: {
  admin: { id: string; email: string; name: string };
}) {
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);

  const [superAdmins, setSuperAdmins] = useState<SuperAdminListItem[]>([]);
  const [cargandoAdmins, setCargandoAdmins] = useState(true);
  const [errorAdmins, setErrorAdmins] = useState("");
  const [gestionandoAdmin, setGestionandoAdmin] = useState("");

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoEmail, setNuevoEmail] = useState("");
  const [enviandoInvitacion, setEnviandoInvitacion] = useState(false);
  const [exitoInvitacion, setExitoInvitacion] = useState("");

  useEffect(() => {
    const cargarAdmins = async () => {
      setCargandoAdmins(true);
      setErrorAdmins("");

      try {
        const resultado = await listarSuperAdminsAction();
        setSuperAdmins(resultado);
      } catch {
        setErrorAdmins("No se pudieron cargar los administradores.");
      } finally {
        setCargandoAdmins(false);
      }
    };

    cargarAdmins();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setExito(false);

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (password !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError("No se pudo actualizar tu contraseña. Intenta de nuevo.");
      return;
    }

    setPassword("");
    setConfirmar("");
    setExito(true);
  };

  const alternarAdmin = async (id: string, activo: boolean) => {
    setGestionandoAdmin(id);
    setErrorAdmins("");

    const resultado = await alternarSuperAdminAction({
      id,
      activo,
    });

    setGestionandoAdmin("");

    if (!resultado.ok) {
      setErrorAdmins(resultado.error ?? "No se pudo actualizar el administrador.");
      return;
    }

    setSuperAdmins((actuales) =>
      actuales.map((item) =>
        item.id === id ? { ...item, isActive: activo } : item
      )
    );
  };

  const eliminarAdmin = async (item: SuperAdminListItem) => {
    const confirmar = window.confirm(
      "¿Eliminar definitivamente a " + item.name + " (" + item.email + ")?\n\nEsta acción eliminará su acceso al Panel Maestro y no se puede deshacer."
    );

    if (!confirmar) return;

    setGestionandoAdmin(item.id);
    setErrorAdmins("");

    const resultado = await eliminarSuperAdminAction(item.id);

    setGestionandoAdmin("");

    if (!resultado.ok) {
      setErrorAdmins(resultado.error ?? "No se pudo eliminar el administrador.");
      return;
    }

    setSuperAdmins((actuales) =>
      actuales.filter((adminActual) => adminActual.id !== item.id)
    );
  };
  const abrirFormulario = () => {
    setErrorAdmins("");
    setExitoInvitacion("");
    setNuevoNombre("");
    setNuevoEmail("");
    setMostrarFormulario(true);
  };

  const cerrarFormulario = () => {
    if (enviandoInvitacion) return;

    setMostrarFormulario(false);
    setNuevoNombre("");
    setNuevoEmail("");
  };

  const enviarInvitacion = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorAdmins("");
    setExitoInvitacion("");

    const nombre = nuevoNombre.trim();
    const email = nuevoEmail.trim().toLowerCase();

    if (!nombre) {
      setErrorAdmins("El nombre es obligatorio.");
      return;
    }

    if (!email || !email.includes("@")) {
      setErrorAdmins("Ingresa un correo electrónico válido.");
      return;
    }

    setEnviandoInvitacion(true);

    const resultado = await invitarSuperAdminAction({
      name: nombre,
      email,
    });

    setEnviandoInvitacion(false);

    if (!resultado.ok) {
      setErrorAdmins(resultado.error ?? "No se pudo enviar la invitación.");
      return;
    }

    setSuperAdmins((actuales) => [
      ...actuales,
      {
        id: `temp-${Date.now()}`,
        email,
        name: nombre,
        isActive: true,
        createdAt: new Date(),
      },
    ]);

    setMostrarFormulario(false);
    setNuevoNombre("");
    setNuevoEmail("");
    setExitoInvitacion(`Invitación enviada a ${email}.`);
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <p className="text-[14.5px] font-medium text-slate-700 mb-3 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-slate-400" />
          Tu cuenta
        </p>

        <dl className="space-y-2 text-[13.5px]">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400">Nombre</dt>
            <dd className="text-slate-700">{admin.name}</dd>
          </div>

          <div className="flex justify-between gap-3">
            <dt className="text-slate-400">Correo</dt>
            <dd className="text-slate-700">{admin.email}</dd>
          </div>

          <div className="flex justify-between gap-3">
            <dt className="text-slate-400">Rol</dt>
            <dd className="text-slate-700">Administrador de Panel Maestro</dd>
          </div>
        </dl>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <p className="text-[14.5px] font-medium text-slate-700 mb-1">
          Cambiar contraseña
        </p>

        <p className="text-[12.5px] text-slate-400 mb-3">
          Se aplica de inmediato — la vas a necesitar la próxima vez que inicies sesión.
        </p>

        {error && (
          <p className="text-[12.5px] text-red-600 mb-3">
            {error}
          </p>
        )}

        {exito && (
          <p className="text-[12.5px] text-emerald-600 mb-3">
            Contraseña actualizada correctamente.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 max-w-xs">
          <div>
            <label className="text-[12.5px] font-medium text-slate-600 mb-1.5 block">
              Nueva contraseña
            </label>

            <div className="relative">
              <input
                type={verPassword ? "text" : "password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="w-full px-4 py-2.5 pl-10 pr-10 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />

              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

              <button
                type="button"
                onClick={() => setVerPassword(!verPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {verPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="text-[12.5px] font-medium text-slate-600 mb-1.5 block">
              Confirmar contraseña
            </label>

            <div className="relative">
              <input
                type={verPassword ? "text" : "password"}
                required
                minLength={8}
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                placeholder="Repite tu contraseña"
                className="w-full px-4 py-2.5 pl-10 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />

              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 px-4 rounded-lg text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              "Actualizar contraseña"
            )}
          </button>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-[14.5px] font-medium text-slate-700 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-slate-400" />
              Administradores del sistema
            </p>

            <p className="text-[12.5px] text-slate-400 mt-1">
              Todas las cuentas tienen el mismo nivel de acceso al Panel Maestro.
            </p>
          </div>

          <button
            type="button"
            onClick={abrirFormulario}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Agregar administrador
          </button>
        </div>

        {exitoInvitacion && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[12.5px] px-3 py-2.5 rounded-lg mb-3">
            {exitoInvitacion}
          </div>
        )}

        {errorAdmins && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-[12.5px] px-3 py-2.5 rounded-lg mb-3">
            {errorAdmins}
          </div>
        )}

        {mostrarFormulario && (
          <div className="border border-slate-200 rounded-lg p-4 mb-4 bg-slate-50">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[13.5px] font-medium text-slate-700">
                  Nuevo administrador
                </p>
                <p className="text-[12px] text-slate-400 mt-0.5">
                  Recibirá un correo para configurar su acceso.
                </p>
              </div>

              <button
                type="button"
                onClick={cerrarFormulario}
                disabled={enviandoInvitacion}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-white disabled:opacity-50"
                title="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={enviarInvitacion} className="space-y-3 max-w-md">
              <div>
                <label className="text-[12.5px] font-medium text-slate-600 mb-1.5 block">
                  Nombre
                </label>

                <input
                  type="text"
                  required
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  placeholder="Nombre del administrador"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>

              <div>
                <label className="text-[12.5px] font-medium text-slate-600 mb-1.5 block">
                  Correo electrónico
                </label>

                <input
                  type="email"
                  required
                  value={nuevoEmail}
                  onChange={(e) => setNuevoEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={enviandoInvitacion}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 px-4 rounded-lg text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {enviandoInvitacion ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Enviar invitación
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={cerrarFormulario}
                  disabled={enviandoInvitacion}
                  className="py-2.5 px-4 rounded-lg text-sm font-medium text-slate-600 hover:bg-white transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {cargandoAdmins ? (
          <div className="py-6 flex justify-center">
            <div className="w-5 h-5 border-2 border-slate-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : superAdmins.length === 0 ? (
          <div className="py-6 text-center text-[12.5px] text-slate-400">
            No hay administradores registrados.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
            {superAdmins.map((item) => {
              const esActual = item.id === admin.id;
              const enCurso = gestionandoAdmin === item.id;

              return (
                <div
                  key={item.id}
                  className="px-3.5 py-3 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13.5px] font-medium text-slate-700 truncate">
                        {item.name}
                      </p>

                      {esActual && (
                        <span className="text-[10.5px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                          Tú
                        </span>
                      )}
                    </div>

                    <p className="text-[12px] text-slate-400 truncate">
                      {item.email}
                    </p>

                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Creado el{" "}
                      {new Intl.DateTimeFormat("es-MX", {
                        dateStyle: "medium",
                      }).format(new Date(item.createdAt))}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`text-[11px] font-medium px-2 py-1 rounded-full ${
                        item.isActive
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {item.isActive ? "Activo" : "Desactivado"}
                    </span>

                    {!esActual && (
                      <button
                        type="button"
                        onClick={() => alternarAdmin(item.id, !item.isActive)}
                        disabled={enCurso}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                          item.isActive
                            ? "text-slate-400 hover:text-red-600 hover:bg-red-50"
                            : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                        } disabled:opacity-50`}
                        title={item.isActive ? "Desactivar" : "Reactivar"}
                      >
                        {enCurso ? (
                          <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                        ) : item.isActive ? (
                          <UserX className="w-3.5 h-3.5" />
                        ) : (
                          <UserCheck className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}

                    {!esActual && (
                      <button
                        type="button"
                        onClick={() => eliminarAdmin(item)}
                        disabled={enCurso}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title="Eliminar administrador"
                      >
                        {enCurso ? (
                          <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                        ) : (
                          <X className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
