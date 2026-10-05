import Link from "next/link";
import { SearchX } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Página no encontrada | Linkity Soluciones",
};

/**
 * 2026-10-05, a petición de Carlos tras la auditoría de las páginas
 * públicas: antes no existía NINGÚN not-found.tsx en el proyecto, así que
 * cualquier notFound() (token inválido en /rep/[token], slug inexistente en
 * /pub/[tenant] o en la puerta de acceso /[tenant], o cualquier otra ruta
 * que no existe) caía en el 404 genérico de Next.js — en inglés, sin
 * ningún texto ni marca de Linkity. Un cliente real que sigue un link de
 * WhatsApp roto/caducado terminaba ahí.
 *
 * Es GLOBAL a propósito (app/not-found.tsx, no uno por ruta): no existía
 * ninguno más específico en ningún segmento, así que este es el único que
 * aplica en todo el proyecto — Next.js lo usa para cualquier notFound() que
 * no tenga un not-found.tsx más cercano en su propio segmento. Texto
 * genérico (no asume que siempre se llegó aquí por un link de reparación)
 * para que sirva igual de bien en cualquier ruta del sitio. Sin inventar un
 * logo que no existe como archivo — solo el nombre del producto, mismo
 * criterio que ya usan las páginas públicas (/pub/[tenant], /rep/[token]:
 * "Powered by Linkity Soluciones").
 */
export default function NotFound() {
  return (
    <div className="min-h-full bg-muted flex justify-center items-center px-4 py-8">
      <div className="w-full max-w-md space-y-4 text-center">
        <div className="bg-card border border-border rounded-2xl p-8 space-y-3">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-muted-foreground mx-auto">
            <SearchX className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">No encontramos esta página</h1>
          <p className="text-sm text-muted-foreground">
            El enlace que seguiste puede estar incompleto, haber caducado, o estar escrito de forma incorrecta.
            Si llegaste aquí desde un mensaje de WhatsApp o un ticket impreso, verifica que copiaste el enlace completo.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center mt-2 px-4 py-2.5 bg-primary text-primary-foreground text-xs font-medium rounded-xl transition-colors hover:opacity-90"
          >
            Ir al inicio de Linkity
          </Link>
        </div>
        <p className="text-center text-[10.5px] text-muted-foreground">Linkity Soluciones</p>
      </div>
    </div>
  );
}
