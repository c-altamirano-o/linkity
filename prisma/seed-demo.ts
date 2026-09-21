import "dotenv/config";
import {
  PrismaClient, ProductType, CategoryType,
  RepairStatus, Priority, PaymentMethod, SaleStatus,
  MovementType, CashSessionStatus,
  MixedPaymentMethod, PaymentScheme, CommissionBase,
  PaymentFrequency, StaffPaymentStatus, PurchaseStatus,
  InvoiceStatus, StaffPaymentMethod, StaffLoginCloseReason,
  AppointmentStatus, ToothCondition, TreatmentPlanItemStatus,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomBytes, scryptSync } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

/**
 * Seed de 20 negocios DEMO (uno por cada rubro soportado), 2026-09-17 —
 * a petición de Carlos: "llenar 1 base de datos de cada rubro con datos
 * inventados para navegar... luego se las pasaré a diferentes dueños de
 * negocios como muestra... grupo de control". Cada tenant queda con una
 * semana completa (lunes 7 a domingo 13 de septiembre de 2026) de
 * operación ya capturada: catálogo, inventario, clientes, personal (roles
 * y esquemas de pago diversificados, la función que se acaba de terminar),
 * ventas, caja, reparaciones (solo en los rubros donde aplica) y nómina.
 *
 * Aparte de prisma/seed.ts (el seed fijo de "Cell Express", usado para
 * desarrollo) a propósito — este es un lote de negocios DEMO nuevos con su
 * propio login real de Supabase Auth cada uno, pensado para mostrarse a
 * dueños de negocio reales, no para desarrollo día a día.
 *
 * No importa nada de lib/*.ts que traiga la guarda "server-only" (ej.
 * lib/catalogo-arranque.ts, lib/roles-server.ts): ese paquete revienta en
 * cualquier ejecución que no pase por el bundler "react-server" de Next, y
 * este script corre con tsx directo (igual que seed.ts). Por eso el
 * catálogo de arranque por rubro, el hash de PIN y el motor de permisos se
 * duplican aquí en su forma mínima, en vez de importarse.
 *
 * Cómo correrlo: `npx tsx prisma/seed-demo.ts` (requiere las mismas
 * variables de entorno que ya usa la app: DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY). Es seguro volver a correrlo: si un tenant con
 * ese slug ya existe, se omite por completo (no lo duplica ni lo toca) —
 * así que si corre y falla a la mitad, se puede volver a correr tal cual
 * para completar los rubros que faltaron, pero no "repara" un tenant que
 * haya quedado a medias (mejor revisar el error y, si hace falta, borrar
 * ese tenant a mano desde Panel Maestro antes de reintentar ese rubro).
 *
 * Al final imprime y también guarda en prisma/DEMO_CREDENCIALES.md la
 * lista de los 20 logins (correo + contraseña del dueño) y el PIN de cada
 * empleado de cada negocio.
 *
 * ── Frescura de los datos (2026-09-18) ──────────────────────────────────
 * Carlos, revisando demo-barberia en producción: "Fecha seleccionada 14 de
 * Septiembre, ventas en $0 en lunes... para ser un demo no sirve. Ningún
 * negocio que ocupe un SaaS debe tener ventas en $0 por día." La causa: la
 * primera versión de este script sembraba una semana con fechas FIJAS
 * (7-13 de septiembre de 2026); en cuanto pasaban los días esa semana
 * quedaba en el pasado y el Dashboard —que sí mira la fecha real de
 * "hoy"— empezaba a mostrar $0. Ahora la semana a sembrar/operar se
 * calcula con calcularSemana(), relativa al momento en que corre el
 * script, terminando siempre en "hoy".
 *
 * Eso resuelve la corrida de HOY, pero el mismo problema reaparece en 1-2
 * semanas si nadie vuelve a correr el script — por eso este archivo ahora
 * soporta dos modos:
 *   1) `npx tsx prisma/seed-demo.ts` (sin flags) — comportamiento de
 *      siempre: crea los negocios demo que falten, omite los que ya
 *      existen. Sigue siendo la forma de dar de alta un rubro nuevo o
 *      completar una corrida que falló a la mitad.
 *   2) `npx tsx prisma/seed-demo.ts --refrescar` — para los negocios demo
 *      que YA existen, borra su semana operativa anterior (ventas, caja,
 *      reparaciones, asistencia, nómina, compras, factura — nunca el
 *      catálogo, clientes ni personal) y siembra una semana nueva
 *      terminando hoy. Es lo que corre solo cada semana vía Vercel Cron
 *      (ver app/api/cron/reseed-demo/route.ts y vercel.json) para que
 *      ningún dueño que reciba el demo se encuentre con ventas en $0 sin
 *      que Carlos tenga que acordarse de resembrar a mano.
 */

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Copia local mínima de lib/staff-auth.ts (ese archivo tiene "server-only").
function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

const DEMO_PASSWORD = "Demo2026!";
const ACCION_UNICA = "acceso";
const PINES = ["1111", "2222", "3333", "4444"];

// M15/M16 (2026-09-18): "citas" y "expediente-clinico" se agregan aquí —
// antes de este cambio faltaban por completo de este catálogo local, así
// que ningún tenant demo tenía una fila TenantModule para ellos y quedaban
// "activos por default" en los 20 rubros por igual (el criterio "sin fila =
// activo" de TenantModule, ver schema.prisma), incluyendo rubros donde no
// aplican (ej. "Citas" visible en Demo Taller de Celulares). Con esto, los
// negocios demo NUEVOS (creados con el script sin --refrescar) quedan
// exactamente igual que un negocio real recién registrado.
const MODULE_NAMES: Record<string, string> = {
  dashboard: "Dashboard", pos: "Punto de Venta", reparaciones: "Reparaciones", citas: "Citas",
  "expediente-clinico": "Expediente Clínico", clientes: "Clientes",
  catalogo: "Catálogo", inventario: "Inventario", compras: "Compras", caja: "Caja", personal: "Personal",
  asistencia: "Asistencia", sucursales: "Sucursales", reportes: "Reportes", facturacion: "Facturación", soporte: "Soporte",
};
const MODULE_CATALOG_CODES = Object.keys(MODULE_NAMES);
const MODULOS_ASIGNABLES = ["pos", "reparaciones", "citas", "expediente-clinico", "clientes", "catalogo", "inventario", "compras", "caja", "sucursales", "reportes", "soporte"];

// Copia local de lib/modulos-rubro.ts (VERTICAL_MODULE_DEFAULTS_OFF) — se
// actualizó junto con ese archivo (2026-09-18) para reflejar "citas" y
// "expediente-clinico".
const MODULOS_OFF_POR_RUBRO: Record<string, string[]> = {
  barberia: ["reparaciones", "expediente-clinico"],
  consultorio_dental: ["reparaciones"],
  consultorio_medico: ["reparaciones"],
  veterinaria: ["reparaciones"],
  estetica: ["reparaciones", "expediente-clinico"],
  spa: ["reparaciones", "expediente-clinico"],
  gimnasio: ["reparaciones", "expediente-clinico"],
  tatuajes: ["reparaciones", "expediente-clinico"],
  comercio_retail: ["reparaciones", "citas", "expediente-clinico"],
  reparacion_celulares: ["citas", "expediente-clinico"],
  taller_autos: ["citas", "expediente-clinico"],
  taller_motos: ["citas", "expediente-clinico"],
  electrodomesticos: ["citas", "expediente-clinico"],
  computadoras: ["citas", "expediente-clinico"],
  relojeria_joyeria: ["citas", "expediente-clinico"],
  zapateria: ["citas", "expediente-clinico"],
  refrigeracion_ac: ["citas", "expediente-clinico"],
  bicicletas: ["citas", "expediente-clinico"],
  cerrajeria: ["citas", "expediente-clinico"],
  tapiceria: ["citas", "expediente-clinico"],
};

// Rubros con antecedentes/notas de evolución (expediente clínico real) —
// solo los 3 de consulta clínica. "consultorio_dental" además recibe
// odontograma (dientes), los otros dos no.
const RUBROS_CON_EXPEDIENTE = new Set(["consultorio_dental", "consultorio_medico", "veterinaria"]);

// Motivo de cita por rubro (2026-09-18) — solo se usa en rubros con "citas"
// activo por default (los 8 de VERTICAL_MODULE_DEFAULTS_OFF que no apagan
// "citas"); tomado del mismo catálogo de servicios de cada rubro (arriba,
// CATALOGOS) para que el motivo de la cita coincida con lo que ese negocio
// realmente ofrece.
const MOTIVOS_CITA: Record<string, string[]> = {
  barberia: ["Corte de cabello", "Corte + barba", "Diseño de cejas", "Tinte", "Barba"],
  consultorio_dental: ["Consulta / valoración", "Limpieza dental", "Extracción simple", "Resina", "Revisión de rutina"],
  consultorio_medico: ["Consulta general", "Consulta de seguimiento", "Certificado médico", "Curación"],
  veterinaria: ["Consulta general", "Vacunación", "Desparasitación", "Baño y corte", "Revisión de rutina"],
  estetica: ["Corte de cabello", "Peinado", "Manicure", "Pedicure", "Tinte"],
  spa: ["Masaje relajante", "Masaje descontracturante", "Facial básico", "Exfoliación corporal"],
  gimnasio: ["Evaluación física", "Sesión personalizada"],
  tatuajes: ["Consulta de diseño", "Tatuaje pequeño", "Retoque"],
};

// Diagnóstico/tratamiento de ejemplo para las notas de evolución — solo los
// 3 rubros de RUBROS_CON_EXPEDIENTE los usan.
const DIAGNOSTICOS_DEMO: Record<string, string[]> = {
  consultorio_dental: ["Caries en primer molar", "Gingivitis leve", "Sarro acumulado", "Sin hallazgos relevantes"],
  consultorio_medico: ["Cuadro gripal", "Hipertensión controlada", "Gastritis leve", "Sin hallazgos relevantes"],
  veterinaria: ["Otitis leve", "Sobrepeso moderado", "Parásitos intestinales", "Sin hallazgos relevantes"],
};
const TRATAMIENTOS_DEMO: Record<string, string[]> = {
  consultorio_dental: ["Limpieza y aplicación de flúor", "Obturación con resina", "Indicaciones de higiene oral", "Control en 6 meses"],
  consultorio_medico: ["Reposo e hidratación", "Ajuste de medicamento", "Dieta blanda por 3 días", "Control en 2 semanas"],
  veterinaria: ["Limpieza de oído y gotas", "Ajuste de dieta", "Desparasitante oral", "Control en 1 mes"],
};

// Plan de Tratamiento demo (M17, Fase 2, 2026-09-19) — solo los 3 rubros de
// RUBROS_CON_EXPEDIENTE. "diente" es opcional y solo se asigna al azar
// (desde DIENTES_FDI_DEMO) en consultorio_dental — los otros 2 rubros nunca
// llevan diente, mismo criterio que TreatmentPlanItem.toothNumber en el
// schema (opcional, no todo tratamiento es de una pieza dental).
const TITULOS_PLAN_DEMO: Record<string, string[]> = {
  consultorio_dental: ["Rehabilitación oral", "Plan de ortodoncia", "Plan de limpieza y prevención", "Plan de endodoncia y corona"],
  consultorio_medico: ["Plan de control de peso", "Plan de rehabilitación física", "Plan de seguimiento crónico"],
  veterinaria: ["Plan dental canino", "Plan de rehabilitación post-cirugía", "Plan de control de peso"],
};
// condicionDiente (2026-09-19, reporte de Carlos): cuando una fase lleva
// diente, también dice qué condición debe reflejar ESE diente en el
// odontograma — sembrarPlanesTratamiento usa esto para sincronizar ambos en
// vez de sortear el diente del plan y la condición del odontograma por
// separado (que es justo lo que producía el mismo diente con dos historias
// distintas: "Endodoncia" en el plan y "Sano" en el odontograma).
interface FasePlanDemo { descripcion: string; costoMin: number; costoMax: number; conDiente?: boolean; condicionDiente?: ToothCondition }
const FASES_PLAN_DEMO: Record<string, FasePlanDemo[]> = {
  consultorio_dental: [
    { descripcion: "Limpieza dental profunda", costoMin: 800, costoMax: 1200 },
    { descripcion: "Resina dental", costoMin: 900, costoMax: 1500, conDiente: true, condicionDiente: ToothCondition.OBTURADO },
    { descripcion: "Corona de porcelana", costoMin: 4500, costoMax: 7000, conDiente: true, condicionDiente: ToothCondition.CORONA },
    { descripcion: "Endodoncia", costoMin: 3500, costoMax: 6000, conDiente: true, condicionDiente: ToothCondition.ENDODONCIA },
    { descripcion: "Extracción de tercer molar", costoMin: 1200, costoMax: 2200, conDiente: true, condicionDiente: ToothCondition.EXTRACCION_INDICADA },
    { descripcion: "Blanqueamiento dental", costoMin: 2500, costoMax: 4000 },
  ],
  consultorio_medico: [
    { descripcion: "Consulta de seguimiento mensual", costoMin: 400, costoMax: 700 },
    { descripcion: "Estudios de laboratorio completos", costoMin: 800, costoMax: 1500 },
    { descripcion: "Sesión de fisioterapia", costoMin: 350, costoMax: 600 },
  ],
  veterinaria: [
    { descripcion: "Limpieza dental canina", costoMin: 900, costoMax: 1600 },
    { descripcion: "Radiografía y valoración", costoMin: 500, costoMax: 900 },
    { descripcion: "Cirugía menor", costoMin: 1800, costoMax: 3500 },
  ],
};

