import { getMaestroReportesData } from "@/lib/maestro-reportes-data";
import ReportesClient from "./ReportesClient";

export default async function ReportesPage() {
  const data = await getMaestroReportesData();

  return (
    <>
      {/* Topbar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-medium text-slate-800">Reportes</h1>
          <p className="text-[12.5px] text-slate-400">Cómo va tu negocio de SaaS — no el de tus clientes</p>
        </div>
        <div className="w-7 h-7 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-[12.5px] font-medium">
          A
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        <ReportesClient data={data} />
      </div>
    </>
  );
}
