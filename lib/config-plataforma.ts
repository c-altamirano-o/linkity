import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
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

function leerValor(filas: FilaCfg[], c: CampoWhatsapp): string | null {
  const fila = filas.find((f) => f.clave === clave(c));
  if (!fila) return null;
  if (!fila.cifrado) return fila.valor || null;
  const claro = descifrar(fila.valor);
  if (claro === null) {
    console.error(`❌ No se pudo descifrar ${clave(c)} (¿cambió CONFIG_ENCRYPTION_KEY?). Vuelve a capturarlo en Panel Maestro → Configuración.`);
  }
  return claro || null;
}

async function cargarFilas(): Promise<FilaCfg[]> {
  return prisma.configuracionPlataforma.findMany({
    where: { clave: { startsWith: "whatsapp." } },
    select: { clave: true, valor: true, cifrado: true },
  });
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