// Condiciones de diente usadas para poblar el odontograma demo —
// deliberadamente sin SANO (un diente sano no necesita fila, ver
// OdontogramaTooth en schema.prisma) ni EXTRACCION_INDICADA/AUSENTE (se
// prefieren condiciones menos alarmantes para un demo genérico).
const CONDICIONES_ODONTOGRAMA_DEMO: ToothCondition[] = [
  ToothCondition.CARIES, ToothCondition.OBTURADO, ToothCondition.CORONA,
  ToothCondition.ENDODONCIA, ToothCondition.SELLANTE, ToothCondition.FRACTURADO,
];
const DIENTES_FDI_DEMO = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
];

const PALETA = ["#4F46E5", "#06B6D4", "#8B5CF6", "#F97316", "#F59E0B", "#14B8A6", "#10B981", "#EC4899", "#EF4444", "#3B82F6"];

// Ventana de 7 días a sembrar/operar, SIEMPRE relativa al momento en que
// corre el script — termina hoy (índice 6) y arranca hace 6 días (índice
// 0), sea cual sea el día real de la semana en que se ejecute. Antes era
// un arreglo de fechas fijas; ver el comentario largo arriba ("Frescura de
// los datos") para el porqué del cambio. new Date()/setDate() usan la hora
// local del proceso que corre el script (la de la máquina de Carlos al
// correrlo a mano, UTC en Vercel Cron) — para el grano de un día completo
// esto es suficiente; en el peor caso, justo en la medianoche UTC, una
// fecha podría quedar corrida por un día, sin ningún efecto real en un
// negocio DEMO.
function calcularSemana(): string[] {
  const hoy = new Date();
  const dias: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(d.getDate() - i);
    dias.push(d.toISOString().slice(0, 10));
  }
  return dias;
}
const SEMANA = calcularSemana();

// ── utilidades ─────────────────────────────────────────────────────────
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
function telefonoAleatorio(): string {
  let s = "";
  for (let i = 0; i < 10; i++) s += String(randInt(0, 9));
  return s;
}
function horaAleatoria(): string {
  const h = randInt(9, 19);
  const m = pick(["00", "15", "30", "45"]);
  return `${String(h).padStart(2, "0")}:${m}`;
}
function claveAleatoria18(): string {
  let s = "014027";
  while (s.length < 18) s += String(randInt(0, 9));
  return s.slice(0, 18);
}
function metodoPagoVenta(): PaymentMethod {
  const r = Math.random();
  if (r < 0.45) return PaymentMethod.CASH;
  if (r < 0.75) return PaymentMethod.CARD;
  if (r < 0.85) return PaymentMethod.TRANSFER;
  return PaymentMethod.MIXED;
}
function inferirModulosPorPuesto(puesto: string, tieneReparaciones: boolean, tieneCitas: boolean, tieneExpediente: boolean): string[] {
  const p = puesto.toLowerCase();
  const base = ["pos", "clientes"];
  if (tieneReparaciones) base.push("reparaciones");
  if (tieneCitas) base.push("citas");
  // "Doctor" en sentido amplio (dentista/médico/veterinario) — el único
  // tipo de puesto al que le corresponde ver expediente clínico, mismo
  // criterio que MATRIZ_ACCESO_BASE.Técnico en lib/roles.ts.
  const esDoctor = p.includes("dentista") || p.includes("médic") || p.includes("medic") || p.includes("veterinari");
  if (tieneExpediente && esDoctor) base.push("expediente-clinico");
  if (p.includes("recep")) return Array.from(new Set([...base, "caja"]));
  if (p.includes("jefe") || p.includes("encargad") || p.includes("gerente") || esDoctor) {
    return Array.from(new Set([...base, "caja", "catalogo", "inventario", "reportes"]));
  }
  return Array.from(new Set(base));
}
function commissionBaseSegunRubro(tieneReparaciones: boolean, i: number, esquema: PaymentScheme): CommissionBase {
  let base: CommissionBase = i === 0 ? CommissionBase.UTILIDAD : (tieneReparaciones && i % 2 === 1 ? CommissionBase.REPARACIONES : CommissionBase.VENTAS);
  // UTILIDAD no aplica a destajo (ver Staff.pieceRate, schema.prisma) — si
  // cayó ahí, se resuelve a la base "unidad" que sí le corresponda al rubro.
  if (esquema === PaymentScheme.DESTAJO && base === CommissionBase.UTILIDAD) {
    base = tieneReparaciones ? CommissionBase.REPARACIONES : CommissionBase.VENTAS;
  }
  return base;
}

async function obtenerOCrearUsuarioAuth(email: string, password: string): Promise<string> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { demo: true },
  });
  if (!error && data?.user) return data.user.id;

  // Ya existe (reintento de una corrida anterior que sí creó el Auth user
  // pero falló después) — lo localizamos por correo en vez de tronar.
  for (let page = 1; page <= 5; page++) {
    const { data: lista, error: errLista } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (errLista || !lista) break;
    const encontrado = lista.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (encontrado) return encontrado.id;
    if (lista.users.length < 200) break;
  }
  throw new Error(`No se pudo crear ni encontrar el usuario de Supabase Auth para ${email}: ${error?.message ?? "desconocido"}`);
}

async function asegurarCatalogoPermisos(): Promise<Map<string, string>> {
  const modulos = Array.from(new Set([...MODULOS_ASIGNABLES, "dashboard"]));
  const permisos = await Promise.all(
    modulos.map((modulo) =>
      prisma.permission.upsert({
        where: { module_action: { module: modulo, action: ACCION_UNICA } },
        update: {},
        create: { module: modulo, action: ACCION_UNICA },
        select: { id: true, module: true },
      })
    )
  );
  return new Map(permisos.map((p) => [p.module, p.id]));
}

// ── catálogo de arranque por rubro (copia local de lib/catalogo-arranque.ts, sin el sistema de íconos) ──
interface ItemArranque {
  categoryName: string;
  categoryType: "PRODUCT" | "PART" | "SERVICE";
  name: string;
  type: "PRODUCT" | "PART" | "SERVICE";
  price: number;
  cost?: number;
  // Clave del catálogo de íconos del sistema (lib/catalogo-iconos-base.ts,
  // ICON_IDS) — se guarda en Product.emoji como "icon:<icon>", exactamente
  // igual que hace cargarCatalogoArranqueAction en catalogo-actions.ts. Un
  // emoji de texto plano ("🛠️" etc.) NO es una clave válida para ese
  // resolver: el catálogo/POS/inventario caen a un ícono genérico de caja o
  // llave cuando no reconocen la clave — bug real de la primera versión de
  // este script, detectado por Carlos navegando el demo de barbería.
  icon: string;
}

interface DispositivoReparacion { brand: string; model: string; }
interface ConfigReparaciones { dispositivos: DispositivoReparacion[]; fallas: string[]; }

interface EmpleadoConfig { puesto: string; nombre: string; }

interface RubroConfig {
  key: string;
  tenantName: string;
  slug: string;
  emailLocal: string;
  segundaSucursal: boolean;
  proveedorNombre: string;
  catalogo: ItemArranque[];
  staff: EmpleadoConfig[];
  reparaciones?: ConfigReparaciones;
  // true = usar CLIENTES_POOL_MASCULINO en vez del pool general (ver su
  // comentario). Por ahora solo "barberia".
  clientelaMasculina?: boolean;
}

