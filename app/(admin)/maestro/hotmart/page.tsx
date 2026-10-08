import { getHotmartPanelData } from "@/lib/hotmart-data";
import HotmartClient from "./HotmartClient";

export const dynamic = "force-dynamic";

export default async function HotmartPage() {
  const data = await getHotmartPanelData();

  return (
    <>
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-medium text-slate-800">Hotmart</h1>
          <p className="text-[12.5px] text-slate-400">
            Estado de la integración y bitácora de compras y eventos recibidos
          </p>
        </div>
        <div className="w-7 h-7 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-[12.5px] font-medium">
          A
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <HotmartClient data={data} />
      </div>
    </>
  );
}
