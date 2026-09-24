"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Unlock, Plus, Filter, TrendingDown, TrendingUp, ShoppingCart, Calculator, FileDown, ChevronDown } from "lucide-react";
import type { CajaData } from "@/lib/caja-data";
import { abrirCajaAction, cerrarCajaAction, registrarMovimientoAction } from "@/app/actions/caja-actions";
import { confirmarSalirSinGuardar, useAdvertirCierrePestaña } from "@/lib/confirmar-cierre";

type Periodo = "hoy" | "semana" | "mes" | "año" | "periodo";

interface Branch {
  id: string;
  name: string;
}

interface CajaClientProps {
  data: CajaData;
  branches: Branch[];
  branchActual: string;
  tenantSlug: string;
  tenantName: string;
  // 2026-09-24, a petición de Carlos (seguridad anti-fraude — ver el
  // comentario largo en Role.verMontosCaja, schema.prisma): false para un
  // empleado de PIN sin el permiso "supervisor" — `data` ya llega redactada
  // desde el servidor (ver redactarMontosCaja en lib/caja-data.ts), este
  // flag es lo que decide qué tanto de la UI se oculta/reemplaza.
  puedeVerMontos: boolean;
}

const tipoBadge: Record<string, string> = {
  venta: "bg-emerald-50 text-emerald-700",
  egreso: "bg-red-50 text-red-600",
  apertura: "bg-blue-50 text-blue-700",
  ingreso: "bg-cyan-50 text-cyan-700",
  // 2026-09-22, cambio de turno: renglón de cierre en el historial (ver
  // lib/caja-data.ts) — gris neutro, no es ni ingreso ni egreso en sí.
  cierre: "bg-slate-100 text-slate-600",
};

const tipoLabel: Record<string, string> = {
  venta: "Venta",
  egreso: "Egreso",
  apertura: "Apertura",
  ingreso: "Ingreso",
  cierre: "Cierre",
};

