// ruta: C:\linkity\app\(tenant)\[tenant]\pos\POSClient.tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, ShoppingCart, Barcode, Plus, Minus, X, Check,
  User, UserPlus, ChevronDown, Building2, AlertTriangle, Printer, Wrench, Loader2,
} from "lucide-react";
import type { PosData, ProductoPOS, ClientePOS } from "@/lib/pos-data";
import type { RepairParaCobro } from "@/lib/reparaciones-data";
import { label, type LabelDictionary } from "@/lib/labels";
import { crearVentaAction, type MetodoPago } from "@/app/actions/pos-actions";
import { abrirCajaAction } from "@/app/actions/caja-actions";
import { crearClienteAction } from "@/app/actions/clientes-actions";
import { ProductoIcono } from "@/lib/catalogo-iconos";
import { CANTIDAD_CHIPS_CATEGORIA } from "@/lib/theme-presets";
import { abrirReciboImprimible, type DatosNegocioRecibo, type ReciboData, type QrDestinoTicket } from "@/lib/recibo-imprimible";
import EscanearModal from "./EscanearModal";
import { decidirEnterBuscador, buscarCodigoExacto, unirCarritos } from "@/lib/caja-rapida";
import { useTourDesdeUrl, TOUR_POS_VENTA, TOUR_POS_COBRAR_REPARACION } from "@/lib/tours";

interface BranchOption {
  id: string;
  name: string;
}

interface POSClientProps {
  data: PosData;
  labels: LabelDictionary;
  branches: BranchOption[];
  branchInicial: string | null;
  tenantSlug: string;
  // Datos reales del negocio para el encabezado/pie del ticket impreso
  // (2026-09-26, ver el comentario largo en lib/recibo-imprimible.ts) —
  // armado en el servidor (page.tsx) a partir de Tenant + nombreNegocioDeSlug.
  negocio: DatosNegocioRecibo;
  // Precarga de "Cobrar y entregar" desde Reparaciones (2026-09-25) — ver el
  // comentario largo en pos-actions.ts. null cuando se llegó a /pos sin
  // ?repairId; { ok:false } cuando el repairId no era válido/cobrable
  // (ver getRepairParaCobro, lib/reparaciones-data.ts).
  repairParaCobro?: RepairParaCobro | null;
  // Precarga del cliente desde el botón "Nueva venta" de su ficha en
  // /clientes (2026-09-25, atajo para el operador único, a petición de
  // Carlos) — id "en crudo" del cliente, sin revalidar en el servidor (ver
  // el comentario en pos/page.tsx); si no coincide con ningún cliente de
  // este tenant simplemente no preselecciona nada.
  clienteInicialId?: string | null;
  // Acceso directo a Reparaciones junto a las píldoras de categoría
  // (2026-09-30, a petición de Carlos: "hay que agregar un acceso a
  // Reparaciones junto a las burbujas") — false cuando el propio negocio
  // desactivó el módulo "reparaciones" (ver TenantModule/modulos-rubro.ts,
  // mismo criterio que el resto de la app: un rubro tipo barbería/estética
  // no necesita este atajo si de plano no usa Reparaciones).
  mostrarAccesoReparaciones?: boolean;
  // Descuentos activos traídos desde el servidor
  discounts: any[];
  // QR del ticket de VENTA (2026-10-01, a petición de Carlos — ver el
  // comentario largo en Tenant.reciboMostrarQR/reciboQrDestino,
  // schema.prisma). SOLO aplica a la venta normal de artículo/servicio: el
  // cobro de una reparación (repLinea abajo) sigue ignorando estos 4 props
  // por completo y apuntando siempre a /rep/[publicToken] — ver el cálculo
  // de qrUrlTicket/qrEtiquetaTicket más abajo.
  mostrarQRVenta: boolean;
  qrDestinoVenta: QrDestinoTicket;
  qrUrlVenta: string | null;
  qrEtiquetaVenta: string | null;
  // Caja rápida (2026-10-09, a petición de Carlos: "tiendas con flujo de
  // cliente continuo tipo supermercado ... que el dueño del tenant decida") —
  // viene de Tenant.cajaRapida (Configuración → Caja rápida). Activa: el foco
  // vive SIEMPRE en el buscador y Enter con el buscador vacío cobra. Apagada
  // (default): el POS se comporta como siempre.
  cajaRapida?: boolean;
}
type CartItem = {
  productId: string;
  nombre: string;
  precio: number;
  taxRate: number;
  cantidad: number;
  isService: boolean;
  // Presente únicamente en el renglón sintético que representa el cobro de
  // una reparación (nunca en un producto real del catálogo) — controla el
  // render distinto (sin +/-, precio editable) y cómo se manda el renglón a
  // crearVentaAction (repairId + monto en vez de productId + cantidad).
  repairId?: string;
  // 2026-09-26, junto con la unificación del botón "Entregar": el ticket de
  // esta venta debe indicar SIEMPRE si el equipo estaba Listo o era una
  // Devolución (a petición explícita de Carlos) — se guarda aquí (viene de
  // RepairParaCobro.esDevolucion) para no tener que volver a consultar la
  // reparación al momento de armar el recibo.
  esDevolucion?: boolean;
  // Repair.publicToken (2026-09-26) — para el QR del ticket de esta venta,
  // que debe apuntar a la página pública de seguimiento de ESA reparación
  // (/rep/[token]), no a la página pública de catálogo que llevan las ventas
  // normales de artículo/servicio. Viene de RepairParaCobro.publicToken.
  repairPublicToken?: string;
};

const SIN_CATEGORIA_ID = "__sin_categoria__";
// "Recientes" (2026-10-01, ver el comentario largo en
// PosData.recientementeUsados, lib/pos-data.ts) — categoría sintética igual
// que SIN_CATEGORIA_ID, pero esta sí puede ser el foco inicial de la página
// (ver el useState de categoriaActiva más abajo).
const RECIENTES_ID = "__recientes__";

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

