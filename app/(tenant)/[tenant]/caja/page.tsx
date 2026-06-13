"use client";

import { useState, useEffect, useRef } from "react";
import { Lock, Plus, Filter, TrendingDown, TrendingUp, ShoppingCart, Calculator, FileDown, ChevronDown } from "lucide-react";

type Periodo = "hoy" | "semana" | "mes" | "año" | "periodo";

const movimientosData = [
  { id: 1,  folio: "VTA-0089", hora: "2:45 pm",  concepto: "Cargador USB-C 20W",           metodo: "Efectivo",      tipo: "venta",      monto: 280,   fecha: "2026-05-28" },
  { id: 2,  folio: "EGR-0012", hora: "1:30 pm",  concepto: "Pago servicio de limpieza",    metodo: "Efectivo",      tipo: "egreso",     monto: -200,  fecha: "2026-05-28" },
  { id: 3,  folio: "VTA-0088", hora: "12:10 pm", concepto: "iPhone 14 + Funda + Cable",    metodo: "Mixto",         tipo: "venta",      monto: 13080, fecha: "2026-05-28" },
  { id: 4,  folio: "EGR-0011", hora: "11:00 am", concepto: "Pago renta local",              metodo: "Efectivo",      tipo: "egreso",     monto: -500,  fecha: "2026-05-28" },
  { id: 5,  folio: "VTA-0087", hora: "11:30 am", concepto: "AirPods Pro",                  metodo: "Tarjeta",       tipo: "venta",      monto: 4200,  fecha: "2026-05-28" },
  { id: 6,  folio: "REP-0040", hora: "10:30 am", concepto: "Cobro reparacion iPhone 12",   metodo: "Efectivo",      tipo: "reparacion", monto: 650,   fecha: "2026-05-28" },
  { id: 7,  folio: "APT-001",  hora: "8:00 am",  concepto: "Apertura de caja",             metodo: "Efectivo",      tipo: "apertura",   monto: 2000,  fecha: "2026-05-28" },
  { id: 8,  folio: "VTA-0086", hora: "6:20 pm",  concepto: "Funda iPhone 14",              metodo: "Efectivo",      tipo: "venta",      monto: 350,   fecha: "2026-05-27" },
  { id: 9,  folio: "VTA-0085", hora: "4:10 pm",  concepto: "Samsung S23",                  metodo: "Tarjeta",       tipo: "venta",      monto: 10800, fecha: "2026-05-27" },
  { id: 10, folio: "REP-0039", hora: "3:30 pm",  concepto: "Cobro reparacion Samsung S22", metodo: "Efectivo",      tipo: "reparacion", monto: 950,   fecha: "2026-05-27" },
  { id: 11, folio: "VTA-0084", hora: "2:00 pm",  concepto: "Bateria iPhone 12",            metodo: "Transferencia", tipo: "venta",      monto: 450,   fecha: "2026-05-27" },
  { id: 12, folio: "EGR-0010", hora: "11:00 am", concepto: "Compra de materiales",         metodo: "Efectivo",      tipo: "egreso",     monto: -380,  fecha: "2026-05-27" },
  { id: 13, folio: "VTA-0083", hora: "9:15 am",  concepto: "Cable Lightning x2",           metodo: "Efectivo",      tipo: "venta",      monto: 360,   fecha: "2026-05-27" },
];

const tipoBadge: Record<string, string> = {
  venta:      "bg-emerald-50 text-emerald-700",
  egreso:     "bg-red-50 text-red-600",
  reparacion: "bg-purple-50 text-purple-700",
  apertura:   "bg-blue-50 text-blue-700",
  ingreso:    "bg-cyan-50 text-cyan-700",
};

const tipoLabel: Record<string, string> = {
  venta:      "Venta",
  egreso:     "Egreso",
  reparacion: "Reparacion",
  apertura:   "Apertura",
  ingreso:    "Ingreso",
};

