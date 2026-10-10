import Link from "next/link";
import Image from "next/image";
import { CheckCircle2, Mail, ArrowRight, Inbox } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gracias por tu compra | Linkity Soluciones",
  // Es una pantalla de paso, no una página para que la encuentre Google.
  robots: { index: false, follow: false },
};

/**
 * 2026-10-10, a petición de Carlos: página de agradecimiento a la que Hotmart
 * manda al comprador justo después de pagar (Hotmart → producto → Herramientas
 * → Configuraciones de pago → Posventa → Externa).
 *
 * Por qué existe en vez de mandar directo a /login: en ese momento el
 * comprador todavía no tiene contraseña. La contraseña temporal llega por
 * correo de Linkity (hotmart-alta.ts → correoBienvenidaSuscripcion) unos
 * segundos o minutos después del webhook. Un login pidiendo una contraseña que
 * aún no existe es justo la confusión que hace abandonar.
 *
 * Es pública a propósito: no consulta nada, no recibe datos de la compra y no
 * confirma ninguna compra (cualquiera podría abrirla escribiendo la URL), así
 * que no expone información. proxy.ts solo protege /maestro, por lo que no
 * hace falta tocarlo. Al ser una ruta estática gana sobre las dinámicas
 * (/[tenant]).
 *
 * El asunto del correo que se menciona aquí debe coincidir con el de
 * correoBienvenidaSuscripcion (lib/correo-transaccional.ts); la opción
 * "Reenviar contraseña" es la que ya existe en /login.
 */
export default function GraciasPage() {
  return (
    <div className="min-h-screen bg-muted flex justify-center items-center px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <div className="flex justify-center">
          <Image
            src="/images/logo-full.svg"
            alt="Linkity Soluciones"
            width={160}
            height={40}
            className="object-contain"
            priority
          />
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-bold text-foreground">¡Gracias por tu compra!</h1>
            <p className="text-sm text-muted-foreground">
              Estamos preparando tu cuenta de Linkity. Solo falta un paso:
            </p>
          </div>

          <ol className="space-y-4">
            <li className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center shrink-0">
                1
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-primary" /> Revisa tu correo
                </p>
                <p className="text-sm text-muted-foreground">
                  Te enviamos un mensaje con el asunto{" "}
                  <span className="font-medium text-foreground">«Bienvenido a Linkity — tu acceso»</span>. Ahí viene tu
                  contraseña temporal. Puede tardar un par de minutos.
                </p>
              </div>
            </li>

            <li className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center shrink-0">
                2
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <ArrowRight className="w-4 h-4 text-primary" /> Inicia sesión
                </p>
                <p className="text-sm text-muted-foreground">
                  Entra con el mismo correo con el que compraste y la contraseña temporal. Después te pediremos crear una
                  contraseña propia.
                </p>
              </div>
            </li>
          </ol>

          <Link
            href="/login"
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-primary text-primary-foreground text-sm font-semibold rounded-xl transition-colors hover:opacity-90"
          >
            Iniciar sesión
            <ArrowRight className="w-4 h-4" />
          </Link>

          <div className="rounded-xl bg-muted p-4 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Inbox className="w-4 h-4 text-muted-foreground" /> ¿No ves el correo?
            </p>
            <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
              <li>Revisa tu carpeta de spam o correo no deseado, y la pestaña de Promociones si usas Gmail.</li>
              <li>
                Si ya pasaron unos minutos, en la pantalla de inicio de sesión escribe tu correo y usa la opción{" "}
                <span className="font-medium text-foreground">«Reenviar contraseña»</span>.
              </li>
              <li>
                Hotmart también te manda un correo, pero ese es solo tu comprobante de compra. Para usar Linkity, entra
                con los datos del correo de Linkity.
              </li>
            </ul>
          </div>
        </div>

        <p className="text-center text-[10.5px] text-muted-foreground">Linkity Soluciones</p>
      </div>
    </div>
  );
}
