"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/maestro-auth";
import { PAISES_TELEFONO, validarTelefono } from "@/lib/paises";
import { cifradoDisponible } from "@/lib/cifrado-config";
import { guardarCamposWhatsapp, esCampoSecreto, CAMPOS_WHATSAPP, type CampoWhatsapp } from "@/lib/config-plataforma";

/**
 * Guarda el WhatsApp Business de LINKITY desde Panel Maestro → Configuración
 * (2026-10-08). Reglas:
 *  - Campo vacío = no se toca (así nadie borra un secreto sin querer al
 *    guardar otro dato). Para quitar un valor se usa `quitar` explícitamente.
 *  - Los secretos (token de acceso, App Secret, verify token) solo se guardan
 *    si hay CONFIG_ENCRYPTION_KEY: nunca se guardan en claro.
 *  - Cada valor se valida por su forma antes de guardarse.
 */

export interface GuardarWhatsappParams {
  /** Código de país del número ("+52") y número nacional (solo dígitos). */
  numeroPais?: string;
  numeroLocal?: string;
  phoneNumberId?: string;
  accessToken?: string;
  appSecret?: string;
  verifyToken?: string;
  plantilla?: string;
  idioma?: string;
  quitar?: CampoWhatsapp[];
}

export type GuardarWhatsappResult = { ok: true } | { ok: false; error: string };

export async function guardarWhatsappPlataformaAction(params: GuardarWhatsappParams): Promise<GuardarWhatsappResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  const cambios: Partial<Record<CampoWhatsapp, string>> = {};
  const limpio = (v: string | undefined) => (typeof v === "string" ? v.trim() : "");

  // Número (con código de país)
  const local = limpio(params.numeroLocal);
  if (local) {
    const pais = limpio(params.numeroPais);
    if (!PAISES_TELEFONO.some((p) => p.code === pais)) return { ok: false, error: "Elige el código de país del número" };
    const errNumero = validarTelefono(local, pais);
    if (errNumero) return { ok: false, error: errNumero };
    cambios.numero = `${pais}${local.replace(/\D/g, "")}`;
  }

  const phoneNumberId = limpio(params.phoneNumberId);
  if (phoneNumberId) {
    if (!/^\d{6,25}$/.test(phoneNumberId)) return { ok: false, error: "El Phone Number ID son solo dígitos (lo da Meta en WhatsApp → API Setup)" };
    cambios.phoneNumberId = phoneNumberId;
  }

  const accessToken = limpio(params.accessToken);
  if (accessToken) {
    if (accessToken.length < 20 || accessToken.length > 2000 || /\s/.test(accessToken)) {
      return { ok: false, error: "El token de acceso no parece válido (sin espacios, mínimo 20 caracteres)" };
    }
    cambios.accessToken = accessToken;
  }

  const appSecret = limpio(params.appSecret);
  if (appSecret) {
    if (!/^[A-Za-z0-9]{16,128}$/.test(appSecret)) return { ok: false, error: "El App Secret no parece válido (solo letras y números)" };
    cambios.appSecret = appSecret;
  }

  const verifyToken = limpio(params.verifyToken);
  if (verifyToken) {
    if (verifyToken.length < 8 || verifyToken.length > 100 || /\s/.test(verifyToken)) {
      return { ok: false, error: "El verify token debe tener de 8 a 100 caracteres, sin espacios" };
    }
    cambios.verifyToken = verifyToken;
  }

  const plantilla = limpio(params.plantilla);
  if (plantilla) {
    if (!/^[a-z0-9_]{1,512}$/.test(plantilla)) return { ok: false, error: "El nombre de la plantilla solo lleva minúsculas, números y guion bajo" };
    cambios.plantilla = plantilla;
  }

  const idioma = limpio(params.idioma);
  if (idioma) {
    if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(idioma)) return { ok: false, error: "El idioma debe verse como es_MX" };
    cambios.idioma = idioma;
  }

  const quitar = (params.quitar ?? []).filter((c): c is CampoWhatsapp => (CAMPOS_WHATSAPP as readonly string[]).includes(c));

  const guardaSecreto = (Object.keys(cambios) as CampoWhatsapp[]).some(esCampoSecreto);
  if (guardaSecreto && !cifradoDisponible()) {
    return { ok: false, error: "Falta la variable CONFIG_ENCRYPTION_KEY en Vercel (o no es válida). Sin ella no se guardan secretos." };
  }
  if (Object.keys(cambios).length === 0 && quitar.length === 0) return { ok: false, error: "No hay nada que guardar" };

  try {
    await guardarCamposWhatsapp(cambios, quitar);
    revalidatePath("/maestro/configuracion");
    return { ok: true };
  } catch (err) {
    console.error("Error al guardar la configuración de WhatsApp:", err);
    return { ok: false, error: "No se pudo guardar la configuración" };
  }
}
