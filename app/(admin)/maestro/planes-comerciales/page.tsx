import { getPlanesComercialesData } from "@/lib/planes-comerciales-data";
import PlanesComercialesClient from "./PlanesComercialesClient";

export default async function PlanesComercialesPage() {
  const planes = await getPlanesComercialesData();

  return (
    <>
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-medium text-slate-800">Planes comerciales</h1>
          <p className="text-[12.5px] text-slate-400">
            Funciones, límites y configuración de acceso comercial de Linkity
          </p>
        </div>
        <div className="w-7 h-7 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-[12.5px] font-medium">
          A
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <PlanesComercialesClient planes={planes} />
      </div>
    </>
  );
}