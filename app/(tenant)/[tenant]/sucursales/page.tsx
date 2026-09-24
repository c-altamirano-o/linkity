import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSucursalesData, redactarMontosSucursales } from "@/lib/sucursales-data";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
import { verTodoNegocioParaRolPorNombre, verMontosCajaParaRolPorNombre } from "@/lib/roles-server";
import SucursalesClient from "./SucursalesClient";

export default async function SucursalesPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true },
  });

  if (!tenant) notFound();

  // 2026-09-24, corrigiendo el hueco más severo que encontró la revisión de
  // permisos que pidió Carlos: esta pantalla era la ÚNICA de las que
  // muestran dinero (junto con Caja) que no aplicaba NINGÚN recorte por
  // sucursal — un empleado con el módulo "sucursales" (el rol base
  // "Gerente" lo trae, ver MATRIZ_ACCESO_BASE en lib/roles.ts) veía el
  // efectivo real en caja de TODAS las sucursales del negocio, no solo la
  // suya. Mismo criterio que dashboard/page.tsx y reportes/page.tsx: un
  // administrador con cuenta real sigue viendo todo; un empleado de PIN
  // queda fijo en su propia sucursal salvo que su rol tenga
  // Role.verTodoNegocio ("Supervisor de Sucursales").
  const sesionPersonal = await verificarSesionPersonalVigente();
  const sesionValida = sesionPersonal && sesionPersonal.tenantId === tenant.id ? sesionPersonal : null;
  const veTodoElNegocio = sesionValida ? await verTodoNegocioParaRolPorNombre(tenant.id, sesionValida.roleName) : false;
  const sucursalDeEmpleado = sesionValida && !veTodoElNegocio ? sesionValida.branchId : null;

  // Mismo criterio anti-fraude que caja/page.tsx (Role.verMontosCaja,
  // 2026-09-24): "Caja actual" aquí es el mismo efectivo real que Caja le
  // redacta a un rol sin ese permiso (ej. el "Gerente" base) — sin esto, un
  // empleado podía ver en Sucursales el mismo monto que Caja le oculta a
  // propósito. Independiente de veTodoElNegocio: un Supervisor de
  // Sucursales ve TODAS las sucursales, pero solo ve los montos reales si
  // su rol también tiene marcado "puede ver montos de Caja" (mismo
  // desacoplamiento que ya usa caja/page.tsx entre ambos permisos).
  const puedeVerMontos = sesionValida ? await verMontosCajaParaRolPorNombre(tenant.id, sesionValida.roleName) : true;

  const dataCompleta = await getSucursalesData(tenant.id, sucursalDeEmpleado ?? undefined);
  const data = puedeVerMontos ? dataCompleta : redactarMontosSucursales(dataCompleta);

  return (
    <SucursalesClient
      data={data}
      tenantSlug={tenantSlug}
      // SucursalesClient necesita saberlo para desactivar "Transferir"
      // (mover inventario ENTRE sucursales no tiene sentido, y no está
      // permitido — ver transferirInventarioAction, sucursales-actions.ts —
      // cuando solo se puede ver/operar una sola sucursal) y para no ofrecer
      // "crear sucursal nueva" a quien no ve el negocio completo.
      soloUnaSucursal={!!sucursalDeEmpleado}
      // Para que "Ventas hoy"/"Caja actual" muestren "Oculto" en vez de un
      // engañoso "$0" cuando redactarMontosSucursales ya puso esos campos en
      // 0/null — un $0 literal se leería como "no hay nada en caja", no
      // como "tu rol no puede ver este monto".
      montosVisibles={puedeVerMontos}
    />
  );
}
