"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings, Building2, Users as UsersIcon, Layers } from "lucide-react";
import type { TenantDetail } from "@/lib/tenants-data";
import type { EsquemaOption } from "@/lib/esquemas-data";
import { alternarSuscripcionAction } from "../../dashboard/actions";
import { alternarModuloTenantAction, asignarEsquemaAction } from "../actions";

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const formatFecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—";

const CICLO_LABEL: Record<string, string> = {
  MENSUAL: "mensual",
  TRIMESTRAL: "trimestral",
  SEMESTRAL: "semestral",
  ANUAL: "anual",
};

const ESTADO_CONFIG: Record<string, { label: string; classes: string }> = {
  ACTIVE: { label: "Activo", classes: "bg-emerald-500/10 text-emerald-600" },
  TRIAL: { label: "Prueba", classes: "bg-cyan-500/10 text-cyan-600" },
  SUSPENDED: { label: "Suspendido", classes: "bg-slate-200 text-slate-500" },
  CANCELLED: { label: "Cancelado", classes: "bg-slate-200 text-slate-400" },
};

export default function TenantDetailClient({
  tenant,
  esquemas,
}: {
  tenant: TenantDetail;
  esquemas: EsquemaOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [moduloEnCurso, setModuloEnCurso] = useState<string | null>(null);
  const [suscripcionEnCurso, setSuscripcionEnCurso] = useState(false);
  const [esquemaSeleccionado, setEsquemaSeleccionado] = useState(tenant.esquemaId ?? "");
  const [esquemaEnCurso, setEsquemaEnCurso] = useState(false);

  const estadoCfg = tenant.status ? ESTADO_CONFIG[tenant.status] : null;
  const puedeSuspender = tenant.status === "ACTIVE";
  const puedeReactivar = tenant.status === "SUSPENDED";

  function alternarSuscripcion(nuevoEstado: "ACTIVE" | "SUSPENDED") {
    setError(null);
    setSuscripcionEnCurso(true);
    startTransition(async () => {
      const res = await alternarSuscripcionAction({ tenantId: tenant.id, nuevoEstado });
      setSuscripcionEnCurso(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function alternarModulo(moduleCode: string, activar: boolean) {
    setError(null);
    setModuloEnCurso(moduleCode);
    startTransition(async () => {
      const res = await alternarModuloTenantAction({ tenantId: tenant.id, slug: tenant.slug, moduleCode, activar });
      setModuloEnCurso(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function guardarEsquema() {
    setError(null);
    setEsquemaEnCurso(true);
    startTransition(async () => {
      const res = await asignarEsquemaAction({
        tenantId: tenant.id,
        slug: tenant.slug,
        esquemaId: esquemaSeleccionado || null,
      });
      setEsquemaEnCurso(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-[12.5px] text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-4">
        {/* Info del negocio */}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-[14.5px] font-medium text-slate-700 mb-3">Información</p>
          <dl className="space-y-2 text-[13.5px]">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Giro</dt>
              <dd className="text-slate-700 text-right">{tenant.businessType ?? "Sin especificar"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Teléfono</dt>
              <dd className="text-slate-700 text-right">{tenant.phone ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Correo</dt>
              <dd className="text-slate-700 text-right">{tenant.email ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">RFC</dt>
              <dd className="text-slate-700 text-right">{tenant.rfc ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Dirección</dt>
              <dd className="text-slate-700 text-right">
                {[tenant.address, tenant.city, tenant.state].filter(Boolean).join(", ") || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Cliente desde</dt>
              <dd className="text-slate-700 text-right">{formatFecha(tenant.createdAt)}</dd>
            </div>
          </dl>
        </div>

        {/* Suscripción */}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[14.5px] font-medium text-slate-700">Suscripción</p>
            <span className={`text-[12.5px] font-medium px-2 py-0.5 rounded-full ${estadoCfg?.classes ?? "bg-slate-100 text-slate-400"}`}>
              {estadoCfg?.label ?? "Sin suscripción"}
            </span>
          </div>
          <dl className="space-y-2 text-[13.5px] mb-3">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Plan</dt>
              <dd className="text-slate-700 text-right">{tenant.plan ?? "Sin plan"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Precio</dt>
              <dd className="text-slate-700 text-right">
                {tenant.price !== null ? `${formatMXN(tenant.price)} / ${CICLO_LABEL[tenant.billingCycle ?? "MENSUAL"]}` : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Vence</dt>
              <dd className="text-slate-700 text-right">{formatFecha(tenant.endDate)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Auto-renovación</dt>
              <dd className="text-slate-700 text-right">{tenant.autoRenew ? "Sí" : "No"}</dd>
            </div>
          </dl>
          {puedeSuspender ? (
            <button
              type="button"
              disabled={isPending && suscripcionEnCurso}
              onClick={() => alternarSuscripcion("SUSPENDED")}
              className="text-[12.5px] text-red-600 border border-red-200 hover:border-red-300 disabled:opacity-50 px-2.5 py-1 rounded transition-colors flex items-center gap-1"
            >
              <Settings className="w-3 h-3" />
              {isPending && suscripcionEnCurso ? "Suspendiendo…" : "Suspender"}
            </button>
          ) : puedeReactivar ? (
            <button
              type="button"
              disabled={isPending && suscripcionEnCurso}
              onClick={() => alternarSuscripcion("ACTIVE")}
              className="text-[12.5px] text-emerald-600 border border-emerald-200 hover:border-emerald-300 disabled:opacity-50 px-2.5 py-1 rounded transition-colors flex items-center gap-1"
            >
              <Settings className="w-3 h-3" />
              {isPending && suscripcionEnCurso ? "Reactivando…" : "Reactivar"}
            </button>
          ) : null}
        </div>
      </div>

      {/* Módulos */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <p className="text-[14.5px] font-medium text-slate-700 mb-1">Módulos</p>
        <p className="text-[12.5px] text-slate-400 mb-3">Qué partes del sistema puede usar este negocio. Los núcleo (M1-M4) siempre están activos.</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          {tenant.modulos.map((m) => {
            const enCurso = isPending && moduloEnCurso === m.code;
            return (
              <div key={m.code} className="flex items-center justify-between py-1">
                <span className="text-[13.5px] text-slate-600">
                  {m.name}
                  {m.isCore && <span className="text-slate-300"> · núcleo</span>}
                </span>
                <button
                  type="button"
                  disabled={m.isCore || enCurso}
                  onClick={() => alternarModulo(m.code, !m.activo)}
                  title={m.isCore ? "Los módulos núcleo no se pueden desactivar" : undefined}
                  className={`relative w-8 h-4.5 rounded-full transition-colors flex-shrink-0 disabled:opacity-40 ${
                    m.activo ? "bg-[#4F46E5]" : "bg-slate-200"
                  }`}
                  style={{ height: "18px" }}
                >
                  <span
                    className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      m.activo ? "translate-x-[16px]" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Esquema (límite de sucursales/personal) */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <p className="text-[14.5px] font-medium text-slate-700 mb-1 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-slate-400" />
          Esquema
        </p>
        <p className="text-[12.5px] text-slate-400 mb-3">
          Cuántas sucursales y cuánto personal por sucursal puede tener este negocio. El cobro real lo gestiona
          Hotmart — esto solo controla capacidad dentro de la plataforma.
        </p>
        <div className="flex items-end gap-2 mb-2">
          <div className="flex-1">
            <label className="text-[12.5px] font-medium text-slate-500">Esquema asignado</label>
            <select
              value={esquemaSeleccionado}
              onChange={(e) => setEsquemaSeleccionado(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-[13.5px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
            >
              <option value="">Sin esquema (sin límite)</option>
              {esquemas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} — {e.maxBranches} sucursal(es), {e.maxStaffPerBranch} personal c/u{!e.isActive ? " (desactivado)" : ""}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={esquemaEnCurso || esquemaSeleccionado === (tenant.esquemaId ?? "")}
            onClick={guardarEsquema}
            className="px-3 py-2 text-[13.5px] rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white font-medium disabled:opacity-50 flex-shrink-0"
          >
            {esquemaEnCurso ? "Guardando…" : "Guardar"}
          </button>
        </div>
        <p className="text-[12.5px] text-slate-500">
          Uso actual: {tenant.branchesActivas} sucursal(es) activa(s)
          {tenant.esquemaMaxBranches !== null ? ` de ${tenant.esquemaMaxBranches} permitida(s)` : ""}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Sucursales */}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-[14.5px] font-medium text-slate-700 mb-3 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            Sucursales ({tenant.branches.length})
          </p>
          {tenant.branches.length === 0 ? (
            <p className="text-[13.5px] text-slate-400">Sin sucursales registradas.</p>
          ) : (
            <div className="space-y-2">
              {tenant.branches.map((b) => (
                <div key={b.id} className="flex items-center justify-between text-[13.5px]">
                  <div>
                    <p className="text-slate-700">{b.name}</p>
                    {b.address && <p className="text-[12.5px] text-slate-400">{b.address}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-[12.5px] text-slate-500">
                      {b.staffCount}{tenant.esquemaMaxStaffPerBranch !== null ? `/${tenant.esquemaMaxStaffPerBranch}` : ""} personal
                    </p>
                    {!b.isActive && <span className="text-[11.5px] text-slate-400">Inactiva</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Usuarios */}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-[14.5px] font-medium text-slate-700 mb-3 flex items-center gap-1.5">
            <UsersIcon className="w-3.5 h-3.5 text-slate-400" />
            Usuarios ({tenant.users.length})
          </p>
          {tenant.users.length === 0 ? (
            <p className="text-[13.5px] text-slate-400">Sin usuarios registrados.</p>
          ) : (
            <div className="space-y-2">
              {tenant.users.map((u) => (
                <div key={u.id} className="flex items-center justify-between text-[13.5px]">
                  <div>
                    <p className="text-slate-700">{u.name}</p>
                    <p className="text-[12.5px] text-slate-400">{u.email}{u.roleName ? ` · ${u.roleName}` : ""}</p>
                  </div>
                  {!u.isActive && <span className="text-[11.5px] text-slate-400">Inactivo</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
