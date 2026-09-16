import { getModulosData } from "@/lib/modulos-data";
import ModulosClient from "./ModulosClient";

export default async function ModulosPage() {
  const modulos = await getModulosData();

  return (
    <>
      {/* Topbar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-medium text-slate-800">Módulos</h1>
          <p className="text-[11px] text-slate-400">Qué tanto se usa cada módulo entre tus negocios — para prender o apagar uno, entra a la ficha de ese negocio</p>
        </div>
        <div className="w-7 h-7 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-[11px] font-medium">
          A
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        <ModulosClient modulos={modulos} />
      </div>
    </>
  );
}
