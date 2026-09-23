import "server-only";
import { cookies } from "next/headers";
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "crypto";

/**
 * Sesión de "entrada por PIN" para empleados (M11 — Personal). Completamente
 * aparte de la sesión de Supabase Auth que usa el dueño/administrador en
 * /login: un empleado de PIN nunca tiene una cuenta real de Supabase Auth
 * que pueda usar ahí (ver el comentario largo en Staff.roleId, schema.prisma).
 *
 * Por qué una cookie firmada a mano en vez de, por ejemplo, un JWT con una
 * librería como `jose`: no hace falta nada del estándar JWT (expiración por
 * "claims" estándar, múltiples algoritmos, etc.) para este caso — es un
 * payload pequeño y fijo, firmado con HMAC-SHA256 usando el módulo `crypto`
 * que ya trae Node, sin agregar una dependencia nueva al proyecto.
 *
 * Por qué scrypt para el PIN (en vez de, por ejemplo, bcrypt): scrypt
 * también viene en el módulo `crypto` de Node — no hay ninguna librería de
 * hashing de contraseñas instalada en este proyecto (la única cuenta con
 * contraseña real, la del dueño, la maneja Supabase Auth del lado de
 * Supabase, nunca se hashea aquí). Un PIN de 6 dígitos (subido de 4 el
 * 2026-09-23, a petición de Carlos: "subir la dificultad... para evitar que
 * alguien ingrese por suerte a un usuario") tiene poca entropía por diseño
 * frente a una contraseña real (sigue siendo rápido de teclear en un
 * mostrador), así que la seguridad real depende de 3 cosas además del hash:
 * el PIN se valida
 * siempre contra UN tenant+empleado específico (nunca una búsqueda global
 * por PIN), fallarPinAction limita intentos seguidos (ver
 * app/actions/acceso-personal-actions.ts), y la cookie de sesión resultante
 * solo alcanza los módulos que el rol de ese empleado tiene permitidos
 * (lib/roles.ts) — nunca Personal, Configuración ni Facturación.
 */

const COOKIE_NAME = "linkity_staff";
const DURACION_SESION_MS = 12 * 60 * 60 * 1000; // 12h — cubre un turno completo sin que el empleado tenga que volver a teclear su PIN a media jornada.

export interface SesionPersonal {
  tenantId: string;
  staffId: string;
  userId: string; // el User "de atribución" oculto del empleado — ver Staff.userId en schema.prisma.
  staffName: string;
  roleName: string;
  // Sucursal asignada al empleado (Staff.branchId) — 2026-09-21, a petición
  // de Carlos ("debe servir desde un autoempleado hasta un corporativo con
  // muchas sucursales"). Antes esta sesión no cargaba ningún dato de
  // sucursal, así que un empleado con PIN podía ver/operar CUALQUIER
  // sucursal del negocio con solo cambiar el selector o el parámetro de la
  // URL — sin importar en cuál trabajaba de verdad. lib/actor.ts
  // (resolverActor/puedeOperarSucursal) y cada page.tsx de un módulo con
  // datos por sucursal (Caja, POS, Citas, Reparaciones, Inventario, Compras,
  // Reportes) usan este campo para acotar lo que ve y puede escribir un
  // empleado a la sucursal que de verdad tiene asignada — un administrador
  // con cuenta real (Supabase Auth) nunca pasa por aquí, así que sigue
  // viendo/operando todas las sucursales sin ningún cambio de comportamiento.
  branchId: string;
  // Campos para el registro de asistencia por login (lib/asistencia.ts,
  // 2026-09-16): loginSessionId es la fila de StaffLoginSession que abrió
  // esta sesión (para poder cerrarla al hacer logout o al detectar cambio
  // de día); loginAt es el epoch ms exacto del login, para calcular a qué
  // día calendario (México) pertenece esta sesión sin depender de `exp`
  // (que se mueve si algún día cambia DURACION_SESION_MS).
  loginSessionId: string;
  loginAt: number;
  exp: number; // epoch ms
}

function secreto(): string {
  const s = process.env.STAFF_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "Falta la variable de entorno STAFF_SESSION_SECRET (o es demasiado corta) — sin ella no se pueden firmar sesiones de PIN de personal."
    );
  }
  return s;
}

// Exportada para que lib/dispositivos-confianza.ts pueda firmar su propia
// cookie (confianza de dispositivo por sucursal) con el MISMO secreto —
// ambas cosas viven del lado del personal de PIN, así que no tiene caso
// pedirle a Carlos una segunda variable de entorno solo para esto.
export function firmar(payload: string): string {
  return createHmac("sha256", secreto()).update(payload).digest("base64url");
}

// ── PIN ──────────────────────────────────────────────────────────────────

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verificarPin(pin: string, hashGuardado: string): boolean {
  const [saltHex, hashHex] = hashGuardado.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const hashEsperado = Buffer.from(hashHex, "hex");
  const hashIntentado = scryptSync(pin, salt, 64);
  if (hashIntentado.length !== hashEsperado.length) return false;
  return timingSafeEqual(hashIntentado, hashEsperado);
}

export function pinValido(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

// ── Sesión (cookie firmada) ─────────────────────────────────────────────

export async function crearSesionPersonal(datos: Omit<SesionPersonal, "exp">): Promise<void> {
  const sesion: SesionPersonal = { ...datos, exp: Date.now() + DURACION_SESION_MS };
  const payload = Buffer.from(JSON.stringify(sesion)).toString("base64url");
  const firma = firmar(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, `${payload}.${firma}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_SESION_MS / 1000,
  });
}

export async function leerSesionPersonal(): Promise<SesionPersonal | null> {
  try {
    const cookieStore = await cookies();
    const valor = cookieStore.get(COOKIE_NAME)?.value;
    if (!valor) return null;

    const [payload, firma] = valor.split(".");
    if (!payload || !firma) return null;
    if (firma !== firmar(payload)) return null; // firma inválida — cookie manipulada o firmada con un secreto viejo.

    const sesion = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SesionPersonal;
    if (typeof sesion.exp !== "number" || sesion.exp < Date.now()) return null; // expirada.

    return sesion;
  } catch {
    // STAFF_SESSION_SECRET ausente, cookie corrupta, JSON inválido, etc. —
    // se trata siempre como "sin sesión" (falla cerrado), nunca se
    // propaga como error 500 en cada carga de página.
    return null;
  }
}

export async function cerrarSesionPersonal(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
