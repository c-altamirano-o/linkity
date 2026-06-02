"use client";

import { useState } from "react";
import { Search, ShoppingCart, Barcode, Plus, Minus, X, Check, User } from "lucide-react";

const categorias = ["Todos", "Celulares", "Accesorios", "Refacciones", "Servicios"];

const productos = [
  { id: 1, nombre: "iPhone 14 128GB", precio: 12500, stock: 3, categoria: "Celulares", icono: "📱" },
  { id: 2, nombre: "Samsung S23", precio: 10800, stock: 5, categoria: "Celulares", icono: "📱" },
  { id: 3, nombre: "AirPods Pro", precio: 4200, stock: 8, categoria: "Accesorios", icono: "🎧" },
  { id: 4, nombre: "Cargador USB-C 20W", precio: 280, stock: 24, categoria: "Accesorios", icono: "🔌" },
  { id: 5, nombre: "Funda iPhone 14", precio: 150, stock: 15, categoria: "Accesorios", icono: "📱" },
  { id: 6, nombre: "Cambio de pantalla", precio: 800, stock: 999, categoria: "Servicios", icono: "🔧" },
  { id: 7, nombre: "Batería iPhone 12", precio: 450, stock: 6, categoria: "Refacciones", icono: "🔋" },
  { id: 8, nombre: "Cable Lightning 2m", precio: 180, stock: 30, categoria: "Accesorios", icono: "🔌" },
];

type CartItem = {
  id: number;
  nombre: string;
  precio: number;
  cantidad: number;
};

type PayMethod = "efectivo" | "tarjeta" | "transferencia";