// Los métodos de pago son indicadores de estatus, no de marca — se quedan
// con colores literales fijos sin importar el tema activo (mismo criterio
// que las prioridades/estatus en POS y Reparaciones). "Efectivo" antes usaba
// el hex de marca (#4F46E5) directo, lo cual lo hacía cambiar según el
// preset de tema activo — se corrigió a un literal fijo.
const metodoBadge: Record<string, string> = {
  Efectivo: "bg-indigo-50 text-indigo-700",
  Tarjeta: "bg-blue-50 text-blue-700",
  Transferencia: "bg-emerald-50 text-emerald-700",
  Mixto: "bg-amber-50 text-amber-700",
};

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function inicioDelDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function finDelDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export default function CajaClient({ data, branches, branchActual, tenantSlug, tenantName, puedeVerMontos }: CajaClientProps) {
  const router = useRouter();
  const { sesionActual, movimientos } = data;

  // Sustituye cualquier monto por un candado cuando este empleado no tiene
  // nivel supervisor — 2026-09-24, a petición de Carlos. Los valores que
  // recibe ya vienen en 0 desde el servidor en ese caso (ver
  // redactarMontosCaja), así que esto es solo la parte de presentación:
  // nunca mostrar "$0" como si fuera el monto real.
  const verMonto = (n: number) => (puedeVerMontos ? formatMXN(n) : "🔒 Oculto");

  const hoy = new Date();
  const hoyStr = hoy.toISOString().slice(0, 10);
  const hace30Str = new Date(hoy.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [periodo, setPeriodo] = useState<Periodo>("hoy");
  const [fechaInicio, setFechaInicio] = useState(hace30Str);
  const [fechaFin, setFechaFin] = useState(hoyStr);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [mostrarExportMenu, setMostrarExportMenu] = useState(false);
  const [mostrarAbrirModal, setMostrarAbrirModal] = useState(false);
  const [mostrarCerrarModal, setMostrarCerrarModal] = useState(false);
  const [tipoMov, setTipoMov] = useState<"ingreso" | "egreso">("ingreso");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [montoApertura, setMontoApertura] = useState("");
  const [efectivoContado, setEfectivoContado] = useState("");
  const [notasCierre, setNotasCierre] = useState("");
  const [tabMovil, setTabMovil] = useState<"caja" | "detalle">("caja");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Filtro por tipo de movimiento/método de pago (2026-09-22, pendiente
  // registrado: el botón "Filtrar" existía desde antes pero no hacía nada)
  // — se combina con el filtro de período que ya existía (periodo/
  // fechaInicio/fechaFin), no lo reemplaza.
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroMetodo, setFiltroMetodo] = useState<string>("todos");
  const [mostrarFiltroPanel, setMostrarFiltroPanel] = useState(false);
  const filtroPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node))
        setMostrarExportMenu(false);
      if (filtroPanelRef.current && !filtroPanelRef.current.contains(e.target as Node))
        setMostrarFiltroPanel(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const cambiarSucursal = (branchId: string) => {
    router.push(`/${tenantSlug}/caja?sucursal=${branchId}`);
  };

  const cerrarModales = () => {
    setMostrarModal(false);
    setMostrarAbrirModal(false);
    setMostrarCerrarModal(false);
    setError(null);
  };

  // 2026-09-22, a petición de Carlos ("revisando el flujo de datos... pide
  // confirmación para cerrarlas cuando abandone la acción a mitad del
  // proceso"): a diferencia de cerrarModales() de arriba — que también se
  // usa para "limpiar antes de abrir OTRO modal" y por eso no debe
  // preguntar nada — esta función es específicamente para cuando el
  // usuario está ABANDONANDO un modal ya abierto (click fuera, Cancelar,
  // la X): pregunta primero, y solo cierra si confirma.
  const cancelarModal = () => {
    if (!confirmarSalirSinGuardar()) return;
    cerrarModales();
  };

  // Aviso al cerrar/recargar la PESTAÑA del navegador mientras alguno de
  // los 3 modales de captura de Caja sigue abierto (ver el comentario
  // largo en lib/confirmar-cierre.ts) — complementa a cancelarModal() de
  // arriba, que solo cubre cerrar el modal sin salir de la pestaña.
  useAdvertirCierrePestaña(mostrarModal || mostrarAbrirModal || mostrarCerrarModal);

  const handleAbrirCaja = () => {
    const valor = parseFloat(montoApertura);
    if (!Number.isFinite(valor) || valor < 0) {
      setError("Ingresa un monto de apertura válido");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await abrirCajaAction({ tenantSlug, branchId: branchActual, montoApertura: valor });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMontoApertura("");
      setMostrarAbrirModal(false);
      router.refresh();
    });
  };

  const handleRegistrarMovimiento = () => {
    if (!sesionActual) return;
    const valor = parseFloat(monto);
    if (!concepto.trim()) {
      setError("Describe el concepto del movimiento");
      return;
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      setError("Ingresa un monto válido");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await registrarMovimientoAction({
        tenantSlug,
        cashSessionId: sesionActual.id,
        tipo: tipoMov,
        concepto: concepto.trim(),
        monto: valor,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConcepto("");
      setMonto("");
      setMostrarModal(false);
      router.refresh();
    });
  };

  const handleCerrarCaja = () => {
    if (!sesionActual) return;
    const valor = parseFloat(efectivoContado);
    if (!Number.isFinite(valor) || valor < 0) {
      setError("Ingresa el efectivo contado en caja");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await cerrarCajaAction({
        tenantSlug,
        cashSessionId: sesionActual.id,
        efectivoContado: valor,
        notas: notasCierre,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEfectivoContado("");
      setNotasCierre("");
      setMostrarCerrarModal(false);
      router.refresh();
    });
  };

  // ── Filtro de período (panel de detalle) ────────────────────────────
  const inicioHoy = inicioDelDia(hoy);
  const inicioSemana = new Date(inicioHoy);
  inicioSemana.setDate(inicioSemana.getDate() - 6);
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const inicioAnio = new Date(hoy.getFullYear(), 0, 1);
  const rangoInicio = inicioDelDia(new Date(fechaInicio + "T00:00:00"));
  const rangoFin = finDelDia(new Date(fechaFin + "T00:00:00"));

  const movsFiltrados = movimientos.filter((m) => {
    const f = new Date(m.fecha);
    const enPeriodo =
      periodo === "hoy" ? f >= inicioHoy :
      periodo === "semana" ? f >= inicioSemana :
      periodo === "mes" ? f >= inicioMes :
      periodo === "año" ? f >= inicioAnio :
      periodo === "periodo" ? (f >= rangoInicio && f <= rangoFin) :
      true;
    if (!enPeriodo) return false;
    if (filtroTipo !== "todos" && m.tipo !== filtroTipo) return false;
    if (filtroMetodo !== "todos" && m.metodo !== filtroMetodo) return false;
    return true;
  });

  const filtrosActivos = filtroTipo !== "todos" || filtroMetodo !== "todos";
  const limpiarFiltros = () => { setFiltroTipo("todos"); setFiltroMetodo("todos"); };

  // "cierre" (2026-09-22, cambio de turno) se excluye de ambos: su monto es
  // la DIFERENCIA del corte (contado − esperado), no un ingreso o egreso
  // real de caja — ya está reflejado en las ventas/movimientos que sí lo
  // componen, incluirlo aquí lo contaría dos veces.
  const ingresos = movsFiltrados.filter((m) => m.monto > 0 && m.tipo !== "apertura" && m.tipo !== "cierre").reduce((s, m) => s + m.monto, 0);
  const egresos = Math.abs(movsFiltrados.filter((m) => m.monto < 0 && m.tipo !== "cierre").reduce((s, m) => s + m.monto, 0));
  const ticketsVenta = movsFiltrados.filter((m) => m.tipo === "venta").length;
  const ticketProm =
    ticketsVenta > 0
      ? Math.round(movsFiltrados.filter((m) => m.tipo === "venta").reduce((s, m) => s + m.monto, 0) / ticketsVenta)
      : 0;

  const periodoLabel: Record<Periodo, string> = {
    hoy: "Hoy",
    semana: "Esta semana",
    mes: "Este mes",
    año: "Este año",
    periodo: `${fechaInicio} al ${fechaFin}`,
  };

  const fechaHoyTexto = hoy.toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
  const nombreArchivo = (ext: string) =>
    `Caja_${periodoLabel[periodo].replace(/ /g, "_")}_${hoy.toISOString().slice(0, 10)}.${ext}`;

  // ── CSV ──────────────────────────────────────────────────
  const exportarCSV = () => {
    const lines = [
      `# ${tenantName} — Reporte de Caja`,
      `# Periodo: ${periodoLabel[periodo]}`,
      `# Generado el: ${fechaHoyTexto}`,
      `# RESUMEN DEL PERIODO`,
      `Total Ingresos,${ingresos}`,
      `Tickets de Venta,${ticketsVenta}`,
      `Ticket Promedio,${ticketProm}`,
      `Total Egresos,${egresos}`,
      `Neto,${ingresos - egresos}`,
      `Folio,Fecha,Hora,Concepto,Metodo,Tipo,Monto`,
      ...movsFiltrados.map(
        (m) =>
          `${m.folio},${m.fecha.slice(0, 10)},${new Date(m.fecha).toLocaleTimeString("es-MX")},"${m.concepto}",${m.metodo},${tipoLabel[m.tipo]},${m.monto}`
      ),
      `,,,,, TOTAL INGRESOS,${ingresos}`,
      `,,,,, TOTAL EGRESOS,${-egresos}`,
      `,,,,, NETO,${ingresos - egresos}`,
    ];
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo("csv");
    a.click();
    URL.revokeObjectURL(url);
    setMostrarExportMenu(false);
  };

  // ── XLSX ─────────────────────────────────────────────────
  const exportarXLSX = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Linkity Soluciones";
    const ws = wb.addWorksheet("Caja", { views: [{ state: "frozen", ySplit: 4 }] });
    const PU = "4F46E5",
      LP = "EDE9FE",
      DK = "0F172A";
    const GR = "F8FAFC",
      GN = "16A34A",
      RD = "DC2626";
    const BD = { style: "thin" as const, color: { argb: "E2E8F0" } };
    const bdr = { top: BD, bottom: BD, left: BD, right: BD };
    ws.columns = [{ width: 15 }, { width: 13 }, { width: 11 }, { width: 40 }, { width: 18 }, { width: 14 }, { width: 16 }];
    const addMerged = (range: string, text: string, bg: string, fc: string, sz: number, bold = false, align: any = "center") => {
      ws.mergeCells(range);
      const c = ws.getCell(range.split(":")[0]);
      c.value = text;
      c.font = { bold, size: sz, color: { argb: fc } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      c.alignment = { horizontal: align, vertical: "middle" };
    };
    addMerged("A1:G1", `${tenantName} — Reporte de Caja`, PU, "FFFFFF", 14, true);
    ws.getRow(1).height = 28;
    addMerged("A2:G2", `Periodo: ${periodoLabel[periodo]}`, LP, "374151", 10);
    addMerged("A3:G3", `Generado el: ${fechaHoyTexto}`, "F1F5F9", "94A3B8", 9);
    ws.addRow([]);
    addMerged("A5:G5", "RESUMEN DEL PERIODO", "1E293B", "FFFFFF", 10, true, "left");
    ws.getRow(5).height = 20;
    [
      ["Total Ingresos", ingresos, GN],
      ["Tickets de Venta", ticketsVenta, DK],
      ["Ticket Promedio", ticketProm, DK],
      ["Total Egresos", egresos, RD],
      ["Neto (Ingresos − Egresos)", ingresos - egresos, ingresos - egresos >= 0 ? GN : RD],
    ].forEach(([lbl, val, col], i) => {
      const row = ws.addRow([lbl, val]);
      row.height = 18;
      row.getCell(1).font = { size: 10, color: { argb: DK } };
      row.getCell(2).font = { bold: true, size: 11, color: { argb: col as string } };
      row.getCell(2).numFmt = '"$"#,##0.00';
      row.getCell(2).alignment = { horizontal: "right" };
      const bg = i % 2 === 0 ? "FFFFFF" : GR;
      [1, 2].forEach((c) => {
        row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        row.getCell(c).border = bdr;
      });
    });
    ws.addRow([]);
    const nr = ws.rowCount + 1;
    addMerged(`A${nr}:G${nr}`, "DETALLE DE MOVIMIENTOS", "1E293B", "FFFFFF", 10, true, "left");
    ws.getRow(ws.rowCount).height = 20;
    const hdr = ws.addRow(["Folio", "Fecha", "Hora", "Concepto", "Metodo", "Tipo", "Monto"]);
    hdr.height = 20;
    hdr.eachCell((c) => {
      c.font = { bold: true, size: 10, color: { argb: "FFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PU } };
      c.border = bdr;
      c.alignment = { horizontal: "center", vertical: "middle" };
    });
    movsFiltrados.forEach((m, i) => {
      const f = new Date(m.fecha);
      const row = ws.addRow([
        m.folio,
        f.toISOString().slice(0, 10),
        f.toLocaleTimeString("es-MX"),
        m.concepto,
        m.metodo,
        tipoLabel[m.tipo],
        m.monto,
      ]);
      row.height = 17;
      const bg = i % 2 === 0 ? "FFFFFF" : GR;
      row.eachCell((cell, col) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        cell.border = bdr;
        cell.font = { size: 10, color: { argb: DK } };
        if (col === 7) {
          cell.numFmt = '"$"#,##0.00';
          cell.alignment = { horizontal: "right" };
          cell.font = { bold: true, size: 10, color: { argb: m.monto >= 0 ? GN : RD } };
        }
      });
    });
    ws.addRow([]);
    [["TOTAL INGRESOS", ingresos], ["TOTAL EGRESOS", -egresos], ["NETO", ingresos - egresos]].forEach(([l, v]) => {
      const row = ws.addRow(["", "", "", "", "", l, v]);
      row.height = 18;
      row.getCell(6).font = { bold: true, size: 10, color: { argb: DK } };
      row.getCell(6).alignment = { horizontal: "right" };
      row.getCell(7).font = { bold: true, size: 11, color: { argb: (v as number) >= 0 ? GN : RD } };
      row.getCell(7).numFmt = '"$"#,##0.00';
      row.getCell(7).alignment = { horizontal: "right" };
      row.getCell(7).border = bdr;
    });
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo("xlsx");
    a.click();
    URL.revokeObjectURL(url);
    setMostrarExportMenu(false);
  };

  // ── PNG ───────────────────────────────────────────────────
  const exportarPNG = () => {
    const W = 1200,
      rowH = 40;
    const H = 110 + 130 + 70 + (movsFiltrados.length + 1) * rowH + 130 + 60;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    const C = {
      purple: "#4F46E5",
      dark: "#0F172A",
      gray: "#F8FAFC",
      green: "#16A34A",
      red: "#DC2626",
      slate: "#64748B",
      border: "#E2E8F0",
      white: "#FFFFFF",
      subtext: "#94A3B8",
    };
    ctx.fillStyle = C.gray;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.purple;
    ctx.fillRect(0, 0, W, 100);
    ctx.fillStyle = C.white;
    ctx.font = "bold 28px Arial,sans-serif";
    ctx.fillText(`${tenantName} — Reporte de Caja`, 40, 44);
    ctx.font = "15px Arial,sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillText(`Periodo: ${periodoLabel[periodo]}  ·  Generado el: ${fechaHoyTexto}  ·  linkity.mx`, 40, 76);
    const kpiY = 118,
      kpiW = (W - 80 - 3 * 14) / 4;
    [
      { label: "Total Ingresos", value: formatMXN(ingresos), color: C.purple },
      { label: "Tickets de Venta", value: String(ticketsVenta), color: C.dark },
      { label: "Ticket Promedio", value: formatMXN(ticketProm), color: C.dark },
      { label: "Total Egresos", value: formatMXN(egresos), color: C.red },
    ].forEach((kpi, i) => {
      const x = 40 + i * (kpiW + 14);
      ctx.fillStyle = C.white;
      roundRect(ctx, x, kpiY, kpiW, 100, 12);
      ctx.fill();
      ctx.strokeStyle = C.border;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = C.subtext;
      ctx.font = "13px Arial,sans-serif";
      ctx.fillText(kpi.label, x + 16, kpiY + 32);
      ctx.fillStyle = kpi.color;
      ctx.font = "bold 26px Arial,sans-serif";
      ctx.fillText(kpi.value, x + 16, kpiY + 74);
    });
    const tY = kpiY + 130;
    ctx.fillStyle = C.dark;
    ctx.font = "bold 13px Arial,sans-serif";
    ctx.fillText("DETALLE DE MOVIMIENTOS", 40, tY - 12);
    const cols = [
      { label: "Folio", x: 40, w: 110 },
      { label: "Fecha", x: 160, w: 110 },
      { label: "Hora", x: 280, w: 100 },
      { label: "Concepto", x: 390, w: 350 },
      { label: "Metodo", x: 750, w: 140 },
      { label: "Tipo", x: 900, w: 130 },
      { label: "Monto", x: 1040, w: 120 },
    ];
    ctx.fillStyle = C.dark;
    ctx.fillRect(40, tY, W - 80, rowH);
    ctx.fillStyle = C.white;
    ctx.font = "bold 13px Arial,sans-serif";
    cols.forEach((c) => ctx.fillText(c.label, c.x + 10, tY + 27));
    movsFiltrados.forEach((mov, i) => {
      const y = tY + (i + 1) * rowH;
      ctx.fillStyle = i % 2 === 0 ? C.white : C.gray;
      ctx.fillRect(40, y, W - 80, rowH);
      ctx.strokeStyle = C.border;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(40, y + rowH);
      ctx.lineTo(W - 40, y + rowH);
      ctx.stroke();
      const f = new Date(mov.fecha);
      ctx.font = "13px Arial,sans-serif";
      ctx.fillStyle = C.purple;
      ctx.fillText(mov.folio, cols[0].x + 10, y + 26);
      ctx.fillStyle = C.slate;
      ctx.fillText(f.toISOString().slice(0, 10), cols[1].x + 10, y + 26);
      ctx.fillText(f.toLocaleTimeString("es-MX"), cols[2].x + 10, y + 26);
      ctx.fillStyle = C.dark;
      const ct = mov.concepto.length > 42 ? mov.concepto.slice(0, 42) + "…" : mov.concepto;
      ctx.fillText(ct, cols[3].x + 10, y + 26);
      ctx.fillStyle = C.slate;
      ctx.fillText(mov.metodo, cols[4].x + 10, y + 26);
      ctx.fillText(tipoLabel[mov.tipo], cols[5].x + 10, y + 26);
      ctx.fillStyle = mov.monto >= 0 ? C.green : C.red;
      ctx.font = "bold 13px Arial,sans-serif";
      const ms = (mov.monto >= 0 ? "+" : "") + formatMXN(mov.monto);
      ctx.fillText(ms, cols[6].x + cols[6].w - ctx.measureText(ms).width - 10, y + 26);
    });
    let ty = tY + (movsFiltrados.length + 1) * rowH + 20;
    [
      { label: "TOTAL INGRESOS", value: ingresos, color: C.green },
      { label: "TOTAL EGRESOS", value: -egresos, color: C.red },
      { label: "NETO", value: ingresos - egresos, color: ingresos - egresos >= 0 ? C.green : C.red },
    ].forEach((tot) => {
      ctx.fillStyle = C.white;
      roundRect(ctx, W - 380 - 40, ty, 380, 30, 6);
      ctx.fill();
      ctx.strokeStyle = C.border;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = C.dark;
      ctx.font = "bold 12px Arial,sans-serif";
      ctx.fillText(tot.label, W - 380 - 30, ty + 20);
      ctx.fillStyle = tot.color;
      ctx.font = "bold 14px Arial,sans-serif";
      const vs = (tot.value >= 0 ? "+" : "") + formatMXN(tot.value);
      ctx.fillText(vs, W - 55 - ctx.measureText(vs).width, ty + 20);
      ty += 38;
    });
    const fy = H - 44;
    ctx.fillStyle = C.border;
    ctx.fillRect(40, fy, W - 80, 1);
    ctx.fillStyle = C.subtext;
    ctx.font = "11px Arial,sans-serif";
    ctx.fillText("Generado por Linkity Soluciones · linkity.mx · Documento no fiscal", 40, fy + 22);
    ctx.fillText(fechaHoyTexto, W - 40 - ctx.measureText(fechaHoyTexto).width, fy + 22);
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob!);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreArchivo("png");
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
    setMostrarExportMenu(false);
  };

  // ── PDF ───────────────────────────────────────────────────
  const exportarPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth(),
      PH = doc.internal.pageSize.getHeight();
    type RGB = [number, number, number];
    const PU: RGB = [79, 70, 229],
      DK: RGB = [15, 23, 42],
      GN: RGB = [22, 163, 74],
      RD: RGB = [220, 38, 38],
      GR: RGB = [248, 250, 252],
      LG: RGB = [226, 232, 240],
      WH: RGB = [255, 255, 255],
      SL: RGB = [100, 116, 139];
    doc.setFillColor(...PU);
    doc.rect(0, 0, W, 62, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(`${tenantName} — Reporte de Caja`, 28, 26);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(200, 200, 230);
    doc.text(`Periodo: ${periodoLabel[periodo]}  ·  Generado el: ${fechaHoyTexto}`, 28, 48);
    const folio = `Folio: RPT-${hoy.toISOString().slice(0, 10).replace(/-/g, "")}`;
    doc.text(folio, W - 28 - doc.getTextWidth(folio), 48);
    const kpiY = 78,
      kpiW = (W - 56 - 3 * 10) / 4;
    [
      { label: "Total Ingresos", value: formatMXN(ingresos), color: PU },
      { label: "Tickets de Venta", value: String(ticketsVenta), color: DK },
      { label: "Ticket Promedio", value: formatMXN(ticketProm), color: DK },
      { label: "Total Egresos", value: formatMXN(egresos), color: RD },
    ].forEach((kpi, i) => {
      const x = 28 + i * (kpiW + 10);
      doc.setFillColor(...WH);
      doc.setDrawColor(...LG);
      doc.roundedRect(x, kpiY, kpiW, 52, 5, 5, "FD");
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text(kpi.label, x + 10, kpiY + 18);
      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...(kpi.color as RGB));
      doc.text(kpi.value, x + 10, kpiY + 40);
    });
    const tableY = kpiY + 68;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PU);
    doc.text("DETALLE DE MOVIMIENTOS", 28, tableY - 7);
    const cols = [
      { label: "Folio", x: 28, w: 78 },
      { label: "Fecha", x: 110, w: 75 },
      { label: "Hora", x: 190, w: 62 },
      { label: "Concepto", x: 256, w: 232 },
      { label: "Metodo", x: 492, w: 88 },
      { label: "Tipo", x: 584, w: 82 },
      { label: "Monto", x: 670, w: 88 },
    ];
    doc.setFillColor(...PU);
    doc.rect(28, tableY, W - 56, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    cols.forEach((c) => doc.text(c.label, c.x + 6, tableY + 15));
    const rowH = 20;
    let y = tableY + 22;
    const drawTH = () => {
      doc.setFillColor(...PU);
      doc.rect(28, y - 4, W - 56, 22, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      cols.forEach((c) => doc.text(c.label, c.x + 6, y + 13));
      y += 22;
    };
    movsFiltrados.forEach((mov, i) => {
      if (y + rowH > PH - 50) {
        doc.addPage();
        y = 28;
        drawTH();
      }
      doc.setFillColor(...(i % 2 === 0 ? WH : GR));
      doc.rect(28, y, W - 56, rowH, "F");
      doc.setDrawColor(...LG);
      doc.line(28, y + rowH, W - 28, y + rowH);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...PU);
      doc.text(mov.folio, cols[0].x + 6, y + 14);
      doc.setTextColor(...SL);
      const f = new Date(mov.fecha);
      doc.text(f.toISOString().slice(0, 10), cols[1].x + 6, y + 14);
      doc.text(f.toLocaleTimeString("es-MX"), cols[2].x + 6, y + 14);
      doc.setTextColor(...DK);
      const ct = mov.concepto.length > 38 ? mov.concepto.slice(0, 38) + "…" : mov.concepto;
      doc.text(ct, cols[3].x + 6, y + 14);
      doc.setTextColor(...SL);
      doc.text(mov.metodo, cols[4].x + 6, y + 14);
      doc.text(tipoLabel[mov.tipo], cols[5].x + 6, y + 14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...(mov.monto >= 0 ? GN : RD));
      const ms = (mov.monto >= 0 ? "+" : "") + formatMXN(mov.monto);
      doc.text(ms, cols[6].x + cols[6].w - doc.getTextWidth(ms), y + 14);
      y += rowH;
    });
    y += 14;
    [
      { label: "TOTAL INGRESOS", v: ingresos, c: GN },
      { label: "TOTAL EGRESOS", v: -egresos, c: RD },
      { label: "NETO", v: ingresos - egresos, c: (ingresos - egresos >= 0 ? GN : RD) as RGB },
    ].forEach((t) => {
      doc.setFillColor(...WH);
      doc.setDrawColor(...LG);
      doc.roundedRect(W - 28 - 270, y, 270, 20, 4, 4, "FD");
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DK);
      doc.text(t.label, W - 28 - 270 + 12, y + 14);
      doc.setTextColor(...(t.c as RGB));
      const vs = (t.v >= 0 ? "+" : "") + formatMXN(t.v);
      doc.text(vs, W - 28 - 12 - doc.getTextWidth(vs), y + 14);
      y += 26;
    });
    const totalPgs = (doc.internal as any).getNumberOfPages();
    for (let p = 1; p <= totalPgs; p++) {
      doc.setPage(p);
      doc.setDrawColor(...LG);
      doc.line(28, PH - 30, W - 28, PH - 30);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text("Generado por Linkity Soluciones · linkity.mx · Documento no fiscal", 28, PH - 14);
      const pg = `Pág. ${p} de ${totalPgs}`;
      doc.text(pg, W - 28 - doc.getTextWidth(pg), PH - 14);
    }
    doc.save(nombreArchivo("pdf"));
    setMostrarExportMenu(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Tabs móvil ─────────────────────────────────────── */}
      {/* "Detalle de Ventas" no se ofrece como pestaña si este empleado no
          tiene nivel supervisor (2026-09-24) — ese panel es justo el que
          muestra montos y totales que Carlos pidió ocultar. */}
      <div className="md:hidden flex border-b border-border bg-card flex-shrink-0">
        {[
          { key: "caja", label: "💰 Control de Caja" },
          ...(puedeVerMontos ? [{ key: "detalle", label: "📋 Detalle de Ventas" }] : []),
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTabMovil(tab.key as any)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              tabMovil === tab.key ? "border-b-2 border-primary text-primary" : "text-muted-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Panel izquierdo (Caja) ───────────────────────── */}
        <div
          className={`
          ${tabMovil === "caja" ? "flex" : "hidden"} md:flex
          w-full md:w-64 flex-col bg-card border-r border-border flex-shrink-0
        `}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-medium text-foreground">Control de caja</span>
            {sesionActual ? (
              <div className="flex items-center gap-1.5 text-[11.5px] font-medium px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Abierta
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[11.5px] font-medium px-2 py-1 rounded-full bg-red-50 text-red-600">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                Cerrada
              </div>
            )}
          </div>

          {branches.length > 1 && (
            <div className="px-4 py-2 border-b border-border">
              <select
                value={branchActual}
                onChange={(e) => cambiarSucursal(e.target.value)}
                className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {sesionActual ? (
            <>
              <div className="mx-3 my-3 bg-primary rounded-xl p-4">
                <p className="text-[11.5px] text-primary-foreground/60 mb-1">Efectivo actual en caja</p>
                <p className="text-[26px] font-bold text-primary-foreground leading-none mb-1">
                  {verMonto(sesionActual.efectivoEsperado)}
                </p>
                <p className="text-[11.5px] text-primary-foreground/50">
                  Apertura: {verMonto(sesionActual.aperturaMonto)} · {sesionActual.abiertaPor}
                </p>
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-primary-foreground/15">
                  {[
                    { label: "Ventas", value: verMonto(sesionActual.totalVentasDia) },
                    { label: "Egresos", value: verMonto(sesionActual.egresosManual) },
                    { label: "Esperado", value: verMonto(sesionActual.efectivoEsperado) },
                  ].map((i) => (
                    <div key={i.label}>
                      <p className="text-[10.5px] text-primary-foreground/50 mb-0.5">{i.label}</p>
                      <p className="text-[12.5px] font-medium text-primary-foreground">{i.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-2">
                <p className="text-[11.5px] font-semibold text-muted-foreground tracking-widest mb-2">RESUMEN DE LA SESIÓN</p>
                <div className="space-y-1">
                  {[
                    { label: "Apertura", value: verMonto(sesionActual.aperturaMonto), dot: "bg-emerald-500" },
                    { label: "Ventas en efectivo", value: verMonto(sesionActual.ventasEfectivo), dot: "bg-primary" },
                    { label: "Otros ingresos", value: verMonto(sesionActual.ingresosManual), dot: "bg-cyan-500" },
                    {
                      label: "Egresos / Gastos",
                      value: puedeVerMontos ? `-${formatMXN(sesionActual.egresosManual)}` : verMonto(0),
                      dot: "bg-red-500",
                      neg: true,
                    },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-border/60">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${row.dot}`} />
                        <span className="text-xs text-muted-foreground">{row.label}</span>
                      </div>
                      <span className={`text-xs font-medium ${row.neg ? "text-red-500" : "text-foreground"}`}>{row.value}</span>
                    </div>
                  ))}
                  <div className="h-px bg-border my-1" />
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-xs font-semibold text-foreground">Total esperado</span>
                    <span className="text-sm font-bold text-primary">{verMonto(sesionActual.efectivoEsperado)}</span>
                  </div>
                </div>
              </div>

              <div className="p-3 space-y-2">
                <button
                  onClick={() => {
                    cerrarModales();
                    setMostrarModal(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-muted hover:bg-muted/70 text-foreground text-xs font-medium rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Registrar movimiento
                </button>
                <button
                  onClick={() => {
                    cerrarModales();
                    setMostrarCerrarModal(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-foreground/90 hover:bg-foreground text-background text-xs font-medium rounded-lg transition-colors"
                >
                  <Lock className="w-3.5 h-3.5" /> Cerrar caja
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center gap-3">
              <p className="text-xs text-muted-foreground">
                No hay una caja abierta en esta sucursal. Abre una para empezar a registrar ventas y movimientos.
              </p>
              <button
                onClick={() => {
                  cerrarModales();
                  setMostrarAbrirModal(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium rounded-lg transition-colors"
              >
                <Unlock className="w-3.5 h-3.5" /> Abrir caja
              </button>
            </div>
          )}
        </div>

        {/* ── Panel derecho (Detalle) ──────────────────────── */}
        {/* 2026-09-24, a petición de Carlos: este panel completo (KPIs,
            tabla de movimientos, exportar) es justo donde vive "el total
            de la venta" que un empleado sin nivel supervisor no debe
            conocer — en vez de tapar cada cifra una por una aquí, se
            reemplaza TODO el panel por un aviso. Los datos reales ni
            siquiera llegan hasta acá (movimientos ya viene vacío desde el
            servidor, ver redactarMontosCaja), esto es solo la parte visual. */}
        <div
          className={`
          ${tabMovil === "detalle" ? "flex" : "hidden"} md:flex
          flex-1 flex-col overflow-hidden
        `}
        >
          {!puedeVerMontos ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
              <Lock className="w-6 h-6 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Sección restringida</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Los montos y totales de Caja solo los puede ver un supervisor o el administrador del negocio.
              </p>
            </div>
          ) : (
          <>
          {/* Topbar filtros */}
          <div className="bg-card border-b border-border px-3 sm:px-4 py-2.5 flex items-center gap-2 sm:gap-3 flex-wrap">
            <span className="text-sm font-medium text-foreground whitespace-nowrap hidden sm:block">Detalle de movimientos</span>
            <div className="flex gap-1 overflow-x-auto flex-shrink-0">
              {(["hoy", "semana", "mes", "año", "periodo"] as Periodo[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriodo(p)}
                  className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium capitalize transition-colors whitespace-nowrap ${
                    periodo === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {p === "hoy" ? "Hoy" : p === "semana" ? "Semana" : p === "mes" ? "Mes" : p === "año" ? "Año" : "Período"}
                </button>
              ))}
            </div>

            {periodo === "periodo" && (
              <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                <input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="px-2 py-1 border border-border rounded-lg text-xs bg-card text-foreground focus:outline-none focus:border-primary"
                />
                <span className="text-xs text-muted-foreground">—</span>
                <input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="px-2 py-1 border border-border rounded-lg text-xs bg-card text-foreground focus:outline-none focus:border-primary"
                />
              </div>
            )}

            <div className="flex gap-2 ml-auto items-center">
              <div className="relative" ref={filtroPanelRef}>
                <button
                  onClick={() => setMostrarFiltroPanel((v) => !v)}
                  className="relative flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted"
                >
                  <Filter className="w-3 h-3" /> <span className="hidden sm:inline">Filtrar</span>
                  {filtrosActivos && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary" />
                  )}
                </button>
                {mostrarFiltroPanel && (
                  <div className="absolute right-0 top-full mt-1.5 w-60 bg-card border border-border rounded-xl shadow-lg z-30 p-3 space-y-3">
                    <div>
                      <p className="text-[10.5px] font-semibold text-muted-foreground tracking-widest mb-1.5">TIPO DE MOVIMIENTO</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(["todos", "venta", "ingreso", "egreso", "apertura", "cierre"] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setFiltroTipo(t)}
                            className={`px-2 py-1 rounded-full text-[11.5px] font-medium capitalize transition-colors ${
                              filtroTipo === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                            }`}
                          >
                            {t === "todos" ? "Todos" : tipoLabel[t]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10.5px] font-semibold text-muted-foreground tracking-widest mb-1.5">MÉTODO DE PAGO</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(["todos", "Efectivo", "Tarjeta", "Transferencia", "Mixto"] as const).map((m) => (
                          <button
                            key={m}
                            onClick={() => setFiltroMetodo(m)}
                            className={`px-2 py-1 rounded-full text-[11.5px] font-medium transition-colors ${
                              filtroMetodo === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                            }`}
                          >
                            {m === "todos" ? "Todos" : m}
                          </button>
                        ))}
                      </div>
                    </div>
                    {filtrosActivos && (
                      <button onClick={limpiarFiltros} className="text-[11.5px] text-primary hover:underline">
                        Limpiar filtros
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="relative" ref={exportMenuRef}>
                <button
                  onClick={() => setMostrarExportMenu(!mostrarExportMenu)}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-medium transition-colors"
                >
                  <FileDown className="w-3 h-3" />
                  <span className="hidden sm:inline">Exportar</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${mostrarExportMenu ? "rotate-180" : ""}`} />
                </button>
                {mostrarExportMenu && (
                  <div className="absolute right-0 top-full mt-1.5 bg-card border border-border rounded-xl shadow-lg z-30 overflow-hidden w-52">
                    {[
                      { icon: "📄", label: "CSV", desc: "Compatible con cualquier sistema", fn: exportarCSV },
                      { icon: "📊", label: "Excel (XLSX)", desc: "Con formato y colores", fn: exportarXLSX },
                      { icon: "🖼️", label: "PNG", desc: "Imagen para compartir", fn: exportarPNG },
                      { icon: "📑", label: "PDF", desc: "Documento formal", fn: exportarPDF },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        onClick={opt.fn}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left border-b border-border/60 last:border-0"
                      >
                        <span className="text-base">{opt.icon}</span>
                        <div>
                          <p className="text-xs font-medium text-foreground">{opt.label}</p>
                          <p className="text-[11.5px] text-muted-foreground">{opt.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Métricas período */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 px-3 sm:px-4 py-3 bg-card border-b border-border">
            {[
              { label: "Total ingresos", value: formatMXN(ingresos), sub: periodoLabel[periodo], color: "text-primary", icon: TrendingUp },
              { label: "Tickets de venta", value: String(ticketsVenta), sub: "Transacciones", color: "text-foreground", icon: ShoppingCart },
              { label: "Ticket promedio", value: formatMXN(ticketProm), sub: "Por venta", color: "text-foreground", icon: Calculator },
              { label: "Total egresos", value: formatMXN(egresos), sub: "Gastos del período", color: "text-red-500", icon: TrendingDown },
            ].map((m) => (
              <div key={m.label} className="bg-muted rounded-lg p-2.5 sm:p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10.5px] sm:text-[11.5px] text-muted-foreground">{m.label}</p>
                  <m.icon className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${m.color}`} />
                </div>
                <p className={`text-sm sm:text-base font-semibold ${m.color}`}>{m.value}</p>
                <p className="text-[10.5px] sm:text-[11.5px] text-muted-foreground mt-0.5 truncate">{m.sub}</p>
              </div>
            ))}
          </div>

          {/* Tabla */}
          <div className="flex-1 overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-card border-b border-border z-10">
                <tr>
                  {[
                    { label: "Folio · Hora", right: false, hide: false },
                    { label: "Concepto", right: false, hide: false },
                    { label: "Método", right: false, hide: true },
                    { label: "Tipo", right: false, hide: true },
                    { label: "Monto", right: true, hide: false },
                  ].map((h) => (
                    <th
                      key={h.label}
                      className={`text-left text-[11.5px] font-medium text-muted-foreground px-3 sm:px-4 py-2.5 whitespace-nowrap ${
                        h.right ? "text-right" : ""
                      } ${h.hide ? "hidden sm:table-cell" : ""}`}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movsFiltrados.map((mov) => (
                  <tr key={mov.id} className="border-b border-border/60 hover:bg-muted transition-colors">
                    <td className="px-3 sm:px-4 py-2.5">
                      <p className="text-[11.5px] font-semibold text-primary">{mov.folio}</p>
                      <p className="text-[10.5px] text-muted-foreground">
                        {new Date(mov.fecha).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" })} ·{" "}
                        <span className="hidden sm:inline">{mov.fecha.slice(0, 10)}</span>
                      </p>
                    </td>
                    <td className="px-3 sm:px-4 py-2.5">
                      <p className="text-xs text-foreground truncate max-w-[130px] sm:max-w-none">{mov.concepto}</p>
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 hidden sm:table-cell">
                      <span className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full ${metodoBadge[mov.metodo] || "bg-muted text-muted-foreground"}`}>
                        {mov.metodo}
                      </span>
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 hidden sm:table-cell">
                      <span className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full ${tipoBadge[mov.tipo]}`}>{tipoLabel[mov.tipo]}</span>
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 text-right">
                      {/* "cierre" (2026-09-22): monto es la diferencia del
                          corte, no un ingreso/egreso — un $0 ahí es la caja
                          cuadrando perfecto, no debería verse en rojo como
                          si fuera un egreso, así que aquí sí cuenta como
                          "bien" (mismo criterio que el modal de cerrar
                          caja: 0 = verde, sobrante = cyan, faltante = rojo). */}
                      <span
                        className={`text-xs font-semibold ${
                          mov.tipo === "cierre"
                            ? mov.monto === 0
                              ? "text-emerald-600"
                              : mov.monto > 0
                              ? "text-cyan-600"
                              : "text-red-500"
                            : mov.monto > 0
                            ? "text-emerald-600"
                            : "text-red-500"
                        }`}
                      >
                        {mov.monto > 0 ? "+" : ""}
                        {formatMXN(mov.monto)}
                      </span>
                    </td>
                  </tr>
                ))}
                {movsFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">
                      Sin movimientos en este período
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </>
          )}
        </div>
      </div>

      {/* Modal registrar movimiento */}
      {mostrarModal && sesionActual && (
        <div
          className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50"
          onClick={cancelarModal}
        >
          <div className="bg-card rounded-t-2xl sm:rounded-2xl p-5 w-full sm:w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-foreground mb-4">Nuevo movimiento</h2>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(["ingreso", "egreso"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTipoMov(t)}
                  className={`py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                    tipoMov === t
                      ? t === "ingreso"
                        ? "bg-emerald-500 text-white"
                        : "bg-red-500 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {t === "ingreso" ? "Ingreso" : "Egreso"}
                </button>
              ))}
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-[12.5px] font-medium text-muted-foreground mb-1">Concepto</label>
                <input
                  type="text"
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value)}
                  placeholder="Ej. Pago de luz"
                  className="w-full px-3 py-2 border border-border rounded-lg text-xs bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-muted-foreground mb-1">Monto</label>
                <input
                  type="number"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="$0.00"
                  className="w-full px-3 py-2 border border-border rounded-lg text-xs bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              {error && <p className="text-[12.5px] text-red-500">{error}</p>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={cancelarModal}
                disabled={pending}
                className="flex-1 py-2 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleRegistrarMovimiento}
                disabled={pending}
                className={`flex-1 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50 ${
                  tipoMov === "ingreso" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-red-500 hover:bg-red-600"
                }`}
              >
                {pending ? "Guardando..." : "Registrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal abrir caja */}
      {mostrarAbrirModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50"
          onClick={cancelarModal}
        >
          <div className="bg-card rounded-t-2xl sm:rounded-2xl p-5 w-full sm:w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-foreground mb-4">Abrir caja</h2>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-[12.5px] font-medium text-muted-foreground mb-1">Monto de apertura</label>
                <input
                  type="number"
                  value={montoApertura}
                  onChange={(e) => setMontoApertura(e.target.value)}
                  placeholder="$0.00"
                  autoFocus
                  className="w-full px-3 py-2 border border-border rounded-lg text-xs bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              {error && <p className="text-[12.5px] text-red-500">{error}</p>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={cancelarModal}
                disabled={pending}
                className="flex-1 py-2 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleAbrirCaja}
                disabled={pending}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-50"
              >
                {pending ? "Abriendo..." : "Abrir caja"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cerrar caja */}
      {mostrarCerrarModal && sesionActual && (
        <div
          className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50"
          onClick={cancelarModal}
        >
          <div className="bg-card rounded-t-2xl sm:rounded-2xl p-5 w-full sm:w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-foreground mb-1">Cerrar caja</h2>
            {/* 2026-09-24, a petición de Carlos (conteo "a ciegas" — ver el
                comentario largo en Role.verMontosCaja, schema.prisma): un
                empleado sin nivel supervisor NUNCA ve "Efectivo esperado"
                antes de contar, para que cuente el efectivo físico de
                verdad en vez de solo escribir lo que ya vio en pantalla —
                un faltante real así sí se nota al revisarlo un supervisor. */}
            {puedeVerMontos && (
              <p className="text-[12.5px] text-muted-foreground mb-4">
                Efectivo esperado: <span className="font-semibold text-foreground">{formatMXN(sesionActual.efectivoEsperado)}</span>
              </p>
            )}
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-[12.5px] font-medium text-muted-foreground mb-1">Efectivo contado</label>
                <input
                  type="number"
                  value={efectivoContado}
                  onChange={(e) => setEfectivoContado(e.target.value)}
                  placeholder="$0.00"
                  autoFocus
                  className="w-full px-3 py-2 border border-border rounded-lg text-xs bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-muted-foreground mb-1">Notas (opcional)</label>
                <input
                  type="text"
                  value={notasCierre}
                  onChange={(e) => setNotasCierre(e.target.value)}
                  placeholder="Ej. Faltante por cambio no registrado"
                  className="w-full px-3 py-2 border border-border rounded-lg text-xs bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              {puedeVerMontos && efectivoContado && Number.isFinite(parseFloat(efectivoContado)) && (
                <p
                  className={`text-[12.5px] font-medium ${
                    parseFloat(efectivoContado) - sesionActual.efectivoEsperado === 0
                      ? "text-emerald-600"
                      : parseFloat(efectivoContado) - sesionActual.efectivoEsperado > 0
                      ? "text-cyan-600"
                      : "text-red-500"
                  }`}
                >
                  Diferencia: {formatMXN(parseFloat(efectivoContado) - sesionActual.efectivoEsperado)}
                </p>
              )}
              {error && <p className="text-[12.5px] text-red-500">{error}</p>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={cancelarModal}
                disabled={pending}
                className="flex-1 py-2 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCerrarCaja}
                disabled={pending}
                className="flex-1 py-2 rounded-lg text-xs font-medium text-background bg-foreground/90 hover:bg-foreground disabled:opacity-50"
              >
                {pending ? "Cerrando..." : "Cerrar caja"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
