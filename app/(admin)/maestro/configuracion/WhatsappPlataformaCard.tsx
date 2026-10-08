"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Copy, Check, KeyRound, AlertTriangle } from "lucide-react";
import { PAISES_TELEFONO } from "@/lib/paises";
import type { WhatsappPlataformaPanel, CampoEnmascarado } from "@/lib/config-plataforma";
import { guardarWhatsappPlataformaAction } from "./whatsapp-actions";

/**
 * WhatsApp Business de LINKITY, editable desde Panel Maestro (2026-10-08). Los
 * secretos nunca vuelven completos al navegador: solo se ve si están
 * configurados y sus últimos 4 caracteres; para cambiarlos se escribe uno
 * nuevo (vacío = se conserva el actual).
 */

const CLASE_INPUT =
  "mt-1 w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[13px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]";

function separarNumero(numero: string | null): { pais: string; local: string } {
  if (numero) {
    const pais = [...PAISES_TELEFONO].sort((a, b) => b.code.length - a.code.length).find((p) => numero.startsWith(p.code));
    if (pais) return { pais: pais.code, local: numero.slice(pais.code.length) };
  }
  return { pais: PAISES_TELEFONO[0].code, local: "" };
}

function generarToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function Estado({ campo }: { campo: CampoEnmascarado }) {
  return campo.configurado ? (
    <span className="text-[11.5px] text-emerald-600">Configurado{campo.ultimos ? ` · ••••${campo.ultimos}` : ""}</span>
  ) : (
    <span className="text-[11.5px] text-amber-600">Sin configurar</span>
  );
}

export default function WhatsappPlataformaCard({ datos, urlWebhook }: { datos: WhatsappPlataformaPanel; urlWebhook: string }) {
  const router = useRouter();
  const inicial = separarNumero(datos.numero);
  const [numeroPais, setNumeroPais] = useState(inicial.pais);
  const [numeroLocal, setNumeroLocal] = useState(inicial.local);
  const [phoneNumberId, setPhoneNumberId] = useState(datos.phoneNumberId ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [plantilla, setPlantilla] = useState(datos.plantilla);
  const [idioma, setIdioma] = useState(datos.idioma);
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [pendiente, iniciar] = useTransition();

  function guardar() {
    setError("");
    setExito(false);
    iniciar(async () => {
      const res = await guardarWhatsappPlataformaAction({
        numeroPais,
        numeroLocal,
        phoneNumberId,
        accessToken,
        appSecret,
        verifyToken,
        plantilla,
        idioma,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAccessToken("");
      setAppSecret("");
      setVerifyToken("");
      setExito(true);
      router.refresh();
    });
  }

  async function copiarWebhook() {
    try {
      await navigator.clipboard.writeText(urlWebhook);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* sin portapapeles: la URL queda visible para copiarla a mano */
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <MessageCircle className="w-4 h-4 text-emerald-600" />
        <p className="text-[14.5px] font-medium text-slate-700">WhatsApp Business de Linkity</p>
      </div>
      <p className="text-[12px] text-slate-400 mb-3">
        Con este número Linkity avisa a los negocios de su suscripción (prueba por terminar, vencimiento, bloqueo). El WhatsApp de cada negocio
        con sus clientes se configura en la Configuración de cada negocio.
      </p>

      {!datos.cifradoListo && (
        <div className="mb-3 flex items-start gap-2 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Falta la variable <code className="font-mono">CONFIG_ENCRYPTION_KEY</code> en Vercel. Sin ella puedes guardar el número y la plantilla, pero no los
            secretos (token, App Secret y verify token).
          </span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-[12px] font-medium text-slate-500">Número de WhatsApp (con código de país)</label>
          <div className="flex gap-2">
            <select value={numeroPais} onChange={(e) => setNumeroPais(e.target.value)} className={`${CLASE_INPUT} w-[7.5rem] flex-shrink-0`}>
              {PAISES_TELEFONO.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.flag} {p.code}
                </option>
              ))}
            </select>
            <input
              type="tel"
              inputMode="numeric"
              value={numeroLocal}
              onChange={(e) => setNumeroLocal(e.target.value)}
              placeholder="10 dígitos"
              className={CLASE_INPUT}
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Solo informativo: la API usa el Phone Number ID.</p>
        </div>

        <div>
          <label className="text-[12px] font-medium text-slate-500">Phone Number ID</label>
          <input type="text" inputMode="numeric" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="Meta → WhatsApp → API Setup" className={CLASE_INPUT} />
        </div>

        <div className="sm:col-span-2">
          <div className="flex items-center justify-between">
            <label className="text-[12px] font-medium text-slate-500">API key (Access Token)</label>
            <Estado campo={datos.accessToken} />
          </div>
          <input type="password" autoComplete="off" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder={datos.accessToken.configurado ? "Vacío = conservar el actual" : "Pega el token de acceso permanente"} className={CLASE_INPUT} />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-[12px] font-medium text-slate-500">App Secret</label>
            <Estado campo={datos.appSecret} />
          </div>
          <input type="password" autoComplete="off" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder={datos.appSecret.configurado ? "Vacío = conservar el actual" : "Meta → Configuración → Básica"} className={CLASE_INPUT} />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-[12px] font-medium text-slate-500">Verify token del webhook</label>
            <Estado campo={datos.verifyToken} />
          </div>
          <div className="flex gap-2">
            <input type="password" autoComplete="off" value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} placeholder={datos.verifyToken.configurado ? "Vacío = conservar el actual" : "Inventa uno o genéralo"} className={CLASE_INPUT} />
            <button
              type="button"
              onClick={() => setVerifyToken(generarToken())}
              title="Generar uno al azar (se guarda al presionar Guardar; cópialo a Meta antes)"
              className="mt-1 px-2.5 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-700 hover:border-slate-300 flex-shrink-0"
            >
              <KeyRound className="w-4 h-4" />
            </button>
          </div>
          {verifyToken && (
            <p className="text-[11px] text-slate-500 mt-1 break-all">
              Valor a poner en Meta: <span className="font-mono">{verifyToken}</span>
            </p>
          )}
        </div>

        <div>
          <label className="text-[12px] font-medium text-slate-500">Plantilla aprobada en Meta</label>
          <input type="text" value={plantilla} onChange={(e) => setPlantilla(e.target.value)} className={CLASE_INPUT} />
        </div>
        <div>
          <label className="text-[12px] font-medium text-slate-500">Idioma de la plantilla</label>
          <input type="text" value={idioma} onChange={(e) => setIdioma(e.target.value)} placeholder="es_MX" className={CLASE_INPUT} />
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
        <p className="text-[11.5px] text-slate-500">URL del webhook para pegar en Meta (WhatsApp → Configuration → Webhook):</p>
        <div className="flex items-center gap-2 mt-1">
          <code className="text-[12px] text-slate-700 break-all flex-1">{urlWebhook}</code>
          <button type="button" onClick={copiarWebhook} className="text-slate-500 hover:text-slate-700 flex-shrink-0" title="Copiar">
            {copiado ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-[12.5px] text-red-600">{error}</p>}
      {exito && <p className="mt-3 text-[12.5px] text-emerald-600">Configuración guardada.</p>}

      <button
        type="button"
        onClick={guardar}
        disabled={pendiente}
        className="mt-3 px-3.5 py-1.5 text-[13px] rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white font-medium disabled:opacity-50"
      >
        {pendiente ? "Guardando…" : "Guardar"}
      </button>
    </div>
  );
}
