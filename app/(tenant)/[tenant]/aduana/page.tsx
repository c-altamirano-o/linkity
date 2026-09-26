import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getReparacionesData } from "@/lib/reparaciones-data";
import { getTenantLabels } from "@/lib/labels-server";
import { puedeAccederModulo } from "@/lib/actor";
import { nombreNegocioDeSlug, type DatosNegocioRecibo } from "@/lib/recibo-imprimible";
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
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true, businessType: true, cobrarEnDevolucion: true,
      logo: true, address: true, phone: true, rfc: true, reciboMensajePie: true, reciboExtra: true,
    },
  });

  if (!tenant) notFound();

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
  };

  return (
    <AduanaClient
      data={data}
      labels={labels}
      tenantSlug={tenantSlug}
      puedeCobrar={puedeCobrar}
      negocioRecibo={negocioRecibo}
      cobrarEnDevolucion={tenant.cobrarEnDevolucion}
    />
  );
}