const CATALOGOS: Record<string, ItemArranque[]> = {
  reparacion_celulares: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Diagnóstico", type: "SERVICE", price: 100 , icon: "Search" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de pantalla", type: "SERVICE", price: 800 , icon: "Smartphone" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de batería", type: "SERVICE", price: 450 , icon: "BatteryCharging" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de puerto de carga", type: "SERVICE", price: 350 , icon: "Plug" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Pantalla genérica", type: "PART", price: 800, cost: 450 , icon: "Smartphone" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Batería genérica", type: "PART", price: 400, cost: 220 , icon: "Battery" },
    { categoryName: "Accesorios", categoryType: "PRODUCT", name: "Mica de cristal templado", type: "PRODUCT", price: 80, cost: 30 , icon: "ShieldCheck" },
    { categoryName: "Accesorios", categoryType: "PRODUCT", name: "Funda protectora", type: "PRODUCT", price: 150, cost: 60 , icon: "Package" },
    { categoryName: "Accesorios", categoryType: "PRODUCT", name: "Cargador USB-C", type: "PRODUCT", price: 200, cost: 90 , icon: "Zap" },
  ],
  taller_autos: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de aceite", type: "SERVICE", price: 450 , icon: "Droplet" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Afinación mayor", type: "SERVICE", price: 1800 , icon: "Wrench" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Diagnóstico computarizado", type: "SERVICE", price: 350 , icon: "Search" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Alineación y balanceo", type: "SERVICE", price: 600 , icon: "CircleGauge" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Filtro de aceite", type: "PART", price: 150, cost: 70 , icon: "Droplet" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Balatas delanteras (juego)", type: "PART", price: 900, cost: 500 , icon: "Cog" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Batería 12V", type: "PART", price: 1800, cost: 1200 , icon: "Battery" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Aceite de motor 1L", type: "PRODUCT", price: 180, cost: 100 , icon: "Droplet" },
  ],
  taller_motos: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de aceite", type: "SERVICE", price: 250 , icon: "Droplet" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Afinación", type: "SERVICE", price: 700 , icon: "Wrench" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de llanta", type: "SERVICE", price: 400 , icon: "Bike" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Kit de arrastre", type: "PART", price: 1200, cost: 700 , icon: "Cog" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Balatas", type: "PART", price: 350, cost: 180 , icon: "Wrench" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Batería para moto", type: "PART", price: 900, cost: 550 , icon: "Battery" },
  ],
  electrodomesticos: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Diagnóstico", type: "SERVICE", price: 150 , icon: "Search" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Reparación de lavadora", type: "SERVICE", price: 600 , icon: "WashingMachine" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Reparación de refrigerador", type: "SERVICE", price: 800 , icon: "Refrigerator" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Mantenimiento de aire acondicionado", type: "SERVICE", price: 500 , icon: "AirVent" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Motor de lavadora", type: "PART", price: 1200, cost: 700 , icon: "Cog" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Compresor", type: "PART", price: 1800, cost: 1100 , icon: "Fan" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Termostato", type: "PART", price: 350, cost: 180 , icon: "Thermometer" },
  ],
  computadoras: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Diagnóstico", type: "SERVICE", price: 150 , icon: "Search" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Formateo e instalación de sistema", type: "SERVICE", price: 350 , icon: "Laptop" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Limpieza interna", type: "SERVICE", price: 250 , icon: "Brush" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de disco a SSD", type: "SERVICE", price: 400 , icon: "HardDrive" },
    { categoryName: "Refacciones", categoryType: "PART", name: "SSD 480GB", type: "PART", price: 800, cost: 500 , icon: "HardDrive" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Memoria RAM 8GB", type: "PART", price: 700, cost: 450 , icon: "MemoryStick" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Fuente de poder", type: "PART", price: 600, cost: 350 , icon: "Zap" },
    { categoryName: "Accesorios", categoryType: "PRODUCT", name: "Mouse", type: "PRODUCT", price: 150, cost: 70 , icon: "Mouse" },
    { categoryName: "Accesorios", categoryType: "PRODUCT", name: "Teclado", type: "PRODUCT", price: 250, cost: 130 , icon: "Keyboard" },
  ],
  barberia: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Corte de cabello", type: "SERVICE", price: 120 , icon: "Scissors" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Barba", type: "SERVICE", price: 80 , icon: "Feather" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Corte + barba", type: "SERVICE", price: 180 , icon: "Star" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Diseño de cejas", type: "SERVICE", price: 50 , icon: "Sparkles" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Tinte", type: "SERVICE", price: 250 , icon: "Palette" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Cera para cabello", type: "PRODUCT", price: 150, cost: 70 , icon: "Brush" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Aceite para barba", type: "PRODUCT", price: 180, cost: 90 , icon: "Droplet" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Shampoo", type: "PRODUCT", price: 120, cost: 60 , icon: "SprayCan" },
  ],
  consultorio_dental: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Consulta / valoración", type: "SERVICE", price: 300 , icon: "Smile" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Limpieza dental", type: "SERVICE", price: 600 , icon: "Brush" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Extracción simple", type: "SERVICE", price: 800 , icon: "Cross" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Resina", type: "SERVICE", price: 700 , icon: "Droplet" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Blanqueamiento", type: "SERVICE", price: 2500 , icon: "Sparkles" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Cepillo dental", type: "PRODUCT", price: 60, cost: 25 , icon: "Brush" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Pasta dental", type: "PRODUCT", price: 80, cost: 35 , icon: "Droplet" },
  ],
  consultorio_medico: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Consulta general", type: "SERVICE", price: 400 , icon: "Stethoscope" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Consulta de seguimiento", type: "SERVICE", price: 250 , icon: "Cross" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Certificado médico", type: "SERVICE", price: 200 , icon: "ClipboardList" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Curación", type: "SERVICE", price: 150 , icon: "Bandage" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Kit de curación", type: "PRODUCT", price: 100, cost: 50 , icon: "Bandage" },
  ],
  veterinaria: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Consulta general", type: "SERVICE", price: 350 , icon: "PawPrint" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Vacunación", type: "SERVICE", price: 300 , icon: "Syringe" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Desparasitación", type: "SERVICE", price: 200 , icon: "Pill" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Baño y corte", type: "SERVICE", price: 250 , icon: "Bath" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cirugía menor", type: "SERVICE", price: 1500 , icon: "Activity" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Alimento premium 1kg", type: "PRODUCT", price: 120, cost: 70 , icon: "Bone" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Shampoo antipulgas", type: "PRODUCT", price: 150, cost: 80 , icon: "SprayCan" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Collar antipulgas", type: "PRODUCT", price: 180, cost: 90 , icon: "PawPrint" },
  ],
  relojeria_joyeria: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de pila de reloj", type: "SERVICE", price: 80 , icon: "Watch" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Ajuste de extensión", type: "SERVICE", price: 100 , icon: "Ruler" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Limpieza y pulido", type: "SERVICE", price: 200 , icon: "Gem" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Reparación de cierre", type: "SERVICE", price: 150 , icon: "Wrench" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Pila de reloj", type: "PART", price: 40, cost: 15 , icon: "Battery" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Correa de piel", type: "PRODUCT", price: 250, cost: 120 , icon: "Watch" },
  ],
  zapateria: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de suela", type: "SERVICE", price: 250 , icon: "Footprints" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de tacón", type: "SERVICE", price: 150 , icon: "Wrench" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Boleada", type: "SERVICE", price: 50 , icon: "Sparkles" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Ajuste de talla", type: "SERVICE", price: 100 , icon: "Ruler" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Plantillas", type: "PRODUCT", price: 120, cost: 55 , icon: "Footprints" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Betún", type: "PRODUCT", price: 60, cost: 25 , icon: "Droplet" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Agujetas", type: "PRODUCT", price: 40, cost: 15 , icon: "Tag" },
  ],
  refrigeracion_ac: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Mantenimiento preventivo", type: "SERVICE", price: 600 , icon: "Snowflake" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Carga de gas refrigerante", type: "SERVICE", price: 900 , icon: "Droplet" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Diagnóstico", type: "SERVICE", price: 250 , icon: "Search" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Instalación de minisplit", type: "SERVICE", price: 1500 , icon: "AirVent" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Capacitor", type: "PART", price: 350, cost: 180 , icon: "Cog" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Filtro de aire", type: "PART", price: 200, cost: 90 , icon: "Fan" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Termostato", type: "PART", price: 400, cost: 220 , icon: "Thermometer" },
  ],
  bicicletas: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Afinación completa", type: "SERVICE", price: 350 , icon: "Bike" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de llanta", type: "SERVICE", price: 150 , icon: "Wrench" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Ajuste de frenos", type: "SERVICE", price: 120 , icon: "CircleGauge" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de cadena", type: "SERVICE", price: 200 , icon: "Cog" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Cámara", type: "PART", price: 80, cost: 35 , icon: "Package" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Llanta", type: "PART", price: 350, cost: 180 , icon: "CircleGauge" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Cadena", type: "PART", price: 250, cost: 120 , icon: "Cog" },
    { categoryName: "Refacciones", categoryType: "PART", name: "Pastillas de freno", type: "PART", price: 150, cost: 70 , icon: "Wrench" },
  ],
  cerrajeria: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Apertura de auto", type: "SERVICE", price: 350 , icon: "Car" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de cerradura", type: "SERVICE", price: 450 , icon: "Lock" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Duplicado de llave", type: "SERVICE", price: 60 , icon: "Key" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Programación de control", type: "SERVICE", price: 500 , icon: "Wrench" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Cerradura estándar", type: "PRODUCT", price: 400, cost: 220 , icon: "Lock" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Candado", type: "PRODUCT", price: 150, cost: 75 , icon: "KeyRound" },
  ],
  tapiceria: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Tapizado de sillón (por pieza)", type: "SERVICE", price: 1500 , icon: "Armchair" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Reparación de resortes", type: "SERVICE", price: 400 , icon: "Wrench" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Cambio de espuma", type: "SERVICE", price: 600 , icon: "Sofa" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Tela por metro", type: "PRODUCT", price: 180, cost: 100 , icon: "Ruler" },
  ],
  estetica: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Corte de cabello", type: "SERVICE", price: 150 , icon: "Scissors" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Peinado", type: "SERVICE", price: 200 , icon: "Brush" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Manicure", type: "SERVICE", price: 120 , icon: "Sparkles" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Pedicure", type: "SERVICE", price: 150 , icon: "Footprints" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Tinte", type: "SERVICE", price: 350 , icon: "Palette" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Esmalte", type: "PRODUCT", price: 80, cost: 35 , icon: "Sparkles" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Shampoo", type: "PRODUCT", price: 150, cost: 70 , icon: "SprayCan" },
  ],
  spa: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Masaje relajante 60 min", type: "SERVICE", price: 500 , icon: "Heart" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Masaje descontracturante", type: "SERVICE", price: 600 , icon: "HeartPulse" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Facial básico", type: "SERVICE", price: 400 , icon: "Sparkles" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Exfoliación corporal", type: "SERVICE", price: 450 , icon: "Flower2" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Aceite esencial", type: "PRODUCT", price: 200, cost: 100 , icon: "Droplet" },
  ],
  gimnasio: [
    { categoryName: "Membresías", categoryType: "SERVICE", name: "Membresía mensual", type: "SERVICE", price: 450 , icon: "Dumbbell" },
    { categoryName: "Membresías", categoryType: "SERVICE", name: "Membresía semanal", type: "SERVICE", price: 150 , icon: "Star" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Sesión personalizada", type: "SERVICE", price: 250 , icon: "HeartPulse" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Evaluación física", type: "SERVICE", price: 150 , icon: "ClipboardList" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Shaker", type: "PRODUCT", price: 100, cost: 45 , icon: "CupSoda" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Toalla deportiva", type: "PRODUCT", price: 80, cost: 35 , icon: "Shirt" },
  ],
  tatuajes: [
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Consulta de diseño", type: "SERVICE", price: 100 , icon: "Palette" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Tatuaje pequeño", type: "SERVICE", price: 600 , icon: "PenTool" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Tatuaje mediano", type: "SERVICE", price: 1500 , icon: "Feather" },
    { categoryName: "Servicios", categoryType: "SERVICE", name: "Retoque", type: "SERVICE", price: 300 , icon: "Sparkles" },
    { categoryName: "Productos", categoryType: "PRODUCT", name: "Crema cicatrizante", type: "PRODUCT", price: 150, cost: 70 , icon: "Droplet" },
  ],
  comercio_retail: [
    { categoryName: "Bebidas", categoryType: "PRODUCT", name: "Agua embotellada 600ml", type: "PRODUCT", price: 15, cost: 8 , icon: "Droplets" },
    { categoryName: "Bebidas", categoryType: "PRODUCT", name: "Refresco 600ml", type: "PRODUCT", price: 20, cost: 12 , icon: "CupSoda" },
    { categoryName: "Snacks", categoryType: "PRODUCT", name: "Snack individual", type: "PRODUCT", price: 18, cost: 10 , icon: "Cookie" },
    { categoryName: "Otros", categoryType: "PRODUCT", name: "Bolsa de plástico", type: "PRODUCT", price: 2, cost: 0.5 , icon: "ShoppingBag" },
  ],
};

const REPARACIONES: Record<string, ConfigReparaciones> = {
  reparacion_celulares: {
    dispositivos: [{ brand: "Apple", model: "iPhone 13" }, { brand: "Samsung", model: "Galaxy A54" }, { brand: "Xiaomi", model: "Redmi Note 12" }, { brand: "Motorola", model: "Moto G84" }],
    fallas: ["Pantalla rota", "No enciende", "Batería se descarga rápido", "No carga", "Sin señal"],
  },
  taller_autos: {
    dispositivos: [{ brand: "Nissan", model: "Versa" }, { brand: "Chevrolet", model: "Aveo" }, { brand: "Volkswagen", model: "Jetta" }, { brand: "Kia", model: "Rio" }],
    fallas: ["Ruido en frenos", "Fuga de aceite", "No enciende", "Falla en la transmisión", "Requiere afinación"],
  },
  taller_motos: {
    dispositivos: [{ brand: "Honda", model: "CB190R" }, { brand: "Yamaha", model: "FZ16" }, { brand: "Suzuki", model: "Gixxer" }],
    fallas: ["No enciende", "Ruido en motor", "Frenos gastados", "Fuga de aceite"],
  },
  electrodomesticos: {
    dispositivos: [{ brand: "Whirlpool", model: "Lavadora 18kg" }, { brand: "Mabe", model: "Refrigerador" }, { brand: "LG", model: "Lavadora" }, { brand: "Samsung", model: "Refrigerador" }],
    fallas: ["No enciende", "Hace ruido excesivo", "No enfría", "Fuga de agua", "No centrifuga"],
  },
  computadoras: {
    dispositivos: [{ brand: "HP", model: "Pavilion 15" }, { brand: "Dell", model: "Inspiron 14" }, { brand: "Lenovo", model: "ThinkPad E14" }, { brand: "Apple", model: "MacBook Air" }],
    fallas: ["No enciende", "Muy lenta", "Pantalla azul", "No carga la batería", "Sobrecalentamiento"],
  },
  relojeria_joyeria: {
    dispositivos: [{ brand: "Casio", model: "Reloj análogo" }, { brand: "Fossil", model: "Reloj de cuarzo" }, { brand: "Citizen", model: "Reloj automático" }],
    fallas: ["Pila agotada", "Cierre roto", "Cristal rayado", "Se atrasa"],
  },
  zapateria: {
    dispositivos: [{ brand: "Casual", model: "Zapato de vestir" }, { brand: "Deportivo", model: "Tenis running" }, { brand: "Bota", model: "Bota de trabajo" }],
    fallas: ["Suela despegada", "Tacón roto", "Costura abierta", "Necesita boleada"],
  },
  refrigeracion_ac: {
    dispositivos: [{ brand: "Mabe", model: "Minisplit 1 tonelada" }, { brand: "LG", model: "Minisplit inverter" }, { brand: "Carrier", model: "Minisplit 2 toneladas" }],
    fallas: ["No enfría", "Gotea agua", "Hace ruido", "Necesita mantenimiento"],
  },
  bicicletas: {
    dispositivos: [{ brand: "Trek", model: "Bici de montaña" }, { brand: "Benotto", model: "Bici urbana" }, { brand: "Mercurio", model: "Bici de ruta" }],
    fallas: ["Frenos no responden", "Cadena suelta", "Llanta ponchada", "Cambios desajustados"],
  },
  cerrajeria: {
    dispositivos: [{ brand: "Kwikset", model: "Cerradura de puerta principal" }, { brand: "Genérica", model: "Chapa de auto" }, { brand: "Genérica", model: "Candado" }],
    fallas: ["Llave atascada", "Cerradura no abre", "Perdió llaves", "Necesita cambio de chapa"],
  },
  tapiceria: {
    dispositivos: [{ brand: "N/A", model: "Sillón de 3 plazas" }, { brand: "N/A", model: "Sofá cama" }, { brand: "N/A", model: "Silla de comedor (juego)" }],
    fallas: ["Tela desgastada", "Resortes hundidos", "Espuma deteriorada", "Costura descosida"],
  },
};

