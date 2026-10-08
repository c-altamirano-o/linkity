import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "node:crypto";
import { cifrar, descifrar, cifradoDisponible } from "@/lib/cifrado-config";

/**
 * Configuración de la PLATAFORMA editable desde Panel Maestro (2026-10-08, a
 * petición de Carlos: "quiero que todo eso sea configurable desde Panel
 * Maestro, no quiero que nada viva en el código"). Hoy guarda el WhatsApp
 * Business de LINKITY (el que avisa a los negocios de su suscripción). El
 * WhatsApp propio de cada negocio es otra cosa y vive en Tenant.whatsapp*.
 *
 * Tabla clave/valor (ConfiguracionPlataforma): agregar otro ajuste de la
 * plataforma es agregar claves, sin migración. Los secretos se guardan
 * cifrados (lib/cifrado-config.ts). Orden de resolución: lo guardado en Panel
 * Maestro manda; si no hay, se usan las variables de entorno que existían
 * antes (WHATSAPP_BUSINESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
 * WHATSAPP_WEBHOOK_VERIFY_TOKEN) para no romper una instalación ya configurada.
 */

export const CAMPOS_WHATSAPP = ["numero", "phoneNumberId", "accessToken", "appSecret", "verifyToken", "plantilla", "idioma"] as const;
export type CampoWhatsapp = (typeof CAMPOS_WHATSAPP)[number];

const SECRETOS: ReadonlySet<CampoWhatsapp> = new Set<CampoWhatsapp>(["accessToken", "appSecret", "verifyToken"]);
const clave = (c: CampoWhatsapp) => `whatsapp.${c}`;

export const PLANTILLA_POR_DEFECTO = "aviso_suscripcion_linkity";
export const IDIOMA_POR_DEFECTO = "es_MX";

export interface WhatsappPlataforma {
  /** Número en formato internacional sin espacios, ej. "+526140000000" (informativo). */
  numero: string | null;
  phoneNumberId: string | null;
  accessToken: string | null;
  appSecret: string | null;
  verifyToken: string | null;
  plantilla: string;
  idioma: string;
}

type FilaCfg = { clave: string; valor: string; cifrado: boolean };

function valorDeClave(filas: FilaCfg[], claveCompleta: string): string | null {
  const fila = filas.find((f) => f.clave === claveCompleta);
  if (!fila) return null;
  if (!fila.cifrado) return fila.valor || null;
  const claro = descifrar(fila.valor);
  if (claro === null) {
    console.error(`❌ No se pudo descifrar ${claveCompleta} (¿cambió CONFIG_ENCRYPTION_KEY?). Vuelve a capturarlo en Panel Maestro → Conexiones.`);
  }
  return claro || null;
}

function leerValor(filas: FilaCfg[], c: CampoWhatsapp): string | null {
  return valorDeClave(filas, clave(c));
}

async function cargarFilasConPrefijo(prefijo: string): Promise<FilaCfg[]> {
  return prisma.configuracionPlataforma.findMany({
    where: { clave: { startsWith: prefijo } },
    select: { clave: true, valor: true, cifrado: true },
  });
}

async function cargarFilas(): Promise<FilaCfg[]> {
  return cargarFilasConPrefijo("whatsapp.");
}

/** Valores efectivos (con respaldo a variables de entorno). Una consulta por petición. */
export const obtenerWhatsappPlataforma = cache(async (): Promise<WhatsappPlataforma> => {
  let filas: FilaCfg[] = [];
  try {
    filas = await cargarFilas();
  } catch (err) {
    console.error("❌ No se pudo leer la configuración de la plataforma (se usan las variables de entorno):", err);
  }
  return {
    numero: leerValor(filas, "numero"),
    phoneNumberId: leerValor(filas, "phoneNumberId") ?? (process.env.WHATSAPP_PHONE_NUMBER_ID || null),
    accessToken: leerValor(filas, "accessToken") ?? (process.env.WHATSAPP_BUSINESS_TOKEN || null),
    appSecret: leerValor(filas, "appSecret"),
    verifyToken: leerValor(filas, "verifyToken") ?? (process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || null),
    plantilla: leerValor(filas, "plantilla") ?? PLANTILLA_POR_DEFECTO,
    idioma: leerValor(filas, "idioma") ?? IDIOMA_POR_DEFECTO,
  };
});

