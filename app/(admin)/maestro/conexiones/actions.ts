"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/maestro-auth";
import { cifradoDisponible } from "@/lib/cifrado-config";
import {
  obtenerWhatsappPlataforma,
  obtenerEstadoExtraWhatsapp,
  guardarCamposWhatsapp,
  guardarAppIdWhatsapp,
  guardarHotmart,
  esCampoSecreto,
  type CampoWhatsapp,
} from "@/lib/config-plataforma";
import {
  VERSION_GRAPH,
  mensajeErrorMeta,
  horasRestantes,
  resumenVigenciaToken,
  formatearNumeroInternacional,
  type NivelPrueba,
} from "@/lib/conexiones-meta";

/**
 * Acciones de Panel Maestro → Conexiones (2026-10-08). Todas exigen un
 * administrador de Panel Maestro. Reglas heredadas de la pantalla anterior:
 *  - Un campo vacío NO se toca (así nadie borra un secreto sin querer).
 *  - Los secretos solo se guardan si hay CONFIG_ENCRYPTION_KEY: nunca en claro.
 *  - Cada valor se valida por su forma antes de guardarse.
 */

export type AccionResult = { ok: true } | { ok: false; error: string };

const limpio = (v: string | undefined) => (typeof v === "string" ? v.trim() : "");

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

export interface GuardarWhatsappParams {
  phoneNumberId?: string;
  accessToken?: string;
  appSecret?: string;
  plantilla?: string;
  idioma?: string;
}

export async function guardarWhatsappAction(params: GuardarWhatsappParams): Promise<AccionResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  const cambios: Partial<Record<CampoWhatsapp, string>> = {};

  const phoneNumberId = limpio(params.phoneNumberId);
  if (phoneNumberId) {
    if (!/^\d{6,25}$/.test(phoneNumberId)) {
      return { ok: false, error: "El Phone Number ID son solo números (sin espacios ni letras). Cópialo tal cual de Meta." };
    }
    cambios.phoneNumberId = phoneNumberId;
  }

  const accessToken = limpio(params.accessToken);
  if (accessToken) {
    if (accessToken.length < 20 || accessToken.length > 2000 || /\s/.test(accessToken)) {
      return { ok: false, error: "El token de acceso no parece completo. Cópialo otra vez de Meta (es un texto largo, sin espacios)." };
    }
    cambios.accessToken = accessToken;
  }

  const appSecret = limpio(params.appSecret);
  if (appSecret) {
    if (!/^[A-Za-z0-9]{16,128}$/.test(appSecret)) {
      return { ok: false, error: "El App Secret no parece válido: son letras y números, sin espacios. Cópialo otra vez de Meta." };
    }
    cambios.appSecret = appSecret;
  }

  const plantilla = limpio(params.plantilla);
  if (plantilla) {
    if (!/^[a-z0-9_]{1,512}$/.test(plantilla)) return { ok: false, error: "El nombre de la plantilla solo lleva minúsculas, números y guion bajo." };
    cambios.plantilla = plantilla;
  }

  const idioma = limpio(params.idioma);
  if (idioma) {
    if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(idioma)) return { ok: false, error: "El idioma debe verse como es_MX." };
    cambios.idioma = idioma;
  }

  if (Object.keys(cambios).length === 0) return { ok: false, error: "No hay nada nuevo que guardar." };

  if ((Object.keys(cambios) as CampoWhatsapp[]).some(esCampoSecreto) && !cifradoDisponible()) {
    return { ok: false, error: "Falta configurar la llave de cifrado en el servidor (CONFIG_ENCRYPTION_KEY). Sin ella no se pueden guardar claves." };
  }

  try {
    await guardarCamposWhatsapp(cambios, []);
    revalidatePath("/maestro/conexiones");
    return { ok: true };
  } catch (err) {
    console.error("Error al guardar la configuración de WhatsApp:", err);
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }
}

