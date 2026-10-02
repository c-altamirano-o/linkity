"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Wrench, Package, Stethoscope, Check, CheckCircle, AlertCircle,
  ChevronLeft, X, Plus, ClipboardList, ArrowRight, Store, Gauge,
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import type {
  ReparacionesData, ReparacionUI, EstadoReparacion, PrioridadReparacion, ProductoParaReparacion, TecnicoOption,
} from "@/lib/reparaciones-data";
// Tipos del selector de periodo (2026-10-02) — ver el comentario largo junto
// al import en aduana/page.tsx: resolverPeriodoDashboard/atajosPeriodoDashboard
// son genéricos pese al nombre del archivo, reutilizados tal cual del
// Dashboard en vez de duplicar la lógica de fechas/zona horaria aquí.
import type { PeriodoDashboard, AtajosPeriodoDashboard } from "@/lib/dashboard-data";
import { label, type LabelDictionary } from "@/lib/labels";
import {
  asignarTecnicoAction, agregarPiezaReparacionAction, eliminarPiezaReparacionAction,
  actualizarCostoEstimadoAction, avanzarEstadoAction, resolverAlertaTallerAction, type NuevoEstadoReparacion,
} from "@/app/actions/reparaciones-actions";
import { abrirReciboImprimible, type DatosNegocioRecibo, type ReciboData } from "@/lib/recibo-imprimible";
import { useTourDesdeUrl, TOUR_ADUANA_ASIGNAR, TOUR_ADUANA_COBRAR_ENTREGAR } from "@/lib/tours";

/**
 * "Aduana" / Recepción del taller (2026-09-22, corrección explícita de
 * Carlos con el ejemplo hipotético "Fix Expres"): la ÚNICA pantalla donde se
 * puede asignar técnico, cambiar el estatus del equipo y ajustar el
 * costo/piezas cotizadas — "eso no lo hacen desde tienda" y "la edición del
 * costo solo se puede hacer en recepción". A propósito centralizada y SIN
 * filtro de sucursal (ver aduana/page.tsx y el comentario de "aduana" en
 * lib/roles.ts): el taller físico es UNO solo y recibe equipos de varias
 * sucursales/tiendas, así que quien trabaja aquí debe ver y operar folios de
 * cualquier sucursal del negocio.
 *
 * Reusa en gran parte la lógica que antes vivía en VistaAdmin de
 * ReparacionesClient.tsx (piezas, costo, avanzar estatus) — movida aquí tal
 * cual porque es exactamente el mismo trabajo, solo que ahora exclusivo de
 * este rol/ruta en vez de disponible también desde tienda o desde el propio
 * técnico.
 */

interface AduanaClientProps {
  data: ReparacionesData;
  labels: LabelDictionary;
  tenantSlug: string;
  // 2026-09-25, a petición de Carlos: true si quien ve esta pantalla TAMBIÉN
  // tiene acceso al módulo "pos" — ver el comentario largo en
  // puedeAccederModulo (lib/actor.ts). Solo decide si se muestra el atajo
  // "Cobrar y entregar" hacia POS; nunca reemplaza la validación real, que
  // sigue pasando por crearVentaAction del lado del servidor.
  puedeCobrar: boolean;
  // Datos reales del negocio para el ticket de "Entregar sin cobro"
  // (2026-09-26, ver el comentario largo en lib/recibo-imprimible.ts).
  negocioRecibo: DatosNegocioRecibo;
  // Tenant.cobrarEnDevolucion (2026-09-26) — decide si "Entregar (sin
  // cobro)" se ofrece aquí para SHOP_RETURN: con la casilla activa esa
  // transición directa la rechaza el servidor de cualquier forma (ver el
  // comentario largo en SIGUIENTES_ESTADOS abajo), así que no tiene caso
  // mostrar un botón que solo va a truene con un error.
  cobrarEnDevolucion: boolean;
  // Folio a preseleccionar al llegar aquí (2026-10-01, "Capa 1" del sistema
  // de alertas de taller — ver el comentario largo en
  // crearNotificacionAlertaTaller, lib/notificaciones.ts): la notificación
  // de una alerta de técnico trae un link a `/aduana?folio=...` para que dar
  // clic lleve directo al folio en cuestión, en vez de que Aduana tenga que
  // buscarlo a mano. null = comportamiento de siempre (llegada normal,
  // selecciona el primero de la lista). Mismo patrón que clienteInicialId en
  // ReparacionesClient.tsx/POSClient.tsx.
  folioInicial?: string | null;
  // Periodo del selector del "Resumen de taller" (2026-10-02, a petición de
  // Carlos) — ya resuelto por el servidor (aduana/page.tsx), igual que
  // dashboard/page.tsx se lo resuelve a DashboardClient.
  periodo: PeriodoDashboard;
  atajosPeriodo: AtajosPeriodoDashboard;
}

const ESTADO_BADGE: Record<EstadoReparacion, string> = {
  RECEIVED: "bg-blue-50 text-blue-700",
  DIAGNOSING: "bg-blue-50 text-blue-700",
  WAITING_PARTS: "bg-amber-50 text-amber-700",
  IN_REPAIR: "bg-purple-50 text-purple-700",
  READY: "bg-emerald-50 text-emerald-700",
  DELIVERED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-red-50 text-red-600",
  WORKSHOP_READY: "bg-emerald-50 text-emerald-700",
  WORKSHOP_RETURN: "bg-orange-50 text-orange-700",
  SHOP_READY: "bg-cyan-50 text-cyan-700",
  SHOP_RETURN: "bg-red-50 text-red-600",
};

const PRIORIDAD_TEXTO: Record<PrioridadReparacion, string> = {
  LOW: "Baja", NORMAL: "Normal", HIGH: "Alta", URGENT: "Urgente",
};

const PRIORIDAD_CLASES: Record<PrioridadReparacion, string> = {
  LOW: "bg-muted text-muted-foreground",
  NORMAL: "bg-amber-50 text-amber-600",
  HIGH: "bg-red-50 text-red-600",
  URGENT: "bg-red-100 text-red-700",
};

const HISTORIAL_ICONOS: Record<EstadoReparacion, { icon: React.ElementType; bg: string; color: string }> = {
  RECEIVED: { icon: Package, bg: "bg-muted", color: "text-muted-foreground" },
  DIAGNOSING: { icon: Stethoscope, bg: "bg-blue-50", color: "text-blue-600" },
  WAITING_PARTS: { icon: Package, bg: "bg-amber-50", color: "text-amber-600" },
  IN_REPAIR: { icon: Wrench, bg: "bg-purple-50", color: "text-purple-600" },
  READY: { icon: Check, bg: "bg-emerald-50", color: "text-emerald-600" },
  DELIVERED: { icon: CheckCircle, bg: "bg-muted", color: "text-muted-foreground" },
  CANCELLED: { icon: AlertCircle, bg: "bg-red-50", color: "text-red-600" },
  WORKSHOP_READY: { icon: Wrench, bg: "bg-emerald-50", color: "text-emerald-600" },
  WORKSHOP_RETURN: { icon: ArrowRight, bg: "bg-orange-50", color: "text-orange-600" },
  SHOP_READY: { icon: Store, bg: "bg-cyan-50", color: "text-cyan-600" },
  SHOP_RETURN: { icon: ArrowRight, bg: "bg-red-50", color: "text-red-600" },
};

