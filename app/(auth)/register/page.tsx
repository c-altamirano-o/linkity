import { redirect } from "next/navigation";

/**
 * El auto-registro con formulario ya no existe (2026-10-08, decisión de Carlos:
 * "deleguemos todo a Hotmart"). La prueba gratis de 30 días y el cobro viven en
 * el checkout de Hotmart, y la cuenta se crea sola cuando Hotmart avisa de la
 * compra. Esta ruta se conserva solo para que los enlaces viejos no den error:
 * llevan a la sección de planes de la landing.
 */
export default function RegisterPage() {
  redirect("/#planes");
}
