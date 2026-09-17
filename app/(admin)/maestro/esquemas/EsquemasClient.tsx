"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Star, X, Pencil, Power } from "lucide-react";
import type { EsquemaUI } from "@/lib/esquemas-data";
import {
  crearEsquemaAction,
  editarEsquemaAction,
  alternarEsquemaActivoAction,
  marcarEsquemaDefaultAction,
  type DatosEsquema,
} from "./actions";

interface FormEsquema extends DatosEsquema {}

const FORM_VACIO: FormEsquema = { name: "", maxBranches: 1, maxStaffPerBranch: 5 };

export default function EsquemasClient({ esquemas }: { esquemas: EsquemaUI[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [modalAbierto, setModalAbierto] = useState(false);
  const [modoModal, setModoModal] = useState<"crear" | "editar">("crear");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormEsquema>(FORM_VACIO);
  const [formError, setFormError] = useState<string | null>(null);

  function abrirModalNuevo() {
    setModoModal("crear");
    setEditandoId(null);
    setForm(FORM_VACIO);
    setFormError(null);
    setModalAbierto(true);
  }

  function abrirModalEditar(e: EsquemaUI) {
    setModoModal("editar");
    setEditandoId(e.id);
    setForm({ name: e.name, maxBranches: e.maxBranches, maxStaffPerBranch: e.maxStaffPerBranch });
    setFormError(null);
    setModalAbierto(true);
  }

  function handleGuardar() {
    setFormError(null);
    startTransition(async () => {
      const res =
        modoModal === "crear"
          ? await crearEsquemaAction(form)
          : await editarEsquemaAction({ id: editandoId!, ...form });
      if (res.ok) {
        setModalAbierto(false);
        router.refresh();
      } else {
        setFormError(res.error);
      }
    });
  }

  function handleAlternarActivo(e: EsquemaUI) {
    startTransition(async () => {
      await alternarEsquemaActivoAction({ id: e.id, isActive: !e.isActive });
      router.refresh();
    });
  }

  function handleMarcarDefault(e: EsquemaUI) {
    startTransition(async () => {
      await marcarEsquemaDefaultAction(e.id);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] text-slate-400">
          {esquemas.length === 0
            ? "Todavía no defines ningún esquema — el registro público no puede asignar uno a negocios nuevos hasta que crees al menos uno."
            : `${esquemas.length} esquema${esquemas.length === 1 ? "" : "s"} definido${esquemas.length === 1 ? "" : "s"}`}
        </p>
        <button
          onClick={abrirModalNuevo}
          className="flex items-center gap-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[12px] font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Nuevo esquema
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Esquema</th>
              <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Máx. sucursales</th>
              <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Máx. personal / sucursal</th>
              <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Negocios</th>
              <th className="text-left text-[11px] font-medium text-slate-500 px-4 py-2.5">Estado</th>
              <th className="text-right text-[11px] font-medium text-slate-500 px-4 py-2.5">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {esquemas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[12px] text-slate-400">
                  Sin esquemas todavía — crea el primero.
                </td>
              </tr>
            ) : (
              esquemas.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[12px] font-medium text-slate-800">{e.name}</p>
                      {e.isDefault && (
                        <span className="flex items-center gap-0.5 text-[9px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                          <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" /> Predeterminado
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-slate-600">{e.maxBranches}</td>
                  <td className="px-4 py-2.5 text-[12px] text-slate-600">{e.maxStaffPerBranch}</td>
                  <td className="px-4 py-2.5 text-[12px] text-slate-600">{e.tenantsCount}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        e.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {e.isActive ? "Activo" : "Desactivado"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {!e.isDefault && e.isActive && (
                        <button
                          disabled={isPending}
                          onClick={() => handleMarcarDefault(e)}
                          title="Marcar como predeterminado"
                          className="p-1.5 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        >
                          <Star className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => abrirModalEditar(e)}
                        title="Editar"
                        className="p-1.5 rounded-md text-slate-400 hover:text-[#4F46E5] hover:bg-[#4F46E5]/5 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        disabled={isPending}
                        onClick={() => handleAlternarActivo(e)}
                        title={e.isActive ? "Desactivar" : "Reactivar"}
                        className={`p-1.5 rounded-md transition-colors ${
                          e.isActive ? "text-slate-400 hover:text-red-600 hover:bg-red-50" : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalAbierto && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <p className="text-[13px] font-medium text-slate-800">
                {modoModal === "crear" ? "Nuevo esquema" : "Editar esquema"}
              </p>
              <button onClick={() => setModalAbierto(false)} className="p-1 rounded-md hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-[11px] font-medium text-slate-500">Nombre</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej. 1 Sucursal"
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-slate-500">Máx. sucursales</label>
                  <input
                    type="number"
                    min={1}
                    value={form.maxBranches}
                    onChange={(e) => setForm({ ...form, maxBranches: parseInt(e.target.value, 10) || 0 })}
                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500">Máx. personal / sucursal</label>
                  <input
                    type="number"
                    min={1}
                    value={form.maxStaffPerBranch}
                    onChange={(e) => setForm({ ...form, maxStaffPerBranch: parseInt(e.target.value, 10) || 0 })}
                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-[13px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                  />
                </div>
              </div>
              {formError && <p className="text-[11px] text-red-600">{formError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200">
              <button
                onClick={() => setModalAbierto(false)}
                className="px-4 py-2 text-[12px] rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardar}
                disabled={isPending}
                className="px-4 py-2 text-[12px] rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white font-medium disabled:opacity-50"
              >
                {isPending ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
