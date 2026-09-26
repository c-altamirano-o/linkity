import "server-only";

import { prisma, getTenantPrisma } from "@/lib/prisma";
import { nombreNegocioDeSlug } from "@/lib/recibo-imprimible";

/**
 * Datos de la página pública de catálogo + sucursales (2026-09-26, a
 * petición explícita de Carlos, junto con la personalización del ticket:
 * "en la venta de un articulo un Qr diferente a una pagina publica que
 * muestre el catalogo de articulos, direcciones de las sucursales y si es
 * posible, un mapa para ubicarlas"). Vive en /pub/[tenant] (app/pub/), sin
 * layout de tenant ni sesión — mismo criterio que /rep/[token] (ver el
 * comentario largo en ese page.tsx): "pub" es un segmento literal, no
 * colisiona con el [tenant] dinámico de app/(auth)/[tenant]/page.tsx.
 *
 * El nombre del negocio se arma con nombreNegocioDeSlug(tenantSlug) — NO
 * Tenant.name (que en la práctica queda igual al slug, sin usarse en
 * ninguna otra pantalla, ver el comentario largo en
 * lib/recibo-imprimible.ts) — para que esta página muestre el MISMO nombre
 * que ya ve el negocio en su propio sidebar y en el ticket impreso.
 *
 * Solo se listan productos ACTIVOS y NO archivados (mismo criterio de
 * exclusión que el catálogo interno, ver ProductoCatalogo.archivedAt en
 * lib/catalogo-data.ts) — un producto pausado o descontinuado no tiene
 * sentido mostrarlo a un cliente que ve esta página desde el QR del
 * ticket.
 */

export interface ProductoPublico {
  id: string;
  name: string;
  emoji: string | null;
  categoryName: string;
  price: number;
  isService: boolean;
}

export interface SucursalPublica {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  // Esquema de URL de Google Maps (sin necesidad de API key, ver el
  // comentario largo de Carlos/decisión de diseño) — null si la sucursal no
  // tiene dirección capturada.
  mapaUrl: string | null;
}

export interface CatalogoPublicoData {
  nombre: string;
  logoUrl: string | null;
  productos: ProductoPublico[];
  sucursales: SucursalPublica[];
}

export async function getCatalogoPublico(tenantSlug: string): Promise<CatalogoPublicoData | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      logo: true,
      branches: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, address: true, phone: true },
      },
    },
  });
  if (!tenant) return null;

  const db = getTenantPrisma(tenant.id);
  const productosRaw = await db.product.findMany({
    where: { isActive: true, archivedAt: null },
    include: { category: true },
    orderBy: [{ name: "asc" }],
  });

  const productos: ProductoPublico[] = productosRaw.map((p) => ({
    id: p.id,
    name: p.name,
    // El valor crudo de Product.emoji puede ser un emoji escrito a mano o
    // una clave "icon:Xxx" de la galería (ver ProductoIcono, lib/
    // catalogo-iconos.tsx) — se manda tal cual, CatalogoPublicoList.tsx
    // (Client Component) es quien sabe interpretarlo.
    emoji: p.emoji,
    categoryName: p.category?.name ?? "Sin categoría",
    price: Number(p.price),
    isService: p.type === "SERVICE",
  }));

  const sucursales: SucursalPublica[] = tenant.branches.map((b) => ({
    id: b.id,
    name: b.name,
    address: b.address,
    phone: b.phone,
    mapaUrl: b.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}` : null,
  }));

  return {
    nombre: nombreNegocioDeSlug(tenantSlug),
    logoUrl: tenant.logo,
    productos,
    sucursales,
  };
}
