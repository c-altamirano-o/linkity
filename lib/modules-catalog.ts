/**
 * Catálogo de módulos del sistema (M1-M14) — antes vivía duplicado dentro
 * de app/(admin)/maestro/tenants/nuevo/actions.ts; se extrajo aquí porque
 * el nuevo flujo de auto-registro (app/(auth)/register) necesita
 * exactamente la misma lista para dar de alta los TenantModule del
 * negocio nuevo, y mantener dos copias del mismo catálogo es justo el
 * tipo de duplicación que ya nos mordió antes con los folios/status —
 * mejor una sola fuente de verdad.
 */

export interface ModuloInfo {
  name: string;
  isCore: boolean;
}

export const MODULE_CATALOG: Record<string, ModuloInfo> = {
  M1: { name: "Acceso Universal", isCore: true },
  M2: { name: "Boveda de Datos", isCore: true },
  M3: { name: "Login Seguro", isCore: true },
  M4: { name: "Permisos", isCore: true },
  M5: { name: "Multi-Sucursal", isCore: false },
  M6: { name: "Catalogo", isCore: false },
  M7: { name: "Clientes", isCore: false },
  M8: { name: "Punto de Venta", isCore: false },
  M9: { name: "Reparaciones", isCore: false },
  M10: { name: "Control de Caja", isCore: false },
  M11: { name: "Personal", isCore: false },
  M12: { name: "Inventario", isCore: false },
  M13: { name: "Dashboard", isCore: false },
  M14: { name: "Facturacion CFDI", isCore: false },
};

export const ALL_MODULE_CODES = Object.keys(MODULE_CATALOG);
