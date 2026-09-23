import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

// Tipografía de toda la interfaz (2026-09-24, a petición de Carlos: "usemos
// SF Pro Display o alguna similar para todo el saas"). SF Pro es propiedad
// de Apple y su licencia no permite incrustarla como fuente web fuera de
// apps/sitios que promocionen hardware Apple — así que en vez de "bajarla"
// de algún lado, se usa la técnica que ya usan Notion/Linear/Vercel: la
// pila empieza con -apple-system/BlinkMacSystemFont (palabras clave que SOLO
// significan algo en macOS/iOS/iPadOS — en Windows y Android el navegador
// las ignora sin más). Eso hace que cualquier empleado en Mac/iPhone/iPad
// vea el SF Pro real del sistema, sin que Linkity distribuya la fuente. Para
// las computadoras de mostrador con Windows (la mayoría de los negocios de
// Carlos), cae en Inter — de licencia libre, auto-hospedada aquí mismo, con
// una geometría prácticamente idéntica a SF Pro Display (mismo origen de
// diseño: ambas parten de la tradición de Akzidenz/Helvetica con proporciones
// muy cercanas) — así todos los mostradores ven exactamente la misma
// tipografía entre sí, en vez de caer cada quien en la fuente por default de
// su sistema operativo (Segoe UI en Windows, Roboto en Android, etc.).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Linkity Soluciones",
  description: "Panel de administración y punto de venta de Linkity Soluciones.",
  // manifest.json + apple-mobile-web-app-* (abajo, en <head>): la base para
  // que el navegador ofrezca "Agregar a inicio" (Android) / "Agregar a
  // pantalla de inicio" (iOS) y para que funcionen las notificaciones push
  // — ver public/manifest.json y public/sw.js. 2026-09-23, a petición de
  // Carlos: la misma base sirve después para empaquetar con PWABuilder
  // hacia Microsoft Store sin tener que rehacer nada de esto.
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Linkity",
  },
  icons: {
    icon: "/favicon-32.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport = {
  themeColor: "#6c4fe5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