// Dona "Distribución por estatus" del panel de resumen (ver más abajo) —
// 2026-10-02, a petición de Carlos, con DOS vueltas de ajuste el mismo día.
// Primera versión: una franja por cada uno de los 9 estatus activos del
// enum. Carlos la vio y pidió simplificarla a un total al centro + 3
// categorías, agrupando Recibido/Diagnóstico/Esperando/En reparación en una
// sola (AskUserQuestion, "Estatus intermedios" → "Agruparlos en 'En
// reparación'"). Al verla ya construida, pidió una SEGUNDA vuelta ("pensando
// mejor la lógica, como dueño o encargado de taller"): separar "Recibido" de
// nuevo, porque agrupado no se podía distinguir "folios que ni siquiera se
// han empezado a atender/asignar" de "folios ya en proceso" — justo el caso
// que "Sin técnico" (más abajo) existe para detectar. Versión final (4
// categorías):
//   - Centro: TOTAL de equipos recibidos en el periodo elegido (sin
//     importar su estatus actual) — "me daría un valor del cual saber que
//     tantos equipos entran a reparar". Sin cambios entre las 2 vueltas.
//   - "Pendientes de asignación": SOLO el estatus RECEIVED — "sí es
//     importante que esté separado... me dice que hay equipos sin que se
//     asignen o los reparen". Etiqueta de ESTA dona nada más (2026-10-02,
//     tercera vuelta): el estatus en sí se sigue llamando "Recibido" en
//     todo el resto de la app (badges, historial, mensajes al cliente —
//     repair.status.RECEIVED, lib/labels.ts) — cambiarlo ahí correría la
//     inconsistencia a todas esas pantallas. Aquí, en cambio, "Recibido"
//     chocaba con la palabra del centro de la dona ("Equipos ingresados",
//     antes "recibidos") y Carlos pidió un término más descriptivo para
//     esta franja en particular.
//   - "En reparación" (morado): Diagnóstico/Esperando refacción/En
//     reparación — "englobar cualquier parte del proceso" (ya sin
//     Recibido).
//   - "Listo" (verde): READY/WORKSHOP_READY/SHOP_READY — cuenta aunque el
//     folio ya se haya entregado después ("sin importar que estén listos
//     en taller, tienda o entregados", ver clasificarPeriodo más abajo).
//   - "Devoluciones" (rojo): WORKSHOP_RETURN/SHOP_RETURN — "cuántos no se
//     pudieron reparar", igual de explícito: cuenta aunque ya se haya
//     entregado ("y lo mismo para las devoluciones en rojo").
// "Recibido" usa var(--primary-text) (el mismo tratamiento que ya tenía ese
// estatus en la primera versión de 9 franjas — varía por tema, así que no
// se puede meter al validador de paletas; siempre va acompañado de la
// leyenda de texto, igual que el resto). Los otros 3 colores (morado/verde/
// rojo) están validados en este orden, en modo "all-pairs" (el más
// estricto): pasan las 4 pruebas. Aun así la dona sigue acompañada de
// leyenda de texto siempre (nunca solo color).
const GRUPO_DONUT_COLOR = {
  recibido: "var(--primary-text)",
  reparacion: "#8B5CF6",
  listo: "#10B981",
  devolucion: "#EF4444",
} as const;
type GrupoDonut = keyof typeof GRUPO_DONUT_COLOR;
const ESTADOS_LISTO: EstadoReparacion[] = ["READY", "WORKSHOP_READY", "SHOP_READY"];
const ESTADOS_DEVOLUCION: EstadoReparacion[] = ["WORKSHOP_RETURN", "SHOP_RETURN"];
// Estatus "aún no sale" — todo lo que no sea Listo/Devolución/Entregado/
// Cancelado. Úsalo para "Atrasados"/"Sin técnico" más abajo — a propósito
// SÍ incluye RECEIVED ahí (un folio recién recibido sin técnico asignado es
// justo el caso que "Sin técnico" debe detectar) aunque la dona ya lo
// muestre en su propia franja separada — son dos usos distintos del mismo
// concepto "sigue abierto".
const ESTADOS_ABIERTOS: EstadoReparacion[] = ["RECEIVED", "DIAGNOSING", "WAITING_PARTS", "IN_REPAIR"];

/**
 * Clasifica un folio para la dona mirando su HISTORIAL completo, no solo el
 * estatus actual (2026-10-02, a petición de Carlos: "listos"/"devoluciones"
 * deben contar "aunque aún estén en tienda o ya se hayan entregado"). Un
 * folio cae en exactamente UNA categoría (a diferencia de las fichas del
 * Dashboard, aquí son rebanadas de una misma dona: deben sumar el 100% del
 * total del centro) — devolución tiene prioridad sobre listo (si alguna vez
 * se marcó devolución, ya pasó lo importante, aunque después alguien haya
 * usado "Regresar a taller" y hoy esté de nuevo en proceso); si no hay
 * ningún checkpoint de los dos grupos, se mira el estatus ACTUAL para
 * distinguir "Recibido" (aún sin empezar) de "En reparación" (ya en
 * proceso) — y "en reparación" es también el cajón por default de un
 * CANCELLED que nunca llegó a listo ni devolución.
 */
function clasificarPeriodo(r: ReparacionUI): GrupoDonut {
  if (r.historial.some((h) => ESTADOS_DEVOLUCION.includes(h.estado))) return "devolucion";
  if (r.historial.some((h) => ESTADOS_LISTO.includes(h.estado))) return "listo";
  return r.estado === "RECEIVED" ? "recibido" : "reparacion";
}

