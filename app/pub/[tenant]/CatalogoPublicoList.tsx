"use client";

import { ProductoIcono } from "@/lib/catalogo-iconos";
import type { ProductoPublico } from "@/lib/catalogo-publico-data";

/**
 * Grid de productos de la página pública (2026-09-26) — Client Component
 * aparte del page.tsx (Server Component) por el mismo motivo que ya
 * documenta lib/catalogo-iconos.tsx: ProductoIcono usa componentes reales de
 * @phosphor-icons/react, que crean un React Context a nivel de módulo y
 * truenan bajo la condición "react-server" de un Server Component
 * ("createContext is not a function"). Aislar solo este pedazo aquí evita
 * ese problema sin tener que convertir toda la página en Client Component.
 */
export default function CatalogoPublicoList({ productos }: { productos: ProductoPublico[] }) {
  const formatMXN = (n: number) =>
    n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

  if (productos.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">Este negocio aún no publicó su catálogo.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {productos.map((p) => (
        <div key={p.id} className="bg-card border border-border rounded-xl p-3 flex flex-col gap-1">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-primary-text">
            <ProductoIcono value={p.emoji} className="w-4.5 h-4.5" />
          </div>
          <p className="text-xs font-medium text-foreground leading-tight">{p.name}</p>
          <p className="text-xs text-muted-foreground">{p.categoryName}</p>
          <p className="text-sm font-semibold text-foreground mt-auto">
            {formatMXN(p.price)}
            {p.isService ? <span className="text-[10px] font-normal text-muted-foreground"> · servicio</span> : null}
          </p>
        </div>
      ))}
    </div>
  );
}