const RUBROS_DEMO: RubroConfig[] = [
  { key: "barberia", tenantName: "Demo Barbería", slug: "demo-barberia", emailLocal: "barberia", segundaSucursal: false, clientelaMasculina: true, proveedorNombre: "Distribuidora de Insumos para Barbería", catalogo: CATALOGOS.barberia, staff: [
    { puesto: "Jefe de Barberos", nombre: "Raúl Domínguez" }, { puesto: "Barbero", nombre: "Iván Casillas" }, { puesto: "Recepcionista", nombre: "Paola Reyes" }, { puesto: "Estilista", nombre: "Kevin Salas" },
  ] },
  { key: "consultorio_dental", tenantName: "Demo Consultorio Dental", slug: "demo-consultorio-dental", emailLocal: "consultoriodental", segundaSucursal: false, proveedorNombre: "Depósito Dental del Bajío", catalogo: CATALOGOS.consultorio_dental, staff: [
    { puesto: "Dentista", nombre: "Fernanda Ibarra" }, { puesto: "Asistente dental", nombre: "Brenda Colín" }, { puesto: "Recepcionista", nombre: "Itzel Moreno" }, { puesto: "Higienista", nombre: "Sergio Nava" },
  ] },
  { key: "consultorio_medico", tenantName: "Demo Consultorio Médico", slug: "demo-consultorio-medico", emailLocal: "consultoriomedico", segundaSucursal: false, proveedorNombre: "Insumos Médicos Hidalgo", catalogo: CATALOGOS.consultorio_medico, staff: [
    { puesto: "Médico", nombre: "Alberto Cabrera" }, { puesto: "Enfermero(a)", nombre: "Lucía Padilla" }, { puesto: "Recepcionista", nombre: "Diego Salinas" }, { puesto: "Asistente médico", nombre: "Marisol Pineda" },
  ] },
  { key: "veterinaria", tenantName: "Demo Veterinaria", slug: "demo-veterinaria", emailLocal: "veterinaria", segundaSucursal: false, proveedorNombre: "Alimentos y Fármacos Veterinarios SA", catalogo: CATALOGOS.veterinaria, staff: [
    { puesto: "Veterinario", nombre: "Renata Solís" }, { puesto: "Asistente veterinario", nombre: "Omar Beltrán" }, { puesto: "Recepcionista", nombre: "Ximena Cordero" }, { puesto: "Groomer", nombre: "Tania Reséndiz" },
  ] },
  { key: "estetica", tenantName: "Demo Estética", slug: "demo-estetica", emailLocal: "estetica", segundaSucursal: false, proveedorNombre: "Distribuidora de Belleza Total", catalogo: CATALOGOS.estetica, staff: [
    { puesto: "Encargado de sucursal", nombre: "Luis Fregoso" }, { puesto: "Esteticista", nombre: "Grecia Montoya" }, { puesto: "Recepcionista", nombre: "Nadia Ríos" },
  ] },
  { key: "spa", tenantName: "Demo Spa", slug: "demo-spa", emailLocal: "spa", segundaSucursal: false, proveedorNombre: "Aromas y Esencias del Spa", catalogo: CATALOGOS.spa, staff: [
    { puesto: "Encargado de sucursal", nombre: "Héctor Villagómez" }, { puesto: "Terapeuta", nombre: "Ingrid Camacho" }, { puesto: "Masajista", nombre: "Rodolfo Aguayo" }, { puesto: "Recepcionista", nombre: "Camila Bautista" },
  ] },
  { key: "gimnasio", tenantName: "Demo Gimnasio", slug: "demo-gimnasio", emailLocal: "gimnasio", segundaSucursal: false, proveedorNombre: "Equipos y Suplementos Fitness", catalogo: CATALOGOS.gimnasio, staff: [
    { puesto: "Encargado de sucursal", nombre: "Ricardo Peña" }, { puesto: "Entrenador", nombre: "Jonathan Rivas" }, { puesto: "Instructor", nombre: "Vanessa Cordero" }, { puesto: "Recepcionista", nombre: "Melissa Estrada" },
  ] },
  { key: "tatuajes", tenantName: "Demo Estudio de Tatuajes", slug: "demo-tatuajes", emailLocal: "tatuajes", segundaSucursal: false, proveedorNombre: "Insumos para Tatuadores MX", catalogo: CATALOGOS.tatuajes, staff: [
    { puesto: "Encargado de estudio", nombre: "Bruno Escamilla" }, { puesto: "Tatuador", nombre: "Axel Monroy" }, { puesto: "Recepcionista", nombre: "Dulce Marín" },
  ] },
  { key: "comercio_retail", tenantName: "Demo Tienda de Conveniencia", slug: "demo-comercio-retail", emailLocal: "comercioretail", segundaSucursal: true, proveedorNombre: "Distribuidora Mayorista del Centro", catalogo: CATALOGOS.comercio_retail, staff: [
    { puesto: "Encargado de tienda", nombre: "Mauricio Lerma" }, { puesto: "Cajero", nombre: "Yolanda Cisneros" }, { puesto: "Vendedor", nombre: "Alan Zapién" }, { puesto: "Almacenista", nombre: "Efraín Solano" },
  ] },
  { key: "reparacion_celulares", tenantName: "Demo Taller de Celulares", slug: "demo-reparacion-celulares", emailLocal: "reparacioncelulares", segundaSucursal: false, proveedorNombre: "Refaccionaria de Celulares Express", catalogo: CATALOGOS.reparacion_celulares, reparaciones: REPARACIONES.reparacion_celulares, staff: [
    { puesto: "Técnico reparador", nombre: "Kevin Loera" }, { puesto: "Recepcionista", nombre: "Andrea Zamora" }, { puesto: "Encargado de sucursal", nombre: "Fabián Orozco" },
  ] },
  { key: "taller_autos", tenantName: "Demo Taller Mecánico", slug: "demo-taller-autos", emailLocal: "tallerautos", segundaSucursal: true, proveedorNombre: "Refaccionaria Automotriz del Norte", catalogo: CATALOGOS.taller_autos, reparaciones: REPARACIONES.taller_autos, staff: [
    { puesto: "Jefe de taller", nombre: "Rubén Casares" }, { puesto: "Mecánico", nombre: "Joel Gaytán" }, { puesto: "Recepción", nombre: "Silvia Anaya" }, { puesto: "Asesor de servicio", nombre: "Gerardo Mata" },
  ] },
  { key: "taller_motos", tenantName: "Demo Taller de Motos", slug: "demo-taller-motos", emailLocal: "tallermotos", segundaSucursal: false, proveedorNombre: "Refaccionaria de Motopartes", catalogo: CATALOGOS.taller_motos, reparaciones: REPARACIONES.taller_motos, staff: [
    { puesto: "Jefe de taller", nombre: "Iván Cazares" }, { puesto: "Mecánico", nombre: "Eduardo Sarabia" }, { puesto: "Recepción", nombre: "Karina Olvera" },
  ] },
  { key: "electrodomesticos", tenantName: "Demo Servicio de Electrodomésticos", slug: "demo-electrodomesticos", emailLocal: "electrodomesticos", segundaSucursal: false, proveedorNombre: "Refacciones para Línea Blanca SA", catalogo: CATALOGOS.electrodomesticos, reparaciones: REPARACIONES.electrodomesticos, staff: [
    { puesto: "Técnico reparador", nombre: "Wilfrido Nájera" }, { puesto: "Recepcionista", nombre: "Perla Guízar" }, { puesto: "Encargado de sucursal", nombre: "Noé Barrientos" },
  ] },
  { key: "computadoras", tenantName: "Demo Taller de Computadoras", slug: "demo-computadoras", emailLocal: "computadoras", segundaSucursal: false, proveedorNombre: "Componentes y Refacciones PC", catalogo: CATALOGOS.computadoras, reparaciones: REPARACIONES.computadoras, staff: [
    { puesto: "Técnico reparador", nombre: "Saúl Farías" }, { puesto: "Recepcionista", nombre: "Mayra Cuevas" }, { puesto: "Encargado de sucursal", nombre: "Emmanuel Rosado" },
  ] },
  { key: "relojeria_joyeria", tenantName: "Demo Relojería y Joyería", slug: "demo-relojeria-joyeria", emailLocal: "relojeriajoyeria", segundaSucursal: false, proveedorNombre: "Insumos de Relojería y Joyería", catalogo: CATALOGOS.relojeria_joyeria, reparaciones: REPARACIONES.relojeria_joyeria, staff: [
    { puesto: "Relojero/Joyero", nombre: "Aarón Villaseñor" }, { puesto: "Vendedor", nombre: "Cynthia Marroquín" }, { puesto: "Encargado de tienda", nombre: "Baltazar Cordero" },
  ] },
  { key: "zapateria", tenantName: "Demo Zapatería", slug: "demo-zapateria", emailLocal: "zapateria", segundaSucursal: false, proveedorNombre: "Insumos para Calzado y Talabartería", catalogo: CATALOGOS.zapateria, reparaciones: REPARACIONES.zapateria, staff: [
    { puesto: "Zapatero remendón", nombre: "Federico Macías" }, { puesto: "Vendedor", nombre: "Guadalupe Serna" }, { puesto: "Encargado de tienda", nombre: "Ismael Pantoja" },
  ] },
  { key: "refrigeracion_ac", tenantName: "Demo Refrigeración y A/C", slug: "demo-refrigeracion-ac", emailLocal: "refrigeracionac", segundaSucursal: false, proveedorNombre: "Refacciones de Refrigeración Industrial", catalogo: CATALOGOS.refrigeracion_ac, reparaciones: REPARACIONES.refrigeracion_ac, staff: [
    { puesto: "Técnico instalador", nombre: "Norberto Chávez" }, { puesto: "Recepcionista", nombre: "Liliana Burciaga" }, { puesto: "Encargado de sucursal", nombre: "Alonso Trejo" },
  ] },
  { key: "bicicletas", tenantName: "Demo Taller de Bicicletas", slug: "demo-bicicletas", emailLocal: "bicicletas", segundaSucursal: false, proveedorNombre: "Refaccionaria de Ciclismo", catalogo: CATALOGOS.bicicletas, reparaciones: REPARACIONES.bicicletas, staff: [
    { puesto: "Encargado de tienda", nombre: "Gilberto Nolasco" }, { puesto: "Mecánico de bicicletas", nombre: "Uriel Campos" }, { puesto: "Vendedor", nombre: "Rocío Delgadillo" },
  ] },
  { key: "cerrajeria", tenantName: "Demo Cerrajería", slug: "demo-cerrajeria", emailLocal: "cerrajeria", segundaSucursal: false, proveedorNombre: "Distribuidora de Herrajes y Cerraduras", catalogo: CATALOGOS.cerrajeria, reparaciones: REPARACIONES.cerrajeria, staff: [
    { puesto: "Cerrajero", nombre: "Arturo Villalpando" }, { puesto: "Recepcionista", nombre: "Estefanía Rangel" }, { puesto: "Encargado de sucursal", nombre: "Moisés Concha" },
  ] },
  { key: "tapiceria", tenantName: "Demo Tapicería", slug: "demo-tapiceria", emailLocal: "tapiceria", segundaSucursal: false, proveedorNombre: "Telas y Espumas para Tapicería", catalogo: CATALOGOS.tapiceria, reparaciones: REPARACIONES.tapiceria, staff: [
    { puesto: "Tapicero", nombre: "Leonel Guerrero" }, { puesto: "Vendedor", nombre: "Anahí Solórzano" }, { puesto: "Encargado de taller", nombre: "Fermín Ocampo" },
  ] },
];

const CLIENTES_POOL = [
  "Juan Hernández", "María Fernanda López", "Carlos Ramírez", "Ana Sofía Torres", "Jorge Luis Medina", "Laura Patricia Gómez", "Roberto Carlos Sánchez", "Daniela Flores",
  "Miguel Ángel Ruiz", "Fernanda Castillo", "Alejandro Vega", "Paola Cristina Ortiz", "Ricardo Morales", "Gabriela Núñez", "Francisco Javier Rojas", "Claudia Elena Vargas",
  "Sergio Iván Aguilar", "Mónica Reséndiz", "Héctor Manuel Cortés", "Adriana Lucía Serrano", "Enrique Paredes", "Verónica Cabrera", "Pablo César Domínguez", "Karla Jazmín Reyes",
  "David Alberto Chávez", "Silvia Guadalupe Mendoza", "Iván Andrés Ponce", "Rosa Isela Bautista", "Óscar Eduardo Salinas", "Blanca Estela Nava", "Rubén Darío Escobar", "Teresa de Jesús Camacho",
  "Gustavo Adolfo Ibarra", "Norma Angélica Pineda", "Raúl Fernando Beltrán", "Cecilia Montserrat Cordero", "Julio César Villagómez", "Leticia Del Carmen Estrada", "Armando Pérez", "Yolanda Marín",
];

// Clientela exclusivamente masculina — hoy solo para "barberia" (feedback de
// Carlos: en su experiencia una barbería atiende solo hombres; el mixto de
// hombre y mujer es "estética"/"estilista", que ya usa CLIENTES_POOL normal).
// Si más adelante se identifica otro rubro con un perfil de clientela
// similarmente marcado, se agrega aquí y se activa con
// RubroConfig.clientelaMasculina — no se asume para ningún otro rubro sin
// que Carlos lo confirme primero.
const CLIENTES_POOL_MASCULINO = [
  "Diego Fernández", "Mauricio Ibarra", "Emilio Castañeda", "Rodrigo Salcedo",
  "Tomás Elizondo", "Gerardo Pineda", "Adrián Cervantes", "Bruno Manríquez",
  "Fabricio Solano", "Renato Quintero", "Maximiliano Ochoa", "Leonardo Villaseñor",
];

interface CredencialEmpleado { name: string; puesto: string; pin: string; }
interface CredencialNegocio { tenantName: string; slug: string; ownerEmail: string; password: string; staff: CredencialEmpleado[]; }
const RESUMEN_CREDENCIALES: CredencialNegocio[] = [];

// Antes vivía declarado dentro de crearNegocioDemo — se sube a nivel de
// módulo porque refrescarNegocioDemo (semana operativa nueva para un
// negocio que YA existe, ver comentario "Frescura de los datos" arriba)
// también arma un arreglo de este mismo tipo, reconstruido desde la BD en
// vez de creado de cero.
type EmpleadoCreado = { staffId: string; branchId: string; name: string; puesto: string; pin: string };

