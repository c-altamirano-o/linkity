"use client";

import { useState } from "react";
import { createCustomerAction, getCustomersAction } from "@/app/actions/customer";

export default function TestRLSPage() {
  const [logs, setLogs] = useState<any[]>([]);

  const handleCreate = async (tenantId: string) => {
    const res = await createCustomerAction(tenantId, `Cliente de prueba para ${tenantId}`);
    setLogs((prev) => [{ action: "CREATE", tenantId, res }, ...prev]);
  };

  const handleFetch = async (tenantId: string) => {
    const res = await getCustomersAction(tenantId);
    setLogs((prev) => [{ action: "FETCH", tenantId, res }, ...prev]);
  };

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto mt-10">
      <h1 className="text-2xl font-bold">Prueba de Aislamiento Lógico (Multi-Tenant)</h1>
      
      <div className="space-y-2">
        <h2 className="font-semibold text-blue-600">Empresa A (TENANT_A)</h2>
        <div className="flex gap-4">
          <button onClick={() => handleCreate("TENANT_A")} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">1. Crear Cliente A</button>
          <button onClick={() => handleFetch("TENANT_A")} className="px-4 py-2 bg-blue-800 text-white rounded hover:bg-blue-900">2. Ver Clientes A</button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold text-emerald-600">Empresa B (TENANT_B)</h2>
        <div className="flex gap-4">
          <button onClick={() => handleCreate("TENANT_B")} className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700">1. Crear Cliente B</button>
          <button onClick={() => handleFetch("TENANT_B")} className="px-4 py-2 bg-emerald-800 text-white rounded hover:bg-emerald-900">2. Ver Clientes B</button>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="font-semibold mb-2">Consola de Resultados:</h3>
        <pre className="bg-slate-900 text-green-400 p-4 rounded-lg overflow-auto max-h-[400px] text-xs">
          {logs.length === 0 ? "Esperando acciones..." : JSON.stringify(logs, null, 2)}
        </pre>
      </div>
    </div>
  );
}