import { headers } from "next/headers";
import { requireSuperAdmin } from "@/lib/maestro-auth";
import { getConexionesData } from "@/lib/conexiones-data";
import { urlPublicaDelSitio } from "@/lib/conexiones-meta";
import ConexionesClient from "./ConexionesClient";

export const dynamic = "force-dynamic";

export default async function ConexionesPage() {
  const resuelto = await requireSuperAdmin();
  // El layout de /maestro ya bloqueó el acceso si esto falla.
  const h = await headers();
  const sitio = urlPublicaDelSitio(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"), process.env.NEXT_PUBLIC_SITE_URL);
  const data = resuelto.ok ? await getConexionesData(sitio) : null;

  return (
    <>
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-medium text-slate-800">Conexiones</h1>
          <p className="text-[12.5px] text-slate-400">Deja funcionando WhatsApp y Hotmart en pocos pasos</p>
        </div>
        <div className="w-7 h-7 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-[12.5px] font-medium">A</div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {data ? <ConexionesClient data={data} /> : <p className="text-[13px] text-slate-500">No tienes permiso para ver esta pantalla.</p>}
      </div>
    </>
  );
}
