"use client";

import { useState } from "react";
import { Search, ShoppingCart, Barcode, Plus, Minus, X, Check, User, ChevronDown } from "lucide-react";

const categorias = ["Todos", "Celulares", "Accesorios", "Refacciones", "Servicios"];

const productos = [
  { id: 1, nombre: "iPhone 14 128GB",  precio: 12500, stock: 3,   categoria: "Celulares",   icono: "📱" },
  { id: 2, nombre: "Samsung S23",       precio: 10800, stock: 5,   categoria: "Celulares",   icono: "📱" },
  { id: 3, nombre: "AirPods Pro",        precio: 4200,  stock: 8,   categoria: "Accesorios",  icono: "🎧" },
  { id: 4, nombre: "Cargador USB-C 20W", precio: 280,   stock: 24,  categoria: "Accesorios",  icono: "🔌" },
  { id: 5, nombre: "Funda iPhone 14",    precio: 150,   stock: 15,  categoria: "Accesorios",  icono: "📱" },
  { id: 6, nombre: "Cambio de pantalla", precio: 800,   stock: 999, categoria: "Servicios",   icono: "🔧" },
  { id: 7, nombre: "Batería iPhone 12",  precio: 450,   stock: 6,   categoria: "Refacciones", icono: "🔋" },
  { id: 8, nombre: "Cable Lightning 2m", precio: 180,   stock: 30,  categoria: "Accesorios",  icono: "🔌" },
];

type CartItem  = { id: number; nombre: string; precio: number; cantidad: number };
type PayMethod = "efectivo" | "tarjeta" | "transferencia" | "mixto";

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