// Datos "de configuración" de un negocio ya sembrado que sembrarSemanaOperativa
// necesita para generar ventas/reparaciones/asistencia/nómina — ya sea
// recién creados (crearNegocioDemo) o releídos de la BD (refrescarNegocioDemo).
interface ContextoNegocio {
  tenant: { id: string };
  branchPrincipal: { id: string };
  branchSecundaria: { id: string } | null;
  branches: { id: string }[];
  ownerUser: { id: string };
  productos: { id: string; type: ProductType; price: number; cost: number | null }[];
  clientes: { id: string }[];
  empleados: EmpleadoCreado[];
  tieneReparaciones: boolean;
  // M15/M16 (2026-09-18) — igual que tieneReparaciones, resuelto por el
  // caller (crearNegocioDemo/refrescarNegocioDemo) a partir de qué módulos
  // tiene apagados este tenant. `doctores` es el pool de cuentas de
  // atribución (User.id vía Staff.userId) que puede quedar como
  // responsable de una cita o autor de una nota de evolución — vacío cae a
  // ownerUser.id (ver sembrarCitasYExpediente).
  tieneCitas: boolean;
  tieneExpediente: boolean;
  doctores: { userId: string; name: string }[];
  cfg: RubroConfig;
  supplierId: string;
}

// Citas (Appointment) + notas de evolución (ClinicalNote) de la semana —
// M15/M16 (2026-09-18). Se llama desde sembrarSemanaOperativa (abajo), así
// que corre tanto al crear un negocio demo nuevo como cada vez que
// --refrescar le da una semana nueva a uno que ya existe — igual que
// ventas/reparaciones, son "datos operativos" de la semana, por eso
// borrarDatosOperativos (abajo) también los limpia antes de resembrar.
// PatientRecord (antecedentes) y OdontogramaTooth (estado del odontograma)
// NO se tocan aquí a propósito: son el expediente acumulado del paciente,
// no algo que deba reiniciarse cada semana — se siembran una sola vez, en
// crearNegocioDemo (ver sembrarExpedienteYOdontograma más abajo).
async function sembrarCitasYNotas(ctx: ContextoNegocio) {
  if (!ctx.tieneCitas) return;
  const { tenant, branchPrincipal, branchSecundaria, clientes, cfg, doctores, ownerUser, tieneExpediente } = ctx;

  const motivos = MOTIVOS_CITA[cfg.key] ?? ["Consulta"];
  const diagnosticos = DIAGNOSTICOS_DEMO[cfg.key];
  const tratamientos = TRATAMIENTOS_DEMO[cfg.key];
  const poolDoctores = doctores.length > 0 ? doctores : [{ userId: ownerUser.id, name: "Dueño Demo" }];

  for (let d = 0; d < SEMANA.length; d++) {
    const fechaStr = SEMANA[d];
    const esDomingo = new Date(`${fechaStr}T12:00:00-06:00`).getUTCDay() === 0;
    const esHoy = d === SEMANA.length - 1;
    const numCitas = esDomingo ? randInt(0, 2) : randInt(2, 5);

    for (let c = 0; c < numCitas; c++) {
      const cliente = pick(clientes);
      const doctor = pick(poolDoctores);
      const branch = branchSecundaria && Math.random() < 0.3 ? branchSecundaria : branchPrincipal;
      const inicio = new Date(`${fechaStr}T${horaAleatoria()}:00-06:00`);
      const fin = new Date(inicio.getTime() + pick([30, 45, 60]) * 60000);
      const status: AppointmentStatus = esHoy
        ? pick([AppointmentStatus.COMPLETED, AppointmentStatus.CONFIRMED, AppointmentStatus.IN_PROGRESS, AppointmentStatus.SCHEDULED])
        : pick([AppointmentStatus.COMPLETED, AppointmentStatus.COMPLETED, AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW, AppointmentStatus.CANCELLED]);
      const motivo = pick(motivos);

      await prisma.appointment.create({
        data: { tenantId: tenant.id, branchId: branch.id, customerId: cliente.id, userId: doctor.userId, reason: motivo, status, startsAt: inicio, endsAt: fin },
      });

      // Nota de evolución solo para las 3 rubros de consulta clínica real, y
      // solo cuando la cita ya se atendió (no tiene sentido diagnosticar
      // una cita cancelada/no-show/futura).
      if (tieneExpediente && status === AppointmentStatus.COMPLETED && diagnosticos && tratamientos) {
        await prisma.clinicalNote.create({
          data: {
            tenantId: tenant.id, customerId: cliente.id, userId: doctor.userId,
            reason: motivo, diagnosis: pick(diagnosticos), treatment: pick(tratamientos),
            createdAt: inicio,
          },
        });
      }
    }
  }

  // Citas próximas (mañana a +5 días) — SEMANA arriba solo cubre
  // pasado+hoy (mismo criterio que ventas/reparaciones), pero una agenda de
  // citas vacía de próximas citas no se siente "en uso" — mismo espíritu
  // que dejar la caja de hoy abierta (ver el comentario largo en el
  // encabezado del archivo, "Frescura de los datos").
  const hoyBase = new Date();
  const numFuturas = randInt(2, 5);
  for (let f = 0; f < numFuturas; f++) {
    const futura = new Date(hoyBase);
    futura.setDate(futura.getDate() + randInt(1, 5));
    const fechaStr = futura.toISOString().slice(0, 10);
    const cliente = pick(clientes);
    const doctor = pick(poolDoctores);
    const branch = branchSecundaria && Math.random() < 0.3 ? branchSecundaria : branchPrincipal;
    const inicio = new Date(`${fechaStr}T${horaAleatoria()}:00-06:00`);
    const fin = new Date(inicio.getTime() + pick([30, 45, 60]) * 60000);
    await prisma.appointment.create({
      data: {
        tenantId: tenant.id, branchId: branch.id, customerId: cliente.id, userId: doctor.userId,
        reason: pick(motivos), status: pick([AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED]),
        startsAt: inicio, endsAt: fin,
      },
    });
  }
}

// Antecedentes (PatientRecord) + odontograma (OdontogramaTooth, solo
// consultorio_dental) — se siembra UNA SOLA VEZ, desde crearNegocioDemo,
// nunca desde refrescarNegocioDemo (ver el comentario largo en
// sembrarCitasYNotas de arriba sobre por qué esto no es "dato operativo").
async function sembrarExpedienteYOdontograma(tenantId: string, rubro: string, clientes: { id: string }[], doctorUserId: string) {
  for (const cliente of clientes) {
    // No todo paciente de un consultorio real tiene ficha capturada — se
    // deja ~70% con expediente para que el demo no se vea artificialmente
    // "perfecto" (mismo criterio que ya usa el resto del seed, ej. el
    // producto con stock en 0 a propósito).
    if (Math.random() < 0.3) continue;

    await prisma.patientRecord.create({
      data: {
        tenantId, customerId: cliente.id,
        bloodType: pick(["O+", "O-", "A+", "A-", "B+", "AB+"]),
        allergies: Math.random() < 0.3 ? pick(["Penicilina", "Látex", "Ninguna conocida"]) : null,
        chronicConditions: Math.random() < 0.25 ? pick(["Diabetes tipo 2 controlada", "Hipertensión controlada"]) : null,
      },
    });

    if (rubro === "consultorio_dental") {
      const numDientes = randInt(2, 6);
      const elegidos = new Set<number>();
      while (elegidos.size < numDientes) elegidos.add(pick(DIENTES_FDI_DEMO));
      for (const numero of elegidos) {
        await prisma.odontogramaTooth.create({
          data: { tenantId, customerId: cliente.id, toothNumber: numero, condition: pick(CONDICIONES_ODONTOGRAMA_DEMO), updatedByUserId: doctorUserId },
        });
      }
    }
  }
}

// Plan de Tratamiento (M17, Fase 2, 2026-09-19) — igual que
// sembrarExpedienteYOdontograma arriba: se siembra UNA SOLA VEZ desde
// crearNegocioDemo, nunca desde refrescarNegocioDemo (es historial clínico
// acumulado del paciente, no dato "de esta semana"). A propósito NO se
// generan items en estado PAGADO: eso implicaría además sintetizar un
// CashMovement coherente en una CashSession ya cerrada de una semana
// anterior — se deja como PROPUESTO/ACEPTADO/RECHAZADO para que Carlos
// pueda probar el flujo real de aceptar/rechazar/cobrar con datos frescos,
// que es más útil para un demo que ver todo ya resuelto.
//
// Coherencia con el odontograma (2026-09-19, reporte de Carlos): esta
// función y sembrarExpedienteYOdontograma sorteaban cada una su propio
// diente FDI de forma independiente, así que un plan podía decir
// "Endodoncia · Diente 13" mientras el odontograma mostraba el diente 13
// como Sano (o con otra condición). Ahora, cada fase con `condicionDiente`
// hace un upsert de ESE diente en OdontogramaTooth con la condición que le
// corresponde, sin importar si sembrarExpedienteYOdontograma ya había
// tocado ese diente o no — así el plan y el odontograma siempre cuentan la
// misma historia para ese paciente.
async function sembrarPlanesTratamiento(tenantId: string, branchId: string, rubro: string, clientes: { id: string }[], doctorUserId: string) {
  const titulos = TITULOS_PLAN_DEMO[rubro];
  const fasesDisponibles = FASES_PLAN_DEMO[rubro];
  if (!titulos || !fasesDisponibles) return;

  for (const cliente of clientes) {
    // No todo paciente tiene un plan de tratamiento en curso — mismo
    // criterio de "no todo perfecto" que el resto del seed.
    if (Math.random() < 0.6) continue;

    const numFases = randInt(1, 3);
    const fases = [...fasesDisponibles].sort(() => Math.random() - 0.5).slice(0, numFases);

    const items = fases.map((fase, i) => {
      const costo = Math.round((fase.costoMin + Math.random() * (fase.costoMax - fase.costoMin)) / 50) * 50;
      const r = Math.random();
      const status = r < 0.4 ? TreatmentPlanItemStatus.ACEPTADO
        : r < 0.55 ? TreatmentPlanItemStatus.RECHAZADO
        : TreatmentPlanItemStatus.PROPUESTO;
      return {
        descripcion: fase.descripcion,
        toothNumber: fase.conDiente ? pick(DIENTES_FDI_DEMO) : null,
        condicionDiente: fase.condicionDiente,
        costo,
        order: i,
        status,
      };
    });

    await prisma.treatmentPlan.create({
      data: {
        tenantId, branchId, customerId: cliente.id, userId: doctorUserId,
        title: pick(titulos),
        items: {
          create: items.map((it) => ({
            description: it.descripcion,
            toothNumber: it.toothNumber,
            cost: it.costo,
            order: it.order,
            status: it.status,
          })),
        },
      },
    });

    for (const it of items) {
      if (it.toothNumber == null || !it.condicionDiente) continue;
      await prisma.odontogramaTooth.upsert({
        where: { customerId_toothNumber: { customerId: cliente.id, toothNumber: it.toothNumber } },
        create: { tenantId, customerId: cliente.id, toothNumber: it.toothNumber, condition: it.condicionDiente, updatedByUserId: doctorUserId },
        update: { condition: it.condicionDiente, updatedByUserId: doctorUserId },
      });
    }
  }
}

// Consentimiento Informado demo (M17, Fase 2, 2026-09-21) — mismo criterio
// que sembrarPlanesTratamiento: se corre UNA SOLA VEZ desde
// crearNegocioDemo, con backfill idempotente en refrescarNegocioDemo. Los
// ids y etiquetas de procedimiento son una copia reducida de
// lib/consentimiento-templates.ts (fuente real que usa la app) — este
// script no puede usar el alias "@/..." porque corre fuera de Next con
// tsx, mismo motivo por el que DIENTES_FDI_DEMO/CONDICIONES_ODONTOGRAMA_DEMO
// arriba también están duplicados en vez de importados. El `content` aquí
// es un texto corto de relleno, no el texto legal completo de la plantilla
// real — para datos de demo no vale la pena duplicar los 12 textos largos.
interface ProcedimientoConsentDemo { id: string; etiqueta: string }
const PROCEDIMIENTOS_CONSENT_DEMO: Record<string, ProcedimientoConsentDemo[]> = {
  consultorio_dental: [
    { id: "extraccion", etiqueta: "Extracción dental" },
    { id: "endodoncia", etiqueta: "Endodoncia (tratamiento de conducto)" },
    { id: "cirugia_oral", etiqueta: "Cirugía oral" },
    { id: "tratamiento_general", etiqueta: "Tratamiento dental general" },
  ],
  consultorio_medico: [
    { id: "procedimiento_menor", etiqueta: "Procedimiento médico menor" },
    { id: "estudio_diagnostico", etiqueta: "Estudio o toma de muestra" },
    { id: "cirugia_ambulatoria", etiqueta: "Cirugía ambulatoria" },
    { id: "tratamiento_general", etiqueta: "Tratamiento médico general" },
  ],
  veterinaria: [
    { id: "cirugia_esterilizacion", etiqueta: "Cirugía o esterilización" },
    { id: "procedimiento_sedacion", etiqueta: "Procedimiento con sedación" },
    { id: "estudio_diagnostico", etiqueta: "Estudio o toma de muestra" },
    { id: "tratamiento_general", etiqueta: "Tratamiento veterinario general" },
  ],
};

// Mismo texto que NOTA_FIRMA_SIMULADA en lib/consentimiento-templates.ts —
// duplicado por el mismo motivo de arriba (sin alias "@/..." disponible).
const NOTA_FIRMA_SIMULADA_DEMO =
  "Nota: esta firma se capturó de forma digital dentro del sistema, como respaldo de que el procedimiento fue explicado y aceptado por el paciente (o su representante). No es una firma electrónica avanzada (e.firma) ni sustituye, para efectos legales o notariales, una firma autógrafa en papel.";

