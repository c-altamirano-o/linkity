import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTenantDetailData } from "@/lib/tenants-data";
import { getPlanesComercialesOpciones } from "@/lib/planes-comerciales-data";
import { obtenerCapacidades, LIMITE_SUCURSALES, LIMITE_EMPLEADOS_POR_SUCURSAL } from "@/lib/capacidades-comerciales";
import TenantDetailClient from "./TenantDetailClient";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [tenant, planes] = await Promise.all([getTenantDetailData(slug), getPlanesComercialesOpciones()]);

  if (!tenant) notFound();

  // Límites que de verdad se le aplican hoy a este negocio (prueba = sin
  // límites; con plan, los del plan; ACTIVE sin plan, los de Básico). null =
  // sin límite. Se resuelve con la misma capa que usan las acciones.
  const capacidades = await obtenerCapacidades(tenant.id);
  const limiteSuc = capacidades.limite(LIMITE_SUCURSALES);
  const limiteEmp = capacidades.limite(LIMITE_EMPLEADOS_POR_SUCURSAL);
  const limites = {
    modo: capacidades.modo,
    sucursales: limiteSuc.ilimitado ? null : limiteSuc.valor,
    empleadosPorSucursal: limiteEmp.ilimitado ? null : limiteEmp.valor,
  };

  return (
    <>
      {/* Topbar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div>
          <Link href="/maestro/tenants" className="flex items-center gap-1 text-[12.5px] text-slate-400 hover:text-slate-600 mb-0.5">
            <ArrowLeft className="w-3 h-3" />
            Negocios
          </Link>
          <h1 className="text-[15px] font-medium text-slate-800">{tenant.name}</h1>
        </div>
        <div className="w-7 h-7 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-[12.5px] font-medium">
          A
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        <TenantDetailClient tenant={tenant} planes={planes} limites={limites} />
      </div>
    </>
  );
}