const metodoBadge: Record<string, string> = {
  "Efectivo":      "bg-[#4F46E5]/10 text-[#4F46E5]",
  "Tarjeta":       "bg-blue-50 text-blue-700",
  "Transferencia": "bg-emerald-50 text-emerald-700",
  "Mixto":         "bg-amber-50 text-amber-700",
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

export default function CajaPage() {
  const [periodo,           setPeriodo]           = useState<Periodo>("hoy");
  const [fechaInicio,       setFechaInicio]       = useState("2026-05-01");
  const [fechaFin,          setFechaFin]          = useState("2026-05-28");
  const [mostrarModal,      setMostrarModal]      = useState(false);
  const [mostrarExportMenu, setMostrarExportMenu] = useState(false);
  const [tipoMov,           setTipoMov]           = useState<"ingreso" | "egreso">("ingreso");
  const [concepto,          setConcepto]          = useState("");
  const [monto,             setMonto]             = useState("");
  const [tabMovil,          setTabMovil]          = useState<"caja" | "detalle">("caja");
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node))
        setMostrarExportMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const movsFiltrados = movimientosData.filter((m) => {
    if (periodo === "hoy")     return m.fecha === "2026-05-28";
    if (periodo === "semana")  return m.fecha >= "2026-05-22";
    if (periodo === "mes")     return m.fecha >= "2026-05-01";
    if (periodo === "año")     return m.fecha >= "2026-01-01";
    if (periodo === "periodo") return m.fecha >= fechaInicio && m.fecha <= fechaFin;
    return true;
  });

  const ingresos     = movsFiltrados.filter(m => m.monto > 0 && m.tipo !== "apertura").reduce((s, m) => s + m.monto, 0);
  const egresos      = Math.abs(movsFiltrados.filter(m => m.monto < 0).reduce((s, m) => s + m.monto, 0));
  const ticketsVenta = movsFiltrados.filter(m => m.tipo === "venta").length;
  const ticketProm   = ticketsVenta > 0
    ? Math.round(movsFiltrados.filter(m => m.tipo === "venta").reduce((s, m) => s + m.monto, 0) / ticketsVenta)
    : 0;

  const movHoy         = movimientosData.filter(m => m.fecha === "2026-05-28");
  const apertura       = 2000;
  const ventasEfectivo = movHoy.filter(m => m.tipo === "venta" && m.metodo === "Efectivo").reduce((s, m) => s + m.monto, 0);
  const ventasTarjeta  = movHoy.filter(m => m.tipo === "venta" && m.metodo === "Tarjeta").reduce((s, m) => s + m.monto, 0);
  const egresosDia     = Math.abs(movHoy.filter(m => m.monto < 0).reduce((s, m) => s + m.monto, 0));
  const totalEsperado  = apertura + ventasEfectivo - egresosDia;
  const totalVentasDia = ventasEfectivo + ventasTarjeta;

  const periodoLabel: Record<Periodo, string> = {
    hoy:     "Hoy",
    semana:  "Esta semana",
    mes:     "Este mes",
    año:     "Este año",
    periodo: `${fechaInicio} al ${fechaFin}`,
  };

  const fechaHoy      = new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
  const nombreArchivo = (ext: string) =>
    `Caja_${periodoLabel[periodo].replace(/ /g, "_")}_${new Date().toISOString().slice(0, 10)}.${ext}`;

  // ── CSV ──────────────────────────────────────────────────
  const exportarCSV = () => {
    const lines = [
      `# Cell Express — Reporte de Caja`,
      `# Periodo: ${periodoLabel[periodo]}`,
      `# Generado el: ${fechaHoy}`,
      `# RESUMEN DEL PERIODO`,
      `Total Ingresos,${ingresos}`,
      `Tickets de Venta,${ticketsVenta}`,
      `Ticket Promedio,${ticketProm}`,
      `Total Egresos,${egresos}`,
      `Neto,${ingresos - egresos}`,
      `Folio,Fecha,Hora,Concepto,Metodo,Tipo,Monto`,
      ...movsFiltrados.map(m =>
        `${m.folio},${m.fecha},${m.hora},"${m.concepto}",${m.metodo},${tipoLabel[m.tipo]},${m.monto}`
      ),
      `,,,,, TOTAL INGRESOS,${ingresos}`,
      `,,,,, TOTAL EGRESOS,${-egresos}`,
      `,,,,, NETO,${ingresos - egresos}`,
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = nombreArchivo("csv"); a.click();
    URL.revokeObjectURL(url);
    setMostrarExportMenu(false);
  };

  // ── XLSX ─────────────────────────────────────────────────
  const exportarXLSX = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb      = new ExcelJS.Workbook();
    wb.creator    = "Linkity Solutions";
    const ws      = wb.addWorksheet("Caja", { views: [{ state: "frozen", ySplit: 4 }] });
    const PU = "4F46E5", LP = "EDE9FE", DK = "0F172A";
    const GR = "F8FAFC", GN = "16A34A", RD = "DC2626";
    const BD = { style: "thin" as const, color: { argb: "E2E8F0" } };
    const bdr = { top: BD, bottom: BD, left: BD, right: BD };
    ws.columns = [{ wch:15},{wch:13},{wch:11},{wch:40},{wch:18},{wch:14},{wch:16}];
    const addMerged = (range: string, text: string, bg: string, fc: string, sz: number, bold = false, align: any = "center") => {
      ws.mergeCells(range);
      const c = ws.getCell(range.split(":")[0]);
      c.value = text; c.font = { bold, size: sz, color: { argb: fc } };
      c.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      c.alignment = { horizontal: align, vertical: "middle" };
    };
    addMerged("A1:G1", "Cell Express — Reporte de Caja", PU, "FFFFFF", 14, true);
    ws.getRow(1).height = 28;
    addMerged("A2:G2", `Periodo: ${periodoLabel[periodo]}`, LP, "374151", 10);
    addMerged("A3:G3", `Generado el: ${fechaHoy}`, "F1F5F9", "94A3B8", 9);
    ws.addRow([]);
    addMerged("A5:G5", "RESUMEN DEL PERIODO", "1E293B", "FFFFFF", 10, true, "left");
    ws.getRow(5).height = 20;
    [
      ["Total Ingresos",            ingresos,          GN],
      ["Tickets de Venta",          ticketsVenta,       DK],
      ["Ticket Promedio",           ticketProm,         DK],
      ["Total Egresos",             egresos,            RD],
      ["Neto (Ingresos − Egresos)", ingresos - egresos, (ingresos-egresos)>=0?GN:RD],
    ].forEach(([lbl, val, col], i) => {
      const row = ws.addRow([lbl, val]);
      row.height = 18;
      row.getCell(1).font = { size:10, color:{ argb: DK } };
      row.getCell(2).font = { bold:true, size:11, color:{ argb: col as string } };
      row.getCell(2).numFmt = '"$"#,##0.00';
      row.getCell(2).alignment = { horizontal:"right" };
      const bg = i%2===0?"FFFFFF":GR;
      [1,2].forEach(c => { row.getCell(c).fill={type:"pattern",pattern:"solid",fgColor:{argb:bg}}; row.getCell(c).border=bdr; });
    });
    ws.addRow([]);
    const nr = ws.rowCount+1;
    addMerged(`A${nr}:G${nr}`, "DETALLE DE MOVIMIENTOS", "1E293B", "FFFFFF", 10, true, "left");
    ws.getRow(ws.rowCount).height = 20;
    const hdr = ws.addRow(["Folio","Fecha","Hora","Concepto","Metodo","Tipo","Monto"]);
    hdr.height = 20;
    hdr.eachCell(c => { c.font={bold:true,size:10,color:{argb:"FFFFFF"}}; c.fill={type:"pattern",pattern:"solid",fgColor:{argb:PU}}; c.border=bdr; c.alignment={horizontal:"center",vertical:"middle"}; });
    movsFiltrados.forEach((m,i) => {
      const row = ws.addRow([m.folio,m.fecha,m.hora,m.concepto,m.metodo,tipoLabel[m.tipo],m.monto]);
      row.height = 17;
      const bg = i%2===0?"FFFFFF":GR;
      row.eachCell((cell,col) => {
        cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:bg}}; cell.border=bdr; cell.font={size:10,color:{argb:DK}};
        if (col===7) { cell.numFmt='"$"#,##0.00'; cell.alignment={horizontal:"right"}; cell.font={bold:true,size:10,color:{argb:m.monto>=0?GN:RD}}; }
      });
    });
    ws.addRow([]);
    [["TOTAL INGRESOS",ingresos],["TOTAL EGRESOS",-egresos],["NETO",ingresos-egresos]].forEach(([l,v]) => {
      const row = ws.addRow(["","","","","",l,v]);
      row.height=18; row.getCell(6).font={bold:true,size:10,color:{argb:DK}}; row.getCell(6).alignment={horizontal:"right"};
      row.getCell(7).font={bold:true,size:11,color:{argb:(v as number)>=0?GN:RD}}; row.getCell(7).numFmt='"$"#,##0.00'; row.getCell(7).alignment={horizontal:"right"}; row.getCell(7).border=bdr;
    });
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href=url; a.download=nombreArchivo("xlsx"); a.click(); URL.revokeObjectURL(url);
    setMostrarExportMenu(false);
  };

  // ── PNG ───────────────────────────────────────────────────
  const exportarPNG = () => {
    const W=1200, rowH=40;
    const H=110+130+70+(movsFiltrados.length+1)*rowH+130+60;
    const canvas=document.createElement("canvas"); canvas.width=W; canvas.height=H;
    const ctx=canvas.getContext("2d")!;
    const C={ purple:"#4F46E5",dark:"#0F172A",gray:"#F8FAFC",green:"#16A34A",red:"#DC2626",slate:"#64748B",border:"#E2E8F0",white:"#FFFFFF",subtext:"#94A3B8" };
    ctx.fillStyle=C.gray; ctx.fillRect(0,0,W,H);
    ctx.fillStyle=C.purple; ctx.fillRect(0,0,W,100);
    ctx.fillStyle=C.white; ctx.font="bold 28px Arial,sans-serif"; ctx.fillText("Cell Express — Reporte de Caja",40,44);
    ctx.font="15px Arial,sans-serif"; ctx.fillStyle="rgba(255,255,255,0.65)";
    ctx.fillText(`Periodo: ${periodoLabel[periodo]}  ·  Generado el: ${fechaHoy}  ·  linkity.mx`,40,76);
    const kpiY=118, kpiW=(W-80-3*14)/4;
    [{label:"Total Ingresos",value:formatMXN(ingresos),color:C.purple},{label:"Tickets de Venta",value:String(ticketsVenta),color:C.dark},{label:"Ticket Promedio",value:formatMXN(ticketProm),color:C.dark},{label:"Total Egresos",value:formatMXN(egresos),color:C.red}]
    .forEach((kpi,i)=>{ const x=40+i*(kpiW+14); ctx.fillStyle=C.white; roundRect(ctx,x,kpiY,kpiW,100,12); ctx.fill(); ctx.strokeStyle=C.border; ctx.lineWidth=1; ctx.stroke(); ctx.fillStyle=C.subtext; ctx.font="13px Arial,sans-serif"; ctx.fillText(kpi.label,x+16,kpiY+32); ctx.fillStyle=kpi.color; ctx.font="bold 26px Arial,sans-serif"; ctx.fillText(kpi.value,x+16,kpiY+74); });
    const tY=kpiY+130;
    ctx.fillStyle=C.dark; ctx.font="bold 13px Arial,sans-serif"; ctx.fillText("DETALLE DE MOVIMIENTOS",40,tY-12);
    const cols=[{label:"Folio",x:40,w:110},{label:"Fecha",x:160,w:110},{label:"Hora",x:280,w:100},{label:"Concepto",x:390,w:350},{label:"Metodo",x:750,w:140},{label:"Tipo",x:900,w:130},{label:"Monto",x:1040,w:120}];
    ctx.fillStyle=C.dark; ctx.fillRect(40,tY,W-80,rowH); ctx.fillStyle=C.white; ctx.font="bold 13px Arial,sans-serif";
    cols.forEach(c=>ctx.fillText(c.label,c.x+10,tY+27));
    movsFiltrados.forEach((mov,i)=>{ const y=tY+(i+1)*rowH; ctx.fillStyle=i%2===0?C.white:C.gray; ctx.fillRect(40,y,W-80,rowH); ctx.strokeStyle=C.border; ctx.lineWidth=0.5; ctx.beginPath(); ctx.moveTo(40,y+rowH); ctx.lineTo(W-40,y+rowH); ctx.stroke(); ctx.font="13px Arial,sans-serif"; ctx.fillStyle=C.purple; ctx.fillText(mov.folio,cols[0].x+10,y+26); ctx.fillStyle=C.slate; ctx.fillText(mov.fecha,cols[1].x+10,y+26); ctx.fillText(mov.hora,cols[2].x+10,y+26); ctx.fillStyle=C.dark; const ct=mov.concepto.length>42?mov.concepto.slice(0,42)+"…":mov.concepto; ctx.fillText(ct,cols[3].x+10,y+26); ctx.fillStyle=C.slate; ctx.fillText(mov.metodo,cols[4].x+10,y+26); ctx.fillText(tipoLabel[mov.tipo],cols[5].x+10,y+26); ctx.fillStyle=mov.monto>=0?C.green:C.red; ctx.font="bold 13px Arial,sans-serif"; const ms=(mov.monto>=0?"+":"")+formatMXN(mov.monto); ctx.fillText(ms,cols[6].x+cols[6].w-ctx.measureText(ms).width-10,y+26); });
    let ty=tY+(movsFiltrados.length+1)*rowH+20;
    [{label:"TOTAL INGRESOS",value:ingresos,color:C.green},{label:"TOTAL EGRESOS",value:-egresos,color:C.red},{label:"NETO",value:ingresos-egresos,color:(ingresos-egresos)>=0?C.green:C.red}]
    .forEach(tot=>{ ctx.fillStyle=C.white; roundRect(ctx,W-380-40,ty,380,30,6); ctx.fill(); ctx.strokeStyle=C.border; ctx.lineWidth=1; ctx.stroke(); ctx.fillStyle=C.dark; ctx.font="bold 12px Arial,sans-serif"; ctx.fillText(tot.label,W-380-30,ty+20); ctx.fillStyle=tot.color; ctx.font="bold 14px Arial,sans-serif"; const vs=(tot.value>=0?"+":"")+formatMXN(tot.value); ctx.fillText(vs,W-55-ctx.measureText(vs).width,ty+20); ty+=38; });
    const fy=H-44; ctx.fillStyle=C.border; ctx.fillRect(40,fy,W-80,1); ctx.fillStyle=C.subtext; ctx.font="11px Arial,sans-serif"; ctx.fillText("Generado por Linkity Solutions · linkity.mx · Documento no fiscal",40,fy+22); ctx.fillText(fechaHoy,W-40-ctx.measureText(fechaHoy).width,fy+22);
    canvas.toBlob(blob=>{ const url=URL.createObjectURL(blob!); const a=document.createElement("a"); a.href=url; a.download=nombreArchivo("png"); a.click(); URL.revokeObjectURL(url); },"image/png");
    setMostrarExportMenu(false);
  };

  // ── PDF ───────────────────────────────────────────────────
  const exportarPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const doc=new jsPDF({orientation:"landscape",unit:"pt",format:"a4"});
    const W=doc.internal.pageSize.getWidth(), PH=doc.internal.pageSize.getHeight();
    type RGB=[number,number,number];
    const PU:RGB=[79,70,229],DK:RGB=[15,23,42],GN:RGB=[22,163,74],RD:RGB=[220,38,38],GR:RGB=[248,250,252],LG:RGB=[226,232,240],WH:RGB=[255,255,255],SL:RGB=[100,116,139];
    doc.setFillColor(...PU); doc.rect(0,0,W,62,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(18); doc.setFont("helvetica","bold"); doc.text("Cell Express — Reporte de Caja",28,26);
    doc.setFontSize(9); doc.setFont("helvetica","normal"); doc.setTextColor(200,200,230); doc.text(`Periodo: ${periodoLabel[periodo]}  ·  Generado el: ${fechaHoy}`,28,48);
    const folio=`Folio: RPT-${new Date().toISOString().slice(0,10).replace(/-/g,"")}`; doc.text(folio,W-28-doc.getTextWidth(folio),48);
    const kpiY=78, kpiW=(W-56-3*10)/4;
    [{label:"Total Ingresos",value:formatMXN(ingresos),color:PU},{label:"Tickets de Venta",value:String(ticketsVenta),color:DK},{label:"Ticket Promedio",value:formatMXN(ticketProm),color:DK},{label:"Total Egresos",value:formatMXN(egresos),color:RD}]
    .forEach((kpi,i)=>{ const x=28+i*(kpiW+10); doc.setFillColor(...WH); doc.setDrawColor(...LG); doc.roundedRect(x,kpiY,kpiW,52,5,5,"FD"); doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(148,163,184); doc.text(kpi.label,x+10,kpiY+18); doc.setFontSize(15); doc.setFont("helvetica","bold"); doc.setTextColor(...(kpi.color as RGB)); doc.text(kpi.value,x+10,kpiY+40); });
    const tableY=kpiY+68;
    doc.setFontSize(8); doc.setFont("helvetica","bold"); doc.setTextColor(...PU); doc.text("DETALLE DE MOVIMIENTOS",28,tableY-7);
    const cols=[{label:"Folio",x:28,w:78},{label:"Fecha",x:110,w:75},{label:"Hora",x:190,w:62},{label:"Concepto",x:256,w:232},{label:"Metodo",x:492,w:88},{label:"Tipo",x:584,w:82},{label:"Monto",x:670,w:88}];
    doc.setFillColor(...PU); doc.rect(28,tableY,W-56,22,"F"); doc.setTextColor(255,255,255); doc.setFontSize(8.5); doc.setFont("helvetica","bold");
    cols.forEach(c=>doc.text(c.label,c.x+6,tableY+15));
    const rowH=20; let y=tableY+22;
    const drawTH=()=>{ doc.setFillColor(...PU); doc.rect(28,y-4,W-56,22,"F"); doc.setTextColor(255,255,255); doc.setFontSize(8.5); doc.setFont("helvetica","bold"); cols.forEach(c=>doc.text(c.label,c.x+6,y+13)); y+=22; };
    movsFiltrados.forEach((mov,i)=>{ if(y+rowH>PH-50){ doc.addPage(); y=28; drawTH(); } doc.setFillColor(...(i%2===0?WH:GR)); doc.rect(28,y,W-56,rowH,"F"); doc.setDrawColor(...LG); doc.line(28,y+rowH,W-28,y+rowH); doc.setFontSize(8.5); doc.setFont("helvetica","normal"); doc.setTextColor(...PU); doc.text(mov.folio,cols[0].x+6,y+14); doc.setTextColor(...SL); doc.text(mov.fecha,cols[1].x+6,y+14); doc.text(mov.hora,cols[2].x+6,y+14); doc.setTextColor(...DK); const ct=mov.concepto.length>38?mov.concepto.slice(0,38)+"…":mov.concepto; doc.text(ct,cols[3].x+6,y+14); doc.setTextColor(...SL); doc.text(mov.metodo,cols[4].x+6,y+14); doc.text(tipoLabel[mov.tipo],cols[5].x+6,y+14); doc.setFont("helvetica","bold"); doc.setTextColor(...(mov.monto>=0?GN:RD)); const ms=(mov.monto>=0?"+":"")+formatMXN(mov.monto); doc.text(ms,cols[6].x+cols[6].w-doc.getTextWidth(ms),y+14); y+=rowH; });
    y+=14;
    [{label:"TOTAL INGRESOS",v:ingresos,c:GN},{label:"TOTAL EGRESOS",v:-egresos,c:RD},{label:"NETO",v:ingresos-egresos,c:(ingresos-egresos)>=0?GN:RD}]
    .forEach(t=>{ doc.setFillColor(...WH); doc.setDrawColor(...LG); doc.roundedRect(W-28-270,y,270,20,4,4,"FD"); doc.setFontSize(8.5); doc.setFont("helvetica","bold"); doc.setTextColor(...DK); doc.text(t.label,W-28-270+12,y+14); doc.setTextColor(...(t.c as RGB)); const vs=(t.v>=0?"+":"")+formatMXN(t.v); doc.text(vs,W-28-12-doc.getTextWidth(vs),y+14); y+=26; });
    const totalPgs=(doc.internal as any).getNumberOfPages();
    for(let p=1;p<=totalPgs;p++){ doc.setPage(p); doc.setDrawColor(...LG); doc.line(28,PH-30,W-28,PH-30); doc.setFontSize(7.5); doc.setFont("helvetica","normal"); doc.setTextColor(148,163,184); doc.text("Generado por Linkity Solutions · linkity.mx · Documento no fiscal",28,PH-14); const pg=`Pág. ${p} de ${totalPgs}`; doc.text(pg,W-28-doc.getTextWidth(pg),PH-14); }
    doc.save(nombreArchivo("pdf"));
    setMostrarExportMenu(false);
  };

  return (
    <div className="flex flex-col h-full">

      {/* ── Tabs móvil ─────────────────────────────────────── */}
      <div className="md:hidden flex border-b border-slate-200 bg-white flex-shrink-0">
        {[
          { key: "caja",    label: "💰 Control de Caja" },
          { key: "detalle", label: "📋 Detalle de Ventas" },
        ].map(tab => (
          <button key={tab.key} onClick={() => setTabMovil(tab.key as any)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              tabMovil === tab.key
                ? "border-b-2 border-[#4F46E5] text-[#4F46E5]"
                : "text-slate-500"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Panel izquierdo (Caja) ───────────────────────── */}
        <div className={`
          ${tabMovil === "caja" ? "flex" : "hidden"} md:flex
          w-full md:w-64 flex-col bg-white border-r border-slate-200 flex-shrink-0
        `}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-medium text-slate-800">Control de caja</span>
            <div className="flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Abierta
            </div>
          </div>

          <div className="mx-3 my-3 bg-[#4F46E5] rounded-xl p-4">
            <p className="text-[10px] text-white/60 mb-1">Efectivo actual en caja</p>
            <p className="text-[26px] font-bold text-white leading-none mb-1">{formatMXN(totalEsperado)}</p>
            <p className="text-[10px] text-white/50">Apertura: {formatMXN(apertura)} · Hace 6 horas</p>
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/15">
              {[
                { label: "Ventas",   value: formatMXN(totalVentasDia) },
                { label: "Egresos",  value: formatMXN(egresosDia) },
                { label: "Esperado", value: formatMXN(totalEsperado) },
              ].map(i => (
                <div key={i.label}>
                  <p className="text-[9px] text-white/50 mb-0.5">{i.label}</p>
                  <p className="text-[11px] font-medium text-white">{i.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-2">
            <p className="text-[10px] font-semibold text-slate-400 tracking-widest mb-2">RESUMEN DEL DÍA</p>
            <div className="space-y-1">
              {[
                { label: "Apertura",           value: formatMXN(apertura),         dot: "bg-emerald-500" },
                { label: "Ventas en efectivo",  value: formatMXN(ventasEfectivo),   dot: "bg-[#4F46E5]" },
                { label: "Ventas con tarjeta",  value: formatMXN(ventasTarjeta),    dot: "bg-cyan-500" },
                { label: "Egresos / Gastos",    value: `-${formatMXN(egresosDia)}`, dot: "bg-red-500", neg: true },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-slate-50">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${row.dot}`} />
                    <span className="text-xs text-slate-600">{row.label}</span>
                  </div>
                  <span className={`text-xs font-medium ${row.neg ? "text-red-500" : "text-slate-800"}`}>{row.value}</span>
                </div>
              ))}
              <div className="h-px bg-slate-200 my-1" />
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs font-semibold text-slate-800">Total esperado</span>
                <span className="text-sm font-bold text-[#4F46E5]">{formatMXN(totalEsperado)}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-xs text-slate-500">Diferencia</span>
                <span className="text-xs font-medium text-emerald-600">$0.00 ✓</span>
              </div>
            </div>
          </div>

          <div className="p-3 space-y-2">
            <button onClick={() => setMostrarModal(true)}
              className="w-full flex items-center justify-center gap-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" /> Registrar movimiento
            </button>
            <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium rounded-lg transition-colors">
              <Lock className="w-3.5 h-3.5" /> Cerrar caja del día
            </button>
          </div>
        </div>

        {/* ── Panel derecho (Detalle) ──────────────────────── */}
        <div className={`
          ${tabMovil === "detalle" ? "flex" : "hidden"} md:flex
          flex-1 flex-col overflow-hidden
        `}>
          {/* Topbar filtros */}
          <div className="bg-white border-b border-slate-200 px-3 sm:px-4 py-2.5 flex items-center gap-2 sm:gap-3 flex-wrap">
            <span className="text-sm font-medium text-slate-800 whitespace-nowrap hidden sm:block">Detalle de ventas</span>
            <div className="flex gap-1 overflow-x-auto flex-shrink-0">
              {(["hoy","semana","mes","año","periodo"] as Periodo[]).map(p => (
                <button key={p} onClick={() => setPeriodo(p)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium capitalize transition-colors whitespace-nowrap ${
                    periodo === p ? "bg-[#4F46E5] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}>
                  {p==="hoy"?"Hoy":p==="semana"?"Semana":p==="mes"?"Mes":p==="año"?"Año":"Período"}
                </button>
              ))}
            </div>

            {periodo === "periodo" && (
              <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
                  className="px-2 py-1 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#4F46E5]" />
                <span className="text-xs text-slate-400">—</span>
                <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
                  className="px-2 py-1 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#4F46E5]" />
              </div>
            )}

            <div className="flex gap-2 ml-auto items-center">
              <button className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50">
                <Filter className="w-3 h-3" /> <span className="hidden sm:inline">Filtrar</span>
              </button>
              <div className="relative" ref={exportMenuRef}>
                <button onClick={() => setMostrarExportMenu(!mostrarExportMenu)}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white rounded-lg text-xs font-medium transition-colors">
                  <FileDown className="w-3 h-3" />
                  <span className="hidden sm:inline">Exportar</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${mostrarExportMenu ? "rotate-180" : ""}`} />
                </button>
                {mostrarExportMenu && (
                  <div className="absolute right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg z-30 overflow-hidden w-52">
                    {[
                      { icon:"📄", label:"CSV",          desc:"Compatible con cualquier sistema", fn:exportarCSV },
                      { icon:"📊", label:"Excel (XLSX)", desc:"Con formato y colores",            fn:exportarXLSX },
                      { icon:"🖼️", label:"PNG",          desc:"Imagen para compartir",            fn:exportarPNG },
                      { icon:"📑", label:"PDF",          desc:"Documento formal",                 fn:exportarPDF },
                    ].map(opt => (
                      <button key={opt.label} onClick={opt.fn}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-50 last:border-0">
                        <span className="text-base">{opt.icon}</span>
                        <div>
                          <p className="text-xs font-medium text-slate-800">{opt.label}</p>
                          <p className="text-[10px] text-slate-400">{opt.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Métricas período — 2×2 en móvil, 4 en línea en desktop */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 px-3 sm:px-4 py-3 bg-white border-b border-slate-200">
            {[
              { label:"Total ingresos",   value:formatMXN(ingresos),   sub:periodoLabel[periodo], color:"text-[#4F46E5]", icon:TrendingUp },
              { label:"Tickets de venta", value:String(ticketsVenta),  sub:"Transacciones",        color:"text-slate-800", icon:ShoppingCart },
              { label:"Ticket promedio",  value:formatMXN(ticketProm), sub:"Por venta",            color:"text-slate-800", icon:Calculator },
              { label:"Total egresos",    value:formatMXN(egresos),    sub:"Gastos del período",   color:"text-red-500",   icon:TrendingDown },
            ].map(m => (
              <div key={m.label} className="bg-slate-50 rounded-lg p-2.5 sm:p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[9px] sm:text-[10px] text-slate-400">{m.label}</p>
                  <m.icon className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${m.color}`} />
                </div>
                <p className={`text-sm sm:text-base font-semibold ${m.color}`}>{m.value}</p>
                <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5 truncate">{m.sub}</p>
              </div>
            ))}
          </div>

          {/* Tabla — columnas Método y Tipo ocultas en móvil */}
          <div className="flex-1 overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-white border-b border-slate-200 z-10">
                <tr>
                  {[
                    { label:"Folio · Hora", right:false, hide:false },
                    { label:"Concepto",     right:false, hide:false },
                    { label:"Método",       right:false, hide:true },
                    { label:"Tipo",         right:false, hide:true },
                    { label:"Monto",        right:true,  hide:false },
                  ].map(h => (
                    <th key={h.label} className={`text-left text-[10px] font-medium text-slate-400 px-3 sm:px-4 py-2.5 whitespace-nowrap ${h.right?"text-right":""} ${h.hide?"hidden sm:table-cell":""}`}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movsFiltrados.map(mov => (
                  <tr key={mov.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-3 sm:px-4 py-2.5">
                      <p className="text-[10px] font-semibold text-[#4F46E5]">{mov.folio}</p>
                      <p className="text-[9px] text-slate-400">{mov.hora} · <span className="hidden sm:inline">{mov.fecha}</span></p>
                    </td>
                    <td className="px-3 sm:px-4 py-2.5">
                      <p className="text-xs text-slate-800 truncate max-w-[130px] sm:max-w-none">{mov.concepto}</p>
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 hidden sm:table-cell">
                      <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${metodoBadge[mov.metodo]||"bg-slate-100 text-slate-500"}`}>
                        {mov.metodo}
                      </span>
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 hidden sm:table-cell">
                      <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${tipoBadge[mov.tipo]}`}>
                        {tipoLabel[mov.tipo]}
                      </span>
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 text-right">
                      <span className={`text-xs font-semibold ${mov.monto > 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {mov.monto > 0 ? "+" : ""}{formatMXN(mov.monto)}
                      </span>
                    </td>
                  </tr>
                ))}
                {movsFiltrados.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">Sin movimientos en este período</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal nuevo movimiento */}
      {mostrarModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full sm:w-80 shadow-xl">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Nuevo movimiento</h2>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(["ingreso","egreso"] as const).map(t => (
                <button key={t} onClick={() => setTipoMov(t)}
                  className={`py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                    tipoMov===t ? t==="ingreso"?"bg-emerald-500 text-white":"bg-red-500 text-white" : "bg-slate-100 text-slate-500"
                  }`}>
                  {t==="ingreso"?"Ingreso":"Egreso"}
                </button>
              ))}
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Concepto</label>
                <input type="text" value={concepto} onChange={e => setConcepto(e.target.value)}
                  placeholder="Ej. Pago de luz"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Monto</label>
                <input type="number" value={monto} onChange={e => setMonto(e.target.value)}
                  placeholder="$0.00"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setMostrarModal(false)}
                className="flex-1 py-2 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={() => setMostrarModal(false)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium text-white ${
                  tipoMov==="ingreso"?"bg-emerald-500 hover:bg-emerald-600":"bg-red-500 hover:bg-red-600"
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