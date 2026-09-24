"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, ShoppingCart, Barcode, Plus, Minus, X, Check,
  User, ChevronDown, Building2, AlertTriangle, Printer,
} from "lucide-react";
import type { PosData, ProductoPOS } from "@/lib/pos-data";
import { label, type LabelDictionary } from "@/lib/labels";
import { crearVentaAction, type MetodoPago } from "@/app/actions/pos-actions";
import { ProductoIcono } from "@/lib/catalogo-iconos";
import { CANTIDAD_CHIPS_CATEGORIA } from "@/lib/theme-presets";
import { abrirReciboImprimible, nombreNegocioDeSlug, type ReciboData } from "@/lib/recibo-imprimible";
import EscanearModal from "./EscanearModal";

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
}

type CartItem = {
  productId: string;
  nombre: string;
  precio: number;
  taxRate: number;
  cantidad: number;
  isService: boolean;
};

const SIN_CATEGORIA_ID = "__sin_categoria__";

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

export default function POSClient({ data, labels, branches, branchInicial, tenantSlug }: POSClientProps) {
  const { categorias, productos, clientes, cajaAbiertaPorSucursal } = data;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [branchId, setBranchId] = useState<string | null>(branchInicial);
  const [busqueda, setBusqueda] = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);
  const [carrito, setCarrito] = useState<CartItem[]>([]);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("efectivo");
  const [carritoAbierto, setCarritoAbierto] = useState(false);

  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clientePickerAbierto, setClientePickerAbierto] = useState(false);
  const [clienteQuery, setClienteQuery] = useState("");

  const [montoRecibido, setMontoRecibido] = useState("");
  const [mixtoEfectivo, setMixtoEfectivo] = useState("");
  const [mixtoTarjeta, setMixtoTarjeta] = useState("");
  const [mixtoTransferencia, setMixtoTransferencia] = useState("");

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

  const stockDe = (p: ProductoPOS) =>
    p.isService ? Infinity : (branchId ? p.stockPorSucursal[branchId] ?? 0 : 0);

  // 2026-09-22, a petición de Carlos: no se puede cobrar si la sucursal
  // seleccionada no tiene una caja abierta (ver el comentario largo en
  // crearVentaAction, pos-actions.ts — esa es la validación que de verdad
  // importa; esto solo evita que el cajero llene todo el carrito para
  // enterarse hasta el final).
  const cajaAbierta = branchId ? cajaAbiertaPorSucursal[branchId] ?? false : false;

  /* ── Categorías (con "Todos" y "Sin categoría" sintéticas) ── */
  const hayNoCategorizados = productos.some((p) => p.categoryId === null);
  const categoriasOpciones = [
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
        : p.categoryId === categoriaActiva;
    // También busca por SKU/código de barras, no solo por nombre — así
    // un lector físico de código de barras (que "escribe" el código en
    // cualquier input enfocado) ya funciona aquí sin abrir el escáner de
    // cámara siquiera, con solo tener el foco en este buscador.
    const busquedaNorm = busqueda.toLowerCase();
    const matchSearch =
      p.name.toLowerCase().includes(busquedaNorm) ||
      (!!p.sku && p.sku.toLowerCase().includes(busquedaNorm)) ||
      (!!p.barcode && p.barcode.toLowerCase().includes(busquedaNorm));
    return matchCat && matchSearch;
  });

  // i.precio es el precio de lista (el que ve el cliente en el catálogo) y
  // YA incluye IVA — el total a cobrar es exactamente ese precio × cantidad,
  // nunca precio + IVA encima. Subtotal/IVA aquí son solo el desglose
  // informativo (se calcula hacia atrás, precio ÷ (1 + tasa)) para que el
  // cliente vea qué parte de lo que paga corresponde a IVA — igual criterio
  // que crearVentaAction en el servidor (fuente de verdad real de la venta).
  const total = Math.round(carrito.reduce((s, i) => s + i.precio * i.cantidad, 0) * 100) / 100;
  const subtotal = Math.round(
    carrito.reduce((s, i) => s + (i.precio * i.cantidad) / (1 + i.taxRate / 100), 0) * 100
  ) / 100;
  const iva = Math.round((total - subtotal) * 100) / 100;
  const totalItems = carrito.reduce((s, i) => s + i.cantidad, 0);

  const montoNum = parseFloat(montoRecibido.replace(/,/g, "")) || 0;
  const cambio = montoNum > total ? montoNum - total : 0;
  const faltaEfec = montoNum < total && montoNum > 0;

  const mEfec = parseFloat(mixtoEfectivo.replace(/,/g, "")) || 0;
  const mTarj = parseFloat(mixtoTarjeta.replace(/,/g, "")) || 0;
  const mTrans = parseFloat(mixtoTransferencia.replace(/,/g, "")) || 0;
  const totalMixto = mEfec + mTarj + mTrans;
  const faltaMixto = total - totalMixto;
  const cambioMixto = totalMixto > total ? totalMixto - total : 0;
  const mixtoOk = totalMixto >= total;

  const puedeCobar =
    !!branchId &&
    cajaAbierta &&
    carrito.length > 0 &&
    !isPending &&
    (metodoPago === "tarjeta" ||
      metodoPago === "transferencia" ||
      (metodoPago === "efectivo" && montoNum >= total) ||
      (metodoPago === "mixto" && mixtoOk));

  const clienteSeleccionado = clientes.find((c) => c.id === clienteId) ?? null;
  const clientesFiltrados = clientes
    .filter((c) => c.name.toLowerCase().includes(clienteQuery.toLowerCase()))
    .slice(0, 8);

  /* ── Acciones ── */
  const agregarAlCarrito = (p: ProductoPOS) => {
    const disponible = stockDe(p);
    if (!p.isService && disponible <= 0) return;
    setUltimaVenta(null);
    setErrorVenta(null);
    setCarrito((prev) => {
      const existe = prev.find((i) => i.productId === p.id);
      if (existe) {
        if (!p.isService && existe.cantidad + 1 > disponible) return prev;
        return prev.map((i) => (i.productId === p.id ? { ...i, cantidad: i.cantidad + 1 } : i));
      }
      return [...prev, { productId: p.id, nombre: p.name, precio: p.price, taxRate: p.taxRate, cantidad: 1, isService: p.isService }];
    });
  };

  // Se llama con lo que detecta la cámara de EscanearModal.tsx (o lo que
  // el cajero escribió a mano ahí mismo). Busca el producto por barcode
  // exacto o, si no hay match, por SKU exacto (sin distinguir mayúsculas)
  // — un código de barras real nunca es un match parcial, así que aquí sí
  // se compara completo, a diferencia del buscador de texto de arriba.
  const handleCodigoEscaneado = (codigoCrudo: string) => {
    const codigo = codigoCrudo.trim();
    if (!codigo) return;

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
    if (!producto.isService && stockDe(producto) <= 0) {
      setErrorEscaner(`"${producto.name}" no tiene stock disponible en esta sucursal.`);
      return;
    }
    agregarAlCarrito(producto);
    setErrorEscaner(null);
    setMostrarEscaner(false);
  };

  const cambiarCantidad = (productId: string, delta: number) => {
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

  const handleCobrar = () => {
    if (!puedeCobar || !branchId) return;
    setErrorVenta(null);

    // Snapshot ANTES de limpiarCarrito()/setClienteId(null) — el ticket
    // necesita los renglones y el cliente tal como estaban al momento de
    // cobrar, no el carrito ya vacío que queda después.
    const renglonesTicket = carrito.map((i) => ({ nombre: i.nombre, cantidad: i.cantidad, precioUnitario: i.precio }));
    const clienteTicket = clienteSeleccionado?.name ?? null;
    const metodoPagoAlCobrar = metodoPago;
    const subtotalTicket = subtotal;
    const ivaTicket = iva;

    startTransition(async () => {
      const res = await crearVentaAction({
        tenantSlug,
        branchId,
        customerId: clienteId,
        items: carrito.map((i) => ({ productId: i.productId, cantidad: i.cantidad })),
        metodoPago,
        montoRecibido: metodoPago === "efectivo" ? montoNum : undefined,
        mixto: metodoPago === "mixto" ? { efectivo: mEfec, tarjeta: mTarj, transferencia: mTrans } : undefined,
      });

      if (res.ok) {
        setUltimaVenta({ folio: res.folio, total: res.total, cambio: res.cambio });

        // "Es imprescindible que toda venta genere un ticket" (Carlos,
        // 2026-09-21) — se imprime de una vez, sin esperar a que el usuario
        // pida un ticket aparte (mismo criterio que ya seguía la recepción
        // de una reparación, ver abrirTicketImprimible en
        // ReparacionesClient.tsx). El botón "Reimprimir ticket" de abajo es
        // el respaldo manual si el navegador bloqueó el pop-up.
        const recibo: ReciboData = {
          tipoDocumento: "Venta",
          folio: res.folio,
          cliente: clienteTicket,
          telefono: null,
          renglones: renglonesTicket,
          subtotal: subtotalTicket,
          iva: ivaTicket,
          total: res.total,
          metodoPago: METODO_PAGO_TEXTO_TICKET[metodoPagoAlCobrar],
          montoRecibido: metodoPagoAlCobrar === "efectivo" ? montoNum : null,
          cambio: res.cambio > 0 ? res.cambio : null,
        };
        setUltimoRecibo(recibo);
        abrirReciboImprimible(recibo, nombreNegocioDeSlug(tenantSlug));

        limpiarCarrito();
        setClienteId(null);
        setClienteQuery("");
        setCarritoAbierto(false);
        router.refresh();
      } else {
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
    : metodoPago === "efectivo" && montoNum < total
    ? "Escribe cuánto recibiste en \"Monto recibido\" para continuar"
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
            </div>
            <button onClick={() => setClienteId(null)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setClientePickerAbierto((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary-text transition-colors"
          >
            <User className="w-4 h-4" />
            <span>Agregar cliente</span>
          </button>
        )}

        {clientePickerAbierto && !clienteSeleccionado && (
          <div className="absolute left-4 right-4 top-full mt-1 z-10 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
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
                  className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-muted truncate"
                >
                  {c.name}
                </button>
              ))}
              {clientesFiltrados.length === 0 && (
                <p className="px-3 py-2 text-[12.5px] text-muted-foreground/70">Sin resultados</p>
              )}
            </div>
          </div>
        )}
      </div>

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
            {carrito.map((item) => (
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
            ))}
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
                  onClick={() => abrirReciboImprimible(ultimoRecibo, nombreNegocioDeSlug(tenantSlug))}
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
        <div className="grid grid-cols-2 gap-2 mb-3">
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
              <span className="text-sm text-muted-foreground">Monto recibido</span>
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
                  placeholder="$0"
                  autoFocus
                  className="w-28 text-right px-2.5 py-2 border border-primary/40 rounded-lg text-sm font-semibold focus:outline-none focus:border-primary bg-card text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>
            {montoNum > 0 && (
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

        {/* Botón cobrar — el elemento más grande y llamativo del panel a
            propósito (2026-09-23, lenguaje visual nuevo del POS: "el botón
            de Cobrar es el elemento más grande y llamativo de la
            pantalla"). */}
        <button
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
          <p className="text-xs text-amber-600 text-center mt-2">
            {razonNoPuedeCobrar}
            {branchId && !cajaAbierta && (
              <>
                {" — "}
                <Link href={`/${tenantSlug}/caja`} className="underline font-medium">
                  ábrela en Caja
                </Link>
              </>
            )}
          </p>
        )}
      </div>
    </>
  );

  return (
    <div className="flex flex-col lg:flex-row h-full bg-muted">

      {/* Panel izquierdo — Catálogo. Fondo = --primary del tema del negocio
          en TODA la ventana del catálogo (2026-09-24, corrección de Carlos
          tras ver el primer intento: "el enfoque fue incorrecto. Fondo de
          toda la ventana color primario, fondo de la ficha color
          secundario (varios), fondo de contenedor de iconos según el
          tema, y los iconos el complementario al principal" — referencia
          directa a las pantallas de inicio de Windows Phone/Metro que
          compartió). El panel del carrito (a la derecha) se queda con
          fondo neutral --card a propósito: es una lista de números
          (totales, cambio) que debe seguir siendo legible como una
          pantalla de trabajo, no como el "launcher" de tiles. */}
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
          dentro de ese espacio en vez de forzar el desbordamiento global. */}
      <div className="flex-1 flex flex-col bg-primary lg:shadow-[1px_0_0_rgba(0,0,0,0.045)] min-h-0 min-w-0">

        <div className="flex items-center gap-2.5 px-5 py-4 flex-wrap">
          <span className="text-lg font-bold text-primary-foreground w-full sm:w-auto sm:mr-2">
            {label(labels, "module.pos.name")}
          </span>

          {branches.length > 1 && (
            <div className="flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-primary-foreground/70 flex-shrink-0" />
              <select value={branchId ?? ""} onChange={(e) => setBranchId(e.target.value)}
                className="px-2.5 py-2 rounded-lg text-sm font-medium bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-card/50">
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}

          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto o servicio"
              className="w-full pl-11 pr-4 py-3 rounded-full text-base bg-card text-foreground placeholder:text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-2 focus:ring-card/50"
            />
          </div>
          <button
            onClick={() => { setErrorEscaner(null); setMostrarEscaner(true); }}
            aria-label="Escanear código de barras"
            className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-card hover:brightness-95 rounded-full text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-colors"
          >
            <Barcode className="w-5 h-5" />
          </button>
        </div>

        {/* Píldoras de categoría — invertidas respecto al resto de la app
            (2026-09-24): sobre un fondo ya saturado por --primary, la
            píldora ACTIVA se marca con el color de tarjeta (clara sobre
            oscuro, o al revés) para que resalte; las inactivas son un
            overlay translúcido del primary-foreground, como un segmento
            "encendido/apagado" de un tile launcher. */}
        <div className="flex gap-2 px-5 py-1.5 overflow-x-auto">
          {categoriasOpciones.map((cat) => (
            <button key={cat.id ?? "todos"} onClick={() => setCategoriaActiva(cat.id)}
              className={`px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
                categoriaActiva === cat.id
                  ? "bg-card text-primary-text shadow-[0_2px_6px_rgba(0,0,0,0.18)]"
                  : "bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25"
              }`}>
              {cat.name}
            </button>
          ))}
        </div>

        {productosFiltrados.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
            <Search className="w-9 h-9 text-primary-foreground/40 mb-2" />
            <p className="text-base font-semibold text-primary-foreground mb-1">Sin resultados</p>
            <p className="text-sm text-primary-foreground/70">
              {productos.length === 0 ? "Aún no hay productos en el catálogo." : "Prueba con otra búsqueda o categoría."}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5 content-start pb-24 lg:pb-4">
            {productosFiltrados.map((producto) => {
              const stock = stockDe(producto);
              const agotado = !producto.isService && stock <= 0;
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
              // Variables de la ficha completa (2026-09-24, corrección de
              // Carlos sobre el primer intento — ver el comentario largo
              // junto al fondo del panel, arriba): la FICHA entera toma el
              // color de categoría (antes solo se coloreaba un cuadrito de
              // ícono); sin categoría, cae al --primary del tema, igual que
              // antes. El color de texto/ícono es SIEMPRE --tile-fg — un
              // solo color fijo por tema (blanco o negro), igual en las 5
              // fichas, NUNCA un color calculado por ficha — Carlos rechazó
              // dos veces cualquier intento de "acomodar" el color del ícono
              // por ficha o de encerrarlo en un contenedor aparte ("sigues
              // cometiendo el error de encerrar el icono en un contenedor de
              // un color diferente... haces que se vea feo"). El ícono se
              // dibuja DIRECTO sobre la ficha, sin nada detrás.
              const fichaBg = chip ? `var(--chip-${chip})` : "var(--primary)";
              return (
                <button key={producto.id} onClick={() => agregarAlCarrito(producto)} disabled={agotado}
                  style={{ backgroundColor: fichaBg, color: "var(--tile-fg)" }}
                  className={`relative flex flex-col items-start gap-3 p-4 rounded-2xl transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 active:scale-[0.98] shadow-[0_2px_10px_rgba(0,0,0,0.12)] hover:brightness-105 ${
                    cantidadEnCarrito > 0 ? "ring-[3px] ring-white/85" : ""
                  }`}>
                  {cantidadEnCarrito > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-[24px] h-6 px-1.5 rounded-full bg-white text-neutral-900 text-xs font-bold flex items-center justify-center leading-none shadow-sm">
                      {cantidadEnCarrito}
                    </span>
                  )}
                  <ProductoIcono value={producto.emoji} className="w-8 h-8" />
                  <div className="w-full">
                    <p className="text-[15px] font-semibold leading-snug mb-1 line-clamp-2">{producto.name}</p>
                    <p className="text-lg font-extrabold">{formatMXN(producto.price)}</p>
                    {!producto.isService && (
                      <p className="text-xs opacity-70 mt-0.5">
                        {agotado ? "Agotado" : `Stock: ${stock}`}
                      </p>
                    )}
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
    </div>
  );
}
