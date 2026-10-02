import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getReparacionesData } from "@/lib/reparaciones-data";
import { getTenantLabels } from "@/lib/labels-server";
import { puedeAccederModulo } from "@/lib/actor";
import { nombreNegocioDeSlug, type DatosNegocioRecibo } from "@/lib/recibo-imprimible";
// Selector de periodo del "Resumen de taller" (2026-10-02, a petición de
// Carlos: "que fuera por periodo, Día, semana, mes, año o fechas
// personalizadas, el mismo comportamiento que tiene el dashboard") — reusa
// resolverPeriodoDashboard/atajosPeriodoDashboard TAL CUAL (lib/dashboard-
// data.ts, ver el comentario largo ahí): misma resolución de fechas/zona
// horaria de México y el mismo cálculo de "semana laboral" (depende de
// Tenant.weekStartDay) que ya usa el Dashboard, en vez de duplicar esa
// lógica aquí solo porque el nombre del archivo dice "dashboard" — ambas
// funciones son genéricas, no miran nada específico de esa pantalla.
import { resolverPeriodoDashboard, atajosPeriodoDashboard } from "@/lib/dashboard-data";
import AduanaClient from "./AduanaClient";

/**
 * "Aduana" / Recepción del taller (2026-09-22, corrección explícita de
 * Carlos con el ejemplo hipotético "Fix Expres") — módulo APARTE de
 * "reparaciones" y "taller" (ver el comentario largo de "aduana" en
 * lib/roles.ts) porque el guard de ruta del layout
 * (app/(tenant)/[tenant]/layout.tsx) gatea acceso por el SEGMENTO de la URL
 * contra los módulos permitidos del rol — un rol con "aduana" es el ÚNICO
 * que puede asignar técnico, cambiar el estatus del equipo y ajustar
 * costo/piezas cotizadas.
 *
 * Sin filtro de sucursal a propósito (a diferencia de /reparaciones,
 * /pos, /citas, /caja) — el taller es una ubicación CENTRAL que recibe
 * equipos de varias sucursales/tiendas, así que Recepción/Aduana debe ver y
 * operar todos los folios del negocio, sin importar en qué sucursal se
 * recibió el equipo.
 */
export default async function AduanaPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  // ?folio=... (2026-10-01) — la notificación de una alerta de técnico
  // (ver el comentario largo en AduanaClientProps.folioInicial) manda aquí
  // con este parámetro para preseleccionar el folio en cuestión.
  // ?desde=/?hasta= (2026-10-02, selector de periodo del "Resumen de
  // taller") — mismo patrón que dashboard/page.tsx: "YYYY-MM-DD", ausentes
  // o inválidos caen a "Hoy" dentro de resolverPeriodoDashboard.
  searchParams: Promise<{ folio?: string; desde?: string; hasta?: string }>;
}) {
  const { tenant: tenantSlug } = await params;
  const { folio, desde, hasta } = await searchParams;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true, businessType: true, cobrarEnDevolucion: true,
      logo: true, address: true, phone: true, rfc: true, reciboMensajePie: true, reciboExtra: true, reciboFormato: true,
      // weekStartDay (2026-10-02) — lo necesita atajosPeriodoDashboard para
      // el atajo "Semana" (rangoSemanaLaboral depende de este campo).
      weekStartDay: true,
    },
  });

  if (!tenant) notFound();

  const periodo = resolverPeriodoDashboard(desde, hasta, tenant.weekStartDay);
  const atajosPeriodo = atajosPeriodoDashboard(tenant.weekStartDay);

  const [data, labels, puedeCobrar] = await Promise.all([
    getReparacionesData(tenant.id, undefined),
    getTenantLabels(tenant.id, tenant.businessType),
    // 2026-09-25, a petición de Carlos: "atajo" para el usuario que hace
    // todo (dueño único) — si quien está en Aduana TAMBIÉN tiene acceso al
    // módulo "pos" (un dueño con cuenta real siempre lo tiene; un
    // recepcionista de PIN sin ese módulo, no), se le ofrece aquí mismo el
    // botón "Cobrar y entregar" hacia POS en vez de obligarlo a ir a buscar
    // el mismo folio otra vez en /reparaciones. Ver el comentario largo en
    // puedeAccederModulo (lib/actor.ts) — esto solo decide qué botón se
    // muestra, la Server Action de destino (crearVentaAction) sigue
    // validando el permiso por su cuenta.
    puedeAccederModulo(tenant.id, "pos"),
  ]);

  // Datos reales del negocio para el ticket de "Entregar sin cobro"
  // (2026-09-26, ver el comentario largo en lib/recibo-imprimible.ts).
  const negocioRecibo: DatosNegocioRecibo = {
    nombre: nombreNegocioDeSlug(tenantSlug),
    logoUrl: tenant.logo,
    direccion: tenant.address,
    telefono: tenant.phone,
    rfc: tenant.rfc,
    mensajePie: tenant.reciboMensajePie,
    extra: tenant.reciboExtra,
    formato: tenant.reciboFormato,
  };

  return (
    <AduanaClient
      // key con el periodo (2026-10-02) — mismo motivo que ya documenta
      // dashboard/page.tsx junto a su propio `key`: Next.js reutiliza esta
      // misma instancia del client component cuando solo cambia el
      // searchParam de la misma ruta, así que sin esto el useState de
      // desdeSel/hastaSel (los inputs de fecha personalizada) se quedaría
      // con los valores del periodo anterior tras navegar a uno nuevo.
      key={`${periodo.desde}-${periodo.hasta}`}
      data={data}
      labels={labels}
      tenantSlug={tenantSlug}
      puedeCobrar={puedeCobrar}
      negocioRecibo={negocioRecibo}
      cobrarEnDevolucion={tenant.cobrarEnDevolucion}
      folioInicial={folio ?? null}
      periodo={periodo}
      atajosPeriodo={atajosPeriodo}
    />
  );
}
