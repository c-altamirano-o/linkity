import { getEsquemasData } from "@/lib/esquemas-data";
import EsquemasClient from "./EsquemasClient";

export default async function EsquemasPage() {
  const esquemas = await getEsquemasData();

  return (
    <>
      {/* Topbar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-medium text-slate-800">Esquemas</h1>
          <p className="text-[12.5px] text-slate-400">
            Límites de sucursales y personal por negocio — el cobro y los paquetes lo gestiona Hotmart, esto solo controla capacidad
          </p>
        </div>
        <div className="w-7 h-7 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-[12.5px] font-medium">
          A
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        <EsquemasClient esquemas={esquemas} />
      </div>
    </>
  );
}
