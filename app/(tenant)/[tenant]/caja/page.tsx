"use client";

import { useState } from "react";
import { ShoppingCart, Wrench, CreditCard, DollarSign, Lock, Plus, Filter, TrendingDown, TrendingUp, Printer, Calculator } from "lucide-react";

const movimientosIniciales = [
  { id: 1, concepto: "Venta #VTA-0089", tipo: "ingreso", categoria: "venta", monto: 280, hora: "2:45 pm", metodo: "Efectivo" },
  { id: 2, concepto: "Pago servicio de limpieza", tipo: "egreso", categoria: "gasto", monto: 200, hora: "1:30 pm", metodo: "Egreso" },
  { id: 3, concepto: "Venta #VTA-0088", tipo: "ingreso", categoria: "venta", monto: 12500, hora: "12:10 pm", metodo: "Tarjeta" },
  { id: 4, concepto: "Pago renta local", tipo: "egreso", categoria: "gasto", monto: 500, hora: "11:00 am", metodo: "Egreso" },
  { id: 5, concepto: "Cobro reparación REP-0040", tipo: "ingreso", categoria: "reparacion", monto: 650, hora: "10:30 am", metodo: "Efectivo" },
  { id: 6, concepto: "Apertura de caja", tipo: "ingreso", categoria: "apertura", monto: 2000, hora: "8:00 am", metodo: "Apertura" },
];

const categoriaIcono: Record<string, { icon: React.ElementType; bg: string; color: string }> = {
  venta:     { icon: ShoppingCart, bg: "bg-emerald-50", color: "text-emerald-600" },
  reparacion:{ icon: Wrench,       bg: "bg-purple-50",  color: "text-purple-600" },
  gasto:     { icon: TrendingDown, bg: "bg-red-50",     color: "text-red-600" },
  apertura:  { icon: DollarSign,   bg: "bg-blue-50",    color: "text-blue-600" },
};

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

