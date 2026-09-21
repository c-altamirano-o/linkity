"use client";

import { useRef, useState } from "react";

/**
 * Captura de firma dibujada a mano (canvas), reutilizable — Consentimiento
 * Informado (M17 Fase 2) y, a futuro, Recetas digitales usan exactamente
 * este mismo componente. Es una firma SIMULADA (PNG en base64), no una
 * firma electrónica avanzada — ver el comentario en
 * lib/consentimiento-templates.ts (NOTA_FIRMA_SIMULADA) para el texto que
 * se le muestra al usuario final sobre esto.
 *
 * onChange recibe null mientras el canvas está vacío, y el PNG en base64
 * en cuanto hay al menos un trazo — el formulario que lo usa decide si
 * bloquea el envío mientras sea null.
 */
export default function FirmaCanvas({
  onChange,
  className,
}: {
  onChange: (dataUrl: string | null) => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const trazoHecho = useRef(false);
  const [vacio, setVacio] = useState(true);

  function coordenadas(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function iniciar(e: React.PointerEvent<HTMLCanvasElement>) {
    dibujando.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = coordenadas(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function trazar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = coordenadas(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineTo(x, y);
    ctx.stroke();
    trazoHecho.current = true;
    if (vacio) setVacio(false);
  }

  function terminar() {
    if (!dibujando.current) return;
    dibujando.current = false;
    const canvas = canvasRef.current!;
    onChange(trazoHecho.current ? canvas.toDataURL("image/png") : null);
  }

  function limpiar() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    trazoHecho.current = false;
    setVacio(true);
    onChange(null);
  }

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        width={500}
        height={160}
        onPointerDown={iniciar}
        onPointerMove={trazar}
        onPointerUp={terminar}
        onPointerLeave={terminar}
        className="w-full h-[160px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white touch-none cursor-crosshair"
      />
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-[11px] text-slate-400">
          {vacio ? "Firma aquí con el mouse o el dedo" : "Firma capturada"}
        </p>
        <button
          type="button"
          onClick={limpiar}
          disabled={vacio}
          className="text-xs text-primary hover:underline disabled:opacity-40 disabled:no-underline"
        >
          Borrar
        </button>
      </div>
    </div>
  );
}