export default function POSPage() {
  const [busqueda, setBusqueda]           = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState("Todos");
  const [carrito, setCarrito]             = useState<CartItem[]>([]);
  const [metodoPago, setMetodoPago]       = useState<PayMethod>("efectivo");
  const [cobrando, setCobrando]           = useState(false);
  const [carritoAbierto, setCarritoAbierto] = useState(false);

  // Efectivo simple — monto recibido
  const [montoRecibido, setMontoRecibido] = useState("");

  // Mixto — monto por método
  const [mixtoEfectivo,      setMixtoEfectivo]      = useState("");
  const [mixtoTarjeta,       setMixtoTarjeta]        = useState("");
  const [mixtoTransferencia, setMixtoTransferencia]  = useState("");

  /* ── Cálculos ── */
  const productosFiltrados = productos.filter((p) => {
    const matchCat    = categoriaActiva === "Todos" || p.categoria === categoriaActiva;
    const matchSearch = p.nombre.toLowerCase().includes(busqueda.toLowerCase());
    return matchCat && matchSearch;
  });

  const subtotal   = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const iva        = Math.round(subtotal * 0.16);
  const total      = subtotal + iva;
  const totalItems = carrito.reduce((s, i) => s + i.cantidad, 0);

  // Efectivo simple
  const montoNum  = parseFloat(montoRecibido.replace(/,/g, "")) || 0;
  const cambio    = montoNum > total ? montoNum - total : 0;
  const faltaEfec = montoNum < total && montoNum > 0;

  // Mixto
  const mEfec  = parseFloat(mixtoEfectivo.replace(/,/g, ""))      || 0;
  const mTarj  = parseFloat(mixtoTarjeta.replace(/,/g, ""))       || 0;
  const mTrans = parseFloat(mixtoTransferencia.replace(/,/g, "")) || 0;
  const totalMixto   = mEfec + mTarj + mTrans;
  const faltaMixto   = total - totalMixto;
  const cambioMixto  = totalMixto > total ? totalMixto - total : 0;
  const mixtoOk      = totalMixto >= total;

  // ¿Se puede cobrar?
  const puedeCobar =
    carrito.length > 0 &&
    !cobrando &&
    (metodoPago === "tarjeta" ||
     metodoPago === "transferencia" ||
     (metodoPago === "efectivo"      && montoNum >= total) ||
     (metodoPago === "mixto"         && mixtoOk));

  /* ── Acciones ── */
  const agregarAlCarrito = (p: typeof productos[0]) => {
    setCarrito((prev) => {
      const existe = prev.find((i) => i.id === p.id);
      if (existe) return prev.map((i) => i.id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i);
      return [...prev, { id: p.id, nombre: p.nombre, precio: p.precio, cantidad: 1 }];
    });
  };

  const cambiarCantidad = (id: number, delta: number) => {
    setCarrito((prev) =>
      prev.map((i) => i.id === id ? { ...i, cantidad: i.cantidad + delta } : i)
          .filter((i) => i.cantidad > 0)
    );
  };

  const limpiarCarrito = () => {
    setCarrito([]);
    setMontoRecibido("");
    setMixtoEfectivo(""); setMixtoTarjeta(""); setMixtoTransferencia("");
  };

  const handleCobrar = () => {
    if (!puedeCobar) return;
    setCobrando(true);
    setTimeout(() => {
      setCarrito([]);
      setMontoRecibido("");
      setMixtoEfectivo(""); setMixtoTarjeta(""); setMixtoTransferencia("");
      setCobrando(false);
      setCarritoAbierto(false);
    }, 1500);
  };

  const handleMetodo = (m: PayMethod) => {
    setMetodoPago(m);
    setMontoRecibido("");
    setMixtoEfectivo(""); setMixtoTarjeta(""); setMixtoTransferencia("");
  };

  /* ── Contenido del carrito ── */
  const carritoContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-1.5">
          <ShoppingCart className="w-4 h-4 text-slate-600" />
          <span className="text-sm font-medium text-slate-800">Venta actual</span>
          {carrito.length > 0 && (
            <span className="bg-[#4F46E5] text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full">{totalItems}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {carrito.length > 0 && (
            <button onClick={limpiarCarrito} className="text-[10px] text-red-400 hover:text-red-600">Limpiar</button>
          )}
          <button onClick={() => setCarritoAbierto(false)} className="lg:hidden text-slate-400">
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Cliente */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100">
        <button className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-[#4F46E5] transition-colors">
          <User className="w-3.5 h-3.5" />
          <span>Agregar cliente</span>
        </button>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {carrito.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-8 text-center">
            <ShoppingCart className="w-8 h-8 text-slate-200 mb-2" />
            <p className="text-xs text-slate-300">El carrito está vacío</p>
            <p className="text-[11px] text-slate-200 mt-1">Selecciona productos del catálogo</p>
          </div>
        ) : (
          <div className="space-y-2">
            {carrito.map((item) => (
              <div key={item.id} className="flex items-center gap-2 py-2 border-b border-slate-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 truncate">{item.nombre}</p>
                  <p className="text-[10px] text-slate-400">{formatMXN(item.precio)} c/u</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => cambiarCantidad(item.id, -1)}
                    className="w-6 h-6 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-50">
                    <Minus className="w-3 h-3 text-slate-500" />
                  </button>
                  <span className="text-xs font-medium text-slate-800 w-5 text-center">{item.cantidad}</span>
                  <button onClick={() => cambiarCantidad(item.id, 1)}
                    className="w-6 h-6 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-50">
                    <Plus className="w-3 h-3 text-slate-500" />
                  </button>
                </div>
                <span className="text-xs font-medium text-slate-800 min-w-[48px] text-right">
                  {formatMXN(item.precio * item.cantidad)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer — Totales y cobro */}
      <div className="border-t border-slate-100 p-4">
        {/* Totales */}
        <div className="space-y-1.5 mb-3">
          <div className="flex justify-between">
            <span className="text-xs text-slate-500">Subtotal</span>
            <span className="text-xs text-slate-700">{formatMXN(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-slate-500">IVA (16%)</span>
            <span className="text-xs text-slate-700">{formatMXN(iva)}</span>
          </div>
          <div className="h-px bg-slate-100" />
          <div className="flex justify-between items-baseline">
            <span className="text-sm font-semibold text-slate-800">Total</span>
            <span className="text-base font-bold text-[#4F46E5]">{formatMXN(total)}</span>
          </div>
        </div>

        {/* Botones de método de pago — 2×2 */}
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {([
            { key: "efectivo",      label: "💵 Efectivo",       active: "bg-[#4F46E5]/10 text-[#4F46E5] border-[#4F46E5]/30" },
            { key: "tarjeta",       label: "💳 Tarjeta",        active: "bg-cyan-50 text-cyan-700 border-cyan-300" },
            { key: "transferencia", label: "📲 Transferencia",  active: "bg-emerald-50 text-emerald-700 border-emerald-300" },
            { key: "mixto",         label: "🔀 Mixto",          active: "bg-amber-50 text-amber-700 border-amber-300" },
          ] as { key: PayMethod; label: string; active: string }[]).map((m) => (
            <button key={m.key} onClick={() => handleMetodo(m.key)}
              className={`py-2 rounded-lg text-xs font-medium transition-colors border ${
                metodoPago === m.key
                  ? m.active
                  : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
              }`}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Panel Efectivo — monto recibido y cambio */}
        {metodoPago === "efectivo" && carrito.length > 0 && (
          <div className="mb-3 bg-[#4F46E5]/5 border border-[#4F46E5]/20 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-600 whitespace-nowrap">Monto recibido</span>
              <input
                type="number"
                value={montoRecibido}
                onChange={(e) => setMontoRecibido(e.target.value)}
                placeholder={formatMXN(total)}
                className="w-28 text-right px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-[#4F46E5] bg-white"
              />
            </div>
            {montoNum > 0 && (
              <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                cambio > 0 ? "bg-emerald-50 border border-emerald-200" :
                faltaEfec ? "bg-red-50 border border-red-200" :
                "bg-slate-50 border border-slate-200"
              }`}>
                <span className={`text-xs font-medium ${
                  cambio > 0 ? "text-emerald-700" : faltaEfec ? "text-red-600" : "text-slate-600"
                }`}>
                  {cambio > 0 ? "💰 Cambio" : faltaEfec ? "⚠️ Falta" : "✓ Exacto"}
                </span>
                <span className={`text-sm font-bold ${
                  cambio > 0 ? "text-emerald-700" : faltaEfec ? "text-red-600" : "text-slate-700"
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
            <p className="text-[10px] font-semibold text-amber-700 mb-1">🔀 Desglose de pago</p>

            {[
              { label: "💵 Efectivo",      value: mixtoEfectivo,      setter: setMixtoEfectivo },
              { label: "💳 Tarjeta",       value: mixtoTarjeta,       setter: setMixtoTarjeta },
              { label: "📲 Transferencia", value: mixtoTransferencia, setter: setMixtoTransferencia },
            ].map((f) => (
              <div key={f.label} className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-600 whitespace-nowrap">{f.label}</span>
                <input
                  type="number"
                  value={f.value}
                  onChange={(e) => f.setter(e.target.value)}
                  placeholder="$0"
                  className="w-28 text-right px-2 py-1.5 border border-amber-200 rounded-lg text-xs font-medium focus:outline-none focus:border-amber-400 bg-white"
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
          className="w-full bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
        >
          {cobrando ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Check className="w-4 h-4" />
              {carrito.length > 0 ? `Cobrar ${formatMXN(total)}` : "Cobrar"}
            </>
          )}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex flex-col lg:flex-row h-full bg-slate-100">

      {/* Panel izquierdo — Catálogo */}
      <div className="flex-1 flex flex-col bg-white lg:border-r border-slate-200 min-h-0">

        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto o escanear código..."
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
            />
          </div>
          <button className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs text-slate-600 transition-colors">
            <Barcode className="w-4 h-4" />
            <span className="hidden sm:inline">Escanear</span>
          </button>
        </div>

        <div className="flex gap-2 px-4 py-2 border-b border-slate-100 overflow-x-auto">
          {categorias.map((cat) => (
            <button key={cat} onClick={() => setCategoriaActiva(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                categoriaActiva === cat
                  ? "bg-[#4F46E5] text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}>
              {cat}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 content-start pb-24 lg:pb-4">
          {productosFiltrados.map((producto) => (
            <button key={producto.id} onClick={() => agregarAlCarrito(producto)}
              className="flex flex-col items-start p-3 bg-white border border-slate-200 rounded-xl hover:border-[#4F46E5] hover:bg-[#4F46E5]/5 transition-all text-left">
              <div className="w-full h-14 bg-slate-50 rounded-lg flex items-center justify-center mb-2 text-2xl">
                {producto.icono}
              </div>
              <p className="text-xs font-medium text-slate-800 leading-tight mb-1 line-clamp-2">{producto.nombre}</p>
              <p className="text-sm font-bold text-[#4F46E5]">{formatMXN(producto.precio)}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {producto.categoria === "Servicios" ? "Servicio" : `Stock: ${producto.stock}`}
              </p>
            </button>
          ))}
          <button className="flex flex-col items-center justify-center p-3 border border-dashed border-slate-200 rounded-xl hover:border-slate-300 hover:bg-slate-50 transition-all">
            <Plus className="w-5 h-5 text-slate-300 mb-1" />
            <span className="text-[10px] text-slate-300">Agregar</span>
          </button>
        </div>
      </div>

      {/* Carrito desktop */}
      <div className="hidden lg:flex w-72 flex-col bg-white">
        {carritoContent}
      </div>

      {/* Botón flotante móvil */}
      {!carritoAbierto && (
        <button onClick={() => setCarritoAbierto(true)}
          className="lg:hidden fixed bottom-4 right-4 bg-[#4F46E5] text-white rounded-full shadow-lg flex items-center gap-2 px-5 py-3.5 z-50">
          <ShoppingCart className="w-5 h-5" />
          {totalItems > 0 ? (
            <>
              <span className="text-sm font-semibold">{formatMXN(total)}</span>
              <span className="bg-white text-[#4F46E5] text-xs font-bold px-2 py-0.5 rounded-full">{totalItems}</span>
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
          <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50 flex flex-col max-h-[85vh] shadow-xl">
            <div className="flex justify-center py-2">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>
            {carritoContent}
          </div>
        </>
      )}
    </div>
  );
}