// ---------------------------------------------------------------------------
// Para la pantalla de Panel Maestro: los secretos NUNCA salen completos.
// ---------------------------------------------------------------------------

export interface CampoEnmascarado {
  configurado: boolean;
  /** Últimos 4 caracteres, solo para reconocerlo ("••••a1b2"). */
  ultimos: string | null;
}

export interface WhatsappPlataformaPanel {
  cifradoListo: boolean;
  numero: string | null;
  phoneNumberId: string | null;
  plantilla: string;
  idioma: string;
  accessToken: CampoEnmascarado;
  appSecret: CampoEnmascarado;
  verifyToken: CampoEnmascarado;
}

function enmascarar(valor: string | null): CampoEnmascarado {
  return valor ? { configurado: true, ultimos: valor.length > 4 ? valor.slice(-4) : null } : { configurado: false, ultimos: null };
}

export async function obtenerWhatsappPlataformaParaPanel(): Promise<WhatsappPlataformaPanel> {
  const v = await obtenerWhatsappPlataforma();
  return {
    cifradoListo: cifradoDisponible(),
    numero: v.numero,
    phoneNumberId: v.phoneNumberId,
    plantilla: v.plantilla,
    idioma: v.idioma,
    accessToken: enmascarar(v.accessToken),
    appSecret: enmascarar(v.appSecret),
    verifyToken: enmascarar(v.verifyToken),
  };
}

// ---------------------------------------------------------------------------
// Escritura (solo desde Server Actions de Panel Maestro, ya autorizadas)
// ---------------------------------------------------------------------------

export async function guardarCamposWhatsapp(cambios: Partial<Record<CampoWhatsapp, string>>, quitar: CampoWhatsapp[]): Promise<void> {
  const operaciones = [];
  for (const campo of CAMPOS_WHATSAPP) {
    const valor = cambios[campo];
    if (valor === undefined) continue;
    const esSecreto = SECRETOS.has(campo);
    operaciones.push(
      prisma.configuracionPlataforma.upsert({
        where: { clave: clave(campo) },
        create: { clave: clave(campo), valor: esSecreto ? cifrar(valor) : valor, cifrado: esSecreto },
        update: { valor: esSecreto ? cifrar(valor) : valor, cifrado: esSecreto },
      })
    );
  }
  if (quitar.length > 0) {
    operaciones.push(prisma.configuracionPlataforma.deleteMany({ where: { clave: { in: quitar.map(clave) } } }));
  }
  if (operaciones.length > 0) await prisma.$transaction(operaciones);
}

export function esCampoSecreto(c: CampoWhatsapp): boolean {
  return SECRETOS.has(c);
}

// ---------------------------------------------------------------------------
// Datos que Linkity aprende solo (Panel Maestro → Conexiones, 2026-10-08)
// ---------------------------------------------------------------------------

const CLAVE_CONTACTO_META = "whatsapp.metaContactoAt";
const CLAVE_APP_ID = "whatsapp.appId";

export interface EstadoExtraWhatsapp {
  /** Última vez que Meta contactó a Linkity (verificó el webhook o mandó un aviso firmado). ISO. */
  metaContactoAt: string | null;
  /** ID de la app de Meta (se aprende solo en la prueba de conexión; sirve para armar enlaces directos). */
  appId: string | null;
}

export async function obtenerEstadoExtraWhatsapp(): Promise<EstadoExtraWhatsapp> {
  let filas: FilaCfg[] = [];
  try {
    filas = await cargarFilasConPrefijo("whatsapp.");
  } catch (err) {
    console.error("❌ No se pudo leer el estado extra de WhatsApp:", err);
  }
  return { metaContactoAt: valorDeClave(filas, CLAVE_CONTACTO_META), appId: valorDeClave(filas, CLAVE_APP_ID) };
}

async function guardarClaveSimple(claveCompleta: string, valor: string): Promise<void> {
  await prisma.configuracionPlataforma.upsert({
    where: { clave: claveCompleta },
    create: { clave: claveCompleta, valor, cifrado: false },
    update: { valor, cifrado: false },
  });
}