export default function POSClient({ data, labels, branches, branchInicial, tenantSlug, negocio, repairParaCobro, clienteInicialId, mostrarAccesoReparaciones = true, discounts, mostrarQRVenta, qrDestinoVenta, qrUrlVenta, qrEtiquetaVenta, cajaRapida = false }: POSClientProps) {
  const { categorias, productos, clientes, cajaAbiertaPorSucursal, recientementeUsados } = data;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // "Muéstrame cómo" (2026-10-02, a petición de Carlos — tutorial
  // interactivo real, no un video) — ver lib/tours.ts. Lanza el tour de
  // "Registrar una venta" cuando se llega aquí desde el botón del mismo
  // nombre en /ayuda (?tour=pos-registrar-venta).
  useTourDesdeUrl("pos-registrar-venta", TOUR_POS_VENTA, labels);
  useTourDesdeUrl("pos-cobrar-reparacion", TOUR_POS_COBRAR_REPARACION, labels);

  const [branchId, setBranchId] = useState<string | null>(branchInicial);
  const [busqueda, setBusqueda] = useState("");
  // Arranca en "Recientes" en vez de "Todos" (2026-10-01, a petición de
  // Carlos: "que no aparezcan Todos los articulos y saturen la vista del
  // usuario") — solo cuando el negocio ya tiene ventas; si es un tenant
  // nuevo sin historial, no hay nada que mostrar en "Recientes" así que cae
  // de vuelta en "Todos" (null) como antes.
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(
    recientementeUsados.length > 0 ? RECIENTES_ID : null
  );
  const [carrito, setCarrito] = useState<CartItem[]>([]);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("efectivo");
  const [carritoAbierto, setCarritoAbierto] = useState(false);

  // Mientras haya un renglón de reparación en el carrito, la sucursal queda
  // fija a la de esa reparación — crearVentaAction la exige igual
  // (branchId de la venta == Repair.branchId), así que cambiarla a mitad de
  // camino solo llevaría a un error al cobrar.
  const sucursalBloqueadaPorReparacion = carrito.some((i) => i.repairId);

  const [clienteId, setClienteId] = useState<string | null>(clienteInicialId ?? null);
  const [clientePickerAbierto, setClientePickerAbierto] = useState(false);
  const [clienteQuery, setClienteQuery] = useState("");

  // "+ Nuevo cliente" inline (2026-10-03, Modo Simple — ver el comentario
  // largo junto a activarModoSimpleAction, app/actions/modulos-tenant-
  // actions.ts: para el negocio de 1-2 personas, POS ES la pantalla de
  // "Ventas", así que el único paso que antes obligaba a salir de aquí
  // —registrar un cliente nuevo en /clientes— se trae directo al picker de
  // cliente de abajo. clientesExtra guarda los clientes creados DESDE AQUÍ
  // en esta sesión de POS (la prop `clientes` solo se refresca cuando el
  // Server Component vuelve a correr) para que aparezcan de inmediato en la
  // lista/búsqueda sin esperar un recargo completo de la página.
  const [clientesExtra, setClientesExtra] = useState<ClientePOS[]>([]);
  const [nuevoClienteAbierto, setNuevoClienteAbierto] = useState(false);
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState("");
  const [nuevoClienteTelefono, setNuevoClienteTelefono] = useState("");
  const [creandoCliente, startCrearClienteTransition] = useTransition();
  const [errorNuevoCliente, setErrorNuevoCliente] = useState<string | null>(null);

  const abrirFormularioNuevoCliente = () => {
    setErrorNuevoCliente(null);
    // Precarga el nombre con lo que ya se había escrito en el buscador del
    // picker (2026-10-03) — si el cajero tecleó "Juan Pérez" buscando a un
    // cliente que no existe, no tiene sentido pedirle que lo vuelva a
    // escribir en el formulario de alta.
    setNuevoClienteNombre(clienteQuery.trim());
    setNuevoClienteTelefono("");
    setNuevoClienteAbierto(true);
  };

  const handleCrearCliente = () => {
    const nombre = nuevoClienteNombre.trim();
    if (!nombre) {
      setErrorNuevoCliente("El nombre del cliente es obligatorio");
      return;
    }
    setErrorNuevoCliente(null);
    startCrearClienteTransition(async () => {
      const res = await crearClienteAction({
        tenantSlug,
        name: nombre,
        phone: nuevoClienteTelefono.trim() || null,
      });
      if (!res.ok) {
        setErrorNuevoCliente(res.error);
        return;
      }
      setClientesExtra((prev) => [...prev, { id: res.id, name: nombre, phone: nuevoClienteTelefono.trim() || null, isWholesaler: false }]);
      setClienteId(res.id);
      setClientePickerAbierto(false);
      setNuevoClienteAbierto(false);
      setNuevoClienteNombre("");
      setNuevoClienteTelefono("");
      setClienteQuery("");
      router.refresh();
    });
  };

  // Caja abierta "optimista" (2026-10-03, Modo Simple) — ver handleAbrirCaja
  // más abajo. Se superpone sobre cajaAbiertaPorSucursal (que viene de la
  // prop `data`, solo se refresca con el Server Component) para que, apenas
  // el cajero abre la caja sin salir de POS, el botón "Cobrar" se habilite
  // al instante sin esperar un recargo completo de la página.
  const [cajaAbiertaOverride, setCajaAbiertaOverride] = useState<Record<string, boolean>>({});
  const [abrirCajaAbierto, setAbrirCajaAbierto] = useState(false);
  const [montoAperturaInput, setMontoAperturaInput] = useState("");
  const [notasAperturaInput, setNotasAperturaInput] = useState("");
  const [abriendoCaja, startAbrirCajaTransition] = useTransition();
  const [errorAbrirCaja, setErrorAbrirCaja] = useState<string | null>(null);

  const handleAbrirCaja = () => {
    if (!branchId) return;
    const monto = montoAperturaInput.trim() === "" ? 0 : Number(montoAperturaInput);
    if (!Number.isFinite(monto) || monto < 0) {
      setErrorAbrirCaja("El monto de apertura no es válido");
      return;
    }
    setErrorAbrirCaja(null);
    startAbrirCajaTransition(async () => {
      const res = await abrirCajaAction({
        tenantSlug,
        branchId,
        montoApertura: monto,
        notas: notasAperturaInput.trim() || null,
      });
      if (!res.ok) {
        setErrorAbrirCaja(res.error);
        return;
      }
      setCajaAbiertaOverride((prev) => ({ ...prev, [branchId]: true }));
      setAbrirCajaAbierto(false);
      setMontoAperturaInput("");
      setNotasAperturaInput("");
      router.refresh();
    });
  };

  const [montoRecibido, setMontoRecibido] = useState("");
  const [mixtoEfectivo, setMixtoEfectivo] = useState("");
  const [mixtoTarjeta, setMixtoTarjeta] = useState("");
  const [mixtoTransferencia, setMixtoTransferencia] = useState("");

  // Precarga de "Cobrar y entregar" (2026-09-25) — ver el comentario largo
  // en pos-actions.ts y en POSClientProps.repairParaCobro arriba. Se aplica
  // UNA sola vez con este ref (no en cada render ni cuando router.refresh()
  // vuelve a pasar por aquí tras cobrar) — después de cobrar, la reparación
  // ya no está en estatus cobrable, así que un refresh que reconsultara
  // repairParaCobro ya vendría con {ok:false}, pero el ref evita de todos
  // modos reabrir el carrito con un renglón ya cobrado si el cajero navegó
  // de ida y vuelta con el mismo ?repairId en la URL.
  const repairSeedAplicada = useRef(false);
  const [errorRepairSeed, setErrorRepairSeed] = useState<string | null>(null);
  useEffect(() => {
    if (repairSeedAplicada.current || !repairParaCobro) return;
    repairSeedAplicada.current = true;
    if (!repairParaCobro.ok) {
      setErrorRepairSeed(repairParaCobro.error);
      return;
    }
    const r = repairParaCobro;
    setCarrito((prev) =>
      prev.some((i) => i.repairId === r.id)
        ? prev
        : [
            ...prev,
            {
              productId: r.id,
              repairId: r.id,
              nombre: `Reparación ${r.folio} — ${r.deviceBrand} ${r.deviceModel}${r.esDevolucion ? " (Devolución)" : " (Listo)"}`.trim(),
              precio: r.montoSugerido,
              taxRate: 0,
              cantidad: 1,
              isService: true,
              esDevolucion: r.esDevolucion,
              repairPublicToken: r.publicToken,
            },
          ]
    );
    if (r.customerId) setClienteId(r.customerId);
    setCarritoAbierto(true);
    // Un renglón de reparación recién precargado siempre arranca sin la
    // confirmación de "$0" ya marcada (2026-10-05, ver confirmaReparacionSinCobro
    // más abajo) — si el monto sugerido ya viniera en $0 (ej. Tenant.montoDevolucion
    // sin configurar), el cajero de todas formas tiene que confirmarlo a propósito.
    setConfirmaReparacionSinCobro(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repairParaCobro]);

  const [ultimaVenta, setUltimaVenta] = useState<{ folio: string; total: number; cambio: number } | null>(null);
  // Snapshot completo para poder reimprimir el ticket sin depender del
  // carrito (que ya se vació con limpiarCarrito al momento de mostrar
  // "última venta") — ver handleCobrar.
  const [ultimoRecibo, setUltimoRecibo] = useState<ReciboData | null>(null);
  const [errorVenta, setErrorVenta] = useState<string | null>(null);

  // Escaneo de código de barras (2026-09-22, pendiente registrado: el
  // botón "Escanear" no hacía nada) — ver EscanearModal.tsx.
  const [mostrarEscaner, setMostrarEscaner] = useState(false);
  const [errorEscaner, setErrorEscaner] = useState<string | null>(null);
  // Evita procesar el MISMO código varias veces seguidas: la cámara sigue
  // "viendo" el código en cuadro por varios frames mientras el usuario
  // reacciona, y decodeFromVideoDevice llama a su callback en cada uno.
  const ultimoEscaneoRef = useRef<{ codigo: string; ts: number } | null>(null);

  // Aviso de "ya no se agregó nada" (2026-10-05, hallazgo de auditoría: tocar
  // una ficha o el "+" del carrito cuando ya se agregó TODO el stock
  // disponible de ese producto no hacía nada visible — el cajero no tenía
  // forma de saber si el toque "no sirvió" o si de verdad ya estaba al
  // tope). agregarAlCarrito/cambiarCantidad lo llenan cuando detectan ese
  // tope; se muestra como un aviso flotante (ver el JSX al final del
  // archivo) y se borra solo a los pocos segundos.
  const [avisoStock, setAvisoStock] = useState<string | null>(null);
  const avisoStockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!avisoStock) return;
    if (avisoStockTimeoutRef.current) clearTimeout(avisoStockTimeoutRef.current);
    avisoStockTimeoutRef.current = setTimeout(() => setAvisoStock(null), 3200);
    return () => {
      if (avisoStockTimeoutRef.current) clearTimeout(avisoStockTimeoutRef.current);
    };
  }, [avisoStock]);

  // Confirmación explícita para cobrar una reparación en $0 (2026-10-05,
  // hallazgo de auditoría: el monto de una reparación es editable a mano sin
  // mínimo real — si el cajero lo deja/borra sin querer, el Total caía a $0 y
  // nada impedía completar el cobro). $0 SÍ puede ser legítimo (ej. una
  // devolución sin cargo — Tenant.montoDevolucion arranca en $0 por default,
  // ver schema.prisma, o una reparación de garantía sin costo), así que en
  // vez de bloquearlo siempre se exige esta casilla marcada a propósito
  // cuando el renglón de la reparación está en $0 — ver hayReparacionEnCero/
  // puedeCobar más abajo. Se resetea (ver editarMontoReparacion,
  // quitarDelCarrito y el efecto de precarga arriba) en cuanto el monto deja
  // de ser $0, para que un cajero no pueda "heredar" una confirmación vieja.
  const [confirmaReparacionSinCobro, setConfirmaReparacionSinCobro] = useState(false);

  // 2026-09-30, a petición de Carlos ("el flujo del Enter debe saltarse la
  // cantidad del producto... el focus deberia cambiar al botón Cobrar"):
  // primer intento (regresar el foco al buscador) no era lo que pedía —
  // aquí el flujo de venta rápida es: buscar/seleccionar UN artículo y que
  // el siguiente Enter ya esté listo para cobrar, sin pasar por ningún
  // control de cantidad de por medio. Cada vez que se agrega un producto
  // (búsqueda+Enter o clic/Enter en una ficha), el foco salta derecho al
  // botón "Cobrar" — un Enter más (o clic) cierra la venta. Si el cajero
  // necesita agregar más de un artículo, vuelve a dar clic o Tab hacia el
  // buscador como de costumbre; esto no se lo bloquea, solo deja de ser el
  // destino automático del foco.
  const cobrarBtnRef = useRef<HTMLButtonElement>(null);

  // Caja rápida (2026-10-09) — ver POSClientProps.cajaRapida. El buscador
  // necesita ref para que el foco pueda volver a él tras cada artículo y tras
  // cada venta; ultimoAgregadoRef evita que el Enter extra que algunos lectores
  // de código de barras mandan pegado al código cobre la venta sin querer.
  const busquedaRef = useRef<HTMLInputElement>(null);
  const ultimoAgregadoRef = useRef(0);
  const enfocarBusqueda = () => {
    setTimeout(() => busquedaRef.current?.focus(), 0);
  };

  const stockDe = (p: ProductoPOS) =>
    p.isService ? Infinity : (branchId ? p.stockPorSucursal[branchId] ?? 0 : 0);

  // 2026-09-22, a petición de Carlos: no se puede cobrar si la sucursal
  // seleccionada no tiene una caja abierta (ver el comentario largo en
  // crearVentaAction, pos-actions.ts — esa es la validación que de verdad
  // importa; esto solo evita que el cajero llene todo el carrito para
  // enterarse hasta el final).
  const cajaAbierta = branchId ? cajaAbiertaOverride[branchId] ?? cajaAbiertaPorSucursal[branchId] ?? false : false;

  // clientesTotal = los del servidor + los dados de alta desde este mismo
  // POS en lo que va de la sesión (ver clientesExtra arriba) — un solo
  // arreglo para que clienteSeleccionado/clientesFiltrados encuentren al
  // recién creado sin esperar un recargo de la página.
  const clientesTotal = clientesExtra.length > 0 ? [...clientes, ...clientesExtra] : clientes;
  const clienteSeleccionado = clientesTotal.find((c) => c.id === clienteId) ?? null;
  const isWholesaler = clienteSeleccionado?.isWholesaler ?? false;
  const clientesFiltrados = clientesTotal
    .filter((c) => c.name.toLowerCase().includes(clienteQuery.toLowerCase()))
    .slice(0, 8);

  // 2026-09-30: Si se cambia el cliente seleccionado (a un mayorista o de regreso a uno normal),
  // se recalculan los precios del carrito para que coincidan con la lógica del servidor.
  useEffect(() => {
    setCarrito((prev) => {
      let changed = false;
      const newCart = prev.map((item) => {
        if (item.repairId) return item; // Las reparaciones tienen monto manual, no se ajustan por catálogo
        const p = productos.find((prod) => prod.id === item.productId);
        if (!p) return item;
        const precioActivo = (isWholesaler && p.wholesalePrice != null && p.wholesalePrice > 0) ? p.wholesalePrice : p.price;
        if (item.precio !== precioActivo) {
          changed = true;
          return { ...item, precio: precioActivo };
        }
        return item;
      });
      return changed ? newCart : prev;
    });
  }, [isWholesaler, productos]);

  /* ── Categorías (con "Recientes", "Todos" y "Sin categoría" sintéticas) ── */
  const hayNoCategorizados = productos.some((p) => p.categoryId === null);
  const categoriasOpciones = [
    // "Recientes" va PRIMERO (antes que "Todos") — es la burbuja que arranca
    // seleccionada por defecto, ver el useState de categoriaActiva arriba.
    // Oculta si el negocio todavía no tiene ventas (recientementeUsados
    // vacío) en vez de mostrarse vacía sin razón aparente.
    ...(recientementeUsados.length > 0 ? [{ id: RECIENTES_ID as string | null, name: "Recientes" }] : []),
    { id: null as string | null, name: "Todos" },
    ...categorias.map((c) => ({ id: c.id as string | null, name: c.name })),
    ...(hayNoCategorizados ? [{ id: SIN_CATEGORIA_ID as string | null, name: "Sin categoría" }] : []),
  ];

  // "Chip" de color por categoría (2026-09-23, a petición de Carlos: "la
  // variedad de colores... se vé novedoso y dinámico" — ver el comentario
  // largo en lib/theme-presets.ts). Un número de 1 a CANTIDAD_CHIPS_CATEGORIA
  // fijo por categoría, en el mismo orden en que vienen del servidor — así
  // cada categoría se queda siempre con el mismo color aunque el catálogo se
  // filtre o se reordene en pantalla. "Sin categoría" (producto.categoryId
  // null) no recibe chip: se queda con el color de marca --primary de
  // siempre, porque no hay una categoría real que resaltar.
  const chipPorCategoria = new Map<string, number>(
    categorias.map((c, i) => [c.id, (i % CANTIDAD_CHIPS_CATEGORIA) + 1])
  );

  /* ── Cálculos ── */
  const productosFiltrados = productos.filter((p) => {
    const matchCat =
      categoriaActiva === null
        ? true
        : categoriaActiva === SIN_CATEGORIA_ID
        ? p.categoryId === null
        : categoriaActiva === RECIENTES_ID
        ? recientementeUsados.includes(p.id)
        : p.categoryId === categoriaActiva;
    const busquedaNorm = busqueda.toLowerCase();
    const matchSearch =
      p.name.toLowerCase().includes(busquedaNorm) ||
      (!!p.sku && p.sku.toLowerCase().includes(busquedaNorm)) ||
      (!!p.barcode && p.barcode.toLowerCase().includes(busquedaNorm));
    return matchCat && matchSearch;
  });
  // En "Recientes" el orden importa (el más vendido hace un momento primero)
  // — `productos` ya viene ordenado alfabéticamente del servidor (ver
  // pos-data.ts), así que aquí se reordena aparte según la posición de cada
  // producto en recientementeUsados (que sí viene en orden de más reciente a
  // menos reciente).
  if (categoriaActiva === RECIENTES_ID) {
    productosFiltrados.sort(
      (a, b) => recientementeUsados.indexOf(a.id) - recientementeUsados.indexOf(b.id)
    );
  }

  // 1. Calculamos el total original sin descuentos
  const totalOriginal = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const subtotalOriginal = carrito.reduce((s, i) => s + (i.precio * i.cantidad) / (1 + i.taxRate / 100), 0);
  
  // 2. FUNCIÓN DE DESCUENTOS: Analiza el carrito y los descuentos aplicables
  const calcularDescuento = () => {
    if (!discounts || discounts.length === 0 || carrito.length === 0) return 0;

    let totalDescuento = 0;
    const subtotalCarrito = totalOriginal; // Precio base de donde descontar

    for (const desc of discounts) {
      // 2.1 Un descuento asignado a un cliente específico (Discount.customerId)
      // solo cuenta aquí si es justo el cliente que está seleccionado en esta
      // venta — mismo criterio que el servidor en pos-actions.ts (donde de
      // verdad se cobra); sin este filtro la vista previa mostraba un
      // descuento que crearVentaAction después NO aplicaba, confundiendo al
      // cajero con un total que no coincidía con el ticket real.
      if (desc.customerId && desc.customerId !== clienteId) continue;

      // 2.2 Validar mínimo de compra general
      if (desc.minPurchase && subtotalCarrito < Number(desc.minPurchase)) continue;

      let descuentoLinea = 0;

      // 2.2 Aplicar según el alcance (Scope)
      if (desc.scope === "SALE") {
        if (desc.valueType === "PERCENTAGE") {
          descuentoLinea = subtotalCarrito * (Number(desc.value) / 100);
        } else {
          descuentoLinea = Number(desc.value);
        }
      } else if (desc.scope === "PRODUCT") {
        const productIds = desc.products?.map((p: any) => p.productId) || [];
        const itemsAplicables = carrito.filter(i => productIds.includes(i.productId) && !i.repairId);
        const subtotalAplicable = itemsAplicables.reduce((s, i) => s + i.precio * i.cantidad, 0);

        if (subtotalAplicable > 0) {
          if (desc.valueType === "PERCENTAGE") {
            descuentoLinea = subtotalAplicable * (Number(desc.value) / 100);
          } else {
            descuentoLinea = Number(desc.value);
          }
        }
      } else if (desc.scope === "CATEGORY") {
        const categoryIds = desc.categories?.map((c: any) => c.categoryId) || [];
        const itemsAplicables = carrito.filter(i => {
          if (i.repairId) return false;
          const prod = productos.find(p => p.id === i.productId);
          return prod && prod.categoryId && categoryIds.includes(prod.categoryId);
        });
        const subtotalAplicable = itemsAplicables.reduce((s, i) => s + i.precio * i.cantidad, 0);

        if (subtotalAplicable > 0) {
          if (desc.valueType === "PERCENTAGE") {
            descuentoLinea = subtotalAplicable * (Number(desc.value) / 100);
          } else {
            descuentoLinea = Number(desc.value);
          }
        }
      }

      // 2.3 Aplicar tope máximo del descuento si existe
      if (desc.maxDiscount && descuentoLinea > Number(desc.maxDiscount)) {
        descuentoLinea = Number(desc.maxDiscount);
      }

      totalDescuento += descuentoLinea;

      // 2.4 Si el descuento no es acumulable, terminamos de buscar
      if (!desc.accumulable && descuentoLinea > 0) {
        break;
      }
    }

    // El descuento nunca puede ser mayor al costo de los productos
    return Math.min(totalDescuento, subtotalCarrito);
  };

  const descuentoAplicado = calcularDescuento(); 
  
  // 3. Totales finales ajustados
  const total = Math.round(Math.max(0, totalOriginal - descuentoAplicado) * 100) / 100;
  const proporcion = totalOriginal > 0 ? (total / totalOriginal) : 1;
  
  const subtotal = Math.round((subtotalOriginal * proporcion) * 100) / 100;
  const iva = Math.round((total - subtotal) * 100) / 100;
  const totalItems = carrito.reduce((s, i) => s + i.cantidad, 0);

  // 2026-09-30, a petición de Carlos: "que no sea obligatorio poner la
  // cantidad con la que paga el cliente, ya que muchos no lo hacen" — antes,
  // un campo en blanco se leía como $0 (montoNum = 0), lo que SIEMPRE
  // bloqueaba el botón Cobrar en efectivo (0 < total, ver puedeCobar más
  // abajo) hasta que alguien tecleara algo. Ahora, en blanco se asume pago
  // exacto (sin cambio) — el cajero solo necesita teclear un monto cuando
  // de verdad recibió más del total y hay que calcular el cambio. Si SÍ
  // escribió algo y es menor al total, eso sigue bloqueando el cobro (esa
  // validación real no cambia — nunca se asume que alcanzó si el cajero
  // mismo tecleó que no).
  const montoIngresado = montoRecibido.trim() !== "";
  const montoNum = montoIngresado ? parseFloat(montoRecibido.replace(/,/g, "")) || 0 : total;
  const cambio = montoNum > total ? montoNum - total : 0;
  const faltaEfec = montoIngresado && montoNum < total;

  const mEfec = parseFloat(mixtoEfectivo.replace(/,/g, "")) || 0;
  const mTarj = parseFloat(mixtoTarjeta.replace(/,/g, "")) || 0;
  const mTrans = parseFloat(mixtoTransferencia.replace(/,/g, "")) || 0;
  const totalMixto = mEfec + mTarj + mTrans;
  const faltaMixto = total - totalMixto;
  const cambioMixto = totalMixto > total ? totalMixto - total : 0;
  const mixtoOk = totalMixto >= total;

  // 2026-10-05, hallazgo de auditoría: el monto de un renglón de reparación
  // es editable a mano sin mínimo real — si el cajero lo borra/deja en $0
  // sin querer, nada impedía completar el cobro (y con Tarjeta/Transferencia
  // ni siquiera depende de "Monto recibido"). $0 SÍ puede ser legítimo (una
  // devolución sin cargo, una reparación de garantía), así que no se bloquea
  // de plano: se exige la casilla "confirmaReparacionSinCobro" marcada a
  // propósito (ver el checkbox junto al botón Cobrar) para que nunca pase
  // por accidente/campo vacío.
  const hayReparacionEnCero = carrito.some((i) => !!i.repairId && i.precio <= 0);

  const puedeCobar =
    !!branchId &&
    cajaAbierta &&
    carrito.length > 0 &&
    !isPending &&
    (!hayReparacionEnCero || confirmaReparacionSinCobro) &&
    (metodoPago === "tarjeta" ||
      metodoPago === "transferencia" ||
      (metodoPago === "efectivo" && montoNum >= total) ||
      (metodoPago === "mixto" && mixtoOk));

  /* ── Acciones ── */
  // Devuelve true si de verdad se agregó/incrementó algo — false si no se
  // tocó el carrito (sin stock, o ya se agregó todo el disponible). El valor
  // de retorno lo usan los llamadores (ficha, buscador+Enter, escáner) para
  // saber si deben seguir con su propio flujo (limpiar buscador, cerrar el
  // modal del escáner, etc.) o no.
  const agregarAlCarrito = (p: ProductoPOS): boolean => {
    const disponible = stockDe(p);
    if (!p.isService && disponible <= 0) {
      // 2026-10-05, hallazgo de auditoría: antes esto regresaba en silencio
      // — un producto sin existencias no daba ninguna pista de por qué no
      // pasaba nada al tocarlo (fuera de la ficha ya marcada "Agotado", que
      // no siempre es lo primero que el cajero mira).
      setAvisoStock(`"${p.name}" no tiene existencias disponibles en esta sucursal.`);
      return false;
    }
    // 2026-10-05, mismo hallazgo: si ya se agregó al carrito TODO el stock
    // disponible de este producto, seguir tocando la ficha (o el "+" del
    // carrito, ver cambiarCantidad) no debía agregar nada — pero tampoco
    // avisaba nada, así que un cajero nuevo podía pensar que la pantalla no
    // respondía. Se calcula aparte del updater de setCarrito de abajo
    // (que sigue siendo la fuente de verdad de la mutación) solo para poder
    // decidir si hay que avisar.
    const existeActual = carrito.find((i) => i.productId === p.id);
    if (existeActual && !p.isService && existeActual.cantidad + 1 > disponible) {
      setAvisoStock(`Ya agregaste todo el stock disponible de "${p.name}" (${disponible}).`);
      return false;
    }
    setAvisoStock(null);
    // En Caja rápida el banner "Venta registrada · Cambio" se queda hasta la
    // siguiente venta: el cajero ya escaneó al cliente siguiente pero aún
    // necesita ver cuánto cambio dar al anterior.
    if (!cajaRapida) setUltimaVenta(null);
    setErrorVenta(null);

    const precioActivo = (isWholesaler && p.wholesalePrice != null && p.wholesalePrice > 0) ? p.wholesalePrice : p.price;

    setCarrito((prev) => {
      const existe = prev.find((i) => i.productId === p.id);
      if (existe) {
        if (!p.isService && existe.cantidad + 1 > disponible) return prev;
        return prev.map((i) => (i.productId === p.id ? { ...i, cantidad: i.cantidad + 1, precio: precioActivo } : i));
      }
      return [...prev, { productId: p.id, nombre: p.name, precio: precioActivo, taxRate: p.taxRate, cantidad: 1, isService: p.isService }];
    });
    return true;
  };

  // Se llama con lo que el lector físico de código de barras (USB/Bluetooth,
  // ver EscanearModal.tsx) o el cajero escribió a mano ahí mismo. Busca el
  // producto por barcode exacto o, si no hay match, por SKU exacto (sin
  // distinguir mayúsculas) — un código de barras real nunca es un match
  // parcial, así que aquí sí se compara completo, a diferencia del buscador
  // de texto de arriba.
  const handleCodigoEscaneado = (codigoCrudo: string) => {
    const codigo = codigoCrudo.trim();
    if (!codigo) return;

    // Evita procesar el MISMO código dos veces si el lector físico llega a
    // disparar Enter más de una vez muy seguido (guarda de seguridad barata
    // — ya no hay cámara viendo el código en varios frames, así que esto
    // rara vez se activa hoy, pero no estorba dejarlo).
    const ahora = Date.now();
    if (ultimoEscaneoRef.current?.codigo === codigo && ahora - ultimoEscaneoRef.current.ts < 2000) return;
    ultimoEscaneoRef.current = { codigo, ts: ahora };

    const producto = productos.find(
      (p) => p.barcode === codigo || (!!p.sku && p.sku.toLowerCase() === codigo.toLowerCase())
    );
    if (!producto) {
      setErrorEscaner(`No se encontró ningún producto con el código "${codigo}".`);
      return;
    }
    const disponibleEscaneado = stockDe(producto);
    if (!producto.isService && disponibleEscaneado <= 0) {
      setErrorEscaner(`"${producto.name}" no tiene stock disponible en esta sucursal.`);
      return;
    }
    // 2026-10-05, hallazgo de auditoría: si ya se agregó al carrito TODO el
    // stock disponible de este producto, agregarAlCarrito no iba a agregar
    // nada — pero el modal se cerraba de todas formas (como si el escaneo
    // hubiera funcionado), dejando al cajero creyendo que sí se agregó. Se
    // detecta ANTES de llamar a agregarAlCarrito para poder mostrar el error
    // AQUÍ MISMO, sin cerrar el modal — igual que el caso de "sin stock" de
    // arriba.
    const existenteEscaneado = carrito.find((i) => i.productId === producto.id);
    if (existenteEscaneado && !producto.isService && existenteEscaneado.cantidad >= disponibleEscaneado) {
      setErrorEscaner(`Ya agregaste todo el stock disponible de "${producto.name}" (${disponibleEscaneado}).`);
      return;
    }
    agregarAlCarrito(producto);
    setErrorEscaner(null);
    setMostrarEscaner(false);
  };

  const cambiarCantidad = (productId: string, delta: number) => {
    // 2026-10-05, hallazgo de auditoría: tocar "+" cuando ya se agregó todo
    // el stock disponible no hacía nada visible — mismo aviso que
    // agregarAlCarrito, calculado aparte del updater de abajo (que se deja
    // igual, como respaldo defensivo).
    if (delta > 0) {
      const item = carrito.find((i) => i.productId === productId);
      if (item && !item.isService) {
        const producto = productos.find((p) => p.id === productId);
        const disponible = producto ? stockDe(producto) : 0;
        if (item.cantidad + delta > disponible) {
          setAvisoStock(`Ya agregaste todo el stock disponible de "${item.nombre}" (${disponible}).`);
          return;
        }
      }
    }
    setAvisoStock(null);
    setCarrito((prev) =>
      prev
        .map((i) => {
          if (i.productId !== productId) return i;
          if (delta > 0 && !i.isService) {
            const producto = productos.find((p) => p.id === productId);
            const disponible = producto ? stockDe(producto) : 0;
            if (i.cantidad + delta > disponible) return i;
          }
          return { ...i, cantidad: i.cantidad + delta };
        })
        .filter((i) => i.cantidad > 0)
    );
  };

  const limpiarCarrito = () => {
    setCarrito([]);
    setMontoRecibido("");
    setMixtoEfectivo(""); setMixtoTarjeta(""); setMixtoTransferencia("");
    setConfirmaReparacionSinCobro(false);
  };

  // Solo para el renglón de una reparación (2026-09-25) — no tiene +/- de
  // cantidad (siempre es 1), así que se quita completo con este botón. Quitar
  // el renglón no le hace nada a la reparación en sí (nada se guardó todavía):
  // solo significa que el cajero decidió no cobrarla ahora mismo.
  const quitarDelCarrito = (productId: string) => {
    setCarrito((prev) => prev.filter((i) => i.productId !== productId));
    // Si se quita justo el renglón de reparación que estaba en $0, la
    // casilla de confirmación ya no aplica a nada — se resetea para que no
    // se quede "marcada" de cara a una futura reparación que se agregue.
    setConfirmaReparacionSinCobro(false);
  };

  // El monto de una reparación es negociado, no un precio de catálogo —
  // editable directo aquí, mismo criterio de confianza que ya tenía el
  // modal de "Cobrar y entregar" que este flujo reemplaza (el servidor solo
  // valida que la reparación siga en un estatus cobrable, no un precio
  // fijo contra el que comparar).
  const editarMontoReparacion = (productId: string, valor: string) => {
    const monto = Math.max(0, parseFloat(valor) || 0);
    setCarrito((prev) => prev.map((i) => (i.productId === productId ? { ...i, precio: monto } : i)));
    // 2026-10-05, hallazgo de auditoría: cualquier edición que deje el monto
    // en algo distinto de $0 invalida una confirmación de "sin cobro" que ya
    // se hubiera marcado antes — si el cajero vuelve a dejarlo en $0 más
    // tarde (otro descuido, u otra reparación), tiene que confirmarlo de
    // nuevo a propósito, nunca heredar la marca vieja.
    if (monto !== 0) setConfirmaReparacionSinCobro(false);
  };

  const handleMetodo = (m: MetodoPago) => {
    setMetodoPago(m);
    setMontoRecibido("");
    setMixtoEfectivo(""); setMixtoTarjeta(""); setMixtoTransferencia("");
  };

  // Texto de método de pago para el ticket — mismo criterio que las
  // etiquetas de los botones 2×2 de arriba, sin los emoji.
  const METODO_PAGO_TEXTO_TICKET: Record<MetodoPago, string> = {
    efectivo: "Efectivo",
    tarjeta: "Tarjeta",
    transferencia: "Transferencia",
    mixto: "Mixto",
  };

  // ── Caja rápida: el foco vive en el buscador ───────────────
  // Al abrir el POS (con caja abierta) el cursor ya está listo para escanear.
  useEffect(() => {
    if (cajaRapida && cajaAbierta) enfocarBusqueda();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cajaRapida, cajaAbierta]);

  // Un lector de código de barras "teclea" como un teclado: si el foco quedó en
  // un botón (por ejemplo tras tocar "+" en el carrito), los dígitos se perderían
  // y su Enter activaría ese botón. En Caja rápida, cualquier carácter imprimible
  // que llegue con el foco FUERA de un campo de texto lo manda primero al
  // buscador (el navegador lo escribe ahí mismo, en el mismo golpe de tecla).
  useEffect(() => {
    if (!cajaRapida) return;
    const alPresionar = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1 || e.key === " ") return;
      if (mostrarEscaner || abrirCajaAbierto || clientePickerAbierto) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
      if (el instanceof HTMLElement && el.isContentEditable) return;
      busquedaRef.current?.focus();
    };
    document.addEventListener("keydown", alPresionar);
    return () => document.removeEventListener("keydown", alPresionar);
  }, [cajaRapida, mostrarEscaner, abrirCajaAbierto, clientePickerAbierto]);

  const handleCobrar = () => {
    if (!puedeCobar || !branchId) return;
    setErrorVenta(null);

    // Snapshot ANTES de limpiarCarrito()/setClienteId(null) — el ticket
    // necesita los renglones y el cliente tal como estaban al momento de
    // cobrar, no el carrito ya vacío que queda después.
    const renglonesTicket = carrito.map((i) => ({ nombre: i.nombre, cantidad: i.cantidad, precioUnitario: i.precio }));
    const clienteTicket = clienteSeleccionado?.name ?? null;
    const clienteTelefonoTicket = clienteSeleccionado?.phone ?? null;
    const metodoPagoAlCobrar = metodoPago;
    // 2026-09-30: si el cajero dejó "Monto recibido" en blanco (pago
    // exacto asumido, ver montoIngresado más arriba), no se manda ni se
    // imprime un "recibido"/"cambio" inventado — ni al server ni al ticket
    // se le hace creer que el cajero SÍ tecleó un monto cuando no lo hizo.
    const montoIngresadoAlCobrar = montoIngresado;
    const subtotalTicket = subtotal;
    const ivaTicket = iva;
    // Si esta venta incluyó el cobro de una reparación, se limpia el
    // ?repairId de la URL de una vez (router.replace, no solo refresh) —
    // sin esto, recargar la página o volver a esta pestaña re-consultaría
    // la misma reparación (ya DELIVERED) sin necesidad, y un back/forward
    // del navegador podría confundir con un ?repairId que ya no aplica.
    const carritoTeniaReparacion = carrito.some((i) => i.repairId);
    // Encabezado del ticket (2026-09-26, a petición de Carlos: el ticket
    // "siempre" debe indicar si el equipo estaba Listo o era Devolución) —
    // el nombre del renglón ya lo deja claro también (ver el efecto de seed
    // arriba), esto además cambia el título del comprobante impreso.
    const repLinea = carrito.find((i) => i.repairId);
    const tipoDocumentoTicket = !repLinea ? "Venta" : repLinea.esDevolucion ? "Reparación — Devolución" : "Reparación — Listo";
    // QR del ticket (2026-09-26, ver el comentario largo en
    // lib/recibo-imprimible.ts; 2026-10-01, ver el comentario largo en
    // Tenant.reciboMostrarQR/reciboQrDestino, schema.prisma): si esta venta
    // cobra una reparación, el QR se queda FIJO apuntando a su página
    // pública de seguimiento de siempre (/rep/[token]) — Carlos confirmó que
    // ese caso no debe ser apagable, tiene un propósito funcional claro. Solo
    // la venta normal de artículo/servicio (sin repLinea) respeta lo que el
    // negocio eligió en Configuración → Personalizar ticket.
    let qrUrlTicket: string | null;
    let qrEtiquetaTicket: string | undefined;
    if (repLinea?.repairPublicToken) {
      qrUrlTicket = `${window.location.origin}/rep/${repLinea.repairPublicToken}`;
      qrEtiquetaTicket = "Sigue tu reparación";
    } else if (!mostrarQRVenta) {
      qrUrlTicket = null;
      qrEtiquetaTicket = undefined;
    } else if (qrDestinoVenta === "CATALOGO") {
      qrUrlTicket = `${window.location.origin}/pub/${tenantSlug}`;
      qrEtiquetaTicket = "Catálogo y sucursales";
    } else if (qrUrlVenta) {
      // SITIO_WEB/PROMOCION/UBICACION/PERSONALIZADO — los 4 necesitan
      // Tenant.reciboQrUrl (validado al guardar en Configuración, ver
      // updateDatosTicket en app/actions/tenant.ts); si por lo que sea
      // todavía no está capturada, se cae a "sin QR" en vez de uno roto.
      qrUrlTicket = qrUrlVenta;
      qrEtiquetaTicket =
        qrDestinoVenta === "SITIO_WEB" ? "Visítanos en línea"
        : qrDestinoVenta === "PROMOCION" ? "Promoción especial"
        : qrDestinoVenta === "UBICACION" ? "Encuéntranos aquí"
        : qrEtiquetaVenta || "Más información";
    } else {
      qrUrlTicket = null;
      qrEtiquetaTicket = undefined;
    }

    // Caja rápida (2026-10-09): el carrito se limpia AL INSTANTE, no cuando
    // termina el guardado y la impresión — así el cajero ya puede escanear al
    // siguiente cliente mientras se registra esta venta. Todo lo que la venta
    // necesita ya quedó copiado arriba (renglones, cliente, método, monto) y
    // crearVentaAction recibe lo capturado en este render, no el estado nuevo.
    // Si el cobro falla se restaura más abajo (sin perder lo que ya se haya
    // escaneado del cliente siguiente). El método de pago vuelve a Efectivo
    // para que la siguiente venta nunca herede "Tarjeta" por descuido.
    const carritoPrevio = carrito;
    const clientePrevioId = clienteId;
    const montoRecibidoPrevio = montoRecibido;
    const mixtoPrevio = { efectivo: mixtoEfectivo, tarjeta: mixtoTarjeta, transferencia: mixtoTransferencia };
    if (cajaRapida) {
      limpiarCarrito();
      setClienteId(null);
      setClienteQuery("");
      setMetodoPago("efectivo");
      setCarritoAbierto(false);
      enfocarBusqueda();
    }

    startTransition(async () => {
      // try/catch: una caída de red no debe dejar la venta "en el aire" (en Caja
      // rápida el carrito ya se limpió, así que hay que poder restaurarlo).
      let res: Awaited<ReturnType<typeof crearVentaAction>>;
      try {
      res = await crearVentaAction({
        tenantSlug,
        branchId,
        customerId: clienteId,
        items: carrito.map((i) =>
          i.repairId
            ? { repairId: i.repairId, monto: i.precio, cantidad: 1 }
            : { productId: i.productId, cantidad: i.cantidad }
        ),
        metodoPago,
        montoRecibido: metodoPago === "efectivo" && montoIngresadoAlCobrar ? montoNum : undefined,
        mixto: metodoPago === "mixto" ? { efectivo: mEfec, tarjeta: mTarj, transferencia: mTrans } : undefined,
      });
      } catch {
        res = { ok: false, error: "No se pudo registrar la venta. Revisa tu conexión e intenta de nuevo." } as Awaited<ReturnType<typeof crearVentaAction>>;
      }

      if (res.ok) {
        setUltimaVenta({ folio: res.folio, total: res.total, cambio: res.cambio });

        // "Es imprescindible que toda venta genere un ticket" (Carlos,
        // 2026-09-21) — se imprime de una vez, sin esperar a que el usuario
        // pida un ticket aparte (mismo criterio que ya seguía la recepción
        // de una reparación, ver abrirTicketImprimible en
        // ReparacionesClient.tsx). El botón "Reimprimir ticket" de abajo es
        // el respaldo manual si el navegador bloqueó el pop-up.
        const recibo: ReciboData = {
          tipoDocumento: tipoDocumentoTicket,
          folio: res.folio,
          cliente: clienteTicket,
          telefono: clienteTelefonoTicket,
          sucursal: res.sucursal,
          atendioPor: res.atendioPor,
          renglones: renglonesTicket,
          subtotal: subtotalTicket,
          descuento: descuentoAplicado,
          iva: ivaTicket,
          total: res.total,
          metodoPago: METODO_PAGO_TEXTO_TICKET[metodoPagoAlCobrar],
          montoRecibido: metodoPagoAlCobrar === "efectivo" && montoIngresadoAlCobrar ? montoNum : null,
          cambio: res.cambio > 0 ? res.cambio : null,
          qrUrl: qrUrlTicket,
          qrEtiqueta: qrEtiquetaTicket,
        };
        setUltimoRecibo(recibo);
        await abrirReciboImprimible(recibo, negocio);

        if (cajaRapida) {
          // El carrito ya se limpió al cobrar (y puede traer ya al cliente
          // siguiente): aquí solo se devuelve el foco al buscador, que el
          // diálogo de impresión pudo haberse llevado.
          window.focus();
          busquedaRef.current?.focus();
        } else {
          limpiarCarrito();
          setClienteId(null);
          setClienteQuery("");
          setCarritoAbierto(false);
        }
        if (carritoTeniaReparacion) {
          router.replace(`/${tenantSlug}/pos`);
        } else {
          router.refresh();
        }
      } else {
        if (cajaRapida) {
          // Restaura la venta que no se pudo cobrar, SUMÁNDOLE lo que el cajero
          // ya haya escaneado del cliente siguiente (nada se pierde).
          setCarrito((actual) => unirCarritos(carritoPrevio, actual));
          setClienteId((actual) => actual ?? clientePrevioId);
          setMetodoPago(metodoPagoAlCobrar);
          setMontoRecibido(montoRecibidoPrevio);
          setMixtoEfectivo(mixtoPrevio.efectivo);
          setMixtoTarjeta(mixtoPrevio.tarjeta);
          setMixtoTransferencia(mixtoPrevio.transferencia);
        }
        setErrorVenta(res.error);
      }
    });
  };

  // Por qué el botón "Cobrar" está deshabilitado ahora mismo, para que el
  // usuario sepa en qué parte del proceso va (Carlos, 2026-09-21: "hay que
  // enfatizar cada paso del proceso para que el usuario sepa en qué parte
  // va") — null cuando ya se puede cobrar.
  const razonNoPuedeCobrar: string | null = !branchId
    ? "Selecciona una sucursal para continuar"
    : !cajaAbierta
    ? "La caja de esta sucursal está cerrada"
    : carrito.length === 0
    ? "Agrega al menos un producto o servicio al carrito"
    // 2026-10-05, hallazgo de auditoría: ver confirmaReparacionSinCobro/
    // hayReparacionEnCero más arriba — un renglón de reparación en $0 nunca
    // bloquea el cobro por accidente, pero sí exige marcar la casilla de
    // abajo a propósito.
    : hayReparacionEnCero && !confirmaReparacionSinCobro
    ? "El monto de la reparación es $0 — confirma la casilla de abajo si de verdad se entrega sin cobrar"
    // 2026-09-30: con "Monto recibido" ya opcional (ver montoIngresado más
    // arriba), esto solo puede dispararse cuando el cajero SÍ escribió un
    // monto y ese monto no alcanza — dejarlo en blanco ya nunca bloquea.
    : metodoPago === "efectivo" && faltaEfec
    ? "Lo que escribiste en \"Monto recibido\" no alcanza a cubrir el total"
    : metodoPago === "mixto" && !mixtoOk
    ? "Completa el desglose de pago hasta cubrir el total"
    : null;

  /* ── Sin sucursales activas: no se puede vender ── */
  if (branches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-10 text-center">
        <Building2 className="w-8 h-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm font-medium text-foreground mb-1">No hay sucursales activas</p>
        <p className="text-xs text-muted-foreground">Configura una sucursal en tu negocio para poder vender.</p>
      </div>
    );
  }

  /* ── Contenido del carrito ── */
  const carritoContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-foreground">Venta actual</span>
          {carrito.length > 0 && (
            <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">{totalItems}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {carrito.length > 0 && (
            <button onClick={limpiarCarrito} className="text-sm font-medium text-red-500 hover:text-red-600">Limpiar</button>
          )}
          <button onClick={() => setCarritoAbierto(false)} className="lg:hidden text-muted-foreground">
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Cliente */}
      <div className="relative px-5 py-2">
        {clienteSeleccionado ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-sm text-foreground min-w-0">
              <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="truncate font-medium">{clienteSeleccionado.name}</span>
              {isWholesaler && (
                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0">
                  Mayorista
                </span>
              )}
            </div>
            <button onClick={() => setClienteId(null)} title="Quitar cliente de esta venta" aria-label="Quitar cliente de esta venta" className="text-muted-foreground hover:text-foreground flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setClientePickerAbierto((v) => !v); setNuevoClienteAbierto(false); setErrorNuevoCliente(null); }}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary-text transition-colors"
          >
            <User className="w-4 h-4" />
            <span>Agregar cliente</span>
          </button>
        )}

        {clientePickerAbierto && !clienteSeleccionado && (
          <div className="absolute left-4 right-4 top-full mt-1 z-10 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
            {/* "+ Nuevo cliente" inline (2026-10-03, Modo Simple) — ver el
                comentario largo junto a clientesExtra más arriba. Reemplaza
                la búsqueda/lista por un formulario corto mientras está
                abierto; al crear, selecciona al cliente recién creado y
                cierra el picker entero, igual que elegir uno ya existente. */}
            {nuevoClienteAbierto ? (
              <div className="p-3 space-y-2" data-enter-zona>
                <p className="text-xs font-medium text-foreground">Nuevo cliente</p>
                <input
                  autoFocus
                  type="text"
                  value={nuevoClienteNombre}
                  onChange={(e) => setNuevoClienteNombre(e.target.value)}
                  placeholder="Nombre *"
                  className="w-full px-2.5 py-1.5 text-xs bg-muted border border-border rounded-md focus:outline-none text-foreground placeholder:text-muted-foreground"
                />
                <input
                  type="tel"
                  value={nuevoClienteTelefono}
                  onChange={(e) => setNuevoClienteTelefono(e.target.value)}
                  placeholder="Teléfono (opcional)"
                  className="w-full px-2.5 py-1.5 text-xs bg-muted border border-border rounded-md focus:outline-none text-foreground placeholder:text-muted-foreground"
                />
                {errorNuevoCliente && <p className="text-[11px] text-red-600">{errorNuevoCliente}</p>}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    data-enter-primario
                    onClick={handleCrearCliente}
                    disabled={creandoCliente}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-60"
                  >
                    {creandoCliente && <Loader2 className="w-3 h-3 animate-spin" />}
                    Crear y seleccionar
                  </button>
                  <button
                    onClick={() => { setNuevoClienteAbierto(false); setErrorNuevoCliente(null); }}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-md text-muted-foreground hover:bg-muted"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <input
                  autoFocus
                  type="text"
                  value={clienteQuery}
                  onChange={(e) => setClienteQuery(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="w-full px-3 py-2 text-xs bg-muted border-b border-border focus:outline-none text-foreground placeholder:text-muted-foreground"
                />
                <div className="max-h-40 overflow-y-auto">
                  <button
                    onClick={() => { setClienteId(null); setClientePickerAbierto(false); setClienteQuery(""); }}
                    className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
                  >
                    Cliente general (sin registrar)
                  </button>
                  {clientesFiltrados.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setClienteId(c.id); setClientePickerAbierto(false); setClienteQuery(""); }}
                      className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-muted truncate flex justify-between items-center"
                    >
                      <span className="truncate">{c.name}</span>
                      {c.isWholesaler && <span className="text-[10px] text-amber-700 font-medium">Mayorista</span>}
                    </button>
                  ))}
                  {clientesFiltrados.length === 0 && (
                    <p className="px-3 py-2 text-[12.5px] text-muted-foreground/70">Sin resultados</p>
                  )}
                </div>
                <button
                  onClick={abrirFormularioNuevoCliente}
                  className="w-full flex items-center gap-1.5 text-left px-3 py-2 text-xs font-medium text-primary-text hover:bg-muted border-t border-border"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Nuevo cliente{clienteQuery.trim() ? ` "${clienteQuery.trim()}"` : ""}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Aviso de "Cobrar y entregar" precargado desde Reparaciones
          (2026-09-25) — ok:false (repairId inválido/ya cobrado) o el
          carrito ya trae el renglón de la reparación. */}
      {errorRepairSeed && (
        <div className="mx-5 mt-2 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm text-red-600">{errorRepairSeed}</p>
            <Link href={`/${tenantSlug}/reparaciones`} className="text-xs font-medium text-red-700 underline">
              Volver a Reparaciones
            </Link>
          </div>
        </div>
      )}
      {carrito.some((i) => i.repairId) && (
        <div className="mx-5 mt-2 flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2" data-tour="pos-reparacion-aviso">
          <Wrench className="w-4 h-4 text-primary-text flex-shrink-0 mt-0.5" />
          <p className="text-xs text-foreground">
            Cobrando una reparación — la sucursal queda fija y el monto se puede ajustar en el renglón de abajo.
          </p>
        </div>
      )}

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-5 py-2">
        {carrito.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-8 text-center">
            <ShoppingCart className="w-9 h-9 text-muted-foreground/30 mb-2" />
            <p className="text-sm font-medium text-muted-foreground/70">El carrito está vacío</p>
            <p className="text-xs text-muted-foreground/50 mt-1">Selecciona productos del catálogo</p>
          </div>
        ) : (
          <div className="space-y-2">
            {carrito.map((item) =>
              item.repairId ? (
                // Renglón de una reparación — sin +/- (cantidad siempre 1):
                // el monto es editable directo y se puede quitar del carrito
                // (ver quitarDelCarrito/editarMontoReparacion arriba).
                <div key={item.productId} className="flex items-center gap-2 py-2.5 border-b border-border/60 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{item.nombre}</p>
                    <p className="text-xs text-muted-foreground">Cobro de reparación</p>
                  </div>
                  <div className="flex items-center gap-1.5" data-tour="pos-reparacion-monto">
                    <span className="text-xs text-muted-foreground">$</span>
                    <input
                      type="number"
                      value={item.precio}
                      onChange={(e) => editarMontoReparacion(item.productId, e.target.value)}
                      className="w-24 text-right px-2 py-1.5 border border-border rounded-lg text-sm font-semibold bg-muted focus:outline-none focus:border-primary text-foreground"
                    />
                  </div>
                  <button onClick={() => quitarDelCarrito(item.productId)}
                    title="Quitar del carrito"
                    className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-accent flex-shrink-0">
                    <X className="w-3.5 h-3.5 text-foreground" />
                  </button>
                </div>
              ) : (
                <div key={item.productId} className="flex items-center gap-2 py-2.5 border-b border-border/60 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{item.nombre}</p>
                    <p className="text-xs text-muted-foreground">{formatMXN(item.precio)} c/u</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => cambiarCantidad(item.productId, -1)}
                      className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-accent">
                      <Minus className="w-3.5 h-3.5 text-foreground" />
                    </button>
                    <span className="text-sm font-bold text-foreground w-6 text-center">{item.cantidad}</span>
                    <button onClick={() => cambiarCantidad(item.productId, 1)}
                      className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-accent">
                      <Plus className="w-3.5 h-3.5 text-foreground" />
                    </button>
                  </div>
                  <span className="text-sm font-bold text-foreground min-w-[56px] text-right">
                    {formatMXN(item.precio * item.cantidad)}
                  </span>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Footer — Totales y cobro */}
      <div className="border-t border-border p-5">
        {errorVenta && (
          <div className="mb-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600">{errorVenta}</p>
          </div>
        )}

        {ultimaVenta && (
          <div className="mb-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-emerald-700">✓ Venta {ultimaVenta.folio} registrada</p>
                <p className="text-xs text-emerald-600">
                  {formatMXN(ultimaVenta.total)}{ultimaVenta.cambio > 0 ? ` · Cambio: ${formatMXN(ultimaVenta.cambio)}` : ""}
                </p>
              </div>
              {ultimoRecibo && (
                <button
                  onClick={() => abrirReciboImprimible(ultimoRecibo, negocio)}
                  title="El ticket ya se imprimió solo al cobrar — usa esto si el navegador bloqueó esa ventana"
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-card border border-emerald-300 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold flex-shrink-0"
                >
                  <Printer className="w-3.5 h-3.5" /> Reimprimir ticket
                </button>
              )}
            </div>
          </div>
        )}

        {/* Totales — el monto Total es el número más importante del panel,
            se agranda a propósito (2026-09-23, misma petición de "textos
            grandes" de Carlos). */}
        <div className="space-y-1.5 mb-3">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Subtotal</span>
            <span className="text-sm text-foreground">{formatMXN(subtotal)}</span>
          </div>
          {descuentoAplicado > 0 && (
            <div className="flex justify-between">
              <span className="text-sm text-emerald-600 font-medium">Descuento</span>
              <span className="text-sm text-emerald-600 font-bold">- {formatMXN(descuentoAplicado)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">IVA</span>
            <span className="text-sm text-foreground">{formatMXN(iva)}</span>
          </div>
          <div className="h-px bg-border my-1" />
          <div className="flex justify-between items-baseline">
            <span className="text-base font-bold text-foreground">Total</span>
            <span className="text-2xl font-extrabold text-primary-text">{formatMXN(total)}</span>
          </div>
          <p className="text-xs text-muted-foreground text-right">Los precios ya incluyen IVA</p>
        </div>

        {/* Botones de método de pago — 2×2, sin emoji, un solo acento
            (2026-09-23, a petición de Carlos: "pocos botones... solo lo
            esencial" — antes cada método tenía su propio color, que sumaba
            ruido visual sin aportar información real). Estado seleccionado
            con relleno sólido (no un tinte tenue) para que se vea igual de
            "marcado" que las píldoras de categoría del catálogo — mismo
            ajuste de "contenedores marcados" del 2026-09-23. */}
        <div className="grid grid-cols-2 gap-2 mb-3" data-tour="pos-metodo-pago">
          {([
            { key: "efectivo", label: "Efectivo" },
            { key: "tarjeta", label: "Tarjeta" },
            { key: "transferencia", label: "Transferencia" },
            { key: "mixto", label: "Mixto" },
          ] as { key: MetodoPago; label: string }[]).map((m) => (
            <button key={m.key} onClick={() => handleMetodo(m.key)}
              className={`py-3 rounded-xl text-sm font-bold transition-colors ${
                metodoPago === m.key
                  ? "bg-primary text-primary-foreground shadow-[0_2px_6px_rgba(0,0,0,0.14)]"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Panel Efectivo — monto recibido y cambio */}
        {metodoPago === "efectivo" && carrito.length > 0 && (
          <div className="mb-3 bg-primary/5 border border-primary/20 rounded-xl p-3.5 space-y-2.5">
            {/* 2026-09-24, a petición de Carlos: la leyenda "— escríbelo para
                continuar" junto con el botón "Exacto" y el input ya no cabían
                en una sola línea dentro del ancho fijo del carrito (w-80) —
                como el texto tenía whitespace-nowrap y la fila no envolvía,
                en vez de acomodarse/apilarse empujaba TODA la página a
                desbordarse de lado (mismo síntoma que el min-w-0 de arriba,
                pero aquí adentro del carrito). Se quita la leyenda por ser
                redundante (el aviso rojo debajo del botón Cobrar ya dice
                "Escribe cuánto recibiste...") y de paso se le agrega
                flex-wrap a la fila como respaldo, para que si algo no cabe se
                apile en vez de desbordar. */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">
                Monto recibido <span className="text-muted-foreground/60">(opcional)</span>
              </span>
              <div className="flex items-center gap-2">
                {/* Atajo para el caso más común (pago exacto) — a propósito
                    ya NO se usa el total como placeholder (Carlos,
                    2026-09-21: "como ya aparece 'pre llenado' da la
                    impresión de que ya está hecho"); un botón explícito que
                    el usuario debe tocar deja claro que es una acción, no un
                    valor ya capturado. */}
                <button type="button" onClick={() => setMontoRecibido(String(total))}
                  className="px-2.5 py-2 border border-primary/30 hover:bg-primary/10 text-primary-text rounded-lg text-sm font-semibold whitespace-nowrap">
                  Exacto
                </button>
                <input
                  type="number"
                  value={montoRecibido}
                  onChange={(e) => setMontoRecibido(e.target.value)}
                  // 2026-09-30, a petición de Carlos ("que el proceso vaya
                  // siguiendo su curso con Enter"): con el campo ya no
                  // obligatorio, Enter aquí cierra la venta directo —
                  // igual que si el cajero le diera clic a "Cobrar".
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && puedeCobar) {
                      e.preventDefault();
                      handleCobrar();
                    }
                  }}
                  placeholder="$0"
                  // Ya NO autoFocus (2026-09-30): con el atajo nuevo de
                  // "escribe y Enter" en el buscador de productos de arriba,
                  // este campo apareciendo y robando el foco justo al
                  // agregar el primer artículo cortaba esa cadena — el
                  // cajero quería seguir tecleando el SIGUIENTE producto, no
                  // el monto. Ahora el foco se queda donde el cajero lo dejó.
                  className="w-28 text-right px-2.5 py-2 border border-primary/40 rounded-lg text-sm font-semibold focus:outline-none focus:border-primary bg-card text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>
            {montoIngresado && (
              <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${
                cambio > 0 ? "bg-emerald-50 border border-emerald-200" :
                faltaEfec ? "bg-red-50 border border-red-200" :
                "bg-muted border border-border"
              }`}>
                <span className={`text-sm font-medium ${
                  cambio > 0 ? "text-emerald-700" : faltaEfec ? "text-red-600" : "text-muted-foreground"
                }`}>
                  {cambio > 0 ? "Cambio" : faltaEfec ? "Falta" : "Exacto"}
                </span>
                <span className={`text-base font-bold ${
                  cambio > 0 ? "text-emerald-700" : faltaEfec ? "text-red-600" : "text-foreground"
                }`}>
                  {cambio > 0 ? formatMXN(cambio) : faltaEfec ? formatMXN(total - montoNum) : "—"}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Panel Mixto */}
        {metodoPago === "mixto" && carrito.length > 0 && (
          <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-2.5">
            <p className="text-sm font-bold text-amber-700 mb-1">Desglose de pago</p>

            {[
              { label: "Efectivo", value: mixtoEfectivo, setter: setMixtoEfectivo },
              { label: "Tarjeta", value: mixtoTarjeta, setter: setMixtoTarjeta },
              { label: "Transferencia", value: mixtoTransferencia, setter: setMixtoTransferencia },
            ].map((f) => (
              <div key={f.label} className="flex items-center justify-between gap-2">
                <span className="text-sm text-amber-700/80 whitespace-nowrap">{f.label}</span>
                <input
                  type="number"
                  value={f.value}
                  onChange={(e) => f.setter(e.target.value)}
                  placeholder="$0"
                  className="w-28 text-right px-2.5 py-2 border border-amber-200 rounded-lg text-sm font-semibold focus:outline-none focus:border-amber-400 bg-card text-foreground placeholder:text-muted-foreground"
                />
              </div>
            ))}

            <div className="h-px bg-amber-200" />

            <div className="flex items-center justify-between">
              <span className="text-sm text-amber-700 font-semibold">Total cubierto</span>
              <span className={`text-base font-bold ${mixtoOk ? "text-emerald-600" : "text-amber-700"}`}>
                {formatMXN(totalMixto)} {mixtoOk ? "✓" : ""}
              </span>
            </div>

            {!mixtoOk && totalMixto > 0 && (
              <div className="flex items-center justify-between px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                <span className="text-sm text-red-600">Falta</span>
                <span className="text-base font-bold text-red-600">{formatMXN(faltaMixto)}</span>
              </div>
            )}

            {cambioMixto > 0 && (
              <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                <span className="text-sm text-emerald-700 font-semibold">Cambio</span>
                <span className="text-base font-bold text-emerald-700">{formatMXN(cambioMixto)}</span>
              </div>
            )}
          </div>
        )}

        {/* Confirmación de "reparación en $0" (2026-10-05, hallazgo de
            auditoría — ver hayReparacionEnCero/confirmaReparacionSinCobro
            más arriba). Solo aparece cuando de verdad hace falta: un
            renglón de reparación en el carrito con su monto en $0. */}
        {hayReparacionEnCero && (
          <label className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmaReparacionSinCobro}
              onChange={(e) => setConfirmaReparacionSinCobro(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-amber-600 flex-shrink-0"
            />
            <span className="text-xs text-amber-700">
              Confirmo que esta reparación se entrega <strong>sin cobrar nada</strong> (monto en $0). Si no era la
              intención, edita el monto en el renglón de arriba.
            </span>
          </label>
        )}

        {/* Botón cobrar — el elemento más grande y llamativo del panel a
            propósito (2026-09-23, lenguaje visual nuevo del POS: "el botón
            de Cobrar es el elemento más grande y llamativo de la
            pantalla"). */}
        <button
          ref={cobrarBtnRef}
          data-tour="pos-cobrar"
          onClick={handleCobrar}
          disabled={!puedeCobar}
          className="w-full h-16 bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed text-primary-foreground font-bold rounded-2xl text-lg transition-colors flex items-center justify-center gap-2.5"
        >
          {isPending ? (
            <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
          ) : (
            <>
              <Check className="w-5 h-5" />
              {carrito.length > 0 ? `Cobrar ${formatMXN(total)}` : "Cobrar"}
            </>
          )}
        </button>
        {razonNoPuedeCobrar && !isPending && (
          <div className="mt-2">
            <p className="text-xs text-amber-600 text-center">{razonNoPuedeCobrar}</p>

            {/* Abrir caja sin salir de POS (2026-10-03, Modo Simple — ver
                el comentario largo junto a activarModoSimpleAction,
                app/actions/modulos-tenant-actions.ts). Antes esto era solo
                un <Link href="/caja">, que sacaba al cajero de la pantalla
                de venta — para el negocio de 1-2 personas, POS debe ser la
                única ventana que necesita abrir en todo el día. Misma
                acción (abrirCajaAction) que usa Caja/CajaClient.tsx, solo
                que en un formulario corto aquí mismo. */}
            {branchId && !cajaAbierta && !abrirCajaAbierto && (
              <button
                onClick={() => setAbrirCajaAbierto(true)}
                className="mt-1.5 w-full text-center text-xs font-medium text-amber-700 underline"
              >
                Abrir caja aquí
              </button>
            )}

            {branchId && !cajaAbierta && abrirCajaAbierto && (
              <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2" data-enter-zona>
                <p className="text-xs font-medium text-foreground">Abrir caja</p>
                <input
                  autoFocus
                  type="number"
                  min={0}
                  step="0.01"
                  value={montoAperturaInput}
                  onChange={(e) => setMontoAperturaInput(e.target.value)}
                  placeholder="Monto de apertura (efectivo inicial)"
                  className="w-full px-2.5 py-1.5 text-xs bg-card border border-border rounded-md focus:outline-none text-foreground placeholder:text-muted-foreground"
                />
                <input
                  type="text"
                  value={notasAperturaInput}
                  onChange={(e) => setNotasAperturaInput(e.target.value)}
                  placeholder="Notas (opcional)"
                  className="w-full px-2.5 py-1.5 text-xs bg-card border border-border rounded-md focus:outline-none text-foreground placeholder:text-muted-foreground"
                />
                {errorAbrirCaja && <p className="text-[11px] text-red-600">{errorAbrirCaja}</p>}
                <div className="flex items-center gap-2">
                  <button
                    data-enter-primario
                    onClick={handleAbrirCaja}
                    disabled={abriendoCaja}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-60"
                  >
                    {abriendoCaja && <Loader2 className="w-3 h-3 animate-spin" />}
                    Abrir caja
                  </button>
                  <button
                    onClick={() => { setAbrirCajaAbierto(false); setErrorAbrirCaja(null); }}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-md text-muted-foreground hover:bg-muted"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex flex-col lg:flex-row h-full bg-muted">

      {/* Panel izquierdo — Catálogo.
          2026-09-25 — rediseño visual completo del sistema: Carlos compartió
          capturas de terminales POS "tipo Toshiba" (ventanas limpias, texto
          grande, solo la información necesaria, alertas y llamadas a la
          acción emergentes) y pidió reemplazar el lenguaje "launcher de
          Windows Phone/Metro" de abajo — probado en un mockup aparte que
          aprobó explícitamente — por tarjetas blancas sobre un fondo neutro.
          ESTO REEMPLAZA la decisión de 2026-09-24 de pintar TODA la ventana
          con --primary: ahora el fondo de este panel es neutro (hereda
          bg-muted del contenedor) y --primary/--chip-N/--tile-fg se usan de
          forma puntual (botón Cobrar, ficha activa, insignia de ícono por
          categoría), no como color de ventana completa. Los tokens de tema
          en sí (los 10 temas + Personalizado de Configuración) NO cambiaron
          — solo dónde se aplican. */}
      {/* min-w-0 es necesario aquí (2026-09-24, a petición de Carlos: vio que
          la pantalla completa se corría/recortaba horizontalmente en vez de
          acomodar el contenido): sin esto, un flex item por default NUNCA se
          encoge más allá del ancho mínimo de su contenido (min-width: auto
          es el default de flexbox, no 0) — como este panel vive junto al
          carrito de ancho fijo (w-80) dentro de un flex lg:flex-row, cuando
          el contenido interno (píldoras de categoría, buscador, etc.) pedía
          más espacio del disponible, en vez de acomodarse/apilarse adentro,
          empujaba TODA la fila a desbordar y aparecía una barra de scroll
          horizontal en la página completa. Con min-w-0 el panel sí se puede
          encoger al ancho real disponible, y cada hijo (la barra de
          categorías ya trae su propio overflow-x-auto, la cuadrícula de
          productos ya se ajusta con sus columnas responsivas) se acomoda
          dento de ese espacio en vez de forzar el desbordamiento global. */}
      <div className="flex-1 flex flex-col lg:border-r lg:border-border min-h-0 min-w-0">

        <div className="flex items-center gap-2.5 px-5 py-4 flex-wrap">
          <span className="text-lg font-bold text-foreground w-full sm:w-auto sm:mr-2">
            {label(labels, "module.pos.name")}
          </span>

          {branches.length > 1 && (
            <div className="flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <select value={branchId ?? ""} onChange={(e) => setBranchId(e.target.value)}
                disabled={sucursalBloqueadaPorReparacion}
                title={sucursalBloqueadaPorReparacion ? "Fija a la sucursal de la reparación que se está cobrando" : undefined}
                className="px-2.5 py-2 rounded-lg text-sm font-medium bg-card border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60 disabled:cursor-not-allowed">
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}

          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
            <input
              ref={busquedaRef}
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              // 2026-09-30, a petición de Carlos ("que se pueda seleccionar
              // los artículos con la tecla Tab y que el proceso vaya
              // siguiendo su curso con Enter" / "el focus deberia cambiar al
              // botón Cobrar"): Enter agrega directo el PRIMER resultado
              // filtrado (igual que un lector de código de barras), limpia
              // el campo, y manda el foco al botón "Cobrar" — venta de un
              // solo artículo en dos Enters: uno para agregarlo, otro para
              // cobrar, sin pasar por ningún control de cantidad.
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                // Caja rápida (2026-10-09): Enter con el buscador VACÍO cobra.
                // Se ignora un instante tras agregar un artículo (algunos
                // lectores mandan un Enter extra pegado al código).
                const decision = decidirEnterBuscador({
                  cajaRapida,
                  busqueda,
                  hayArticulos: carrito.length > 0,
                  msDesdeUltimoAgregado: Date.now() - ultimoAgregadoRef.current,
                  cobrando: isPending,
                  puedeCobrar: puedeCobar,
                  razonNoPuedeCobrar,
                });
                if (decision.tipo === "cobrar") { handleCobrar(); return; }
                if (decision.tipo === "aviso") { setAvisoStock(decision.mensaje); return; }
                if (decision.tipo === "ignorar") return;
                // En Caja rápida un código de barras o SKU EXACTO gana sobre la
                // lista filtrada, aunque haya una categoría seleccionada.
                const consulta = busqueda.trim();
                const exacto = cajaRapida ? buscarCodigoExacto(productos, consulta) : undefined;
                const primero = exacto ?? productosFiltrados[0];
                if (!primero) {
                  if (cajaRapida && consulta !== "") {
                    setAvisoStock(`No se encontró ningún producto con "${consulta}".`);
                    busquedaRef.current?.select();
                  }
                  return;
                }
                // 2026-10-05: si no se agregó nada (sin stock, o ya se
                // agregó todo el disponible — ver agregarAlCarrito), el
                // aviso correspondiente ya quedó visible; no tiene caso
                // borrar lo que el cajero escribió ni saltar el foco a
                // Cobrar como si la venta hubiera avanzado.
                if (!agregarAlCarrito(primero)) {
                  if (cajaRapida) busquedaRef.current?.select();
                  return;
                }
                setBusqueda("");
                if (cajaRapida) {
                  // El foco se QUEDA en el buscador: siguiente artículo, o
                  // Enter con el campo vacío para cobrar.
                  ultimoAgregadoRef.current = Date.now();
                  return;
                }
                // setTimeout(0), no llamada directa: el botón "Cobrar" puede
                // estar deshabilitado (carrito todavía vacío) en el momento
                // exacto de este clic/Enter — un <button disabled> no puede
                // recibir foco. React recién quita el disabled cuando
                // procesa el setCarrito de agregarAlCarrito y vuelve a
                // renderizar, lo cual pasa DESPUÉS de que este handler
                // termine; el setTimeout(0) espera ese repintado antes de
                // intentar el foco.
                setTimeout(() => cobrarBtnRef.current?.focus(), 0);
              }}
              placeholder={cajaRapida && carrito.length > 0 ? `Enter con el campo vacío = Cobrar ${formatMXN(total)}` : "Buscar producto o servicio"}
              className="w-full pl-11 pr-4 py-3 rounded-full text-base bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
          </div>
          <button
            onClick={() => { setErrorEscaner(null); setMostrarEscaner(true); }}
            title="Escanear código de barras"
            aria-label="Escanear código de barras"
            className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-card border border-border hover:bg-muted rounded-full text-foreground transition-colors"
          >
            <Barcode className="w-5 h-5" />
          </button>
        </div>

        {/* Fila de Reparaciones + píldoras de categoría. Reparaciones vive
            FUERA del div con overflow-x-auto (2026-10-01, a petición de
            Carlos: "fijarla al lado izquierdo", confirmado como "fija de
            verdad, nunca se mueve con el scroll") — así queda siempre
            visible sin importar cuánto se recorran las píldoras de abajo,
            en vez de solo ser la primera en orden (que seguiría scrolleando
            con las demás). */}
        <div className="flex items-center gap-2 px-5 py-1.5">
          {/* Acceso directo a Reparaciones (2026-09-30, a petición de
              Carlos: "agregar un acceso a Reparaciones junto a las
              burbujas") — a propósito con un estilo distinto (borde
              punteado, ícono) al de las píldoras de abajo: esto NO filtra
              el catálogo, navega a otro módulo, así que no debe verse como
              una opción más de categoría. Oculto si el negocio desactivó
              el módulo (rubros sin taller, ver modulos-rubro.ts). */}
          {mostrarAccesoReparaciones && (
            <Link href={`/${tenantSlug}/reparaciones`}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap border border-dashed border-primary/50 text-primary-text hover:bg-primary/5 transition-colors flex-shrink-0">
              <Wrench className="w-3.5 h-3.5" />
              {label(labels, "module.repair.name")}
            </Link>
          )}
          {/* Píldoras de categoría — mismo patrón "activo = relleno con
              --primary" que el resto de la app (2026-09-25; antes iban
              invertidas para resaltar sobre la ventana a color sólido que ya
              no existe, ver el comentario de arriba). Incluye "Recientes"
              (sintética, ver categoriasOpciones arriba) igual que cualquier
              otra píldora — si el scroll se la lleva, Reparaciones de todas
              formas se queda fija a la izquierda. */}
          <div className="flex gap-2 overflow-x-auto flex-1 min-w-0">
            {categoriasOpciones.map((cat) => (
              <button key={cat.id ?? "todos"} onClick={() => setCategoriaActiva(cat.id)}
                className={`px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors flex-shrink-0 ${
                  categoriaActiva === cat.id
                    ? "bg-primary text-primary-foreground shadow-[0_2px_6px_rgba(0,0,0,0.14)]"
                    : "bg-card border border-border text-muted-foreground hover:border-primary/40"
                }`}>
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {productosFiltrados.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
            <Search className="w-9 h-9 text-muted-foreground/40 mb-2" />
            <p className="text-base font-semibold text-foreground mb-1">Sin resultados</p>
            <p className="text-sm text-muted-foreground">
              {productos.length === 0
                ? "Aún no hay productos en el catálogo."
                : categoriaActiva === RECIENTES_ID
                ? "Aún no hay ventas registradas."
                : "Prueba con otra búsqueda o categoría."}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5 content-start items-start pb-24 lg:pb-4">
            {productosFiltrados.map((producto, idxProducto) => {
              const stock = stockDe(producto);
              const agotado = !producto.isService && stock <= 0;
              const precioActivo = (isWholesaler && producto.wholesalePrice != null && producto.wholesalePrice > 0) ? producto.wholesalePrice : producto.price;
              // "Seleccionado" = ya está en el carrito actual (2026-09-23, a
              // petición de Carlos: "efecto de mouseover o select para que
              // lo ilumine cuando se pase el cursor o se seleccione") — el
              // tile se queda iluminado mientras tenga cantidad > 0, no solo
              // al pasar el cursor, y muestra cuántos lleva en una insignia
              // — antes la única forma de saber si ya lo habías agregado
              // era mirar la lista del carrito aparte.
              const enCarrito = carrito.find((i) => i.productId === producto.id);
              const cantidadEnCarrito = enCarrito?.cantidad ?? 0;
              const chip = producto.categoryId ? chipPorCategoria.get(producto.categoryId) ?? null : null;
              // Ficha horizontal por categoría (2026-09-26, a petición de
              // Carlos, igual a CatalogoClient.tsx: ícono con fondo de color
              // a la izquierda, información y stock a la derecha. El color
              // (--chip-N, o --primary sin categoría) pinta el bloque del
              // ícono; --tile-fg es el color de ícono fijo del tema.
              //
              // NOTA sobre el items-start del grid de arriba: sin esa clase,
              // CSS Grid estira cada ficha a la altura de su fila por
              // default y, combinado con este layout horizontal (flex
              // anidado sin alto explícito), el navegador podía colapsar
              // cada ficha.
              //
              // NOTA sobre "overflow-hidden" (2026-09-26, causa real del
              // traslape masivo que solo aparecía en la pestaña "Todos"):
              // con cientos de fichas visibles a la vez (Todos junta TODAS
              // las categorías; una categoría sola nunca llega a esa
              // cantidad, por eso Catálogo — que siempre filtra por una sola
              // categoría — nunca lo mostró), `overflow-hidden` en CADA
              // ficha individual fuerza una capa de composición GPU por
              // ficha, y con 200+ fichas el navegador terminaba pintando mal
              // — el layout medido por JS (getBoundingClientRect) siempre
              // fue correcto, pero los píxeles reales en pantalla no. Se
              // comprobó en vivo quitando overflow-hidden: el problema
              // desaparece por completo. Como nada dentro de la ficha
              // realmente se desborda (el nombre ya se recorta solo via
              // line-clamp, el SKU via truncate), no hacía falta ese
              // overflow-hidden para nada más que redondear la esquina
              // izquierda del bloque de ícono — eso ahora se logra
              // redondeando esa esquina directamente en el propio bloque
              // (rounded-l-xl más abajo), sin necesitar clip del padre.
              const fichaBg = chip ? `var(--chip-${chip})` : "var(--primary)";
              return (
                <button key={producto.id} data-tour={idxProducto === 0 ? "pos-producto" : undefined} onClick={() => { agregarAlCarrito(producto); setTimeout(() => (cajaRapida ? busquedaRef.current : cobrarBtnRef.current)?.focus(), 0); }} disabled={agotado}
                  className={`relative flex items-stretch rounded-xl bg-card border transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 active:scale-[0.98] hover:shadow-[0_2px_10px_rgba(0,0,0,0.06)] ${
                    cantidadEnCarrito > 0 ? "border-primary ring-2 ring-primary/25" : "border-border hover:border-primary/40"
                  }`}>
                  {cantidadEnCarrito > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-[24px] h-6 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center leading-none shadow-sm z-10">
                      {cantidadEnCarrito}
                    </span>
                  )}
                  <div className="relative w-20 sm:w-24 flex-shrink-0 rounded-l-xl flex items-center justify-center"
                    style={{ backgroundColor: fichaBg, color: "var(--tile-fg)" }}>
                    {/* imageClassName trae su propio rounded-l-xl (no
                        overflow-hidden en el contenedor) — mismo criterio que
                        ya se usó para arreglar el bug real de rasterizado de
                        Chrome con cientos de fichas a la vez en esta pestaña,
                        ver el historial largo más arriba en este archivo. */}
                    <ProductoIcono value={producto.emoji} imageUrl={producto.image} className="w-7 h-7 sm:w-8 sm:h-8" imageClassName="absolute inset-0 w-full h-full object-cover rounded-l-xl" />
                  </div>
                  <div className="flex-1 min-w-0 p-2 sm:p-2.5 flex flex-col justify-center gap-0.5">
                    <p className="text-xs font-medium text-foreground leading-tight line-clamp-2">{producto.name}</p>
                    <p className="text-[10.5px] text-muted-foreground truncate">{producto.sku || "Sin SKU"}</p>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <div className="flex items-baseline gap-1.5 min-w-0">
                        <span className="text-xs font-bold text-primary-text truncate">{formatMXN(precioActivo)}</span>
                        {precioActivo < producto.price && (
                          <span className="text-[10px] text-muted-foreground line-through truncate">{formatMXN(producto.price)}</span>
                        )}
                      </div>
                      {!producto.isService && (
                        <span className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap ${
                          agotado ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                        }`}>
                          {agotado ? "Agotado" : `Stock: ${stock}`}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Carrito desktop */}
      <div className="hidden lg:flex w-80 flex-col bg-card">
        {carritoContent}
      </div>

      {/* Botón flotante móvil */}
      {!carritoAbierto && (
        <button onClick={() => setCarritoAbierto(true)}
          className="lg:hidden fixed bottom-4 right-4 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center gap-2 px-5 py-3.5 z-50">
          <ShoppingCart className="w-5 h-5" />
          {totalItems > 0 ? (
            <>
              <span className="text-base font-bold">{formatMXN(total)}</span>
              <span className="bg-primary-foreground text-primary-text text-xs font-bold px-2 py-0.5 rounded-full">{totalItems}</span>
            </>
          ) : (
            <span className="text-base font-semibold">Carrito</span>
          )}
        </button>
      )}

      {/* Panel móvil */}
      {carritoAbierto && (
        <>
          <div className="lg:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setCarritoAbierto(false)} />
          <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-card rounded-t-2xl z-50 flex flex-col max-h-[85vh] shadow-xl">
            <div className="flex justify-center py-2">
              <div className="w-10 h-1 bg-border rounded-full" />
            </div>
            {carritoContent}
          </div>
        </>
      )}

      {mostrarEscaner && (
        <EscanearModal
          onCerrar={() => { setMostrarEscaner(false); setErrorEscaner(null); }}
          onCodigoDetectado={handleCodigoEscaneado}
          error={errorEscaner}
        />
      )}

      {/* Aviso flotante de "no se agregó nada por tope de stock" (2026-10-05,
          hallazgo de auditoría — ver avisoStock arriba). Vive al nivel raíz
          (no dentro del panel de catálogo ni del carrito) para que se vea
          igual sin importar si el cajero está tocando una ficha o el "+" del
          carrito, en escritorio o en la hoja móvil. Se autodestruye solo a
          los pocos segundos. */}
      {avisoStock && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-[92vw] flex items-center gap-2 bg-amber-50 border border-amber-300 text-amber-800 rounded-xl shadow-lg px-4 py-2.5"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="text-xs font-medium">{avisoStock}</span>
        </div>
      )}
    </div>
  );
}