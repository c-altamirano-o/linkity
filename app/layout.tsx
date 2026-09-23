import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
