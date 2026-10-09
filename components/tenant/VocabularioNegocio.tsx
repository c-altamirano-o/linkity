"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquareText, RotateCcw } from "lucide-react";
import { ICONOS_CATALOGO, VOCABULARIO_PERSONALIZABLE, valorPorDefectoDeRubro } from "@/lib/labels";
import { guardarVocabularioAction } from "@/app/actions/vocabulario-actions";

/**
 * Tarjeta "Vocabulario de tu negocio" (Configuración, 2026-10-09). El rubro
 * propone los términos; aquí el dueño escribe los suyos ("Otro / Especificar")
 * y puede volver al del rubro con "Restablecer".
 */
export default function VocabularioNegocio({
  tenantSlug,
  businessType,
  actuales,
  mostrarReparaciones,
}: {
  tenantSlug: string;
  businessType: string | null;
  actuales: Record<string, string>;
  // true si el negocio recibe objetos para reparar/atender (módulo de Reparaciones activo).
  mostrarReparaciones: boolean;
}) {
  const router = useRouter();
  const [valores, setValores] = useState<Record<string, string>>(actuales);
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const guardar = () => {
    startTransition(async () => {
      const res = await guardarVocabularioAction({ tenantSlug, valores });
      if (res.ok) {
        setMensaje({ tipo: "ok", texto: "Vocabulario actualizado." });
        router.refresh();
        setTimeout(() => setMensaje(null), 3000);
      } else {
        setMensaje({ tipo: "error", texto: res.error });
      }
    });
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mt-6">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
        <MessageSquareText className="w-5 h-5 text-primary-text" />
        <h2 className="text-base font-semibold text-foreground">Vocabulario de tu negocio</h2>
      </div>

      <div className="p-5">
        <p className="text-sm text-muted-foreground mb-5">
          El giro que elegiste propone estos nombres y ejemplos. Si en tu negocio se dicen distinto, escribe los tuyos:
          el sistema los usará en todas las pantallas.
        </p>

        <div className="space-y-4 max-w-xl">
          {VOCABULARIO_PERSONALIZABLE.filter((campo) => {
            if (campo.grupo === "reparaciones" && !mostrarReparaciones) return false;
            const enUso = (k: string) => valores[k] ?? valorPorDefectoDeRubro(businessType, k);
            // Los nombres de campos solo se muestran si ese campo se usa.
            if ((campo.key === "repair.field.brand" || campo.key === "repair.field.model") && enUso("repair.field.single") === "1") return false;
            if (campo.key === "repair.field.single.label" && enUso("repair.field.single") !== "1") return false;
            if (campo.key === "repair.field.unlock" && enUso("repair.field.unlock.enabled") !== "1") return false;
            return true;
          }).map((campo) => {
            const porDefecto = valorPorDefectoDeRubro(businessType, campo.key);
            const valor = valores[campo.key] ?? porDefecto;
            const cambiado = valor !== porDefecto;
            return (
              <div key={campo.key}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{campo.titulo}</label>
                  {cambiado && (
                    <button
                      type="button"
                      onClick={() => setValores({ ...valores, [campo.key]: porDefecto })}
                      className="flex items-center gap-1 text-[11.5px] text-primary-text hover:underline"
                    >
                      <RotateCcw className="w-3 h-3" /> Restablecer
                    </button>
                  )}
                </div>
                {campo.tipo === "opciones" ? (
                  <select
                    value={valor}
                    onChange={(e) => setValores({ ...valores, [campo.key]: e.target.value })}
                    className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    {(campo.opciones ?? []).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : campo.tipo === "icono" ? (
                  <select
                    value={valor}
                    onChange={(e) => setValores({ ...valores, [campo.key]: e.target.value })}
                    className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    {ICONOS_CATALOGO.map((i) => (
                      <option key={i.value} value={i.value}>{i.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={valor}
                    maxLength={campo.max}
                    onChange={(e) => setValores({ ...valores, [campo.key]: e.target.value })}
                    className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                )}
                <p className="text-[11.5px] text-muted-foreground mt-1">{campo.ayuda}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex items-center gap-4 border-t border-border pt-5">
          <button
            onClick={guardar}
            disabled={pending}
            className="btn-primary px-5 py-2.5 text-sm rounded-lg transition-all flex items-center gap-2"
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {pending ? "Guardando..." : "Guardar vocabulario"}
          </button>
          {mensaje && (
            <span className={`text-sm font-medium ${mensaje.tipo === "ok" ? "text-emerald-600" : "text-red-600"}`}>
              {mensaje.texto}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
