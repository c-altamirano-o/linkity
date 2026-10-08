import { requireSuperAdmin } from "@/lib/maestro-auth";
import ConfiguracionClient from "./ConfiguracionClient";
import WhatsappPlataformaCard from "./WhatsappPlataformaCard";
import { obtenerWhatsappPlataformaParaPanel } from "@/lib/config-plataforma";

export default async function ConfiguracionPage() {
  const resuelto = await requireSuperAdmin();
  // El layout de /maestro ya bloqueó el acceso si esto falla — este chequeo
  // extra es solo para tener los datos a mostrar, mismo patrón que las
  // Server Actions de esta sección.
  const admin = resuelto.ok ? resuelto.admin : { id: "", email: "", name: "" };

  // WhatsApp Business de Linkity (2026-10-08): solo se cargan los datos si hay
  // un administrador válido; los secretos llegan enmascarados.
  const whatsapp = resuelto.ok ? await obtenerWhatsappPlataformaParaPanel() : null;
  const sitio = (process.env.NEXT_PUBLIC_SITE_URL || "https://linkitysoluciones.mx").replace(/\/+$/, "");

  return (
    <>
      {/* Topbar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-medium text-slate-800">Configuración</h1>
          <p className="text-[12.5px] text-slate-400">Tu cuenta de administrador de la plataforma</p>
        </div>
        <div className="w-7 h-7 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-[12.5px] font-medium">
          A
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-3xl space-y-4">
          {whatsapp && <WhatsappPlataformaCard datos={whatsapp} urlWebhook={`${sitio}/api/webhooks/whatsapp`} />}
        </div>
        <div className="mt-4">
          <ConfiguracionClient admin={admin} />
        </div>
      </div>
    </>
  );
}
