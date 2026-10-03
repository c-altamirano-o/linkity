import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
import { getReparacionesData } from "@/lib/reparaciones-data";
import { getTenantLabels } from "@/lib/labels-server";
import { nombreNegocioDeSlug, type DatosNegocioRecibo } from "@/lib/recibo-imprimible";
import { puedeAccederModulo } from "@/lib/actor";
import ReparacionesClient from "./ReparacionesClient";

export default async function ReparacionesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  // ?clienteId=... (2026-09-25, atajo para el operador único, a petición de
  // Carlos) — el botón "Nueva reparación" de la ficha de un cliente en
  // /clientes manda aquí con este parámetro para abrir el modal de "Nueva
  // reparación" con ese cliente ya preseleccionado (ver clienteInicialId,
  // ReparacionesClient.tsx). Igual que clienteId en /pos, no se revalida
  // aquí contra la base — si no coincide con ningún cliente del tenant
  // simplemente no preselecciona nada.
  searchParams: Promise<{ clienteId?: string }>;
}) {
  const { tenant: tenantSlug } = await params;
  const { clienteId } = await searchParams;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    include: {
      branches: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
      },
    },
    // cobrarEnDevolucion (2026-09-25) — hace falta aquí para decidir si el
    // botón de una devolución (SHOP_RETURN) en tienda es "Entregar" (sin
    // cargo) o "Cobrar y entregar" (mismo camino a POS que un equipo
    // reparado) — ver el comentario largo en ReparacionesClient.tsx.
  });

  if (!tenant) notFound();

  // 2026-09-21, a petición de Carlos: un empleado de PIN solo ve/recibe
  // reparaciones de SU sucursal (mismo criterio que Caja/POS/Citas).
  const sesionPersonal = await verificarSesionPersonalVigente();
  const sucursalDeEmpleado = sesionPersonal && sesionPersonal.tenantId === tenant.id ? sesionPersonal.branchId : null;
  const branches = sucursalDeEmpleado
    ? tenant.branches.filter((b) => b.id === sucursalDeEmpleado)
    : tenant.branches;

  // 2026-09-22: ya no hace falta resolver el roleName aquí — desde la
  // corrección de Carlos, /reparaciones es SIEMPRE la vista de tienda (ver
  // el comentario en ReparacionesClient.tsx); el control de piezas, costo,
  // estatus y técnico vive en /aduana.
  // Modo Simple (2026-10-03, a petición de Carlos: "unificar en una sola
  // ventana todas las operaciones que tengan que ver con reparaciones") —
  // puedeControlarTaller decide si esta pantalla también muestra el control
  // de técnico/costo/piezas/estatus que antes vivía exclusivamente en
  // /aduana. puedeAccederModulo (lib/actor.ts) ya resuelve esto igual que en
  // el guard de layout.tsx: el dueño de la cuenta real SIEMPRE pasa (sin
  // cambio de comportamiento), y un empleado con PIN solo pasa si su rol
  // tiene "aduana" en su matriz de permisos (lib/roles.ts) — por ejemplo un
  // Gerente visitando /reparaciones (no su pantalla normal) seguiría viendo
  // el control completo, consistente con lo que ya puede hacer en /aduana.
  const [data, labels, puedeControlarTaller] = await Promise.all([
    getReparacionesData(tenant.id, sucursalDeEmpleado ?? undefined),
    getTenantLabels(tenant.id, tenant.businessType),
    puedeAccederModulo(tenant.id, "aduana"),
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
    <ReparacionesClient
      data={data}
      labels={labels}
      branches={branches}
      tenantSlug={tenantSlug}
      telefonoNegocio={tenant.phone}
      negocioRecibo={negocioRecibo}
      cobrarEnDevolucion={tenant.cobrarEnDevolucion}
      puedeControlarTaller={puedeControlarTaller}
      clienteInicialId={clienteId ?? null}
      // whatsappApiConectado (2026-10-02) — decide el modo del botón
      // "Avisar" (ver handleWhatsapp en ReparacionesClient.tsx): con API
      // conectada se manda automático vía marcarWhatsappEnviadoAction; si no,
      // cae a un link wa.me/... armado en el cliente con el teléfono del
      // cliente. No hace falta un select especial arriba — este query ya usa
      // include (no select) en el nivel superior, así que trae todos los
      // campos escalares de Tenant, token incluido; pero aquí solo se manda
      // el boolean derivado, nunca el token real.
      whatsappApiConectado={Boolean(tenant.whatsappPhoneNumberId && tenant.whatsappAccessToken)}
    />
  );
}
