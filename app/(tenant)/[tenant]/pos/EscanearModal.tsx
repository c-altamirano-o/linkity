"use client";

import { useEffect, useRef, useState } from "react";
import { X, Camera, AlertCircle } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";

interface EscanearModalProps {
  onCerrar: () => void;
  // Se llama con CADA código que la cámara logra leer, uno por frame —
  // POSClient.tsx decide qué hacer con él (buscar el producto, filtrar
  // duplicados seguidos, etc.), este componente no sabe nada de productos.
  onCodigoDetectado: (codigo: string) => void;
  // Mensaje del padre (ej. "no se encontró ningún producto con ese
  // código") — se muestra junto al error propio de la cámara, si lo hay.
  // Se pasa desde fuera en vez de manejarlo aquí porque solo POSClient.tsx
  // sabe si el código escaneado corresponde a un producto real.
  error?: string | null;
}

/**
 * Escaneo de código de barras con la cámara del dispositivo (2026-09-22,
 * pendiente registrado: el botón "Escanear" de POS existía desde antes
 * —con su ícono y todo— pero no hacía nada al hacerle clic).
 *
 * Usa @zxing/browser (envoltura de ZXing para leer directo de un
 * <video>), que decodifica el stream de la cámara en el propio navegador,
 * frame por frame — nada se sube a ningún servidor ni se toma como foto.
 * BrowserMultiFormatReader lee tanto códigos 1D (EAN-13, UPC, Code128 —
 * los típicos de empaques de productos) como 2D (QR), sin tener que elegir
 * un formato de antemano.
 *
 * Fallback SIEMPRE visible, no solo si la cámara falla — cubre dos casos
 * reales de un negocio: (1) ya tienen un lector de código de barras físico
 * (USB/Bluetooth), que en la práctica es un teclado que "escribe" el
 * código y presiona Enter — funciona igual aquí, tecleando en este mismo
 * input, sin código adicional de por medio; (2) el navegador/dispositivo
 * niega el permiso de cámara, no la tiene, o falla por cualquier otra
 * razón — sin esto la pantalla se quedaría sin ninguna forma de continuar.
 */
export default function EscanearModal({ onCerrar, onCodigoDetectado, error }: EscanearModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);
  const [codigoManual, setCodigoManual] = useState("");

  useEffect(() => {
    let cancelado = false;
    const reader = new BrowserMultiFormatReader();

    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (resultado, _err, controls) => {
        if (cancelado) return;
        controlsRef.current = controls;
        if (resultado) onCodigoDetectado(resultado.getText());
        // El segundo argumento (_err) casi siempre es una NotFoundException
        // — ZXing la dispara en CADA frame donde todavía no encuentra
        // ningún código, es el flujo normal mientras se apunta la cámara,
        // no un error real que valga la pena mostrar.
      })
      .catch((err) => {
        if (cancelado) return;
        console.error("No se pudo iniciar la cámara para escanear:", err);
        setErrorCamara("No se pudo acceder a la cámara. Puedes escribir el código manualmente abajo.");
      });

    return () => {
      cancelado = true;
      controlsRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCodigoDetectado
    // se recrea en cada render de POSClient.tsx (no está en useCallback);
    // incluirlo reiniciaría la cámara en cada tecla que se escribe en la
    // búsqueda de productos, ya que ese estado vive en el mismo componente.
  }, []);

  const enviarManual = () => {
    const codigo = codigoManual.trim();
    if (!codigo) return;
    onCodigoDetectado(codigo);
    setCodigoManual("");
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div
        className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-medium text-foreground flex items-center gap-2">
            <Camera className="w-4 h-4 text-primary-text" /> Escanear código
          </span>
          <button onClick={onCerrar} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-black aspect-square relative overflow-hidden">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          <div className="absolute inset-8 border-2 border-primary/70 rounded-xl pointer-events-none" />
        </div>

        <div className="p-4 space-y-3">
          {(errorCamara || error) && (
            <p className="flex items-start gap-1.5 text-[12.5px] text-amber-600">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {errorCamara || error}
            </p>
          )}
          <p className="text-[11.5px] text-muted-foreground">
            Apunta la cámara al código de barras, o escríbelo aquí si tienes un lector físico o prefieres teclearlo:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={codigoManual}
              onChange={(e) => setCodigoManual(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enviarManual()}
              autoFocus
              placeholder="Código de barras..."
              className="flex-1 min-w-0 px-3 py-2 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:border-primary"
            />
            <button
              onClick={enviarManual}
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