/** Lo llama el webhook de WhatsApp cuando Meta verifica la URL o manda un aviso firmado. Nunca lanza. */
export async function registrarContactoMeta(): Promise<void> {
  try {
    await guardarClaveSimple(CLAVE_CONTACTO_META, new Date().toISOString());
  } catch (err) {
    console.error("No se pudo registrar el contacto de Meta (se ignora):", err);
  }
}

export async function guardarAppIdWhatsapp(appId: string): Promise<void> {
  if (/^\d{5,30}$/.test(appId)) await guardarClaveSimple(CLAVE_APP_ID, appId);
}

/**
 * El verify token lo genera el sistema (el dueño no debe inventarlo): si no hay
 * ninguno guardado ni en variable de entorno, se crea uno al azar y se guarda
 * cifrado. Devuelve el valor vigente (o null si no hay llave de cifrado).
 */
export async function asegurarVerifyToken(): Promise<string | null> {
  const actual = (await obtenerWhatsappPlataforma()).verifyToken;
  if (actual) return actual;
  if (!cifradoDisponible()) return null;
  const nuevo = randomBytes(16).toString("hex");
  try {
    await guardarCamposWhatsapp({ verifyToken: nuevo }, []);
    return nuevo;
  } catch (err) {
    console.error("No se pudo generar el verify token:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hotmart (2026-10-08): antes vivía en variables de entorno de Vercel. Ahora se
// captura en Panel Maestro → Conexiones; las variables anteriores
// (HOTMART_HOTTOK, HOTMART_CHECKOUT_URL) siguen valiendo como respaldo.
// ---------------------------------------------------------------------------

const CLAVE_HOTTOK = "hotmart.hottok";
const CLAVE_CHECKOUT = "hotmart.checkoutUrl";

export interface HotmartPlataforma {
  hottok: string | null;
  checkoutUrl: string | null;
}

export const obtenerHotmartPlataforma = cache(async (): Promise<HotmartPlataforma> => {
  let filas: FilaCfg[] = [];
  try {
    filas = await cargarFilasConPrefijo("hotmart.");
  } catch (err) {
    console.error("❌ No se pudo leer la configuración de Hotmart (se usan las variables de entorno):", err);
  }
  return {
    hottok: valorDeClave(filas, CLAVE_HOTTOK) ?? (process.env.HOTMART_HOTTOK || null),
    checkoutUrl: valorDeClave(filas, CLAVE_CHECKOUT) ?? (process.env.HOTMART_CHECKOUT_URL || null),
  };
});

/** Link de pago de Hotmart (para el banner, la pantalla de bloqueo y los correos). */
export async function obtenerCheckoutUrl(): Promise<string | null> {
  return (await obtenerHotmartPlataforma()).checkoutUrl;
}

export interface HotmartPlataformaPanel {
  cifradoListo: boolean;
  hottok: CampoEnmascarado;
  checkoutUrl: string | null;
}

export async function obtenerHotmartPlataformaParaPanel(): Promise<HotmartPlataformaPanel> {
  const v = await obtenerHotmartPlataforma();
  return { cifradoListo: cifradoDisponible(), hottok: enmascarar(v.hottok), checkoutUrl: v.checkoutUrl };
}

export async function guardarHotmart(cambios: { hottok?: string; checkoutUrl?: string }): Promise<void> {
  const operaciones = [];
  if (cambios.hottok !== undefined) {
    operaciones.push(
      prisma.configuracionPlataforma.upsert({
        where: { clave: CLAVE_HOTTOK },
        create: { clave: CLAVE_HOTTOK, valor: cifrar(cambios.hottok), cifrado: true },
        update: { valor: cifrar(cambios.hottok), cifrado: true },
      })
    );
  }
  if (cambios.checkoutUrl !== undefined) {
    operaciones.push(
      prisma.configuracionPlataforma.upsert({
        where: { clave: CLAVE_CHECKOUT },
        create: { clave: CLAVE_CHECKOUT, valor: cambios.checkoutUrl, cifrado: false },
        update: { valor: cambios.checkoutUrl, cifrado: false },
      })
    );
  }
  if (operaciones.length > 0) await prisma.$transaction(operaciones);
}
