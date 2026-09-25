import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verificarSesionPersonalVigente } from "@/lib/asistencia";
import { verMontosCajaParaRolPorNombre } from "@/lib/roles-server";
import { getCatalogoData, redactarMontosCatalogo } from "@/lib/catalogo-data";
import { getTenantLabels } from "@/lib/labels-server";
import CatalogoClient from "./CatalogoClient";

export default async function CatalogoPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    include: {
      branches: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, isActive: true },
      },
    },
  });

  if (!tenant) notFound();

  // 2026-09-24, auditoría de permisos completa a petición de Carlos: esta
  // pantalla no tenía NINGÚN chequeo de sesión/permiso — `ventasDetalle` (el
  // desglose de venta por producto, en pesos, que alimenta la pestaña "Top
  // ventas") y `cost` de cada producto (precio de compra, dato de margen)
  // se mandaban completos a CUALQUIER empleado con el módulo "catalogo",
  // sin importar Role.verMontosCaja. Mismo criterio que Dashboard/Reportes/
  // Sucursales/Caja/Inventario: se redacta en el servidor (no en el
  // cliente) para que el dato ni siquiera viaje al navegador de ese rol.
  const sesionPersonal = await verificarSesionPersonalVigente();
  const sesionValida = sesionPersonal && sesionPersonal.tenantId === tenant.id ? sesionPersonal : null;
  const puedeVerMontos = sesionValida ? await verMontosCajaParaRolPorNombre(tenant.id, sesionValida.roleName) : true;

  const [dataCompleta, labels] = await Promise.all([
    getCatalogoData(tenant.id, tenant.branches),
    getTenantLabels(tenant.id, tenant.businessType),
  ]);

  const data = puedeVerMontos ? dataCompleta : redactarMontosCatalogo(dataCompleta);

  const branches = tenant.branches.map((b) => ({ id: b.id, name: b.name }));

  return (
    <CatalogoClient
      data={data}
      labels={labels}
      branches={branches}
      tenantSlug={tenantSlug}
      businessType={tenant.businessType}
      puedeVerMontos={puedeVerMontos}
    />
  );
}