export default function CajaPage() {
  const [movimientos] = useState(movimientosIniciales);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [tipoMovimiento, setTipoMovimiento] = useState<"ingreso" | "egreso">("ingreso");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");

  const apertura = 2000;
  const ventasEfectivo = movimientos
    .filter((m) => m.tipo === "ingreso" && m.metodo === "Efectivo" && m.categoria !== "apertura")
    .reduce((s, m) => s + m.monto, 0);
  const ventasTarjeta = movimientos
    .filter((m) => m.tipo === "ingreso" && m.metodo === "Tarjeta")
    .reduce((s, m) => s + m.monto, 0);
  const egresos = movimientos
    .filter((m) => m.tipo === "egreso")
    .reduce((s, m) => s + m.monto, 0);
  const totalEsperado = apertura + ventasEfectivo - egresos;
  const totalVentas = ventasEfectivo + ventasTarjeta;

  return (
    <div className="flex h-full">

      {/* Panel izquierdo */}
      <div className="w-72 flex flex-col bg-white border-r border-slate-200 flex-shrink-0">

        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span className="text-[13px] font-medium text-slate-800">Control de caja</span>
          <div className="flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Abierta
          </div>
        </div>

        {/* Card principal */}
        <div className="mx-3 my-3 bg-[#4F46E5] rounded-xl p-4">
          <p className="text-[10px] text-white/60 mb-1">Efectivo actual en caja</p>
          <p className="text-[28px] font-semibold text-white leading-none mb-1">
            {formatMXN(totalEsperado)}
          </p>
          <p className="text-[10px] text-white/50">Apertura: {formatMXN(apertura)} · Hace 6 horas</p>
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/15">
            {[
              { label: "Ventas", value: formatMXN(totalVentas) },
              { label: "Egresos", value: formatMXN(egresos) },
              { label: "Esperado", value: formatMXN(totalEsperado) },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-[9px] text-white/50 mb-0.5">{item.label}</p>
                <p className="text-[11px] font-medium text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Resumen */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          <p className="text-[10px] font-semibold text-slate-400 tracking-widest mb-2">RESUMEN DEL DÍA</p>
          <div className="space-y-1">
            {[
              { label: "Apertura de caja", value: formatMXN(apertura), dot: "bg-blue-500" },
              { label: "Ventas en efectivo", value: formatMXN(ventasEfectivo), dot: "bg-[#4F46E5]" },
              { label: "Ventas con tarjeta", value: formatMXN(ventasTarjeta), dot: "bg-cyan-500" },
              { label: "Egresos / Gastos", value: `-${formatMXN(egresos)}`, dot: "bg-red-500", neg: true },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-slate-50">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${row.dot}`} />
                  <span className="text-[11px] text-slate-600">{row.label}</span>
                </div>
                <span className={`text-[11px] font-medium ${row.neg ? "text-red-500" : "text-slate-800"}`}>
                  {row.value}
                </span>
              </div>
            ))}
            <div className="h-px bg-slate-200 my-1" />
            <div className="flex items-center justify-between py-1.5">
              <span className="text-[12px] font-semibold text-slate-800">Total esperado</span>
              <span className="text-[14px] font-bold text-[#4F46E5]">{formatMXN(totalEsperado)}</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-[11px] text-slate-500">Diferencia</span>
              <span className="text-[11px] font-medium text-emerald-600">$0.00 ✓</span>
            </div>
          </div>
        </div>

        <div className="p-3">
          <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-[12px] font-medium rounded-lg transition-colors">
            <Lock className="w-3.5 h-3.5" />
            Cerrar caja del día
          </button>
        </div>
      </div>

      {/* Panel derecho */}
      <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">

        <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
          <span className="text-[13px] font-medium text-slate-800">Movimientos de hoy</span>
          <div className="flex gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-[11px] text-slate-600 hover:bg-slate-50">
              <Filter className="w-3 h-3" /> Filtrar
            </button>
            <button
              onClick={() => setMostrarModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-lg text-[11px] font-medium transition-colors">
              <Plus className="w-3 h-3" /> Movimiento
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">

          {/* Acciones rápidas */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: "Registrar ingreso", sub: "Efectivo, préstamo...", icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50", action: () => { setTipoMovimiento("ingreso"); setMostrarModal(true); } },
              { label: "Registrar egreso", sub: "Gastos, retiros...", icon: TrendingDown, color: "text-red-600", bg: "bg-red-50", action: () => { setTipoMovimiento("egreso"); setMostrarModal(true); } },
              { label: "Corte parcial", sub: "Contar efectivo", icon: Calculator, color: "text-[#4F46E5]", bg: "bg-[#4F46E5]/10", action: () => {} },
              { label: "Imprimir reporte", sub: "PDF del día", icon: Printer, color: "text-slate-600", bg: "bg-slate-100", action: () => {} },
            ].map((btn) => (
              <button key={btn.label} onClick={btn.action}
                className="flex flex-col items-start p-3 bg-white border border-slate-200 rounded-xl hover:border-slate-300 hover:bg-slate-50 transition-all text-left">
                <div className={`w-8 h-8 rounded-lg ${btn.bg} flex items-center justify-center mb-2`}>
                  <btn.icon className={`w-4 h-4 ${btn.color}`} />
                </div>
                <p className="text-[11px] font-medium text-slate-800">{btn.label}</p>
                <p className="text-[10px] text-slate-400">{btn.sub}</p>
              </button>
            ))}
          </div>

          {/* Lista de movimientos */}
          <p className="text-[10px] font-semibold text-slate-400 tracking-widest mb-3">MOVIMIENTOS</p>
          <div className="space-y-2">
            {movimientos.map((mov) => {
              const cfg = categoriaIcono[mov.categoria] || categoriaIcono.gasto;
              const Icono = cfg.icon;
              return (
                <div key={mov.id} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                    <Icono className={`w-4 h-4 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-slate-800">{mov.concepto}</p>
                    <p className="text-[10px] text-slate-400">{mov.hora} · {mov.metodo}</p>
                  </div>
                  <span className={`text-[13px] font-semibold ${mov.tipo === "ingreso" ? "text-emerald-600" : "text-red-500"}`}>
                    {mov.tipo === "ingreso" ? "+" : "-"}{formatMXN(mov.monto)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal nuevo movimiento */}
      {mostrarModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-5 w-80 shadow-xl">
            <h2 className="text-[14px] font-semibold text-slate-800 mb-4">Nuevo movimiento</h2>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {(["ingreso", "egreso"] as const).map((tipo) => (
                <button key={tipo} onClick={() => setTipoMovimiento(tipo)}
                  className={`py-2 rounded-lg text-[12px] font-medium transition-colors capitalize ${
                    tipoMovimiento === tipo
                      ? tipo === "ingreso"
                        ? "bg-emerald-500 text-white"
                        : "bg-red-500 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}>
                  {tipo === "ingreso" ? "Ingreso" : "Egreso"}
                </button>
              ))}
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Concepto</label>
                <input type="text" value={concepto} onChange={(e) => setConcepto(e.target.value)}
                  placeholder="Ej. Pago de luz"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[12px] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Monto</label>
                <input type="number" value={monto} onChange={(e) => setMonto(e.target.value)}
                  placeholder="$0.00"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[12px] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setMostrarModal(false)}
                className="flex-1 py-2 border border-slate-200 rounded-lg text-[12px] text-slate-600 hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button onClick={() => setMostrarModal(false)}
                className={`flex-1 py-2 rounded-lg text-[12px] font-medium text-white transition-colors ${
                  tipoMovimiento === "ingreso" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-red-500 hover:bg-red-600"
                }`}>
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}