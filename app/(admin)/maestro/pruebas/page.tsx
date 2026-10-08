import { getPruebasUsadas } from "@/lib/pruebas-usadas-data";
import PruebasClient from "./PruebasClient";

export const dynamic = "force-dynamic";

export default async function PruebasUsadasPage() {
  const pruebas = await getPruebasUsadas();

  return (
    <>
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-medium text-slate-800">Pruebas usadas</h1>
          <p className="text-[12.5px] text-slate-400">
            Correos que ya usaron su prueba gratis de 30 días (una por persona, aunque se borre su negocio)
          </p>
        </div>
        <div className="w-7 h-7 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-[12.5px] font-medium">
          A
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <PruebasClient pruebas={pruebas} />
      </div>
    </>
  );
}