// Botones de avance de estatus ofrecidos aquí — mismo mapa de transiciones
// válidas que TRANSICIONES_VALIDAS en reparaciones-actions.ts (el servidor
// vuelve a validar todo, esto solo decide qué botones mostrar). SHOP_READY
// no ofrece un botón hacia DELIVERED a propósito: ese salto exige un cobro y
// vive exclusivamente en /reparaciones (cobrarYEntregarAction, tienda) — lo
// que SHOP_READY sí ofrece aquí es "Regresar a taller (corregir)", ver más
// abajo. El botón de SHOP_RETURN -> DELIVERED sí se ofrece aquí (una
// devolución no siempre tiene cargo), pero el servidor lo rechaza si el
// negocio activó "cobrar en devolución" en Configuración — en ese caso el
// mensaje de error le indica al usuario que use "Cobrar y entregar" desde
// tienda. 2026-09-26: con la casilla activa, este componente ya ni
// siquiera OFRECE el botón (ver el filtro de "siguientes" más abajo) en
// vez de mostrarlo y dejar que el servidor lo rechace.
const SIGUIENTES_ESTADOS: Partial<Record<EstadoReparacion, { estado: NuevoEstadoReparacion; texto: string }[]>> = {
  RECEIVED: [{ estado: "IN_REPAIR", texto: "Iniciar reparación" }],
  IN_REPAIR: [
    { estado: "WAITING_PARTS", texto: "Esperando refacción" },
    { estado: "WORKSHOP_READY", texto: "Marcar listo" },
    { estado: "WORKSHOP_RETURN", texto: "Marcar devolución" },
  ],
  WAITING_PARTS: [{ estado: "IN_REPAIR", texto: "Reanudar reparación" }],
  WORKSHOP_READY: [{ estado: "SHOP_READY", texto: "Enviar a tienda (listo)" }],
  WORKSHOP_RETURN: [{ estado: "SHOP_RETURN", texto: "Enviar a tienda (devolución)" }],
  // SHOP_READY/SHOP_RETURN también ofrecen un botón de "regresar" al taller
  // (2026-09-25, a petición de Carlos: corregir un "Enviar a tienda" hecho
  // por error de dedo — antes no había forma de deshacerlo desde la UI).
  // Aterriza en IN_REPAIR, no en WORKSHOP_READY/WORKSHOP_RETURN (corregido
  // 2026-09-26: Carlos reportó que, aterrizando ahí, la única opción
  // siguiente era reenviar el mismo estatus de tienda que ya estaba
  // corrigiendo — "debería poderse elegir cualquiera que involucre a
  // taller, por ejemplo En reparación, Equipo Listo, En espera de
  // refacción". IN_REPAIR ya ofrece esas tres salidas completas, ver el
  // renglón de arriba — ver el comentario largo en TRANSICIONES_VALIDAS,
  // reparaciones-actions.ts).
  SHOP_READY: [{ estado: "IN_REPAIR", texto: "Regresar a taller (corregir)" }],
  SHOP_RETURN: [
    { estado: "DELIVERED", texto: "Entregar (sin cobro)" },
    { estado: "IN_REPAIR", texto: "Regresar a taller (corregir)" },
  ],
};

function agruparProductosParaSelector(productos: ProductoParaReparacion[]) {
  const piezas = productos.filter((p) => p.type !== "SERVICE");
  const servicios = productos.filter((p) => p.type === "SERVICE");
  return { piezas, servicios };
}

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const formatFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

const formatFechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true });

// "10 sep" — para el rango del selector de periodo del "Resumen de taller"
// (2026-10-02). Copia textual de la misma función en DashboardClient.tsx
// (mismo criterio ya usado en varias pantallas de este proyecto: un
// formateador de fecha chico se duplica por archivo en vez de compartirse,
// ver también ClientesClient.tsx/CitasClient.tsx).
const MESES_CORTO_PERIODO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function formatFechaCortaPeriodo(fechaStr: string): string {
  const [, m, d] = fechaStr.split("-").map(Number);
  return `${d} ${MESES_CORTO_PERIODO[m - 1]}`;
}