// PNG 1x1 REALMENTE transparente en base64 (alpha=0, verificado con
// Pillow) — placeholder honesto de "aquí hay una firma capturada" para
// datos de demo, no se pretende que sea un trazo real (ver FirmaCanvas.tsx
// para la captura real en la app). OJO: la cadena base64 típica que
// circula como "1x1 transparent PNG" en internet en realidad decodifica a
// un pixel NEGRO OPACO, no transparente — con eso el <img> se veía como un
// cuadro negro enorme en vez de un placeholder discreto (bug reportado por
// Carlos, 2026-09-21). Esta sí es transparente de verdad.
const FIRMA_DEMO_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==";

async function sembrarConsentimientos(tenantId: string, rubro: string, clientes: { id: string }[], doctorUserId: string) {
  const procedimientos = PROCEDIMIENTOS_CONSENT_DEMO[rubro];
  if (!procedimientos) return;

  for (const cliente of clientes) {
    // ~35% de los pacientes tienen un consentimiento firmado — mismo
    // criterio de "no todo perfecto" que el resto del seed.
    if (Math.random() < 0.65) continue;

    const procedimiento = pick(procedimientos);

    // Si el paciente ya tiene alguna fase de plan de tratamiento (sembrada
    // arriba en sembrarPlanesTratamiento, que siempre corre antes que esta
    // función), ~50% de las veces se liga el consentimiento a esa fase —
    // mismo espíritu de coherencia que ya se aplicó entre el plan y el
    // odontograma.
    let treatmentPlanItemId: string | null = null;
    if (Math.random() < 0.5) {
      const item = await prisma.treatmentPlanItem.findFirst({
        where: { treatmentPlan: { tenantId, customerId: cliente.id } },
        select: { id: true },
      });
      if (item) treatmentPlanItemId = item.id;
    }

    await prisma.informedConsent.create({
      data: {
        tenantId,
        customerId: cliente.id,
        userId: doctorUserId,
        procedureType: procedimiento.id,
        content: `Consentimiento informado para: ${procedimiento.etiqueta}.\n\n${NOTA_FIRMA_SIMULADA_DEMO}`,
        treatmentPlanItemId,
        patientSignature: FIRMA_DEMO_PNG,
        signedByName: "Firmado por el paciente (dato de demo)",
        signedAt: new Date(),
      },
    });
  }
}

// Semana operativa completa (compra a proveedor, caja + ventas por
// sucursal, reparaciones si aplica, citas/notas si aplica, asistencia y
// nómina de la semana, factura de la primera venta) — extraído de
// crearNegocioDemo (2026-09-18) para que refrescarNegocioDemo pueda
// generarle una semana NUEVA a un negocio demo que ya existe, sin repetir
// la lógica ni tocar su catálogo, clientes o personal.
async function sembrarSemanaOperativa(ctx: ContextoNegocio) {
  const { tenant, branchPrincipal, branchSecundaria, branches, ownerUser, productos, clientes, empleados, tieneReparaciones, cfg, supplierId } = ctx;

  const conStock = productos.filter((p) => p.type !== ProductType.SERVICE);
  const itemsCompra = conStock.slice(0, 3);
  if (itemsCompra.length > 0) {
    let totalCompra = 0;
    const detalles: { productId: string; costo: number }[] = [];
    for (const p of itemsCompra) {
      const costo = Number(p.cost ?? p.price * 0.5);
      totalCompra += costo * 5;
      detalles.push({ productId: p.id, costo });
    }
    const compra = await prisma.purchase.create({
      data: { tenantId: tenant.id, supplierId, branchId: branchPrincipal.id, folio: "C-0001", total: totalCompra, status: PurchaseStatus.RECEIVED, receivedAt: new Date(`${SEMANA[2]}T10:00:00-06:00`) },
    });
    for (const d of detalles) {
      await prisma.purchaseItem.create({ data: { purchaseId: compra.id, productId: d.productId, quantity: 5, cost: d.costo, subtotal: d.costo * 5 } });
    }
  }

  let folioVentaN = 1;
  let folioRepN = 1;
  let primeraVenta: { id: string; customerId: string | null; total: number } | null = null;

  for (let d = 0; d < SEMANA.length; d++) {
    const fechaStr = SEMANA[d];
    // Antes era `d === 6` (asumiendo que el arreglo siempre arrancaba en
    // lunes y el índice 6 caía en domingo, cierto solo cuando SEMANA era
    // la semana fija 7-13 sep). Ahora SEMANA es una ventana de 7 días que
    // puede empezar cualquier día, así que "es domingo" se calcula del
    // día calendario real de fechaStr, no de su posición en el arreglo.
    const esDomingo = new Date(`${fechaStr}T12:00:00-06:00`).getUTCDay() === 0;

    for (const branch of branches) {
      const apertura = randInt(500, 1500);
      const sesion = await prisma.cashSession.create({
        data: { tenantId: tenant.id, branchId: branch.id, userId: ownerUser.id, openingCash: apertura, status: CashSessionStatus.OPEN, openedAt: new Date(`${fechaStr}T09:00:00-06:00`) },
      });
      let ingresos = 0;
      let egresos = 0;

      const numVentas = esDomingo ? randInt(1, 3) : randInt(3, 7);
      for (let v = 0; v < numVentas; v++) {
        const cliente = Math.random() < 0.8 ? pick(clientes) : null;
        const nItems = randInt(1, 3);
        let subtotal = 0;
        const itemsVenta: { productId: string; quantity: number; price: number; subtotal: number }[] = [];
        for (let k = 0; k < nItems; k++) {
          const prod = pick(productos);
          const cantidad = prod.type === ProductType.PRODUCT ? randInt(1, 2) : 1;
          const sub = prod.price * cantidad;
          subtotal += sub;
          itemsVenta.push({ productId: prod.id, quantity: cantidad, price: prod.price, subtotal: sub });
        }
        const impuesto = Math.round(subtotal * 16) / 100;
        const total = Math.round((subtotal + impuesto) * 100) / 100;
        const metodo = metodoPagoVenta();
        const folio = `V-${String(folioVentaN++).padStart(4, "0")}`;
        const venta = await prisma.sale.create({
          data: {
            tenantId: tenant.id, branchId: branch.id, customerId: cliente?.id ?? null, userId: ownerUser.id,
            folio, subtotal, tax: impuesto, discount: 0, total, paymentMethod: metodo, status: SaleStatus.COMPLETED,
            createdAt: new Date(`${fechaStr}T${horaAleatoria()}:00-06:00`),
          },
        });
        for (const it of itemsVenta) {
          await prisma.saleItem.create({ data: { saleId: venta.id, productId: it.productId, quantity: it.quantity, price: it.price, subtotal: it.subtotal } });
        }
        let parteEfectivo = 0;
        if (metodo === PaymentMethod.MIXED) {
          parteEfectivo = Math.round(total * 0.5 * 100) / 100;
          await prisma.saleMixedPayment.create({ data: { saleId: venta.id, method: MixedPaymentMethod.CASH, amount: parteEfectivo } });
          await prisma.saleMixedPayment.create({ data: { saleId: venta.id, method: MixedPaymentMethod.CARD, amount: Math.round((total - parteEfectivo) * 100) / 100 } });
        }
        if (metodo === PaymentMethod.CASH) ingresos += total;
        if (metodo === PaymentMethod.MIXED) ingresos += parteEfectivo;
        if (!primeraVenta) primeraVenta = { id: venta.id, customerId: cliente?.id ?? null, total };
      }

      const gastoDia = randInt(50, 300);
      await prisma.cashMovement.create({ data: { cashSessionId: sesion.id, type: MovementType.EXPENSE, amount: gastoDia, concept: pick(["Compra de insumos", "Pago de servicios", "Gasolina/mensajería", "Papelería"]) } });
      egresos += gastoDia;

      // La caja de "hoy" (el último día de SEMANA) se deja ABIERTA a
      // propósito — Carlos: "para que el cliente aprecie un entorno como
      // si estuviera trabajando en tiempo real, tipo simulador" (2026-09-18).
      // Antes se cerraba igual que cualquier otro día del historial (con
      // closedAt fijo a las 20:30), así que un demo se veía con "Caja
      // cerrada" sin importar la hora real en que alguien lo visitara.
      // Los días anteriores (historial ya "pasado") sí se cierran, porque
      // esos representan jornadas completas y ya facturadas.
      const esHoy = d === SEMANA.length - 1;
      if (!esHoy) {
        const cierre = Math.round((apertura + ingresos - egresos) * 100) / 100;
        await prisma.cashSession.update({
          where: { id: sesion.id },
          data: { status: CashSessionStatus.CLOSED, closingCash: cierre, expectedCash: cierre, difference: 0, closedAt: new Date(`${fechaStr}T20:30:00-06:00`) },
        });
      }
    }

    if (tieneReparaciones && cfg.reparaciones) {
      const nuevas = randInt(1, 3);
      for (let r = 0; r < nuevas; r++) {
        const dispositivo = pick(cfg.reparaciones.dispositivos);
        const falla = pick(cfg.reparaciones.fallas);
        const cliente = pick(clientes);
        const branchRep = branchSecundaria && Math.random() < 0.5 ? branchSecundaria : branchPrincipal;
        const diasTranscurridos = 6 - d;
        let status: RepairStatus;
        if (diasTranscurridos >= 4) status = pick([RepairStatus.DELIVERED, RepairStatus.DELIVERED, RepairStatus.DELIVERED, RepairStatus.CANCELLED]);
        else if (diasTranscurridos >= 2) status = pick([RepairStatus.READY, RepairStatus.IN_REPAIR]);
        else status = pick([RepairStatus.RECEIVED, RepairStatus.DIAGNOSING, RepairStatus.IN_REPAIR]);

        const partes = productos.filter((p) => p.type === ProductType.PART);
        const servicios = productos.filter((p) => p.type === ProductType.SERVICE);
        const parte = partes.length ? pick(partes) : null;
        const servicio = servicios.length ? pick(servicios) : null;
        const estimado = (parte?.price ?? 0) + (servicio?.price ?? 0) || randInt(200, 900);
        const entregado = status === RepairStatus.DELIVERED;

        const folio = `REP-${String(folioRepN++).padStart(4, "0")}`;
        const repair = await prisma.repair.create({
          data: {
            tenantId: tenant.id, branchId: branchRep.id, customerId: cliente.id, userId: ownerUser.id,
            folio, deviceBrand: dispositivo.brand, deviceModel: dispositivo.model, issueDesc: falla,
            status, priority: pick([Priority.LOW, Priority.NORMAL, Priority.NORMAL, Priority.HIGH]),
            estimatedCost: estimado, finalCost: entregado ? estimado : null,
            receivedAt: new Date(`${fechaStr}T${horaAleatoria()}:00-06:00`),
            deliveredAt: entregado ? new Date(`${SEMANA[Math.min(d + 2, 6)]}T18:00:00-06:00`) : null,
          },
        });
        if (status !== RepairStatus.RECEIVED) {
          if (parte) await prisma.repairItem.create({ data: { repairId: repair.id, productId: parte.id, quantity: 1, price: parte.price } });
          if (servicio) await prisma.repairItem.create({ data: { repairId: repair.id, productId: servicio.id, quantity: 1, price: servicio.price } });
        }
        await prisma.repairHistory.create({ data: { repairId: repair.id, status: RepairStatus.RECEIVED, notes: "Equipo recibido" } });
        if (status !== RepairStatus.RECEIVED) {
          await prisma.repairHistory.create({ data: { repairId: repair.id, status, notes: null } });
        }
      }
    }

    if (!esDomingo) {
      const datosAsistencia: { staffId: string; date: Date; checkIn: Date; checkOut: Date }[] = [];
      const datosLogin: { tenantId: string; staffId: string; branchId: string; checkIn: Date; checkOut: Date; closedBy: StaffLoginCloseReason }[] = [];
      for (const emp of empleados) {
        // Jornada de exactamente 8 horas (máximo legal diario en México,
        // LFT art. 61) — la primera versión generaba turnos de 9-10.5h sin
        // ningún tope, detectado por Carlos al revisar Asistencia del demo.
        const checkIn = new Date(`${fechaStr}T${pick(["08:55", "09:00", "09:10"])}:00-06:00`);
        const checkOut = new Date(checkIn.getTime() + 8 * 60 * 60 * 1000);
        datosAsistencia.push({ staffId: emp.staffId, date: new Date(`${fechaStr}T00:00:00-06:00`), checkIn, checkOut });
        datosLogin.push({ tenantId: tenant.id, staffId: emp.staffId, branchId: emp.branchId, checkIn, checkOut, closedBy: StaffLoginCloseReason.MANUAL });
      }
      await prisma.attendance.createMany({ data: datosAsistencia });
      await prisma.staffLoginSession.createMany({ data: datosLogin });
    }
  }

  for (const emp of empleados) {
    const staffInfo = await prisma.staff.findUnique({ where: { id: emp.staffId }, select: { baseSalary: true, paymentScheme: true } });
    const base = Math.round(Number(staffInfo?.baseSalary ?? 0) / 2);
    const comision = staffInfo?.paymentScheme !== PaymentScheme.FIJO ? randInt(200, 1200) : 0;
    const pagado = Math.random() < 0.6;
    await prisma.staffPayment.create({
      data: {
        staffId: emp.staffId, periodStart: new Date(`${SEMANA[0]}T00:00:00-06:00`), periodEnd: new Date(`${SEMANA[6]}T00:00:00-06:00`),
        baseAmount: base, commissionAmount: comision, total: base + comision,
        status: pagado ? StaffPaymentStatus.PAID : StaffPaymentStatus.PENDING, paidAt: pagado ? new Date(`${SEMANA[6]}T12:00:00-06:00`) : null,
      },
    });
  }

  await sembrarCitasYNotas(ctx);

  if (primeraVenta) {
    await prisma.invoice.create({
      data: { tenantId: tenant.id, customerId: primeraVenta.customerId ?? clientes[0].id, saleId: primeraVenta.id, folio: "F-0001", status: InvoiceStatus.STAMPED, total: primeraVenta.total },
    });
  }
}

