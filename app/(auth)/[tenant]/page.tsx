import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AccesoNegocioClient from "./AccesoNegocioClient";

/**
 * Puerta única de entrada a un negocio (2026-09-23, a petición de Carlos:
 * "Entro a un link que me proporciona el desarrollador... exclusivo para mi
 * negocio... Al entrar, la pantalla muestra dos fichas, una para login de
 * administrador... y otra para empleado"). Reemplaza el flujo anterior de
 * /login + /entrada/[tenant] como punto de entrada normal — ambas rutas
 * siguen existiendo por compatibilidad (ver sus propios comentarios) pero
 * ya no son las que se reparten como link del negocio.
 *
 * Esta pantalla llevó al inicio una contraseña compartida de "puerta" antes
 * de las dos fichas (Tenant.accessPasswordHash) — Carlos pidió quitarla el
 * mismo día: "mientras menos le pregunten [al dueño]... mejor". Se retiró
 * por completo (schema, acción de Configuración, cookie de pase) en vez de
 * dejarla como opción apagada, para no cargar el código con una capa que ya
 * no se va a usar. Las dos fichas (administrador/empleado) siguen siendo la
 * única protección de este punto de entrada, más el PIN de 6 dígitos (ver
 * lib/staff-auth.ts, pinValido).
 *
 * Esta ruta vive en el MISMO nivel que /login, /register, etc. (todas bajo
 * el route group (auth)) — Next.js resuelve los segmentos literales
 * (/login, /register...) ANTES que el dinámico [tenant], así que no hay
 * colisión: /login sigue siendo /login, y cualquier otro slug cae aquí.
 * Tampoco colisiona con (tenant)/[tenant]/layout.tsx (las páginas YA
 * autenticadas del negocio, /[tenant]/dashboard etc.) porque ese layout no
 * tiene su propio page.tsx en la raíz — sus hijos empiezan en el
 * siguiente segmento.
 *
 * 2026-10-01, a petición de Carlos ("remodela la ventana de login... que use
 * los colores estándar de Linkity, pero agrega el logo del negocio si lo
 * tiene"): esta pantalla YA NO aplica el tema/colores que el negocio eligió
 * en Configuración (antes se envolvía todo en #${TENANT_THEME_ROOT_ID} con
 * resolverPresetTenant, igual que /[tenant]/dashboard y el resto de la app
 * autenticada) — a propósito: la puerta de entrada es "software de Linkity",
 * no el negocio ya personalizado de adentro, así que se queda con el morado
 * de marca por defecto (--primary en app/globals.css, el mismo de la landing
 * y del ícono de la app) sin importar qué tema tenga ese negocio. Lo único
 * que SÍ se trae de la identidad del negocio es su logo (Tenant.logo) — si
 * lo subió, se muestra arriba; si no, un ícono con su inicial hace de
 * respaldo (ver AccesoNegocioClient).
 */
export default async function AccesoNegocioPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ sucursal?: string }>;
}) {
  const { tenant: tenantSlug } = await params;
  // ?sucursal=<branchId> (opcional): mismo propósito que antes tenía la URL
  // /entrada/[tenant]/[branch] — el link fijo que se pega en el tablet de
  // una sucursal específica, para que la ficha de Empleado arranque
  // directo en su lista de personal sin pedir "¿en qué sucursal estás?"
  // (ver "Copiar link de entrada" en /[tenant]/sucursales).
  const { sucursal: sucursalInicial } = await searchParams;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      name: true,
      logo: true,
      branches: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
      },
      staff: {
        where: { isActive: true, pinHash: { not: null }, roleId: { not: null } },
        select: { id: true, name: true, position: true, branchId: true },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!tenant) notFound();

  return (
    <AccesoNegocioClient
      tenantSlug={tenantSlug}
      businessName={tenant.name}
      logoUrl={tenant.logo}
      branches={tenant.branches}
      empleados={tenant.staff}
      sucursalInicial={
        sucursalInicial && tenant.branches.some((b) => b.id === sucursalInicial) ? sucursalInicial : null
      }
    />
  );
}
