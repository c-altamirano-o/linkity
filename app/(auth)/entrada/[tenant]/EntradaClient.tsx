"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Delete, ArrowLeft, User } from "lucide-react";
import { iniciarSesionPersonalAction } from "@/app/actions/acceso-personal-actions";

/**
 * 2026-09-23: esta pantalla quedó SIN ninguna ruta que la use — tanto
 * app/(auth)/entrada/[tenant]/page.tsx como .../[tenant]/[branch]/page.tsx
 * ahora son puros redirect() hacia /[tenant] (ver AccesoNegocioClient.tsx,
 * la pantalla unificada de "¿quién eres?" + PIN que sustituyó a esta). No
 * pude borrar el archivo yo mismo (esta sesión no tiene una herramienta de
 * shell sobre tu compu, solo lectura/escritura de archivos) — si quieres
 * quitarlo del todo basta con:
 *   Remove-Item "app\(auth)\entrada\[tenant]\EntradaClient.tsx"
 * Mientras tanto, solo se actualizó lo mínimo para que compile (PIN de 6
 * dígitos y el nuevo tipo de resultado con autorización de dispositivo) —
 * como nada la enruta, nunca se renderiza.
 */

interface EmpleadoOption {
  id: string;
  name: string;
  position: string | null;
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default function EntradaClient({
  tenantSlug,
  branchId,
  businessName,
  branchName,
  empleados,
}: {
  tenantSlug: string;
  branchId: string;
  businessName: string;
  branchName: string;
  empleados: EmpleadoOption[];
}) {
  const [seleccionado, setSeleccionado] = useState<EmpleadoOption | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const elegir = (emp: EmpleadoOption) => {
    setSeleccionado(emp);
    setPin("");
    setError(null);
  };

  const volver = () => {
    setSeleccionado(null);
    setPin("");
    setError(null);
  };

  const tecla = (d: string) => {
    if (pending || pin.length >= 6) return;
    const siguiente = pin + d;
    setPin(siguiente);
    setError(null);
    if (siguiente.length === 6 && seleccionado) {
      startTransition(async () => {
        const res = await iniciarSesionPersonalAction({ tenantSlug, staffId: seleccionado.id, pin: siguiente, branchId });
        if (res.ok) {
          window.location.href = `/${tenantSlug}/dashboard`;
        } else if (res.necesitaAutorizacion) {
          // Ruta muerta (ver comentario de archivo) — esta pantalla no tiene
          // el flujo de espera/autorización de AccesoNegocioClient.tsx.
          setError("Este dispositivo necesita autorización — usa el link principal de entrada del negocio.");
          setPin("");
        } else {
          setError(res.error);
          setPin("");
        }
      });
    }
  };

  const borrar = () => {
    if (pending) return;
    setPin((p) => p.slice(0, -1));
    setError(null);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-xs text-muted-foreground tracking-widest uppercase mb-1">
            {businessName} · {branchName}
          </p>
          <h1 className="text-xl font-semibold text-foreground">
            {seleccionado ? `Hola, ${seleccionado.name.split(" ")[0]}` : "¿Quién eres?"}
          </h1>
          {!seleccionado && <p className="text-sm text-muted-foreground mt-1">Toca tu nombre para entrar</p>}
        </div>

        {!seleccionado ? (
          <>
            {empleados.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
                Todavía no hay personal con acceso configurado en este negocio.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {empleados.map((emp) => (
                  <button
                    key={emp.id}
                    onClick={() => elegir(emp)}
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
            <div className="text-center mt-8">
              <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                <User className="w-3 h-3" /> ¿Eres el administrador? Inicia sesión con tu correo
              </Link>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-3 mb-6">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full border-2 transition-colors ${
                    i < pin.length ? "bg-primary border-primary" : "border-border"
                  }`}
                />
              ))}
            </div>

            {error && <p className="text-xs text-red-600 mb-4">{error}</p>}
            {pending && <p className="text-xs text-muted-foreground mb-4">Verificando...</p>}

            <div className="grid grid-cols-3 gap-3 w-full max-w-[240px]">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button
                  key={d}
                  disabled={pending}
                  onClick={() => tecla(d)}
                  className="aspect-square rounded-xl bg-card border border-border text-lg font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                >
                  {d}
                </button>
              ))}
              <button
                disabled={pending}
                onClick={volver}
                className="aspect-square rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button
                disabled={pending}
                onClick={() => tecla("0")}
                className="aspect-square rounded-xl bg-card border border-border text-lg font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
              >
                0
              </button>
              <button
                disabled={pending}
                onClick={borrar}
                className="aspect-square rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            <button onClick={volver} className="mt-6 text-xs text-muted-foreground hover:text-foreground">
              No soy {seleccionado.name.split(" ")[0]}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