export default function AduanaClient({ data, labels, tenantSlug, puedeCobrar, negocioRecibo, cobrarEnDevolucion, folioInicial, periodo, atajosPeriodo }: AduanaClientProps) {
  const { reparaciones, productos, tecnicos } = data;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [soloActivas, setSoloActivas] = useState(true);
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(reparaciones[0]?.id ?? null);

  // "Muéstrame cómo" (2026-10-02, a petición de Carlos — tutorial
  // interactivo real, no un video) — ver lib/tours.ts. Lanza el tour de
  // "Asignar técnico y avanzar un folio" cuando se llega aquí desde el botón
  // del mismo nombre en /ayuda (?tour=aduana-asignar-tecnico).
  useTourDesdeUrl("aduana-asignar-tecnico", TOUR_ADUANA_ASIGNAR);
  useTourDesdeUrl("aduana-cobrar-entregar", TOUR_ADUANA_COBRAR_ENTREGAR);

  // Selector de periodo del "Resumen de taller" (2026-10-02) — mismo patrón
  // que cambiarPeriodo en DashboardClient.tsx: navega a ?desde=&hasta=, el
  // servidor (aduana/page.tsx) resuelve el nuevo periodo y, gracias al
  // `key` que le puso ahí, este componente se remonta completo con los
  // datos ya filtrados.
  const cambiarPeriodo = (desde: string, hasta: string) => {
    router.push(`/${tenantSlug}/aduana?${new URLSearchParams({ desde, hasta }).toString()}`);
  };
  const [desdeSel, setDesdeSel] = useState(periodo.desde);
  const [hastaSel, setHastaSel] = useState(periodo.hasta);
  const etiquetaPeriodo = (() => {
    switch (periodo.atajo) {
      case "hoy": return "hoy";
      case "semana": return "esta semana";
      case "mes": return "este mes";
      case "año": return "este año";
      default: return `del ${formatFechaCortaPeriodo(periodo.desde)} al ${formatFechaCortaPeriodo(periodo.hasta)}`;
    }
  })();

  // Seed de `folioInicial` (2026-10-01, ver el comentario largo junto a ese
  // prop arriba) — useRef en vez de depender de folioInicial en el arreglo
  // de dependencias, mismo patrón que clienteSeedAplicado en
  // ReparacionesClient.tsx: corre UNA sola vez al montar, nunca se repite si
  // el usuario luego selecciona otro folio a mano.
  const folioSeedAplicado = useRef(false);
  useEffect(() => {
    if (folioSeedAplicado.current || !folioInicial) return;
    folioSeedAplicado.current = true;
    const match = reparaciones.find((r) => r.folio === folioInicial);
    if (!match) return;
    setSeleccionadaId(match.id);
    // Si el folio ya se entregó/canceló, "Solo activas" lo escondería de la
    // lista aunque sí esté seleccionado — se apaga para que de verdad se
    // vea, no solo para que quede seleccionado "a ciegas".
    if (match.estado === "DELIVERED" || match.estado === "CANCELLED") setSoloActivas(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folioInicial]);

  const [costoEdit, setCostoEdit] = useState("");
  const [piezaNuevaId, setPiezaNuevaId] = useState("");
  const [piezaNuevaCantidad, setPiezaNuevaCantidad] = useState("1");

  // "Otro" — pieza o servicio personalizado, para cuando no está guardado
  // en el catálogo (2026-09-28, a petición explícita de Carlos, probando
  // justo esta pantalla: "falta agregar un campo personalizado... Campo
  // (Otro) abre cuadro de diálogo para poner nombre y precio"). Ver el
  // comentario largo junto a crearProductoPersonalizado
  // (reparaciones-actions.ts) para el porqué de cómo se guarda.
  const [otroAbierto, setOtroAbierto] = useState(false);
  const [otroNombre, setOtroNombre] = useState("");
  const [otroPrecio, setOtroPrecio] = useState("");
  const [otroCantidad, setOtroCantidad] = useState("1");
  const [otroError, setOtroError] = useState<string | null>(null);

  const activas = reparaciones.filter((r) => r.estado !== "DELIVERED" && r.estado !== "CANCELLED");
  const base = soloActivas ? activas : reparaciones;
  const listaVisible = base.filter((r) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return (
      r.folio.toLowerCase().includes(q) ||
      r.cliente.toLowerCase().includes(q) ||
      r.sucursalNombre.toLowerCase().includes(q)
    );
  });

  const seleccionada = reparaciones.find((r) => r.id === seleccionadaId) ?? null;

  // Generic (2026-09-29, a petición de Carlos: el ticket de "Entregar sin
  // cobro" ahora necesita sucursal/atendioPor que devuelve
  // avanzarEstadoAction) — `alTerminar` recibe el resultado ya angosto a la
  // rama {ok:true}, así handleEntregarSinCobro puede leer sus campos extra
  // sin que los demás llamados de ejecutar() tengan que cambiar (siguen
  // ignorando el argumento, como antes).
  function ejecutar<T extends { ok: boolean; error?: string }>(
    promesa: () => Promise<T>,
    alTerminar?: (res: Extract<T, { ok: true }>) => void
  ) {
    setError(null);
    startTransition(async () => {
      const res = await promesa();
      if (!res.ok) {
        setError(res.error ?? "No se pudo completar la acción");
        return;
      }
      alTerminar?.(res as Extract<T, { ok: true }>);
      router.refresh();
    });
  }

  const handleAsignarTecnico = (staffId: string) => {
    if (!seleccionada) return;
    ejecutar(() => asignarTecnicoAction({ tenantSlug, repairId: seleccionada.id, staffId: staffId || null }));
  };

  const handleGuardarCosto = () => {
    if (!seleccionada) return;
    const valor = parseFloat(costoEdit);
    if (!Number.isFinite(valor) || valor < 0) { setError("Ingresa un costo válido"); return; }
    ejecutar(
      () => actualizarCostoEstimadoAction({ tenantSlug, repairId: seleccionada.id, costoEstimado: valor }),
      () => setCostoEdit("")
    );
  };

  const handleAgregarPieza = () => {
    if (!seleccionada || !piezaNuevaId) return;
    const cantidad = Math.max(1, parseInt(piezaNuevaCantidad, 10) || 1);
    ejecutar(
      () => agregarPiezaReparacionAction({ tenantSlug, repairId: seleccionada.id, productId: piezaNuevaId, quantity: cantidad }),
      () => { setPiezaNuevaId(""); setPiezaNuevaCantidad("1"); }
    );
  };

  const handleAgregarPiezaPersonalizada = () => {
    if (!seleccionada) return;
    const nombre = otroNombre.trim();
    const precio = parseFloat(otroPrecio);
    if (!nombre) { setOtroError("Escribe un nombre"); return; }
    if (!Number.isFinite(precio) || precio <= 0) { setOtroError("Escribe un precio válido"); return; }
    setOtroError(null);
    const cantidad = Math.max(1, parseInt(otroCantidad, 10) || 1);
    ejecutar(
      () => agregarPiezaReparacionAction({ tenantSlug, repairId: seleccionada.id, nombre, precio, quantity: cantidad }),
      () => { setOtroNombre(""); setOtroPrecio(""); setOtroCantidad("1"); setOtroAbierto(false); }
    );
  };

  const handleQuitarPieza = (itemId: string) => {
    if (!seleccionada) return;
    ejecutar(() => eliminarPiezaReparacionAction({ tenantSlug, repairId: seleccionada.id, itemId }));
  };

  const handleAvanzar = (nuevoEstado: NuevoEstadoReparacion) => {
    if (!seleccionada) return;
    ejecutar(() => avanzarEstadoAction({ tenantSlug, repairId: seleccionada.id, nuevoEstado }));
  };

  // 2026-10-01 — ver el comentario largo en Repair.alertaTallerPendiente
  // (schema.prisma). Único botón que de verdad apaga el aviso fijo: Taller
  // (este módulo) es el único rol validado para resolverAlertaTallerAction
  // del lado del servidor, Tienda/Técnico solo lo ven.
  const handleResolverAlerta = () => {
    if (!seleccionada) return;
    ejecutar(() => resolverAlertaTallerAction({ tenantSlug, repairId: seleccionada.id }));
  };

  // "Entregar (sin cobro)" de una devolución (2026-09-26, mismo cambio que
  // handleEntregarSinCobro en ReparacionesClient.tsx, a petición explícita
  // de Carlos: "si es devolución se imprime un ticket en $0.00, pero
  // siempre indicando si fue Listo o Devolución" — antes esta entrega
  // directa no dejaba ningún comprobante, solo cambiaba el estatus).
  const handleEntregarSinCobro = () => {
    if (!seleccionada) return;
    const repair = seleccionada;
    ejecutar(
      () => avanzarEstadoAction({ tenantSlug, repairId: repair.id, nuevoEstado: "DELIVERED" }),
      async (res) => {
        const recibo: ReciboData = {
          tipoDocumento: "Reparación — Devolución",
          folio: repair.folio,
          cliente: repair.cliente,
          telefono: repair.telefono,
          sucursal: res.sucursal,
          atendioPor: res.atendioPor,
          renglones: [{ nombre: `${repair.marca} ${repair.modelo}`.trim(), cantidad: 1, precioUnitario: 0 }],
          subtotal: 0,
          iva: 0,
          total: 0,
          metodoPago: "Sin cargo",
          notaPie: "No fue posible reparar el equipo — se entrega sin costo.",
          qrUrl: `${window.location.origin}/rep/${repair.publicToken}`,
          qrEtiqueta: "Sigue tu reparación",
        };
        await abrirReciboImprimible(recibo, negocioRecibo);
      }
    );
  };

  // 2026-09-25, a petición de Carlos: atajo para el dueño/único operador —
  // manda directo a POS con esta reparación precargada (mismo camino que ya
  // usa "Cobrar y entregar" en /reparaciones, ver getRepairParaCobro y
  // crearVentaAction). Nunca cobra aquí mismo: solo navega.
  const handleCobrar = () => {
    if (!seleccionada) return;
    router.push(`/${tenantSlug}/pos?repairId=${seleccionada.id}`);
  };

  const entidadPlural = label(labels, "entity.repair.plural");
  const activo = label(labels, "entity.repair.asset");

  // ── Panel "Resumen de taller" (2026-10-02, a petición de Carlos: "veo
  // mucho espacio desperdiciado del lado derecho... qué reportes o métricas
  // podrás colocar ahí para ver el desempeño de taller y sus empleados").
  // Se calcula aquí mismo, en el cliente, a partir de los datos que esta
  // pantalla YA recibe (reparaciones + técnicos, con su `historial`
  // completo) — no hace falta ni un query ni un campo nuevo para el
  // selector de periodo tampoco: `periodo.start`/`periodo.end` ya vienen
  // resueltos del servidor. A propósito usa `reparaciones`/`activas`
  // completas (de TODO el negocio), sin importar el toggle "Activas/Todas"
  // de la lista de la izquierda ni la búsqueda — este panel responde "cómo
  // va el taller en general", no "qué estoy viendo en la lista ahora".
  //
  // 2026-10-02, segunda vuelta (AskUserQuestion "Alcance periodo" → "Todo
  // el panel"): Carlos pidió que el selector de periodo filtre TODO este
  // panel, no solo la dona. "Activos en taller" (debajo) es la ÚNICA
  // excepción deliberada — sigue siendo una foto del momento, mismo
  // criterio que "Reparaciones activas" en el Dashboard (no tiene sentido
  // acotar "cuántos hay AHORITA en el taller" a un rango de fechas
  // pasado). El resto se ancla en `fechaRecibido` dentro del periodo.
  const hoy = new Date();
  const inicioPeriodoMs = periodo.start.getTime();
  const finPeriodoMs = periodo.end.getTime();
  const recibidosPeriodo = reparaciones.filter((r) => {
    const t = new Date(r.fechaRecibido).getTime();
    return t >= inicioPeriodoMs && t < finPeriodoMs;
  });
  const atrasados = recibidosPeriodo.filter(
    (r) => ESTADOS_ABIERTOS.includes(r.estado) && r.fechaEstimada && new Date(r.fechaEstimada) < hoy
  );
  const sinTecnico = recibidosPeriodo.filter((r) => ESTADOS_ABIERTOS.includes(r.estado) && !r.tecnicoAsignadoId);
  const alertasPendientes = recibidosPeriodo.filter((r) => r.alertaTallerPendiente);

  // Dona "Distribución por estatus" — ver el comentario largo junto a
  // clasificarPeriodo/GRUPO_DONUT_COLOR arriba. El centro muestra
  // recibidosPeriodo.length (el total "cuántos entran a reparar" que pidió
  // Carlos); las 4 franjas clasifican ESE MISMO conjunto, así que siempre
  // suman el 100% del centro.
  const totalRecibidosPeriodo = recibidosPeriodo.length;
  const GRUPO_DONUT_LABEL: Record<GrupoDonut, string> = {
    recibido: "Pendientes de asignación",
    reparacion: "En reparación",
    listo: "Listo",
    devolucion: "Devoluciones",
  };
  const estadoCounts = (["recibido", "reparacion", "listo", "devolucion"] as GrupoDonut[])
    .map((grupo) => ({
      grupo,
      label: GRUPO_DONUT_LABEL[grupo],
      color: GRUPO_DONUT_COLOR[grupo],
      value: recibidosPeriodo.filter((r) => clasificarPeriodo(r) === grupo).length,
    }))
    .filter((e) => e.value > 0);

  // Ranking de técnicos — "carga actual" (debajo) es la OTRA excepción
  // deliberada, mismo motivo que "Activos en taller": el punto de ese
  // número es detectar sobrecarga/desbalance AHORA MISMO, y si se acotara
  // al periodo elegido, con "Hoy" casi cualquier técnico mostraría 0 (su
  // trabajo en curso casi siempre se recibió días antes) — justo lo
  // contrario de lo que esta tarjeta necesita mostrar. "Entregados"/
  // "tiempo promedio" sí siguen el periodo elegido (reemplazan la ventana
  // fija de 30 días que tenía esto antes) — para un periodo corto ("Hoy")
  // la muestra puede ser chica o incluso 0, igual que ya le pasa a
  // "Ventas del día" en el Dashboard: efecto esperado de filtrar por
  // periodo, no un bug.
  const rankingTecnicos = tecnicos
    .map((t: TecnicoOption) => {
      const propias = reparaciones.filter((r) => r.tecnicoAsignadoId === t.id);
      const entregadasPeriodo = propias.filter((r) => {
        if (r.estado !== "DELIVERED" || !r.fechaEntregado) return false;
        const t2 = new Date(r.fechaEntregado).getTime();
        return t2 >= inicioPeriodoMs && t2 < finPeriodoMs;
      });
      const diasPromedio =
        entregadasPeriodo.length > 0
          ? entregadasPeriodo.reduce((sum, r) => {
              const dias = (new Date(r.fechaEntregado as string).getTime() - new Date(r.fechaRecibido).getTime()) / (24 * 60 * 60 * 1000);
              return sum + Math.max(0, dias);
            }, 0) / entregadasPeriodo.length
          : null;
      return {
        id: t.id,
        nombre: t.name,
        carga: propias.filter((r) => r.estado !== "DELIVERED" && r.estado !== "CANCELLED").length,
        entregadosPeriodo: entregadasPeriodo.length,
        diasPromedio,
      };
    })
    .sort((a, b) => b.carga - a.carga || b.entregadosPeriodo - a.entregadosPeriodo);

  const cerrada = seleccionada?.estado === "DELIVERED" || seleccionada?.estado === "CANCELLED";
  // Con "cobrar en devolución" activo, SHOP_RETURN -> DELIVERED directo NO
  // se ofrece aquí (ver el comentario largo en SIGUIENTES_ESTADOS arriba):
  // el servidor lo rechaza de cualquier forma, y ese caso pasa por "Cobrar
  // y entregar" (el atajo de abajo, o /reparaciones).
  const siguientes = (seleccionada ? (SIGUIENTES_ESTADOS[seleccionada.estado] ?? []) : []).filter(
    (s) => !(s.estado === "DELIVERED" && cobrarEnDevolucion)
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <h1 className="text-[15px] font-semibold text-foreground flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary-text" /> {label(labels, "module.reception.name")}
          </h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Asigna técnico, cambia el estatus y ajusta costo/piezas — todas las {entidadPlural.toLowerCase()} del taller, de cualquier sucursal.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          {(["activas", "todas"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setSoloActivas(f === "activas")}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors ${
                (f === "activas") === soloActivas ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
              }`}
            >
              {f === "activas" ? "Activas" : "Todas"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-2 flex items-center gap-2 bg-red-50 text-red-700 text-[12.5px] px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Lista */}
        <div className={`w-full md:w-[340px] flex-shrink-0 border-r border-border overflow-y-auto ${seleccionada ? "hidden md:block" : ""}`}>
          <div className="px-3 py-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Folio, cliente o sucursal..."
                className="w-full pl-7 pr-3 py-1.5 border border-border rounded-lg text-xs bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>
          {listaVisible.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-muted-foreground">
              No hay {entidadPlural.toLowerCase()} {soloActivas ? "activas" : "registradas"}.
            </div>
          ) : (
            listaVisible.map((r) => (
              <button
                key={r.id}
                onClick={() => setSeleccionadaId(r.id)}
                data-tour="aduana-abrir-folio"
                className={`w-full text-left px-4 py-3 border-b border-border/60 hover:bg-muted/60 transition-colors ${
                  seleccionadaId === r.id ? "bg-primary/5" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-semibold text-foreground flex items-center gap-1">
                    {r.folio}
                    {/* 2026-10-01 — ver el aviso fijo del panel de detalle,
                        un poco más abajo. */}
                    {r.alertaTallerPendiente && <AlertCircle className="w-3 h-3 text-amber-600 flex-shrink-0" />}
                  </span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${ESTADO_BADGE[r.estado]}`}>
                    {label(labels, `repair.status.${r.estado}`)}
                  </span>
                </div>
                <p className="text-[12px] text-foreground/80 mt-1">{r.marca} {r.modelo}</p>
                <p className="text-[11.5px] text-muted-foreground truncate">{r.cliente} · {r.sucursalNombre}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${PRIORIDAD_CLASES[r.prioridad]}`}>
                    {PRIORIDAD_TEXTO[r.prioridad]}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground">
                    {r.tecnicoAsignadoNombre ?? "Sin técnico asignado"}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Detalle */}
        <div className={`flex-1 overflow-y-auto p-4 ${seleccionada ? "" : "hidden md:block"}`}>
          {!seleccionada ? (
            <div className="h-full flex items-center justify-center text-center text-[12.5px] text-muted-foreground p-8">
              Selecciona una {label(labels, "entity.repair.singular").toLowerCase()} de la lista para ver el detalle.
            </div>
          ) : (
            <div className="max-w-xl">
              <button
                onClick={() => setSeleccionadaId(null)}
                className="md:hidden flex items-center gap-1 text-[12px] text-muted-foreground mb-3"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Volver a la lista
              </button>

              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-semibold text-foreground">{seleccionada.folio}</h2>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${ESTADO_BADGE[seleccionada.estado]}`}>
                  {label(labels, `repair.status.${seleccionada.estado}`)}
                </span>
              </div>

              {/* 2026-10-01, a petición de Carlos — ver el comentario largo
                  en Repair.alertaTallerPendiente (schema.prisma). Aviso
                  FIJO (no un toast) con el único botón del sistema que lo
                  apaga: Taller es el único módulo validado del lado del
                  servidor para resolverAlertaTallerAction. */}
              {seleccionada.alertaTallerPendiente && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl border bg-amber-50 border-amber-300 mt-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-amber-700">Alerta del técnico sin atender</p>
                    <p className="text-[11.5px] mt-0.5 text-amber-600">
                      {seleccionada.historial.find((h) => h.nota?.startsWith("Alerta del técnico: "))?.nota?.slice("Alerta del técnico: ".length)
                        ?? "Hay un pendiente con este equipo."}
                    </p>
                    <button
                      onClick={handleResolverAlerta}
                      disabled={pending}
                      className="mt-2 text-[11.5px] font-medium px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white transition-colors"
                    >
                      Marcar como atendida
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="bg-muted rounded-lg p-2.5">
                  <p className="text-[10.5px] text-muted-foreground mb-0.5">{activo}</p>
                  <p className="text-[13px] font-medium text-foreground">{seleccionada.marca} {seleccionada.modelo}</p>
                </div>
                <div className="bg-muted rounded-lg p-2.5">
                  <p className="text-[10.5px] text-muted-foreground mb-0.5">Cliente</p>
                  <p className="text-[13px] font-medium text-foreground truncate">{seleccionada.cliente}</p>
                </div>
                <div className="bg-muted rounded-lg p-2.5">
                  <p className="text-[10.5px] text-muted-foreground mb-0.5">Sucursal</p>
                  <p className="text-[13px] font-medium text-foreground">{seleccionada.sucursalNombre}</p>
                </div>
                <div className="bg-muted rounded-lg p-2.5">
                  <p className="text-[10.5px] text-muted-foreground mb-0.5">Fecha prometida</p>
                  <p className="text-[13px] font-medium text-foreground">
                    {seleccionada.fechaEstimada ? formatFecha(seleccionada.fechaEstimada) : "Sin definir"}
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <p className="text-[10.5px] text-muted-foreground mb-1">Falla reportada</p>
                <p className="text-[12.5px] text-foreground/90 bg-muted rounded-lg p-2.5">{seleccionada.falla}</p>
              </div>

              {/* Técnico asignado — exclusivo de Aduana (2026-09-22, corrección
                  de Carlos: ni tienda ni el técnico mismo pueden elegirlo). */}
              <div className="mt-4" data-tour="aduana-tecnico">
                <p className="text-[12.5px] font-semibold text-foreground mb-1.5">Técnico asignado</p>
                <select
                  disabled={pending || cerrada}
                  value={seleccionada.tecnicoAsignadoId ?? ""}
                  onChange={(e) => handleAsignarTecnico(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-[12.5px] bg-card focus:outline-none focus:border-primary disabled:opacity-50"
                >
                  <option value="">Sin asignar</option>
                  {tecnicos.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Costo estimado — exclusivo de Aduana ("la edición del costo
                  solo se puede hacer en recepción", Carlos). El cambio queda
                  registrado en el Historial de abajo con fecha y hora. */}
              <div className="mt-4" data-tour="aduana-costo">
                <p className="text-[12.5px] font-semibold text-foreground mb-1.5">Costo estimado / pieza cotizada</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    disabled={pending || cerrada}
                    value={costoEdit}
                    onChange={(e) => setCostoEdit(e.target.value)}
                    placeholder={seleccionada.costoEstimado != null ? formatMXN(seleccionada.costoEstimado) : "$0"}
                    className="flex-1 min-w-0 px-3 py-2 border border-border rounded-lg text-[12.5px] bg-card focus:outline-none focus:border-primary disabled:opacity-50"
                  />
                  <button
                    onClick={handleGuardarCosto}
                    disabled={pending || cerrada || !costoEdit}
                    className="btn-primary px-3 py-2 rounded-lg text-[12.5px]"
                  >
                    Guardar
                  </button>
                </div>
                {seleccionada.costoEstimado != null && (
                  <p className="text-[11.5px] text-muted-foreground mt-1">Actual: {formatMXN(seleccionada.costoEstimado)}</p>
                )}
              </div>

              {/* Piezas — exclusivo de Aduana (ver el comentario en
                  agregarPiezaReparacionAction). */}
              <div className="mt-4" data-tour="aduana-piezas">
                <p className="text-[12.5px] font-semibold text-foreground mb-1.5">Piezas y servicios cotizados</p>
                {seleccionada.piezas.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-2">
                    {seleccionada.piezas.map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-muted rounded-lg px-2.5 py-1.5 text-[12px]">
                        <span className="text-foreground/90">{p.productName} × {p.quantity}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{formatMXN(p.price * p.quantity)}</span>
                          {!cerrada && (
                            <button
                              onClick={() => handleQuitarPieza(p.id)}
                              disabled={pending}
                              className="text-muted-foreground hover:text-red-600 disabled:opacity-50"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!cerrada && (
                  <div className="flex gap-2">
                    <select
                      value={piezaNuevaId}
                      onChange={(e) => {
                        // "__otro__" no es un producto real — abre el
                        // diálogo de personalizado (ver handleAgregarPiezaPersonalizada).
                        if (e.target.value === "__otro__") { setOtroAbierto(true); return; }
                        setPiezaNuevaId(e.target.value);
                      }}
                      className="flex-1 min-w-0 px-2 py-2 border border-border rounded-lg text-[12px] bg-card text-foreground focus:outline-none focus:border-primary"
                    >
                      <option value="">Selecciona una pieza o servicio…</option>
                      {(() => {
                        const { piezas: piezasCat, servicios } = agruparProductosParaSelector(productos);
                        return (
                          <>
                            {piezasCat.length > 0 && (
                              <optgroup label="Piezas / productos">
                                {piezasCat.map((p) => (
                                  <option key={p.id} value={p.id}>{p.name} — {formatMXN(p.price)}</option>
                                ))}
                              </optgroup>
                            )}
                            {servicios.length > 0 && (
                              <optgroup label="Servicios">
                                {servicios.map((p) => (
                                  <option key={p.id} value={p.id}>{p.name} — {formatMXN(p.price)}</option>
                                ))}
                              </optgroup>
                            )}
                          </>
                        );
                      })()}
                      <option value="__otro__">+ Otro (nombre y precio libres)</option>
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={piezaNuevaCantidad}
                      onChange={(e) => setPiezaNuevaCantidad(e.target.value)}
                      className="w-14 px-2 py-2 border border-border rounded-lg text-[12px] bg-card focus:outline-none focus:border-primary"
                    />
                    <button
                      onClick={handleAgregarPieza}
                      disabled={pending || !piezaNuevaId}
                      className="btn-secondary px-2.5 py-2 rounded-lg"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Avanzar estatus — exclusivo de Aduana ("solo la encargada de
                  recepción puede cambiar el estatus de un equipo", Carlos). */}
              {siguientes.length > 0 && (
                <div className="mt-4" data-tour="aduana-estatus">
                  <p className="text-[12.5px] font-semibold text-foreground mb-1.5">Cambiar estatus</p>
                  <div className="flex flex-wrap gap-2">
                    {siguientes.map((s) => (
                      <button
                        key={s.estado}
                        onClick={() => (s.estado === "DELIVERED" ? handleEntregarSinCobro() : handleAvanzar(s.estado))}
                        disabled={pending}
                        className="btn-primary flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px]"
                      >
                        <ArrowRight className="w-3.5 h-3.5" /> {s.texto}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Atajo "Cobrar y entregar" (2026-09-25, a petición de
                  Carlos: simplificar el proceso para el operador único, sin
                  quitarle la separación de funciones a quien sí la necesita
                  por jerarquía) — solo aparece cuando el equipo ya está listo
                  en tienda Y quien ve esta pantalla también tiene acceso al
                  módulo POS (puedeCobrar, ver el comentario en page.tsx). Un
                  recepcionista sin ese módulo nunca ve este botón; para él la
                  pantalla queda igual que siempre. Nunca cobra aquí mismo —
                  solo manda a /pos con la reparación precargada, el mismo
                  camino que ya usa este botón en /reparaciones.
                  2026-09-29, corrigiendo un bug real (reportado por Carlos:
                  quedaba atorado intentando "Cobrar y entregar" una
                  devolución en un negocio SIN "cobrar en devolución"
                  activo — crearVentaAction lo rechaza del lado del servidor
                  porque SHOP_RETURN -> DELIVERED directo no es válido en ese
                  caso): SHOP_READY siempre cobra (igual que antes), pero
                  SHOP_RETURN solo ofrece este atajo a POS si el negocio
                  activó cobrarEnDevolucion. Si no lo activó, este atajo
                  simplemente NO se muestra — la entrega sin cobro de esa
                  devolución ya la ofrece "Cambiar estatus" más arriba
                  ("Entregar (sin cobro)", vía SIGUIENTES_ESTADOS.SHOP_RETURN
                  + handleEntregarSinCobro), mostrar un segundo botón aquí
                  para la misma acción sería redundante. Mismo criterio que
                  ya tenía correcto ReparacionesClient.tsx (ver sus botones
                  "Entregar"). */}
              {puedeCobrar && (seleccionada.estado === "SHOP_READY" || (seleccionada.estado === "SHOP_RETURN" && cobrarEnDevolucion)) && (
                <div className="mt-4">
                  <button
                    onClick={handleCobrar}
                    disabled={pending}
                    data-tour="aduana-cobrar-entregar"
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-[12.5px] font-medium transition-colors"
                  >
                    <Store className="w-3.5 h-3.5" /> Cobrar y entregar
                  </button>
                </div>
              )}

              {/* Historial — incluye cambios de costo y alertas del técnico
                  (ver enviarAlertaTallerAction), todos con fecha y hora. */}
              {seleccionada.historial.length > 0 && (
                <div className="mt-5">
                  <p className="text-[12.5px] font-semibold text-foreground mb-2">Historial</p>
                  <div className="space-y-2.5">
                    {seleccionada.historial.map((h, i) => {
                      const cfg = HISTORIAL_ICONOS[h.estado] || HISTORIAL_ICONOS.RECEIVED;
                      const Icon = cfg.icon;
                      return (
                        <div key={i} className="flex items-start gap-2.5">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                            <Icon className={`w-3 h-3 ${cfg.color}`} />
                          </div>
                          <div>
                            <p className="text-[12.5px] text-foreground">{h.nota ?? label(labels, `repair.status.${h.estado}`)}</p>
                            <p className="text-[11px] text-muted-foreground">{formatFechaHora(h.fecha)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Resumen de taller — panel de métricas (2026-10-02, a petición de
            Carlos: "veo mucho espacio desperdiciado del lado derecho...
            qué reportes o métricas podrás colocar ahí para ver el
            desempeño de taller y sus empleados"). Oculto por debajo de
            "xl" a propósito — el panel de Detalle ya se vuelve angosto en
            pantallas medianas (sigue limitado por max-w-xl, ver más
            arriba), y este panel necesita su propio ancho fijo aparte; en
            vez de apretar todo en una pantalla chica, simplemente no se
            muestra ahí (el admin que lo quiere ver trabaja en escritorio
            grande, igual que el resto de este módulo). */}
        <div className="hidden xl:flex w-[320px] flex-shrink-0 border-l border-border overflow-y-auto p-4 flex-col gap-4">
          <div className="flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-primary-text" />
            <p className="text-[12.5px] font-semibold text-foreground">Resumen de taller</p>
          </div>

          {/* Selector de periodo (2026-10-02, a petición de Carlos: "que
              fuera por periodo, Día, semana, mes, año o fechas
              personalizadas, el mismo comportamiento que tiene el
              dashboard") — mismo patrón que el selector de
              DashboardClient.tsx, en dos renglones por el ancho angosto de
              este panel (320px) en vez de uno solo. Los atajos ya vienen
              resueltos del servidor (atajosPeriodoDashboard,
              lib/dashboard-data.ts) porque "Semana" depende de
              Tenant.weekStartDay. */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 flex-wrap">
              {(
                [
                  { key: "hoy", label: "Hoy", rango: atajosPeriodo.hoy },
                  { key: "semana", label: "Semana", rango: atajosPeriodo.semana },
                  { key: "mes", label: "Mes", rango: atajosPeriodo.mes },
                  { key: "año", label: "Año", rango: atajosPeriodo.año },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => cambiarPeriodo(opt.rango.desde, opt.rango.hasta)}
                  className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors ${
                    periodo.atajo === opt.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={desdeSel}
                max={hastaSel}
                onChange={(e) => e.target.value && setDesdeSel(e.target.value)}
                className="flex-1 min-w-0 px-1.5 py-1 border border-border rounded-lg text-[11px] bg-muted text-foreground focus:outline-none focus:border-primary"
              />
              <span className="text-[11px] text-muted-foreground">–</span>
              <input
                type="date"
                value={hastaSel}
                min={desdeSel}
                onChange={(e) => e.target.value && setHastaSel(e.target.value)}
                className="flex-1 min-w-0 px-1.5 py-1 border border-border rounded-lg text-[11px] bg-muted text-foreground focus:outline-none focus:border-primary"
              />
              <button
                onClick={() => cambiarPeriodo(desdeSel, hastaSel)}
                disabled={desdeSel === periodo.desde && hastaSel === periodo.hasta}
                className="text-[10.5px] font-medium px-2 py-1 rounded-lg text-primary-text bg-primary/10 hover:opacity-80 disabled:opacity-40 flex-shrink-0"
              >
                Aplicar
              </button>
            </div>
          </div>

          {/* KPIs operativos — mismo patrón visual de "ficha" que ya usa
              Dashboard (bg-muted/50, valor grande + etiqueta chica), para
              que se sienta parte de la misma app. Rojo/ámbar solo cuando
              el número es un problema real (>0) — en 0 se ve neutro, no
              hay que entrenar al ojo a ignorar un color de alerta que casi
              siempre está encendido. "Activos en taller" es foto del
              momento (no sigue el periodo); los otros 3 sí — ver el
              comentario largo junto a `atrasados` más arriba. */}
          <div className="space-y-1">
            <div className="grid grid-cols-2 gap-2">
              {[
                { valor: activas.length, texto: "Activos en taller", alerta: false },
                { valor: atrasados.length, texto: "Atrasados", alerta: atrasados.length > 0 },
                { valor: sinTecnico.length, texto: "Sin técnico", alerta: sinTecnico.length > 0 },
                { valor: alertasPendientes.length, texto: "Alertas sin atender", alerta: alertasPendientes.length > 0 },
              ].map((k) => (
                <div key={k.texto} className={`rounded-xl p-2.5 text-center ${k.alerta ? "bg-red-50" : "bg-muted/50"}`}>
                  <p className={`text-base font-semibold ${k.alerta ? "text-red-600" : "text-foreground"}`}>{k.valor}</p>
                  <p className={`text-[10.5px] mt-0.5 ${k.alerta ? "text-red-600/80" : "text-muted-foreground"}`}>{k.texto}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground px-0.5">
              Activos en taller: ahora mismo · el resto: recibidos {etiquetaPeriodo}
            </p>
          </div>

          {/* Distribución por estatus — dona con el total recibido al
              centro (2026-10-02, a petición de Carlos: "eso me daría un
              valor del cual saber que tantos equipos entran a reparar") y
              leyenda de texto siempre visible (nunca solo color, ver el
              comentario largo junto a GRUPO_DONUT_COLOR arriba). */}
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-[12px] font-medium text-foreground mb-2">
              Distribución por estatus <span className="font-normal text-muted-foreground">· {etiquetaPeriodo}</span>
            </p>
            {totalRecibidosPeriodo === 0 ? (
              <p className="text-[11.5px] text-muted-foreground text-center py-4">
                No se recibieron {entidadPlural.toLowerCase()} en este periodo.
              </p>
            ) : (
              <>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={120}>
                    <PieChart>
                      <Pie data={estadoCounts} cx="50%" cy="50%" innerRadius={32} outerRadius={48} dataKey="value" nameKey="label" paddingAngle={2}>
                        {estadoCounts.map((e) => <Cell key={e.grupo} fill={e.color} />)}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)", borderRadius: 8, fontSize: 12 }}
                        formatter={(v: any, nombre: any) => [`${v} ${Number(v) === 1 ? activo.toLowerCase() : entidadPlural.toLowerCase()}`, nombre]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-lg font-semibold text-foreground leading-none">{totalRecibidosPeriodo}</p>
                    {/* "Equipos ingresados" en vez de "recibidos" (2026-10-02,
                        a petición de Carlos: se confundía con el estatus
                        "Recibido" de la leyenda, que es algo distinto —
                        equipo que ya se registró pero nadie le ha puesto
                        manos encima todavía). Partido en 2 líneas: una sola
                        línea no cabe legible en el centro de la dona. */}
                    <p className="text-[8px] text-muted-foreground mt-0.5 leading-tight text-center">Equipos<br />ingresados</p>
                  </div>
                </div>
                <div className="space-y-1 mt-1">
                  {estadoCounts.map((e) => (
                    <div key={e.grupo} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.color }} />
                        <span className="text-[11px] text-muted-foreground truncate">{e.label}</span>
                      </div>
                      <span className="text-[11px] font-medium text-foreground ml-1">{e.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Ranking de técnicos — "reportes por técnico" que teníamos
              pendiente en el backlog, aquí a la vista todo el tiempo en
              vez de una pantalla aparte. Carga = equipos activos que trae
              asignados AHORA MISMO (foto del momento, ver el comentario
              largo junto a rankingTecnicos); entregas/promedio = dentro
              del periodo elegido arriba. */}
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-[12px] font-medium text-foreground mb-2">Técnicos</p>
            {rankingTecnicos.length === 0 ? (
              <p className="text-[11.5px] text-muted-foreground text-center py-4">Sin técnicos registrados.</p>
            ) : (
              <div className="space-y-2.5">
                {rankingTecnicos.map((t) => (
                  <div key={t.id}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11.5px] font-medium text-foreground truncate">{t.nombre}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                        t.carga === 0 ? "bg-muted text-muted-foreground" : "bg-purple-50 text-purple-700"
                      }`}>
                        {t.carga} {t.carga === 1 ? "activo" : "activos"}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-muted-foreground mt-0.5">
                      {t.entregadosPeriodo} {t.entregadosPeriodo === 1 ? "entrega" : "entregas"} · {etiquetaPeriodo}
                      {t.diasPromedio != null && ` · ${t.diasPromedio.toFixed(1)} días prom.`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Diálogo de "Otro" — pieza o servicio personalizado (2026-09-28, a
          petición explícita de Carlos, probando esta misma pantalla: "falta
          agregar un campo personalizado para cuando la pieza o servicio no
          se encuentre guardado... Campo (Otro) abre cuadro de diálogo para
          poner nombre y precio"). Ver el comentario largo junto a
          crearProductoPersonalizado (reparaciones-actions.ts). */}
      {otroAbierto && seleccionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOtroAbierto(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-medium text-foreground">Pieza o servicio personalizado</span>
              <button onClick={() => setOtroAbierto(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {otroError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{otroError}</div>}
              <div>
                <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">NOMBRE</label>
                <input type="text" autoFocus value={otroNombre} onChange={(e) => setOtroNombre(e.target.value)}
                  placeholder='Ej. "Micrófono genérico" o "Limpieza interna"'
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-card text-foreground focus:outline-none focus:border-primary" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">PRECIO</label>
                  <input type="number" min={0} step="0.01" value={otroPrecio} onChange={(e) => setOtroPrecio(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-card text-foreground focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">CANTIDAD</label>
                  <input type="number" min={1} value={otroCantidad} onChange={(e) => setOtroCantidad(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-sm bg-card text-foreground focus:outline-none focus:border-primary" />
                </div>
              </div>
              <p className="text-[11.5px] text-muted-foreground">
                Úsalo cuando la pieza o el servicio no esté guardado en tu catálogo — no se agrega a Catálogo ni afecta tu inventario, solo se cotiza en esta reparación.
              </p>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setOtroAbierto(false)}
                  className="btn-secondary flex-1 px-3 py-2 rounded-lg text-xs">
                  Cancelar
                </button>
                <button type="button" onClick={handleAgregarPiezaPersonalizada} disabled={pending}
                  className="btn-primary flex-1 px-3 py-2 rounded-lg text-xs">
                  {pending ? "Agregando..." : "Agregar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
