import "server-only";
import { cookies } from "next/headers";
import { firmar } from "@/lib/staff-auth";

/**
 * "Dispositivo autorizado" por sucursal (2026-09-23, a petición de Carlos:
 * "que ningún empleado pueda entrar desde otro lugar y fingir que está en
 * la tienda"). A diferencia de la contraseña compartida de "puerta" que se
 * probó y se quitó el mismo día (ver app/(auth)/[tenant]/page.tsx), esto no
 * le pide nada al empleado en su día a día: la PC del mostrador se autoriza
 * UNA vez (por el administrador, aprobando la solicitud que dispara
 * iniciarSesionPersonalAction cuando un PIN correcto llega desde un
 * navegador nunca antes visto para esa sucursal — ver
 * app/actions/dispositivos-actions.ts) y desde ahí en adelante los PIN de
 * esa sucursal funcionan en ese navegador sin fricción. Cualquier OTRO
 * navegador (el celular del empleado, su casa) sigue sin poder entrar
 * aunque sepa el PIN correcto, hasta que también se autorice.
 *
 * Cookie por sucursal (no por tenant): un negocio de varias sucursales
 * autoriza cada mostrador por separado — autorizar la PC de una sucursal no
 * autoriza la de otra.
 */

const COOKIE_PREFIX = "linkity_confianza_";
const DURACION_CONFIANZA_MS = 365 * 24 * 60 * 60 * 1000; // 1 año — pensado para no volver a pedir nada mientras sea la misma PC del mostrador.

// Cuánto dura viva una solicitud de autorización antes de darse por vencida
// (SolicitudDispositivoStatus.EXPIRADO) — pasado este tiempo sin respuesta
// del administrador, el navegador en espera deja de tener caso seguir
// haciendo polling y le ofrece reintentar.
export const EXPIRACION_SOLICITUD_MS = 10 * 60 * 1000; // 10 minutos.

export async function crearConfianzaDispositivo(tenantId: string, branchId: string): Promise<void> {
  const exp = Date.now() + DURACION_CONFIANZA_MS;
  const payload = Buffer.from(JSON.stringify({ tenantId, branchId, exp })).toString("base64url");
  const firma = firmar(payload);
  const cookieStore = await cookies();
  cookieStore.set(`${COOKIE_PREFIX}${branchId}`, `${payload}.${firma}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_CONFIANZA_MS / 1000,
  });
}

export async function tieneConfianzaDispositivo(tenantId: string, branchId: string): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const valor = cookieStore.get(`${COOKIE_PREFIX}${branchId}`)?.value;
    if (!valor) return false;
    const [payload, firma] = valor.split(".");
    if (!payload || !firma || firma !== firmar(payload)) return false;
    const datos = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      tenantId: string;
      branchId: string;
      exp: number;
    };
    return (
      datos.tenantId === tenantId &&
      datos.branchId === branchId &&
      typeof datos.exp === "number" &&
      datos.exp >= Date.now()
    );
  } catch {
    return false;
  }
}
