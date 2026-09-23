import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { THEME_PRESETS, TENANT_THEME_ROOT_ID } from "@/lib/theme-presets";
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
      themePreset: true,
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

  const activePreset = THEME_PRESETS[tenant.themePreset as keyof typeof THEME_PRESETS] || THEME_PRESETS.NEUTRAL_TECH;

  return (
    <div id={TENANT_THEME_ROOT_ID} style={activePreset as React.CSSProperties}>
      <AccesoNegocioClient
        tenantSlug={tenantSlug}
        businessName={tenant.name}
        branches={tenant.branches}
        empleados={tenant.staff}
        sucursalInicial={
          sucursalInicial && tenant.branches.some((b) => b.id === sucursalInicial) ? sucursalInicial : null
        }
      />
    </div>
  );
}