async function crearNegocioDemo(cfg: RubroConfig, indice: number, mapaPermisos: Map<string, string>) {
  const ownerEmail = `demo_${cfg.emailLocal}@linkitysoluciones.com`;
  console.log(`\n🌱 ${cfg.tenantName} (${ownerEmail})`);

  const supabaseId = await obtenerOCrearUsuarioAuth(ownerEmail, DEMO_PASSWORD);

  const tenant = await prisma.tenant.create({
    data: { name: cfg.tenantName, slug: cfg.slug, businessType: cfg.key, email: ownerEmail, phone: telefonoAleatorio(), city: "Ciudad de México", state: "CDMX", isActive: true },
  });

  const branchPrincipal = await prisma.branch.create({ data: { tenantId: tenant.id, name: "Sucursal Principal", address: "Av. Principal 100", phone: telefonoAleatorio(), isActive: true } });
  let branchSecundaria: { id: string } | null = null;
  if (cfg.segundaSucursal) {
    branchSecundaria = await prisma.branch.create({ data: { tenantId: tenant.id, name: "Sucursal Norte", address: "Blvd. Norte 250", phone: telefonoAleatorio(), isActive: true } });
  }
  const branches = branchSecundaria ? [branchPrincipal, branchSecundaria] : [branchPrincipal];

  const ownerUser = await prisma.user.create({ data: { tenantId: tenant.id, branchId: branchPrincipal.id, email: ownerEmail, name: "Dueño Demo", supabaseId, isActive: true } });
  const rolAdmin = await prisma.role.create({ data: { tenantId: tenant.id, name: "Administrador", description: "Acceso completo", isSystem: true } });
  await prisma.userRole.create({ data: { userId: ownerUser.id, roleId: rolAdmin.id } });

  await prisma.subscription.create({ data: { tenantId: tenant.id, plan: "Demo", price: 0 } });

  const offSet = new Set(MODULOS_OFF_POR_RUBRO[cfg.key] ?? []);
  for (const code of MODULE_CATALOG_CODES) {
    const mod = await prisma.module.upsert({ where: { code }, update: {}, create: { code, name: MODULE_NAMES[code], isCore: code === "dashboard" } });
    await prisma.tenantModule.create({ data: { tenantId: tenant.id, moduleId: mod.id, isActive: !offSet.has(code) } });
  }
  const tieneReparaciones = !offSet.has("reparaciones");
  const tieneCitas = !offSet.has("citas");
  const tieneExpediente = !offSet.has("expediente-clinico");

  const categoriasCache = new Map<string, string>();
  const productos: { id: string; type: ProductType; price: number; cost: number | null }[] = [];
  let colorIdx = 0;
  for (const item of cfg.catalogo) {
    const catKey = `${item.categoryName}|${item.categoryType}`;
    let catId = categoriasCache.get(catKey);
    if (!catId) {
      const cat = await prisma.category.create({ data: { tenantId: tenant.id, name: item.categoryName, type: item.categoryType as CategoryType, color: PALETA[colorIdx++ % PALETA.length] } });
      catId = cat.id;
      categoriasCache.set(catKey, catId);
    }
    const emoji = `icon:${item.icon}`;
    const prod = await prisma.product.create({ data: { tenantId: tenant.id, categoryId: catId, name: item.name, type: item.type as ProductType, price: item.price, cost: item.cost ?? null, emoji, isActive: true } });
    productos.push({ id: prod.id, type: item.type as ProductType, price: item.price, cost: item.cost ?? null });
  }

  const conStock = productos.filter((p) => p.type !== ProductType.SERVICE);
  for (const p of conStock) {
    const stockBase = randInt(3, 25);
    await prisma.inventory.create({ data: { productId: p.id, branchId: branchPrincipal.id, stock: stockBase, minStock: Math.max(2, Math.round(stockBase * 0.25)) } });
    if (branchSecundaria) {
      await prisma.inventory.create({ data: { productId: p.id, branchId: branchSecundaria.id, stock: Math.max(0, Math.round(stockBase * 0.5)), minStock: Math.max(2, Math.round(stockBase * 0.25)) } });
    }
  }
  if (conStock.length > 0) {
    await prisma.inventory.update({ where: { productId_branchId: { productId: conStock[0].id, branchId: branchPrincipal.id } }, data: { stock: 0 } });
  }
  if (conStock.length > 1) {
    await prisma.inventory.update({ where: { productId_branchId: { productId: conStock[1].id, branchId: branchPrincipal.id } }, data: { stock: 1 } });
  }

  const poolClientes = cfg.clientelaMasculina ? CLIENTES_POOL_MASCULINO : CLIENTES_POOL;
  const clientes: { id: string }[] = [];
  for (let i = 0; i < 8; i++) {
    const nombre = poolClientes[(indice * 8 + i) % poolClientes.length];
    const cliente = await prisma.customer.create({ data: { tenantId: tenant.id, name: nombre, phone: telefonoAleatorio(), phoneCountryCode: "+52" } });
    clientes.push(cliente);
  }

  const empleados: EmpleadoCreado[] = [];
  for (let i = 0; i < cfg.staff.length; i++) {
    const s = cfg.staff[i];
    const rol = await prisma.role.create({ data: { tenantId: tenant.id, name: s.puesto, description: null, isSystem: false } });
    const modulos = inferirModulosPorPuesto(s.puesto, tieneReparaciones, tieneCitas, tieneExpediente);
    const conDashboard = new Set([...modulos, "dashboard"]);
    await prisma.rolePermission.createMany({
      data: Array.from(conDashboard).map((m) => mapaPermisos.get(m)).filter((id): id is string => Boolean(id)).map((permissionId) => ({ roleId: rol.id, permissionId })),
      skipDuplicates: true,
    });

    const branchAsignada = branchSecundaria && i % 2 === 1 ? branchSecundaria : branchPrincipal;
    const email = `staff-demo-${i}@${cfg.slug}.personal.linkity.internal`;
    const supabaseIdFalso = `staff-placeholder-demo-${cfg.slug}-${i}`;
    const usuarioOculto = await prisma.user.create({ data: { tenantId: tenant.id, branchId: branchAsignada.id, email, name: s.nombre, supabaseId: supabaseIdFalso, isActive: true } });

    const pin = PINES[i % PINES.length];
    const ESQUEMAS_ROTACION = [PaymentScheme.MIXTO, PaymentScheme.COMISION, PaymentScheme.DESTAJO, PaymentScheme.FIJO];
    const FRECUENCIAS = [PaymentFrequency.SEMANAL, PaymentFrequency.CATORCENAL, PaymentFrequency.QUINCENAL, PaymentFrequency.MENSUAL];
    const METODOS_PAGO = [StaffPaymentMethod.EFECTIVO, StaffPaymentMethod.TRANSFERENCIA, StaffPaymentMethod.CHEQUE, StaffPaymentMethod.TARJETA_NOMINA, StaffPaymentMethod.OTRO];
    const esquema = ESQUEMAS_ROTACION[(indice + i) % ESQUEMAS_ROTACION.length];
    const commissionBase = commissionBaseSegunRubro(tieneReparaciones, i, esquema);
    const frecuenciaSueldo = FRECUENCIAS[(indice + i) % FRECUENCIAS.length];
    const frecuenciaComision = FRECUENCIAS[(indice + i + 1) % FRECUENCIAS.length];
    const metodoPago = METODOS_PAGO[(indice + i) % METODOS_PAGO.length];
    const esLider = i === 0;

    const staff = await prisma.staff.create({
      data: {
        tenantId: tenant.id, branchId: branchAsignada.id, userId: usuarioOculto.id,
        name: s.nombre, phone: telefonoAleatorio(), phoneCountryCode: "+52", position: s.puesto,
        pinHash: hashPin(pin), roleId: rol.id,
        paymentScheme: esquema,
        baseSalary: esquema === PaymentScheme.FIJO || esquema === PaymentScheme.MIXTO ? randInt(3500, 7000) : 0,
        commissionRate: esquema === PaymentScheme.COMISION || esquema === PaymentScheme.MIXTO ? randInt(5, 15) : 0,
        commissionBase,
        paymentFrequency: frecuenciaSueldo,
        commissionFrequency: frecuenciaComision,
        pieceRate: esquema === PaymentScheme.DESTAJO ? randInt(30, 150) : 0,
        teamCommissionRate: esLider ? randInt(2, 5) : 0,
        teamCommissionBase: esLider ? commissionBase : null,
        staffPaymentMethod: metodoPago,
        clabe: metodoPago === StaffPaymentMethod.TRANSFERENCIA ? claveAleatoria18() : null,
        isActive: true,
      },
    });
    empleados.push({ staffId: staff.id, branchId: branchAsignada.id, name: s.nombre, puesto: s.puesto, pin });
  }

  const proveedor = await prisma.supplier.create({ data: { tenantId: tenant.id, name: cfg.proveedorNombre, phone: telefonoAleatorio(), isActive: true } });

  // Pool de doctores/profesionales (cuenta de atribución vía Staff.userId,
  // ver el comentario largo en Staff.userId, schema.prisma) para citas y
  // notas de evolución — M15/M16, 2026-09-18.
  const doctores = (
    await prisma.staff.findMany({ where: { tenantId: tenant.id, userId: { not: null } }, select: { userId: true, name: true } })
  ).map((s) => ({ userId: s.userId as string, name: s.name }));

  // Antecedentes/odontograma/planes de tratamiento/consentimientos se
  // siembran UNA sola vez aquí (no en cada refresco semanal) — ver el
  // comentario largo en
  // sembrarExpedienteYOdontograma/sembrarPlanesTratamiento/sembrarConsentimientos.
  if (tieneExpediente) {
    const doctorUserId = doctores[0]?.userId ?? ownerUser.id;
    await sembrarExpedienteYOdontograma(tenant.id, cfg.key, clientes, doctorUserId);
    await sembrarPlanesTratamiento(tenant.id, branchPrincipal.id, cfg.key, clientes, doctorUserId);
    await sembrarConsentimientos(tenant.id, cfg.key, clientes, doctorUserId);
  }

  // Compra inicial + la semana operativa completa (caja, ventas,
  // reparaciones, citas/notas, asistencia, nómina, factura) — ver
  // sembrarSemanaOperativa arriba; extraído para que refrescarNegocioDemo
  // pueda reusarlo cada semana sobre un negocio que ya existe, sin repetir
  // esta lógica.
  await sembrarSemanaOperativa({
    tenant, branchPrincipal, branchSecundaria, branches, ownerUser, productos, clientes, empleados,
    tieneReparaciones, tieneCitas, tieneExpediente, doctores, cfg,
    supplierId: proveedor.id,
  });

  RESUMEN_CREDENCIALES.push({
    tenantName: cfg.tenantName, slug: cfg.slug, ownerEmail, password: DEMO_PASSWORD,
    staff: empleados.map((e) => ({ name: e.name, puesto: e.puesto, pin: e.pin })),
  });
}

// Borra SOLO los datos OPERATIVOS de un negocio demo (ventas, caja,
// reparaciones, asistencia, nómina, compras, factura) antes de sembrarle
// una semana nueva — nunca Tenant, Branch, User, Role, Category, Product,
// Inventory, Customer, Staff ni Supplier, que son la "configuración" del
// negocio y deben sobrevivir intactos de una semana a la siguiente (ver
// comentario "Frescura de los datos" al inicio del archivo). Borra en
// orden hijo→padre para no chocar con las llaves foráneas.
async function borrarDatosOperativos(tenantId: string) {
  const ventaIds = (await prisma.sale.findMany({ where: { tenantId }, select: { id: true } })).map((v) => v.id);
  await prisma.saleMixedPayment.deleteMany({ where: { saleId: { in: ventaIds } } });
  await prisma.saleItem.deleteMany({ where: { saleId: { in: ventaIds } } });
  await prisma.invoice.deleteMany({ where: { tenantId } });
  await prisma.sale.deleteMany({ where: { tenantId } });

  const repairIds = (await prisma.repair.findMany({ where: { tenantId }, select: { id: true } })).map((r) => r.id);
  await prisma.repairHistory.deleteMany({ where: { repairId: { in: repairIds } } });
  await prisma.repairItem.deleteMany({ where: { repairId: { in: repairIds } } });
  await prisma.repair.deleteMany({ where: { tenantId } });

  const sesionIds = (await prisma.cashSession.findMany({ where: { tenantId }, select: { id: true } })).map((s) => s.id);
  await prisma.cashMovement.deleteMany({ where: { cashSessionId: { in: sesionIds } } });
  await prisma.cashSession.deleteMany({ where: { tenantId } });

  const staffIds = (await prisma.staff.findMany({ where: { tenantId }, select: { id: true } })).map((s) => s.id);
  await prisma.staffPayment.deleteMany({ where: { staffId: { in: staffIds } } });
  await prisma.attendance.deleteMany({ where: { staffId: { in: staffIds } } });
  await prisma.staffLoginSession.deleteMany({ where: { tenantId } });

  const purchaseIds = (await prisma.purchase.findMany({ where: { tenantId }, select: { id: true } })).map((p) => p.id);
  await prisma.purchaseItem.deleteMany({ where: { purchaseId: { in: purchaseIds } } });
  await prisma.purchase.deleteMany({ where: { tenantId } });

  // Citas + notas de evolución (M15/M16, 2026-09-18) — igual que
  // ventas/reparaciones, se resiembran cada semana (ver sembrarCitasYNotas).
  // A propósito NO se tocan PatientRecord ni OdontogramaTooth: son el
  // expediente acumulado del paciente, no datos "de esta semana".
  await prisma.clinicalNote.deleteMany({ where: { tenantId } });
  await prisma.appointment.deleteMany({ where: { tenantId } });
}

