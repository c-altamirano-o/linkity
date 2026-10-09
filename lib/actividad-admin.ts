/**
 * Marca de "última actividad" del administrador, guardada en localStorage.
 * La lee TenantShell para cerrar la sesión tras 20 minutos de inactividad.
 *
 * Esa marca es del NAVEGADOR, no de la sesión: si quedó guardada de un inicio
 * de sesión anterior (otro negocio, otro día), al entrar de nuevo se leía como
 * "hace horas" y la sesión se cerraba en el acto. Por eso cada inicio de sesión
 * exitoso debe reiniciarla a "ahora" con reiniciarActividadAdmin().
 */
export const CLAVE_ULTIMA_ACTIVIDAD_ADMIN = "linkity_admin_actividad_ts";

export function reiniciarActividadAdmin(): void {
  try {
    window.localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD_ADMIN, String(Date.now()));
  } catch {
    // localStorage no disponible (p.ej. modo privado): TenantShell usa su
    // respaldo en memoria, que arranca en "ahora".
  }
}
