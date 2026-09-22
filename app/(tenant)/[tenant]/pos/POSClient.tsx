"use client";

import { useState, useTransition } from "react";
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
import { abrirReciboImprimible, nombreNegocioDeSlug, type ReciboData } from "@/lib/recibo-imprimible";

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

  /* ── Cálculos ── */
  const productosFiltrados = productos.filter((p) => {
    const matchCat =
      categoriaActiva === null
        ? true
        : categoriaActiva === SIN_CATEGORIA_ID
        ? p.categoryId === null
        : p.categoryId === categoriaActiva;
    const matchSearch = p.name.toLowerCase().includes(busqueda.toLowerCase());
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-1.5">
          <ShoppingCart className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Venta actual</span>
          {carrito.length > 0 && (
            <span className="bg-primary text-primary-foreground text-[10.5px] font-medium px-1.5 py-0.5 rounded-full">{totalItems}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {carrito.length > 0 && (
            <button onClick={limpiarCarrito} className="text-[11.5px] text-red-500 hover:text-red-600">Limpiar</button>
          )}
          <button onClick={() => setCarritoAbierto(false)} className="lg:hidden text-muted-foreground">
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Cliente */}
      <div className="relative px-4 py-2 border-b border-border">
        {clienteSeleccionado ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs text-foreground min-w-0">
              <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{clienteSeleccionado.name}</span>
            </div>
            <button onClick={() => setClienteId(null)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setClientePickerAbierto((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <User className="w-3.5 h-3.5" />
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
              className="w-full px-3 py-2 text-xs bg-muted border-b border-border focus:outline-none"
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
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {carrito.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-8 text-center">
            <ShoppingCart className="w-8 h-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground/70">El carrito está vacío</p>
            <p className="text-[12.5px] text-muted-foreground/50 mt-1">Selecciona productos del catálogo</p>
          </div>
        ) : (
          <div className="space-y-2">
            {carrito.map((item) => (
              <div key={item.productId} className="flex items-center gap-2 py-2 border-b border-border/60 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{item.nombre}</p>
                  <p className="text-[11.5px] text-muted-foreground">{formatMXN(item.precio)} c/u</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => cambiarCantidad(item.productId, -1)}
                    className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted">
                    <Minus className="w-3 h-3 text-muted-foreground" />
                  </button>
                  <span className="text-xs font-medium text-foreground w-5 text-center">{item.cantidad}</span>
                  <button onClick={() => cambiarCantidad(item.productId, 1)}
                    className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted">
                    <Plus className="w-3 h-3 text-muted-foreground" />
                  </button>
                </div>
                <span className="text-xs font-medium text-foreground min-w-[48px] text-right">
                  {formatMXN(item.precio * item.cantidad)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer — Totales y cobro */}
      <div className="border-t border-border p-4">
        {errorVenta && (
          <div className="mb-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-red-600">{errorVenta}</p>
          </div>
        )}

        {ultimaVenta && (
          <div className="mb-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-emerald-700">✓ Venta {ultimaVenta.folio} registrada</p>
                <p className="text-[12.5px] text-emerald-600">
                  {formatMXN(ultimaVenta.total)}{ultimaVenta.cambio > 0 ? ` · Cambio: ${formatMXN(ultimaVenta.cambio)}` : ""}
                </p>
              </div>
              {ultimoRecibo && (
                <button
                  onClick={() => abrirReciboImprimible(ultimoRecibo, nombreNegocioDeSlug(tenantSlug))}
                  title="El ticket ya se imprimió solo al cobrar — usa esto si el navegador bloqueó esa ventana"
                  className="flex items-center gap-1 px-2 py-1.5 bg-card border border-emerald-300 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[11.5px] font-medium flex-shrink-0"
                >
                  <Printer className="w-3 h-3" /> Reimprimir ticket
                </button>
              )}
            </div>
          </div>
        )}

        {/* Totales */}
        <div className="space-y-1.5 mb-3">
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">Subtotal</span>
            <span className="text-xs text-foreground">{formatMXN(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">IVA</span>
            <span className="text-xs text-foreground">{formatMXN(iva)}</span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex justify-between items-baseline">
            <span className="text-sm font-semibold text-foreground">Total</span>
            <span className="text-base font-bold text-primary">{formatMXN(total)}</span>
          </div>
          <p className="text-[11.5px] text-muted-foreground text-right">Los precios ya incluyen IVA</p>
        </div>

        {/* Botones de método de pago — 2×2 */}
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {([
            { key: "efectivo", label: "💵 Efectivo", active: "bg-primary/10 text-primary border-primary/30" },
            { key: "tarjeta", label: "💳 Tarjeta", active: "bg-cyan-50 text-cyan-700 border-cyan-300" },
            { key: "transferencia", label: "📲 Transferencia", active: "bg-emerald-50 text-emerald-700 border-emerald-300" },
            { key: "mixto", label: "🔀 Mixto", active: "bg-amber-50 text-amber-700 border-amber-300" },
          ] as { key: MetodoPago; label: string; active: string }[]).map((m) => (
            <button key={m.key} onClick={() => handleMetodo(m.key)}
              className={`py-2 rounded-lg text-xs font-medium transition-colors border ${
                metodoPago === m.key
                  ? m.active
                  : "bg-muted text-muted-foreground border-border hover:bg-accent"
              }`}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Panel Efectivo — monto recibido y cambio */}
        {metodoPago === "efectivo" && carrito.length > 0 && (
          <div className="mb-3 bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Monto recibido <span className="text-primary">— escríbelo para continuar</span>
              </span>
              <div className="flex items-center gap-1.5">
                {/* Atajo para el caso más común (pago exacto) — a propósito
                    ya NO se usa el total como placeholder (Carlos,
                    2026-09-21: "como ya aparece 'pre llenado' da la
                    impresión de que ya está hecho"); un botón explícito que
                    el usuario debe tocar deja claro que es una acción, no un
                    valor ya capturado. */}
                <button type="button" onClick={() => setMontoRecibido(String(total))}
                  className="px-2 py-1.5 border border-primary/30 hover:bg-primary/10 text-primary rounded-lg text-[11.5px] font-medium whitespace-nowrap">
                  Exacto
                </button>
                <input
                  type="number"
                  value={montoRecibido}
                  onChange={(e) => setMontoRecibido(e.target.value)}
                  placeholder="$0"
                  autoFocus
                  className="w-24 text-right px-2 py-1.5 border border-primary/40 rounded-lg text-xs font-medium focus:outline-none focus:border-primary bg-card"
                />
              </div>
            </div>
            {montoNum > 0 && (
              <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                cambio > 0 ? "bg-emerald-50 border border-emerald-200" :
                faltaEfec ? "bg-red-50 border border-red-200" :
                "bg-muted border border-border"
              }`}>
                <span className={`text-xs font-medium ${
                  cambio > 0 ? "text-emerald-700" : faltaEfec ? "text-red-600" : "text-muted-foreground"
                }`}>
                  {cambio > 0 ? "💰 Cambio" : faltaEfec ? "⚠️ Falta" : "✓ Exacto"}
                </span>
                <span className={`text-sm font-bold ${
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
          <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
            <p className="text-[11.5px] font-semibold text-amber-700 mb-1">🔀 Desglose de pago</p>

            {[
              { label: "💵 Efectivo", value: mixtoEfectivo, setter: setMixtoEfectivo },
              { label: "💳 Tarjeta", value: mixtoTarjeta, setter: setMixtoTarjeta },
              { label: "📲 Transferencia", value: mixtoTransferencia, setter: setMixtoTransferencia },
            ].map((f) => (
              <div key={f.label} className="flex items-center justify-between gap-2">
                <span className="text-xs text-amber-700/80 whitespace-nowrap">{f.label}</span>
                <input
                  type="number"
                  value={f.value}
                  onChange={(e) => f.setter(e.target.value)}
                  placeholder="$0"
                  className="w-28 text-right px-2 py-1.5 border border-amber-200 rounded-lg text-xs font-medium focus:outline-none focus:border-amber-400 bg-card"
                />
              </div>
            ))}

            <div className="h-px bg-amber-200" />

            <div className="flex items-center justify-between">
              <span className="text-xs text-amber-700 font-medium">Total cubierto</span>
              <span className={`text-sm font-bold ${mixtoOk ? "text-emerald-600" : "text-amber-700"}`}>
                {formatMXN(totalMixto)} {mixtoOk ? "✓" : ""}
              </span>
            </div>

            {!mixtoOk && totalMixto > 0 && (
              <div className="flex items-center justify-between px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
                <span className="text-xs text-red-600">⚠️ Falta</span>
                <span className="text-sm font-bold text-red-600">{formatMXN(faltaMixto)}</span>
              </div>
            )}

            {cambioMixto > 0 && (
              <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                <span className="text-xs text-emerald-700 font-medium">💰 Cambio</span>
                <span className="text-sm font-bold text-emerald-700">{formatMXN(cambioMixto)}</span>
              </div>
            )}
          </div>
        )}

        {/* Botón cobrar */}
        <button
          onClick={handleCobrar}
          disabled={!puedeCobar}
          className="w-full bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground font-semibold py-3 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
        >
          {isPending ? (
            <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
          ) : (
            <>
              <Check className="w-4 h-4" />
              {carrito.length > 0 ? `Cobrar ${formatMXN(total)}` : "Cobrar"}
            </>
          )}
        </button>
        {razonNoPuedeCobrar && !isPending && (
          <p className="text-[11.5px] text-amber-600 text-center mt-1.5">
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

      {/* Panel izquierdo — Catálogo */}
      <div className="flex-1 flex flex-col bg-card lg:border-r border-border min-h-0">

        <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-wrap">
          <span className="text-sm font-medium text-foreground w-full sm:w-auto sm:mr-1">
            {label(labels, "module.pos.name")}
          </span>

          {branches.length > 1 && (
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <select value={branchId ?? ""} onChange={(e) => setBranchId(e.target.value)}
                className="px-2 py-2 border border-border rounded-lg text-xs bg-muted focus:outline-none focus:border-primary">
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}

          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full pl-9 pr-4 py-2.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <button className="flex items-center gap-1.5 px-3 py-2.5 bg-muted hover:bg-accent rounded-lg text-xs text-muted-foreground transition-colors">
            <Barcode className="w-4 h-4" />
            <span className="hidden sm:inline">Escanear</span>
          </button>
        </div>

        <div className="flex gap-2 px-4 py-2 border-b border-border overflow-x-auto">
          {categoriasOpciones.map((cat) => (
            <button key={cat.id ?? "todos"} onClick={() => setCategoriaActiva(cat.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                categoriaActiva === cat.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}>
              {cat.name}
            </button>
          ))}
        </div>

        {productosFiltrados.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
            <Search className="w-8 h-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm font-medium text-foreground mb-1">Sin resultados</p>
            <p className="text-xs text-muted-foreground">
              {productos.length === 0 ? "Aún no hay productos en el catálogo." : "Prueba con otra búsqueda o categoría."}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 content-start pb-24 lg:pb-4">
            {productosFiltrados.map((producto) => {
              const stock = stockDe(producto);
              const agotado = !producto.isService && stock <= 0;
              return (
                <button key={producto.id} onClick={() => agregarAlCarrito(producto)} disabled={agotado}
                  className="flex flex-col items-start p-3 bg-card border border-border rounded-xl hover:border-primary hover:bg-primary/5 transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-card">
                  <div className="w-full h-14 bg-muted rounded-lg flex items-center justify-center mb-2 text-2xl">
                    <ProductoIcono value={producto.emoji} className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-xs font-medium text-foreground leading-tight mb-1 line-clamp-2">{producto.name}</p>
                  <p className="text-sm font-bold text-primary">{formatMXN(producto.price)}</p>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5">
                    {producto.isService ? "Servicio" : agotado ? "Agotado" : `Stock: ${stock}`}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Carrito desktop */}
      <div className="hidden lg:flex w-72 flex-col bg-card">
        {carritoContent}
      </div>

      {/* Botón flotante móvil */}
      {!carritoAbierto && (
        <button onClick={() => setCarritoAbierto(true)}
          className="lg:hidden fixed bottom-4 right-4 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center gap-2 px-5 py-3.5 z-50">
          <ShoppingCart className="w-5 h-5" />
          {totalItems > 0 ? (
            <>
              <span className="text-sm font-semibold">{formatMXN(total)}</span>
              <span className="bg-primary-foreground text-primary text-xs font-bold px-2 py-0.5 rounded-full">{totalItems}</span>
            </>
          ) : (
            <span className="text-sm font-medium">Carrito</span>
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
    </div>
  );
}
