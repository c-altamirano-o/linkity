import { Ticket } from "lucide-react";

/**
 * Antes esta ruta ni siquiera existía (daba 404) y el sidebar mostraba un
 * badge fijo de "3" tickets que no salía de ningún dato real. Se quitó el
 * badge falso y se deja esta pantalla-aviso en vez del 404: construir la
 * bandeja de tickets de verdad necesita una tabla nueva en la base de
 * datos (no existe ningún modelo de tickets/soporte en el schema hoy) y
 * probablemente un formulario de "contactar soporte" del lado de cada
 * negocio — es un cambio de schema que hay que revisar y aplicar juntos,
 * no algo para hacer sin supervisión.
 */
export default function SoportePage() {
  return (
    <>
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-slate-800">Soporte</h1>
        <div className="w-7 h-7 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-[11px] font-medium">
          A
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="bg-white border border-slate-200 rounded-lg p-8 max-w-md text-center mx-auto mt-12">
          <Ticket className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-[14px] font-medium text-slate-700 mb-1">Todavía no hay bandeja de tickets</p>
          <p className="text-[12px] text-slate-500">
            Para que tus negocios puedan escribirte y que aparezca aquí, primero hay que agregar una tabla nueva a la base de datos. Es un cambio que conviene revisar juntos antes de aplicarlo.
          </p>
        </div>
      </div>
    </>
  );
}
