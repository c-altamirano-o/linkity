import { getEsquemasOptions } from "@/lib/esquemas-data";
import NuevoTenantClient from "./NuevoTenantClient";

// Server Component solo para poder traer la lista de esquemas antes de
// pintar el formulario (NuevoTenantClient, "use client", no puede hacer
// esta consulta directo) — mismo patrón page.tsx→Client.tsx del resto del
// proyecto.
export default async function NuevoTenantPage() {
  const esquemas = await getEsquemasOptions();

  return <NuevoTenantClient esquemas={esquemas.filter((e) => e.isActive)} />;
}