export default function POSPage() {
  const [busqueda, setBusqueda] = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState("Todos");
  const [carrito, setCarrito] = useState<CartItem[]>([]);
  const [metodoPago, setMetodoPago] = useState<PayMethod>("efectivo");
  const [cobrando, setCobrando] = useState(false);

  const productosFiltrados = productos.filter((p) => {
    const matchCategoria = categoriaActiva === "Todos" || p.categoria === categoriaActiva;
    const matchBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase());
    return matchCategoria && matchBusqueda;
  });

  const agregarAlCarrito = (producto: typeof productos[0]) => {
    setCarrito((prev) => {
      const existe = prev.find((item) => item.id === producto.id);
      if (existe) {
        return prev.map((item) =>
          item.id === producto.id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        );
      }
      return [...prev, { id: producto.id, nombre: producto.nombre, precio: producto.precio, cantidad: 1 }];
    });
  };

  const cambiarCantidad = (id: number, delta: number) => {
    setCarrito((prev) =>
      prev
        .map((item) => item.id === id ? { ...item, cantidad: item.cantidad + delta } : item)
        .filter((item) => item.cantidad > 0)
    );
  };

  const limpiarCarrito = () => setCarrito([]);

  const subtotal = carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  const iva = Math.round(subtotal * 0.16);
  const total = subtotal + iva;

  const formatMXN = (n: number) =>
    n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

  const handleCobrar = () => {
    if (carrito.length === 0) return;
    setCobrando(true);
    setTimeout(() => {
      setCarrito([]);
      setCobrando(false);
    }, 1500);
  };

  return (
    <div className="flex h-full bg-slate-100">

      {/* Panel izquierdo — Catálogo */}
      <div className="flex-1 flex flex-col bg-white border-r border-slate-200">

        {/* Barra de búsqueda */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto o escanear código..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-[12px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
            />
          </div>
          <button className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-[11px] text-slate-600 transition-colors">
            <Barcode className="w-3.5 h-3.5" />
            Escanear
          </button>
        </div>

        {/* Categorías */}
        <div className="flex gap-2 px-4 py-2 border-b border-slate-100 overflow-x-auto">
          {categorias.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoriaActiva(cat)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                categoriaActiva === cat
                  ? "bg-[#4F46E5] text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid de productos */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-3 gap-3 content-start xl:grid-cols-4">
          {productosFiltrados.map((producto) => (
            <button
              key={producto.id}
              onClick={() => agregarAlCarrito(producto)}
              className="flex flex-col items-start p-3 bg-white border border-slate-200 rounded-xl hover:border-[#4F46E5] hover:bg-[#4F46E5]/5 transition-all text-left"
            >
              <div className="w-full h-14 bg-slate-50 rounded-lg flex items-center justify-center mb-2 text-2xl">
                {producto.icono}
              </div>
              <p className="text-[11px] font-medium text-slate-800 leading-tight mb-1 line-clamp-2">{producto.nombre}</p>
              <p className="text-[13px] font-bold text-[#4F46E5]">{formatMXN(producto.precio)}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {producto.categoria === "Servicios" ? "Servicio" : `Stock: ${producto.stock}`}
              </p>
            </button>
          ))}

          {/* Botón agregar producto */}
          <button className="flex flex-col items-center justify-center p-3 border border-dashed border-slate-200 rounded-xl hover:border-slate-300 hover:bg-slate-50 transition-all">
            <Plus className="w-5 h-5 text-slate-300 mb-1" />
            <span className="text-[10px] text-slate-300">Agregar</span>
          </button>
        </div>
      </div>

      {/* Panel derecho — Carrito */}
      <div className="w-64 flex flex-col bg-white">

        {/* Header carrito */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-1.5">
            <ShoppingCart className="w-4 h-4 text-slate-600" />
            <span className="text-[13px] font-medium text-slate-800">Venta actual</span>
            {carrito.length > 0 && (
              <span className="bg-[#4F46E5] text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full">
                {carrito.reduce((s, i) => s + i.cantidad, 0)}
              </span>
            )}
          </div>
          {carrito.length > 0 && (
            <button onClick={limpiarCarrito} className="text-[10px] text-red-400 hover:text-red-600 transition-colors">
              Limpiar
            </button>
          )}
        </div>

        {/* Cliente */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100">
          <button className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-[#4F46E5] transition-colors">
            <User className="w-3.5 h-3.5" />
            <span>Agregar cliente</span>
          </button>
        </div>

        {/* Items del carrito */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {carrito.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <ShoppingCart className="w-8 h-8 text-slate-200 mb-2" />
              <p className="text-[12px] text-slate-300">El carrito está vacío</p>
              <p className="text-[11px] text-slate-200 mt-1">Selecciona productos del catálogo</p>
            </div>
          ) : (
            <div className="space-y-2">
              {carrito.map((item) => (
                <div key={item.id} className="flex items-center gap-2 py-2 border-b border-slate-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-slate-800 truncate">{item.nombre}</p>
                    <p className="text-[10px] text-slate-400">{formatMXN(item.precio)} c/u</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => cambiarCantidad(item.id, -1)}
                      className="w-5 h-5 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
                    >
                      <Minus className="w-2.5 h-2.5 text-slate-500" />
                    </button>
                    <span className="text-[11px] font-medium text-slate-800 w-4 text-center">{item.cantidad}</span>
                    <button
                      onClick={() => cambiarCantidad(item.id, 1)}
                      className="w-5 h-5 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
                    >
                      <Plus className="w-2.5 h-2.5 text-slate-500" />
                    </button>
                  </div>
                  <span className="text-[11px] font-medium text-slate-800 min-w-[48px] text-right">
                    {formatMXN(item.precio * item.cantidad)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer — Totales y cobro */}
        <div className="border-t border-slate-100 p-4">
          <div className="space-y-1.5 mb-3">
            <div className="flex justify-between">
              <span className="text-[11px] text-slate-500">Subtotal</span>
              <span className="text-[11px] text-slate-700">{formatMXN(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[11px] text-slate-500">IVA (16%)</span>
              <span className="text-[11px] text-slate-700">{formatMXN(iva)}</span>
            </div>
            <div className="h-px bg-slate-100 my-1" />
            <div className="flex justify-between items-baseline">
              <span className="text-[13px] font-semibold text-slate-800">Total</span>
              <span className="text-[16px] font-bold text-[#4F46E5]">{formatMXN(total)}</span>
            </div>
          </div>

          {/* Método de pago */}
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {(["efectivo", "tarjeta", "transferencia"] as PayMethod[]).map((metodo) => (
              <button
                key={metodo}
                onClick={() => setMetodoPago(metodo)}
                className={`py-1.5 rounded-lg text-[10px] font-medium capitalize transition-colors ${
                  metodoPago === metodo
                    ? "bg-[#4F46E5]/10 text-[#4F46E5] border border-[#4F46E5]/30"
                    : "bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                {metodo === "transferencia" ? "Transfer." : metodo.charAt(0).toUpperCase() + metodo.slice(1)}
              </button>
            ))}
          </div>

          {/* Botón cobrar */}
          <button
            onClick={handleCobrar}
            disabled={carrito.length === 0 || cobrando}
            className="w-full bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-[13px] transition-colors flex items-center justify-center gap-2"
          >
            {cobrando ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4" />
                Cobrar {carrito.length > 0 ? formatMXN(total) : ""}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}