import { notFound } from "next/navigation";
import { MapPin, Phone, Store } from "lucide-react";
import { getCatalogoPublico } from "@/lib/catalogo-publico-data";
import CatalogoPublicoList from "./CatalogoPublicoList";

/**
 * Página pública de catálogo + sucursales (2026-09-26, a petición explícita
 * de Carlos: ver el comentario largo en lib/catalogo-publico-data.ts). Es el
 * destino del QR que trae el ticket impreso de una venta de artículo o
 * servicio (POSClient.tsx) — el QR de una venta que cobra una REPARACIÓN
 * sigue apuntando a /rep/[token] en vez de aquí (ver el comentario largo en
 * lib/recibo-imprimible.ts).
 *
 * Sin layout de tenant (no vive bajo app/(tenant)/[tenant]/) — no requiere
 * sesión, no aplica el tema del negocio, alcanzable sin importar el rol de
 * quien la abra. "pub" es un segmento literal, mismo criterio que "rep" en
 * app/rep/[token]/page.tsx (ver el comentario largo ahí) — no colisiona con
 * el [tenant] dinámico de app/(auth)/[tenant]/page.tsx.
 */
export default async function CatalogoPublicoPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;
  const datos = await getCatalogoPublico(tenantSlug);
  if (!datos) notFound();

  return (
    <div className="min-h-full bg-muted flex justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-2">
          {datos.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={datos.logoUrl} alt="" className="w-14 h-14 rounded-xl object-contain mx-auto bg-card border border-border" />
          )}
          <h1 className="text-lg font-semibold text-foreground">{datos.nombre}</h1>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-3">
            <Store className="w-3.5 h-3.5" /> Catálogo
          </p>
          <CatalogoPublicoList productos={datos.productos} />
        </div>

        {datos.sucursales.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" /> Sucursales
            </p>
            {datos.sucursales.map((s) => (
              <div key={s.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                <p className="text-sm font-medium text-foreground">{s.name}</p>
                {s.address && <p className="text-xs text-muted-foreground mt-0.5">{s.address}</p>}
                {s.phone && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {s.phone}
                  </p>
                )}
                {s.mapaUrl && (
                  <a
                    href={s.mapaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1.5 text-xs font-medium text-primary-text underline underline-offset-2"
                  >
                    <MapPin className="w-3 h-3" /> Ver en el mapa
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-[10.5px] text-muted-foreground pt-2">Powered by Linkity Soluciones</p>
      </div>
    </div>
  );
}
