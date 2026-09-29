"use client";

import { useState } from "react";
import { X, Barcode, AlertCircle } from "lucide-react";

interface EscanearModalProps {
  onCerrar: () => void;
  // Se llama con el código que se teclea o que "escribe" el lector físico
  // (USB/Bluetooth) — POSClient.tsx decide qué hacer con él (buscar el
  // producto, etc.), este componente no sabe nada de productos.
  onCodigoDetectado: (codigo: string) => void;
  // Mensaje del padre (ej. "no se encontró ningún producto con ese
  // código") — se pasa desde fuera porque solo POSClient.tsx sabe si el
  // código escaneado corresponde a un producto real.
  error?: string | null;
}

/**
 * Captura de código de barras — SOLO lector físico (USB/Bluetooth) o
 * tecleado a mano. Nunca cámara.
 *
 * 2026-09-29, a petición explícita de Carlos: la primera versión de este
 * componente (2026-09-22) usaba @zxing/browser para leer el código con la
 * cámara del dispositivo, con este mismo campo de texto como respaldo si la
 * cámara fallaba. Carlos reportó que en su operación real (mostrador con
 * lector físico de mano o tecleo manual, computadoras de escritorio) la
 * cámara se activaba sola cada vez que se abría esta ventana, sin que nadie
 * la pidiera — un lector físico ES, eléctricamente, un teclado que "escribe"
 * el código y presiona Enter, así que nunca necesitó la cámara para
 * funcionar. Se quitó @zxing/browser por completo (antes la única razón de
 * esa dependencia en el proyecto — ver package.json) — este campo, con
 * autoFocus, es ahora el único mecanismo: un lector físico escribe aquí
 * exactamente igual que antes, sin ningún cambio de comportamiento para
 * quien ya lo usaba así.
 */
export default function EscanearModal({ onCerrar, onCodigoDetectado, error }: EscanearModalProps) {
  const [codigo, setCodigo] = useState("");

  const enviar = () => {
    const valor = codigo.trim();
    if (!valor) return;
    onCodigoDetectado(valor);
    setCodigo("");
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div
        className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-medium text-foreground flex items-center gap-2">
            <Barcode className="w-4 h-4 text-primary-text" /> Escanear código
          </span>
          <button onClick={onCerrar} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <p className="flex items-start gap-1.5 text-[12.5px] text-amber-600">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {error}
            </p>
          )}
          <p className="text-[11.5px] text-muted-foreground">
            Usa tu lector de código de barras, o teclealo aquí:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enviar()}
              autoFocus
              placeholder="Código de barras..."
              className="flex-1 min-w-0 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
            />
            <button
              onClick={enviar}
              className="px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-medium transition-colors"
            >
              Buscar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
