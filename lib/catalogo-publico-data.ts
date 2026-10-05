import "server-only";

import { prisma, getTenantPrisma } from "@/lib/prisma";

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
 * 2026-10-05, corregido tras auditoría: el nombre del negocio ahora sale de
 * Tenant.name (el real, capturado como "Nombre del negocio" al dar de alta
 * el tenant) — YA NO de un nombre reconstruido a partir del slug. Ese
 * nombre reconstruido podía divergir del real (acentos/mayúsculas que
 * slugify() normaliza al crear el slug), y Tenant.name SÍ se usa en otras
 * pantallas públicas del mismo flujo (la puerta de acceso /[tenant] y el
 * mensaje de WhatsApp, ver lib/whatsapp-tenant.ts) — con el nombre
 * reconstruido, un mismo cliente podía ver dos nombres distintos para el
 * mismo negocio entre esta página y /rep/[token]/el WhatsApp que ya recibió.
 *
 * Solo se listan productos ACTIVOS y NO archivados (mismo criterio de
 * exclusión que el catálogo interno, ver ProductoCatalogo.archivedAt en
 * lib/catalogo-data.ts) — un producto pausado o descontinuado no tiene
 * sentido mostrarlo a un cliente que ve esta página desde el QR del
 * ticket. Y SOLO si el negocio tiene el módulo "catalogo" activo
 * (TenantModule, ver lib/roles.ts/MODULOS) — un negocio que lo desactivó en
 * Configuración (ej. un taller que solo repara y no quiere exhibir precios
 * al público) no debe seguir exponiendo su catálogo aquí solo porque
 * alguien tiene o adivina el link; `catalogoActivo:false` en el resultado
 * le indica a app/pub/[tenant]/page.tsx que muestre un aviso en vez de la
 * lista (las sucursales se siguen mostrando — ese dato no depende del
 * módulo "catalogo").
 */

export interface ProductoPublico {
  id: string;
  name: string;
  emoji: string | null;
  // Foto propia del producto (Product.image) — mismo criterio que
  // <ProductoIcono> en el resto de la app: cuando existe, tiene prioridad
  // visual sobre `emoji`. Null si el negocio nunca subió una foto para ese
  // producto.
  image: string | null;
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
  // false = el negocio desactivó el módulo "Catálogo" (Configuración →
  // Módulos) — `productos` viene vacío a propósito en ese caso, y
  // app/pub/[tenant]/page.tsx debe mostrar un aviso en vez de la lista.
  catalogoActivo: boolean;
  productos: ProductoPublico[];
  sucursales: SucursalPublica[];
}

export async function getCatalogoPublico(tenantSlug: string): Promise<CatalogoPublicoData | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      name: true,
      logo: true,
      branches: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, address: true, phone: true },
      },
    },
  });
  if (!tenant) return null;

  // Mismo criterio que app/(tenant)/[tenant]/layout.tsx: "sin fila en
  // TenantModule, o fila con isActive:true" = módulo activo; solo una fila
  // explícita isActive:false lo apaga.
  const moduloCatalogoInactivo = await prisma.tenantModule.findFirst({
    where: { tenantId: tenant.id, isActive: false, module: { code: "catalogo" } },
    select: { tenantId: true },
  });
  const catalogoActivo = !moduloCatalogoInactivo;

  const productos: ProductoPublico[] = catalogoActivo
    ? await (async () => {
        const db = getTenantPrisma(tenant.id);
        const productosRaw = await db.product.findMany({
          where: { isActive: true, archivedAt: null },
          include: { category: true },
          orderBy: [{ name: "asc" }],
        });

        return productosRaw.map((p) => ({
          id: p.id,
          name: p.name,
          // El valor crudo de Product.emoji puede ser un emoji escrito a mano
          // o una clave "icon:Xxx" de la galería (ver ProductoIcono, lib/
          // catalogo-iconos.tsx) — se manda tal cual, CatalogoPublicoList.tsx
          // (Client Component) es quien sabe interpretarlo.
          emoji: p.emoji,
          image: p.image,
          categoryName: p.category?.name ?? "Sin categoría",
          price: Number(p.price),
          isService: p.type === "SERVICE",
        }));
      })()
    : [];

  const sucursales: SucursalPublica[] = tenant.branches.map((b) => ({
    id: b.id,
    name: b.name,
    address: b.address,
    phone: b.phone,
    mapaUrl: b.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}` : null,
  }));

  return {
    nombre: tenant.name,
    logoUrl: tenant.logo,
    catalogoActivo,
    productos,
    sucursales,
  };
}
