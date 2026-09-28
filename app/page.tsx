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
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Image
            src="/images/logo-full.svg"
            alt="Linkity Soluciones"
            width={150}
            height={28}
            className="object-contain"
          />
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-2"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/register"
              className="text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 rounded-lg transition-all shadow-sm hover:shadow-md"
            >
              Crear cuenta
            </Link>
          </div>
        </div>
      </header>

      {/* HERO SECTION REDISEÑADO */}
      <section className="relative pt-16 pb-24 lg:pt-28 lg:pb-32">
        {/* Fondos dinámicos / Blobs */}
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-primary/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[30rem] h-[30rem] bg-primary/5 rounded-full translate-y-1/3 -translate-x-1/3 blur-[100px] pointer-events-none" />

        <div className="mx-auto max-w-7xl px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            
            {/* Columna Izquierda: Textos y CTAs */}
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-bold px-3 py-1.5 rounded-full mb-6 tracking-wide border border-primary/20">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                HECHO PARA NEGOCIOS DE SERVICIO Y RETAIL
              </span>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight mb-6">
                El ecosistema integral <br className="hidden lg:block"/> para tu negocio
              </h1>
              <p className="text-muted-foreground text-lg sm:text-xl mb-8 leading-relaxed max-w-xl">
                Punto de venta, reparaciones, inventario, caja, personal y facturación CFDI — todo en una sola plataforma que se adapta al giro de tu empresa.
              </p>
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-10">
                <Link
                  href="/register"
                  className="flex justify-center items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-4 rounded-xl transition-all shadow-lg shadow-primary/25 hover:shadow-primary/40 w-full sm:w-auto"
                >
                  Crear mi cuenta <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  href="/login"
                  className="flex justify-center items-center gap-2 bg-background border-2 border-border hover:border-primary/50 text-foreground font-medium px-8 py-4 rounded-xl transition-all w-full sm:w-auto"
                >
                  Ya tengo cuenta
                </Link>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground font-medium">
                {["Módulos activos desde el día uno", "Ajustado a tu rubro", "Cancela cuando quieras"].map((t) => (
                  <span key={t} className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 text-primary" />
                    </div>
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Columna Derecha: Mockup del Sistema */}
            <div className="relative mx-auto w-full max-w-[600px] lg:max-w-none mt-8 lg:mt-0">
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/30 to-transparent rounded-2xl blur-3xl transform rotate-3" />
              <div className="relative bg-background border border-border rounded-2xl shadow-2xl overflow-hidden ring-1 ring-border/50">
                
                {/* Cabecera simulada de navegador */}
                <div className="bg-muted/40 border-b border-border px-4 py-3 flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]" />
                    <div className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]" />
                    <div className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]" />
                  </div>
                </div>
                
                {/* Imagen del Dashboard */}
                <Image
                  src="/images/dashboard-preview.png"
                  alt="Vista previa del Dashboard de Linkity"
                  width={1200}
                  height={800}
                  className="w-full h-auto object-cover"
                  priority
                />
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* EL RESTO DE LAS SECCIONES SE MANTIENEN IGUAL PERO CENTRADAS EN MAX-W-7XL */}
      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <h2 className="text-3xl sm:text-4xl font-bold text-center tracking-tight">Todo lo que tu negocio necesita</h2>
          <p className="text-muted-foreground text-center mt-3 max-w-lg mx-auto text-lg">
            Sin módulos por separado ni integraciones a medias — un solo sistema conectado de punta a punta.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-16">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-background border border-border rounded-2xl p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                  <f.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <h2 className="text-3xl sm:text-4xl font-bold text-center tracking-tight">Para el giro de tu negocio</h2>
          <p className="text-muted-foreground text-center mt-3 max-w-lg mx-auto text-lg">
            Al registrarte eliges tu rubro y la plataforma ajusta los nombres y el enfoque a tu operación.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-12">
            {RUBROS.map((r) => (
              <div
                key={r.label}
                className="flex items-center gap-2 border border-border rounded-full px-5 py-2.5 text-sm font-medium bg-background shadow-sm hover:border-primary/50 transition-colors cursor-default"
              >
                <r.icon className="w-4 h-4 text-primary" />
                {r.label}
              </div>
            ))}
            <div className="flex items-center gap-2 border border-dashed border-border rounded-full px-5 py-2.5 text-sm font-medium text-muted-foreground bg-muted/20">
              +13 giros más
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <h2 className="text-3xl sm:text-4xl font-bold text-center tracking-tight">Planes simples, sin sorpresas</h2>
          <p className="text-muted-foreground text-center mt-3 max-w-lg mx-auto text-lg">
            Elige tu vigencia al registrarte — 1, 3, 6 o 12 meses — con la opción de renovar automáticamente.
          </p>
          <div className="grid sm:grid-cols-3 gap-8 mt-16 max-w-5xl mx-auto">
            {PLANES.map((p) => (
              <div
                key={p.nombre}
                className={`rounded-2xl p-8 border ${p.destacado ? "border-primary bg-background shadow-xl shadow-primary/10 relative transform sm:-translate-y-4" : "border-border bg-background"}`}
              >
                {p.destacado && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[13px] font-bold px-4 py-1 rounded-full shadow-sm">
                    MÁS POPULAR
                  </span>
                )}
                <h3 className="font-bold text-xl">{p.nombre}</h3>
                <p className="text-4xl font-extrabold mt-4">
                  ${p.precio.toLocaleString("es-MX")}
                  <span className="text-base font-normal text-muted-foreground"> MXN / mes</span>
                </p>
                <p className="text-muted-foreground mt-4 leading-relaxed">{p.desc}</p>
                <Link
                  href="/register"
                  className={`mt-8 flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold transition-all ${
                    p.destacado
                      ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
                      : "border-2 border-border hover:border-primary/50 text-foreground"
                  }`}
                >
                  Empezar <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Crea tu cuenta en menos de dos minutos</h2>
          <p className="text-muted-foreground mt-4 max-w-md mx-auto text-lg">
            Sin instalar nada. Configura tu negocio y empieza a vender hoy mismo.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-4 rounded-xl mt-8 transition-all shadow-lg shadow-primary/25"
          >
            Crear mi cuenta <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border bg-muted/10">
        <div className="mx-auto max-w-7xl px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <Image
            src="/images/favicon.svg"
            alt="Linkity"
            width={24}
            height={24}
            className="opacity-60 grayscale hover:grayscale-0 transition-all"
          />
          <p className="text-sm text-muted-foreground font-medium">
            (c) 2026 Linkity Soluciones. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-6 text-sm text-muted-foreground font-medium">
            <Link href="/login" className="hover:text-foreground transition-colors">Iniciar sesión</Link>
            <Link href="/register" className="hover:text-foreground transition-colors">Crear cuenta</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}