import Link from "next/link";
import { Plus } from "lucide-react";
import { getTenantsListData } from "@/lib/tenants-data";
import TenantsClient from "./TenantsClient";

export default async function TenantsPage() {
  const tenants = await getTenantsListData();

  return (
    <>
      {/* Topbar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-medium text-slate-800">Negocios</h1>
          <p className="text-[11px] text-slate-400">Cada cliente de la plataforma: su plan, sus módulos y su gente</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/maestro/tenants/nuevo"
            className="flex items-center gap-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[12px] font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo negocio
          </Link>
          <div className="w-7 h-7 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-[11px] font-medium">
            A
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        <TenantsClient tenants={tenants} />
      </div>
    </>
  );
}
