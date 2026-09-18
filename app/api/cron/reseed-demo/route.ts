import { NextResponse } from "next/server";
import { refrescarTodosLosNegociosDemo } from "@/prisma/seed-demo";

/**
 * Endpoint que Vercel Cron llama una vez por semana (ver el arreglo
 * "crons" en vercel.json) para resolver la queja de Carlos en producción:
 * "ventas en $0 en lunes... para ser un demo no sirve. Ningún negocio que
 * ocupe un SaaS debe tener ventas en $0 por día." (2026-09-18).
 *
 * Solo RE-siembra la semana operativa de los 20 negocios demo que YA
 * existen (ventas, caja, reparaciones, asistencia, nómina, compras,
 * factura) — nunca su catálogo, clientes o personal, y nunca crea un
 * negocio nuevo. La lógica real vive en prisma/seed-demo.ts
 * (refrescarTodosLosNegociosDemo → refrescarNegocioDemo →
 * sembrarSemanaOperativa), el mismo código que corre Carlos a mano con
 * `npx tsx prisma/seed-demo.ts --refrescar` — este endpoint solo lo llama
 * automáticamente para que nadie tenga que acordarse de hacerlo.
 *
 * Protegido con CRON_SECRET (variable de entorno que hay que crear en
 * Vercel — ver el aviso que Carlos recibió junto con este cambio): Vercel
 * agrega automáticamente el header `Authorization: Bearer <CRON_SECRET>`
 * en cada llamada programada, así que cualquier otra petición sin ese
 * secreto se rechaza. Sin CRON_SECRET configurado, el endpoint se niega a
 * correr en vez de quedar abierto a cualquiera que adivine la URL.
 */

// Refrescar 20 negocios demo (borrar + volver a sembrar su semana) es
// bastante más lento que una ruta normal de la app — el límite por
// default de Vercel (10s en Hobby) no alcanza.
export const maxDuration = 300;

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secreto) {
    return NextResponse.json({ error: "CRON_SECRET no está configurado en las variables de entorno." }, { status: 500 });
  }
  if (auth !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const resultado = await refrescarTodosLosNegociosDemo();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    console.error("❌ Error en /api/cron/reseed-demo:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Error desconocido" }, { status: 500 });
  }
}