// Le da una semana operativa NUEVA (terminando hoy) a un negocio demo que
// YA EXISTE, releyendo de la BD todo lo que sembrarSemanaOperativa
// necesita (nunca se recrea el tenant/catálogo/clientes/personal). Si el
// slug no existe todavía, no hace nada — ese caso lo cubre
// crearNegocioDemo desde el modo normal del script (sin --refrescar).
async function refrescarNegocioDemo(cfg: RubroConfig): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: cfg.slug }, select: { id: true } });
  if (!tenant) return false;

  const [branches, ownerUser, productosRaw, clientes, staffRows, tenantModulesInactivos, proveedor] = await Promise.all([
    prisma.branch.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" }, select: { id: true } }),
    prisma.user.findFirst({ where: { tenantId: tenant.id, email: `demo_${cfg.emailLocal}@linkitysoluciones.com` }, select: { id: true } }),
    prisma.product.findMany({ where: { tenantId: tenant.id, isActive: true }, select: { id: true, type: true, price: true, cost: true } }),
    prisma.customer.findMany({ where: { tenantId: tenant.id }, select: { id: true } }),
    prisma.staff.findMany({ where: { tenantId: tenant.id }, select: { id: true, branchId: true, name: true, position: true, userId: true } }),
    prisma.tenantModule.findMany({ where: { tenantId: tenant.id, isActive: false }, select: { module: { select: { code: true } } } }),
    prisma.supplier.findFirst({ where: { tenantId: tenant.id }, select: { id: true } }),
  ]);

  if (!ownerUser || !proveedor || branches.length === 0) {
    throw new Error(`refrescarNegocioDemo: ${cfg.slug} existe pero le falta dueño/proveedor/sucursal — no se puede refrescar (¿quedó a medias una corrida anterior?).`);
  }

  // Product.price/cost llegan de Prisma como Decimal — sembrarSemanaOperativa
  // (y ContextoNegocio) esperan `number`, igual que crearNegocioDemo ya les
  // pasa números planos desde ItemArranque.
  const productos = productosRaw.map((p) => ({ id: p.id, type: p.type, price: Number(p.price), cost: p.cost != null ? Number(p.cost) : null }));

  const tieneReparaciones = !tenantModulesInactivos.some((tm) => tm.module.code === "reparaciones");
  // M15/M16 (2026-09-18): un tenant demo creado ANTES de que estos dos
  // módulos existieran en este catálogo (MODULE_NAMES, arriba) nunca tuvo
  // fila TenantModule para ellos — ni activa ni inactiva. Igual que en
  // producción, "sin fila" se lee como "activo" (ver el comentario largo en
  // TenantModule, schema.prisma), así que `.some(...)` sobre
  // tenantModulesInactivos (que solo trae inactivos) da el resultado
  // correcto sin necesitar una migración de backfill aparte.
  const tieneCitas = !tenantModulesInactivos.some((tm) => tm.module.code === "citas");
  const tieneExpediente = !tenantModulesInactivos.some((tm) => tm.module.code === "expediente-clinico");
  const doctores = staffRows.filter((s) => s.userId != null).map((s) => ({ userId: s.userId as string, name: s.name }));
  // El PIN original no se puede recuperar de pinHash (es un hash, no texto
  // plano) — no hace falta para operar la semana; se reutiliza uno de la
  // lista fija PINES solo para que el tipo EmpleadoCreado quede completo.
  // Staff.position es opcional en el esquema (nunca debería estarlo en un
  // negocio demo, que siempre lo crea con puesto — pero el tipo sí permite
  // null, así que se resuelve con un valor por defecto).
  const empleados: EmpleadoCreado[] = staffRows.map((s, i) => ({
    staffId: s.id, branchId: s.branchId, name: s.name, puesto: s.position ?? "Personal", pin: PINES[i % PINES.length],
  }));

  // Backfill único de Plan de Tratamiento (M17, Fase 2, 2026-09-19): un
  // tenant demo creado ANTES de que este modelo existiera nunca tuvo uno —
  // se siembra aquí la PRIMERA vez que se refresca después de este cambio,
  // idéntico al criterio de "accumulated, not weekly" ya usado para
  // antecedentes/odontograma (nunca se vuelve a tocar en refrescos
  // posteriores). Idempotente vía el propio dato: si el tenant ya tiene al
  // menos un TreatmentPlan, no se vuelve a sembrar.
  if (tieneExpediente) {
    const doctorBackfillId = doctores[0]?.userId ?? ownerUser.id;
    const yaTienePlanes = await prisma.treatmentPlan.findFirst({ where: { tenantId: tenant.id }, select: { id: true } });
    if (!yaTienePlanes) {
      await sembrarPlanesTratamiento(tenant.id, branches[0].id, cfg.key, clientes, doctorBackfillId);
    }
    // Mismo backfill idempotente, para Consentimiento Informado (M17, Fase
    // 2, 2026-09-21) — un tenant demo ya existente antes de este cambio
    // nunca tuvo consentimientos sembrados.
    const yaTieneConsentimientos = await prisma.informedConsent.findFirst({ where: { tenantId: tenant.id }, select: { id: true } });
    if (!yaTieneConsentimientos) {
      await sembrarConsentimientos(tenant.id, cfg.key, clientes, doctorBackfillId);
    }
  }

  await borrarDatosOperativos(tenant.id);

  await sembrarSemanaOperativa({
    tenant, branchPrincipal: branches[0], branchSecundaria: branches[1] ?? null, branches, ownerUser, productos, clientes, empleados,
    tieneReparaciones, tieneCitas, tieneExpediente, doctores, cfg,
    supplierId: proveedor.id,
  });
  return true;
}

/**
 * Refresca la semana operativa de TODOS los negocios demo que ya existan
 * (nunca crea uno nuevo — eso solo pasa vía `npx tsx prisma/seed-demo.ts`
 * sin flags). Es lo que llama app/api/cron/reseed-demo/route.ts cada
 * semana vía Vercel Cron para que el demo nunca se vea con ventas en $0.
 */
export async function refrescarTodosLosNegociosDemo(): Promise<{ actualizados: string[]; omitidos: string[] }> {
  const actualizados: string[] = [];
  const omitidos: string[] = [];
  for (const cfg of RUBROS_DEMO) {
    try {
      const seActualizo = await refrescarNegocioDemo(cfg);
      if (seActualizo) actualizados.push(cfg.slug);
      else omitidos.push(cfg.slug);
    } catch (err) {
      console.error(`❌ Error refrescando ${cfg.slug}:`, err);
      omitidos.push(cfg.slug);
    }
  }
  return { actualizados, omitidos };
}

function guardarResumenCredenciales() {
  const lineas: string[] = [
    "# Credenciales de los 20 negocios DEMO", "",
    `Contraseña del dueño en los 20 negocios (misma para todos, fácil de copiar/pegar): **${DEMO_PASSWORD}**`, "",
    "El PIN de cada empleado es el mismo en todos los negocios según su posición de alta (1111, 2222, 3333, 4444) — solo aplica dentro del negocio al que pertenece, entrando por `/[negocio]/entrada`.", "",
  ];
  for (const c of RESUMEN_CREDENCIALES) {
    lineas.push(`## ${c.tenantName}`);
    lineas.push(`- URL: /${c.slug}`);
    lineas.push(`- Dueño: ${c.ownerEmail} / ${c.password}`);
    for (const s of c.staff) lineas.push(`- Empleado — ${s.name} (${s.puesto}): PIN ${s.pin}`);
    lineas.push("");
  }
  writeFileSync("prisma/DEMO_CREDENCIALES.md", lineas.join("\n"), "utf-8");
  console.log("\n📄 Credenciales guardadas en prisma/DEMO_CREDENCIALES.md");
}

// `npx tsx prisma/seed-demo.ts --refrescar` — ver el comentario "Frescura
// de los datos" al inicio del archivo para el porqué de este modo.
const REFRESCAR = process.argv.includes("--refrescar");

// --solo=slug1,slug2 (opcional, 2026-09-21 — pedido de Carlos para no
// esperar el refresco completo de los 20 rubros mientras prueba un cambio
// puntual en uno solo). Filtra RUBROS_DEMO a solo esos slugs; sin este
// flag se comporta como siempre (los 20). Ejemplo:
//   npx tsx prisma/seed-demo.ts --refrescar --solo=demo-consultorio-dental
const argSolo = process.argv.find((a) => a.startsWith("--solo="));
const SOLO_SLUGS = argSolo
  ? new Set(argSolo.slice("--solo=".length).split(",").map((s) => s.trim()).filter(Boolean))
  : null;

async function main() {
  console.log(REFRESCAR ? "🔄 Refrescando la semana operativa de los negocios demo existentes..." : "🌱 Sembrando 20 negocios demo (uno por rubro)...");
  if (SOLO_SLUGS) console.log(`   (filtrado a: ${[...SOLO_SLUGS].join(", ")})`);
  const mapaPermisos = await asegurarCatalogoPermisos();

  for (let i = 0; i < RUBROS_DEMO.length; i++) {
    const cfg = RUBROS_DEMO[i];
    if (SOLO_SLUGS && !SOLO_SLUGS.has(cfg.slug)) continue;
    try {
      const existente = await prisma.tenant.findUnique({ where: { slug: cfg.slug } });
      if (existente) {
        if (REFRESCAR) {
          await refrescarNegocioDemo(cfg);
          console.log(`🔄 ${cfg.tenantName} — semana operativa refrescada`);
        } else {
          console.log(`⏭  ${cfg.slug} ya existe, se omite.`);
        }
        continue;
      }
      if (REFRESCAR) {
        // --refrescar nunca crea negocios nuevos, solo les da semana nueva
        // a los que ya existen — si falta alguno, se corre el script sin
        // el flag para completarlo.
        console.log(`⏭  ${cfg.slug} no existe todavía, --refrescar no lo crea (usa el script sin flags para eso).`);
        continue;
      }
      await crearNegocioDemo(cfg, i, mapaPermisos);
      console.log(`✅ ${cfg.tenantName} listo`);
    } catch (err) {
      console.error(`❌ Error ${REFRESCAR ? "refrescando" : "creando"} ${cfg.slug}:`, err);
    }
  }

  if (!REFRESCAR) guardarResumenCredenciales();
  console.log(REFRESCAR ? "\n🎉 Refresco de datos demo completo." : "\n🎉 Seed demo completo.");
}

// Solo corre main() automáticamente cuando el archivo se ejecuta
// directamente por CLI (`npx tsx prisma/seed-demo.ts`) — no cuando se
// importa como módulo (app/api/cron/reseed-demo/route.ts importa
// refrescarTodosLosNegociosDemo de aquí; sin esta guarda, ese import por sí
// solo dispararía una corrida completa de main() cada vez que Next carga
// la ruta). Equivalente ESM de la guarda clásica `require.main === module`.
//
// La primera versión comparaba `import.meta.url` contra
// `file://${process.argv[1]}` armado a mano — en Windows eso nunca
// coincide (import.meta.url usa "file:///C:/..." con diagonales; argv[1]
// trae la ruta de Windows con backslashes, "C:\..."), así que la
// comparación siempre daba falso y main() nunca corría (el bug que Carlos
// encontró: `npx tsx prisma/seed-demo.ts --refrescar` no imprimía nada).
// fileURLToPath() + path.resolve() normalizan ambos lados a una ruta real
// del sistema operativo antes de compararlos, y en Windows además se
// compara sin distinguir mayúsculas/minúsculas (su sistema de archivos no
// las distingue, pero la comparación de strings sí).
const esEjecucionDirecta = (() => {
  if (!process.argv[1]) return false;
  try {
    const rutaModulo = fileURLToPath(import.meta.url);
    const rutaArgv = path.resolve(process.argv[1]);
    return process.platform === "win32"
      ? rutaModulo.toLowerCase() === rutaArgv.toLowerCase()
      : rutaModulo === rutaArgv;
  } catch {
    return false;
  }
})();
if (esEjecucionDirecta) {
  main()
    .catch((e) => {
      console.error("❌ Error en el seed demo:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
