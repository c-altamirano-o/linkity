import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, ShoppingCart, Wrench, GitBranch, FileText, BarChart3, ShieldCheck,
  Smartphone, Car, Bike, Scissors, Stethoscope, PawPrint, Store, Check,
} from "lucide-react";

const FEATURES = [
  {
    icon: ShoppingCart,
    title: "Punto de venta ultra rápido",
    desc: "Vende productos y servicios, cobra con pagos mixtos y descuenta inventario automáticamente en cada sucursal.",
  },
  {
    icon: Wrench,
    title: "Reparaciones con seguimiento",
    desc: "Da de alta un equipo, muévelo por cada estatus del taller y cóbralo al entregarlo — todo queda en el historial.",
  },
  {
    icon: GitBranch,
    title: "Control multi-sucursal",
    desc: "Inventario, caja y reportes separados por sucursal, con un resumen consolidado de todo tu negocio.",
  },
  {
    icon: FileText,
    title: "Facturación CFDI",
    desc: "Genera y timbra facturas directo desde tus ventas, con el folio y los datos fiscales de tu cliente.",
  },
  {
    icon: BarChart3,
    title: "Dashboard en tiempo real",
    desc: "Ventas, reparaciones y caja del día sin tener que armar un reporte a mano.",
  },
  {
    icon: ShieldCheck,
    title: "Tus datos, aislados",
    desc: "Cada negocio vive en su propio espacio — nadie más ve tu información, ni tú la de otros.",
  },
];

const RUBROS = [
  { icon: Smartphone, label: "Celulares y electrónica" },
  { icon: Car, label: "Talleres automotrices" },
  { icon: Bike, label: "Motos y bicicletas" },
  { icon: Scissors, label: "Barberías y estética" },
  { icon: Stethoscope, label: "Consultorios" },
  { icon: PawPrint, label: "Veterinarias" },
  { icon: Store, label: "Comercio y retail" },
];

const PLANES = [
  {
    nombre: "Básico",
    precio: 499,
    desc: "Para un negocio con una sola sucursal que está arrancando.",
    destacado: false,
  },
  {
    nombre: "Pro",
    precio: 999,
    desc: "Para negocios en crecimiento con más de una sucursal.",
    destacado: true,
  },
  {
    nombre: "Enterprise",
    precio: 1999,
    desc: "Para franquicias y operaciones con varias sucursales activas.",
    destacado: false,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Image
            src="/images/logo-full.svg"
            alt="Linkity Soluciones"
            width={150}
            height={28}
            className="object-contain"
          />
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/register"
              className="text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg transition-colors"
            >
              Crear cuenta
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[32rem] h-[32rem] bg-primary/10 rounded-full -translate-y-1/3 translate-x-1/3 blur-3xl" />
        <div className="mx-auto max-w-6xl px-6 pt-20 pb-24 relative">
          <span className="inline-block bg-primary/10 text-primary text-xs font-semibold px-3 py-1 rounded-full mb-5 tracking-wide">
            HECHO PARA NEGOCIOS DE SERVICIO Y RETAIL
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight max-w-2xl">
            El ecosistema integral para tu negocio
          </h1>
          <p className="text-muted-foreground text-lg mt-5 max-w-xl leading-relaxed">
            Punto de venta, reparaciones, inventario, caja, personal y facturación CFDI — todo en una sola
            plataforma que se adapta al giro de tu negocio.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-8">
            <Link
              href="/register"
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Crear mi cuenta <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="flex items-center gap-2 border border-border hover:bg-muted font-medium px-6 py-3 rounded-lg transition-colors"
            >
              Ya tengo cuenta
            </Link>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-8 text-sm text-muted-foreground">
            {["Todos los módulos activos desde el día uno", "Personalizado a tu giro de negocio", "Cancela cuando quieras"].map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-primary" /> {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl sm:text-3xl font-bold text-center">Todo lo que tu negocio necesita</h2>
          <p className="text-muted-foreground text-center mt-2 max-w-lg mx-auto">
            Sin módulos por separado ni integraciones a medias — un solo sistema conectado de punta a punta.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-12">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-card border border-border rounded-xl p-6">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-1.5">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl sm:text-3xl font-bold text-center">Para el giro de tu negocio</h2>
          <p className="text-muted-foreground text-center mt-2 max-w-lg mx-auto">
            Al registrarte eliges tu rubro y la plataforma ajusta los nombres y el enfoque a tu negocio.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-10">
            {RUBROS.map((r) => (
              <div
                key={r.label}
                className="flex items-center gap-2 border border-border rounded-full px-4 py-2 text-sm bg-card"
              >
                <r.icon className="w-4 h-4 text-primary" />
                {r.label}
              </div>
            ))}
            <div className="flex items-center gap-2 border border-dashed border-border rounded-full px-4 py-2 text-sm text-muted-foreground">
              +13 giros más
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl sm:text-3xl font-bold text-center">Planes simples, sin sorpresas</h2>
          <p className="text-muted-foreground text-center mt-2 max-w-lg mx-auto">
            Elige tu vigencia al registrarte — 1, 3, 6 o 12 meses — con la opción de renovar automáticamente.
          </p>
          <div className="grid sm:grid-cols-3 gap-6 mt-12 max-w-4xl mx-auto">
            {PLANES.map((p) => (
              <div
                key={p.nombre}
                className={`rounded-xl p-6 border ${p.destacado ? "border-primary bg-card shadow-lg shadow-primary/10 relative" : "border-border bg-card"}`}
              >
                {p.destacado && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[11px] font-semibold px-3 py-1 rounded-full">
                    MÁS POPULAR
                  </span>
                )}
                <h3 className="font-semibold text-lg">{p.nombre}</h3>
                <p className="text-3xl font-bold mt-2">
                  ${p.precio.toLocaleString("es-MX")}
                  <span className="text-sm font-normal text-muted-foreground"> MXN / mes</span>
                </p>
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{p.desc}</p>
                <Link
                  href="/register"
                  className={`mt-6 flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    p.destacado
                      ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                      : "border border-border hover:bg-muted"
                  }`}
                >
                  Empezar <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold">Crea tu cuenta en menos de dos minutos</h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            Sin instalar nada. Configura tu negocio y empieza a vender hoy mismo.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-3 rounded-lg mt-6 transition-colors"
          >
            Crear mi cuenta <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Image
            src="/images/favicon.svg"
            alt="Linkity"
            width={24}
            height={24}
            className="opacity-60"
          />
          <p className="text-xs text-muted-foreground">
            (c) 2026 Linkity Soluciones. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link href="/login" className="hover:text-foreground transition-colors">Iniciar sesión</Link>
            <Link href="/register" className="hover:text-foreground transition-colors">Crear cuenta</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