export interface PruebaItem {
  id: string;
  nivel: NivelPrueba;
  titulo: string;
  detalle: string;
}

export type ProbarResult = { ok: true; items: PruebaItem[] } | { ok: false; error: string };

async function graph(ruta: string, token: string, extra: Record<string, string> = {}): Promise<{ status: number; json: any }> {
  const url = new URL(`https://graph.facebook.com/${VERSION_GRAPH}/${ruta}`);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

/**
 * «Probar conexión»: NO envía ningún mensaje. Pregunta a Meta si el token y el
 * Phone Number ID funcionan, cuánto le queda al token, si el App Secret
 * corresponde a la app, y revisa si Meta ya contactó a Linkity.
 */
export async function probarWhatsappAction(): Promise<ProbarResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  const cfg = await obtenerWhatsappPlataforma();
  const items: PruebaItem[] = [];

  if (!cfg.phoneNumberId || !cfg.accessToken) {
    return {
      ok: true,
      items: [
        {
          id: "datos",
          nivel: "error",
          titulo: "Faltan datos",
          detalle: "Pega el Phone Number ID y el token de acceso en el paso 1 y pulsa Guardar.",
        },
      ],
    };
  }

  // 1) ¿El token y el número funcionan?
  try {
    const r = await graph(cfg.phoneNumberId, cfg.accessToken, { fields: "display_phone_number,verified_name" });
    if (r.status >= 400 || r.json?.error) {
      items.push({ id: "numero", nivel: "error", titulo: "No se pudo conectar con tu número", detalle: mensajeErrorMeta(r.json?.error, "numero") });
      return { ok: true, items };
    }
    const visible: string = typeof r.json?.display_phone_number === "string" ? r.json.display_phone_number : "";
    const nombre: string = typeof r.json?.verified_name === "string" ? r.json.verified_name : "";
    const internacional = formatearNumeroInternacional(visible);
    if (internacional && internacional !== cfg.numero) {
      try {
        await guardarCamposWhatsapp({ numero: internacional }, []);
      } catch {
        /* informativo: si no se guarda, no pasa nada */
      }
    }
    items.push({
      id: "numero",
      nivel: "ok",
      titulo: "Número conectado",
      detalle: [nombre, visible].filter(Boolean).join(" · ") || "Meta reconoce tu número.",
    });
  } catch {
    return { ok: true, items: [{ id: "numero", nivel: "error", titulo: "Meta no respondió", detalle: "No se pudo contactar a Meta (sin respuesta). Intenta de nuevo en un momento." }] };
  }

  // 2) Vigencia del token (y de paso, el ID de la app)
  let appId: string | null = null;
  try {
    const d = await graph("debug_token", cfg.accessToken, { input_token: cfg.accessToken });
    const datos = d.json?.data;
    if (d.status < 400 && datos && typeof datos === "object" && !datos.error) {
      if (datos.is_valid === false) {
        items.push({ id: "vigencia", nivel: "error", titulo: "Token sin validez", detalle: "Meta dice que este token ya no es válido. Genera uno nuevo." });
      } else {
        const v = resumenVigenciaToken(horasRestantes(Number(datos.expires_at) || 0));
        items.push({ id: "vigencia", nivel: v.nivel, titulo: v.nivel === "ok" ? "Token vigente" : v.nivel === "aviso" ? "Token temporal" : "Token vencido", detalle: v.texto });
      }
      if (typeof datos.app_id === "string" && /^\d{5,30}$/.test(datos.app_id)) {
        const idApp: string = datos.app_id;
        appId = idApp;
        await guardarAppIdWhatsapp(idApp);
      }
    } else {
      items.push({
        id: "vigencia",
        nivel: "aviso",
        titulo: "No se pudo ver cuándo vence el token",
        detalle: "Si lo generaste hoy en «Configuración de la API», dura solo 24 horas: antes de usarlo con clientes crea uno permanente.",
      });
    }
  } catch {
    /* sin vigencia: no bloquea el resto */
  }

  // 3) App Secret
  if (!cfg.appSecret) {
    items.push({
      id: "secret",
      nivel: "aviso",
      titulo: "Falta el App Secret",
      detalle: "Sin él Linkity no puede comprobar que los avisos vienen de Meta. Pégalo en el paso 1.",
    });
  } else if (appId) {
    try {
      const url = new URL(`https://graph.facebook.com/${VERSION_GRAPH}/${appId}`);
      url.searchParams.set("fields", "name");
      url.searchParams.set("access_token", `${appId}|${cfg.appSecret}`);
      const res = await fetch(url, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
      const json: any = await res.json().catch(() => null);
      if (res.status >= 400 || json?.error) {
        items.push({ id: "secret", nivel: "error", titulo: "App Secret incorrecto", detalle: mensajeErrorMeta(json?.error, "secret") });
      } else {
        items.push({ id: "secret", nivel: "ok", titulo: "App Secret correcto", detalle: typeof json?.name === "string" ? `App de Meta: ${json.name}` : "Corresponde a tu app de Meta." });
      }
    } catch {
      /* no bloquea */
    }
  }

  // 4) ¿Meta ya contactó a Linkity?
  const extra = await obtenerEstadoExtraWhatsapp();
  if (extra.metaContactoAt) {
    items.push({
      id: "meta",
      nivel: "ok",
      titulo: "Meta ya está conectada con Linkity",
      detalle: `Último contacto: ${new Date(extra.metaContactoAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}.`,
    });
  } else {
    items.push({
      id: "meta",
      nivel: "aviso",
      titulo: "Meta todavía no se ha conectado con Linkity",
      detalle: "Haz el paso 2: pega la dirección y el código en Meta y pulsa «Verificar y guardar».",
    });
  }

  revalidatePath("/maestro/conexiones");
  return { ok: true, items };
}

// ---------------------------------------------------------------------------
// Hotmart
// ---------------------------------------------------------------------------

export interface GuardarHotmartParams {
  hottok?: string;
  checkoutUrl?: string;
}

export async function guardarHotmartAction(params: GuardarHotmartParams): Promise<AccionResult> {
  const resuelto = await requireSuperAdmin();
  if (!resuelto.ok) return { ok: false, error: resuelto.error };

  const cambios: { hottok?: string; checkoutUrl?: string } = {};

  const hottok = limpio(params.hottok);
  if (hottok) {
    if (hottok.length < 10 || hottok.length > 200 || /\s/.test(hottok)) {
      return { ok: false, error: "La clave de Hotmart (Hottok) no parece completa. Cópiala otra vez de Hotmart, sin espacios." };
    }
    if (!cifradoDisponible()) {
      return { ok: false, error: "Falta configurar la llave de cifrado en el servidor (CONFIG_ENCRYPTION_KEY). Sin ella no se pueden guardar claves." };
    }
    cambios.hottok = hottok;
  }

  const checkoutUrl = limpio(params.checkoutUrl);
  if (checkoutUrl) {
    let url: URL;
    try {
      url = new URL(checkoutUrl);
    } catch {
      return { ok: false, error: "El link de pago no es una dirección válida. Debe empezar con https://" };
    }
    if (url.protocol !== "https:" || checkoutUrl.length > 500) {
      return { ok: false, error: "El link de pago debe empezar con https:// y ser una sola dirección." };
    }
    cambios.checkoutUrl = checkoutUrl;
  }

  if (Object.keys(cambios).length === 0) return { ok: false, error: "No hay nada nuevo que guardar." };

  try {
    await guardarHotmart(cambios);
    revalidatePath("/maestro/conexiones");
    revalidatePath("/maestro/hotmart");
    return { ok: true };
  } catch (err) {
    console.error("Error al guardar la configuración de Hotmart:", err);
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }
}
