import { getUsuariosListData } from "@/lib/usuarios-data";
import UsuariosClient from "./UsuariosClient";

export default async function UsuariosPage() {
  const usuarios = await getUsuariosListData();

  return (
    <>
      {/* Topbar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-medium text-slate-800">Usuarios</h1>
          <p className="text-[11px] text-slate-400">Todas las cuentas de acceso de todos tus negocios, en un solo lugar</p>
        </div>
        <div className="w-7 h-7 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-[11px] font-medium">
          A
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        <UsuariosClient usuarios={usuarios} />
      </div>
    </>
  );
}
