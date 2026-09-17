import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTenantDetailData } from "@/lib/tenants-data";
import { getEsquemasOptions } from "@/lib/esquemas-data";
import TenantDetailClient from "./TenantDetailClient";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [tenant, esquemas] = await Promise.all([getTenantDetailData(slug), getEsquemasOptions()]);

  if (!tenant) notFound();

  return (
    <>
      {/* Topbar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div>
          <Link href="/maestro/tenants" className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 mb-0.5">
            <ArrowLeft className="w-3 h-3" />
            Negocios
          </Link>
          <h1 className="text-[15px] font-medium text-slate-800">{tenant.name}</h1>
        </div>
        <div className="w-7 h-7 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-[11px] font-medium">
          A
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        <TenantDetailClient tenant={tenant} esquemas={esquemas} />
      </div>
    </>
  );
}
