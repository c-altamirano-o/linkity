import "server-only";

import { prisma } from "@/lib/prisma";
import { cifradoDisponible } from "@/lib/cifrado-config";
import {
  asegurarVerifyToken,
  obtenerEstadoExtraWhatsapp,
  obtenerHotmartPlataforma,
  obtenerWhatsappPlataforma,
  type CampoEnmascarado,
} from "@/lib/config-plataforma";

/**
 * Datos de Panel Maestro → Conexiones (2026-10-08): todo lo que el dueño
 * necesita ver en una sola pantalla para dejar WhatsApp y Hotmart funcionando.
 * Los secretos nunca salen completos; el verify token sí se muestra completo
 * porque el dueño debe copiarlo a Meta (solo sirve para el saludo inicial del
 * webhook y esta pantalla es exclusiva del administrador).
 */

export interface ConexionesData {
  sitio: string;
  cifradoListo: boolean;
  whatsapp: {
    phoneNumberId: string | null;
    numero: string | null;
    accessToken: CampoEnmascarado;
    appSecret: CampoEnmascarado;
    verifyToken: string | null;
    plantilla: string;
    idioma: string;
    metaContactoAt: string | null;
    appId: string | null;
  };
  hotmart: {
    hottok: CampoEnmascarado;
    checkoutUrl: string | null;
    planesActivos: number;
    planesSinCodigo: number;
    ultimoEventoAt: string | null;
    pendientes: number;
  };
}

function enmascarar(valor: string | null): CampoEnmascarado {
  return valor ? { configurado: true, ultimos: valor.length > 4 ? valor.slice(-4) : null } : { configurado: false, ultimos: null };
}

export async function getConexionesData(sitio: string): Promise<ConexionesData> {
  // Primero se asegura el verify token (lo genera el sistema si no existe) y
  // DESPUÉS se lee la configuración, para que la lectura ya lo incluya.
  await asegurarVerifyToken();

  const [wa, extra, hm, planes, ultimo, pendientes] = await Promise.all([
    obtenerWhatsappPlataforma(),
    obtenerEstadoExtraWhatsapp(),
    obtenerHotmartPlataforma(),
    prisma.commercialPlan.findMany({
      where: { isActive: true },
      select: { hotmartProductId: true, hotmartOfferCode: true },
    }),
    prisma.hotmartEvent.findFirst({ orderBy: { receivedAt: "desc" }, select: { receivedAt: true } }),
    prisma.hotmartEvent.count({ where: { needsAttention: true, attendedAt: null } }),
  ]);

  return {
    sitio,
    cifradoListo: cifradoDisponible(),
    whatsapp: {
      phoneNumberId: wa.phoneNumberId,
      numero: wa.numero,
      accessToken: enmascarar(wa.accessToken),
      appSecret: enmascarar(wa.appSecret),
      verifyToken: wa.verifyToken,
      plantilla: wa.plantilla,
      idioma: wa.idioma,
      metaContactoAt: extra.metaContactoAt,
      appId: extra.appId,
    },
    hotmart: {
      hottok: enmascarar(hm.hottok),
      checkoutUrl: hm.checkoutUrl,
      planesActivos: planes.length,
      planesSinCodigo: planes.filter((p) => !p.hotmartProductId && !p.hotmartOfferCode).length,
      ultimoEventoAt: ultimo ? ultimo.receivedAt.toISOString() : null,
      pendientes,
    },
  };
}
