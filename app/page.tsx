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
    title: "Integración API de Facturación",
    desc: "Conecta tu proveedor mediante API para emitir facturas directamente desde tus ventas.",
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
    caracteristicas: [
      "1 Sucursal",
      "Hasta 2 Usuarios",
      "Integración de API de facturación por separado"
    ],
    destacado: false,
  },
  {
    nombre: "Pro",
    precio: 999,
    desc: "Para negocios en crecimiento con varias sucursales.",
    caracteristicas: [
      "De 2 a 4 Sucursales",
      "De 1 a 5 Usuarios por sucursal",
      "Integración de API de facturación incluida"
    ],
    destacado: true,
  },
  {
    nombre: "Enterprise",
    precio: 1999,
    desc: "Para franquicias y operaciones con varias sucursales activas.",
    caracteristicas: [
      "5 o más sucursales",
      "Usuarios ilimitados",
      "Integración de API de facturación incluida"
    ],
    destacado: false,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <Image
            src="/images/logo-full.svg"
            alt="Linkity Soluciones"
            width={140}
            height={26}
            className="object-contain"
          />
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-2 hidden sm:block"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/register"
              className="text-xs sm:text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground px-4 sm:px-5 py-2 sm:py-2.5 rounded-full transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5"
            >
              Crear cuenta
            </Link>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative pt-10 pb-16 sm:pt-16 sm:pb-24 lg:pt-28 lg:pb-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 relative z-10">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-8 items-center">
            
            {/* Columna Izquierda: Textos */}
            <div className="lg:col-span-5 max-w-2xl mx-auto text-center lg:text-left">
              <div className="inline-flex items-center justify-center lg:justify-start gap-2 bg-primary/10 text-primary text-[11px] sm:text-xs font-bold px-3.5 py-1.5 rounded-full mb-6 tracking-wide border border-primary/20 backdrop-blur-md">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                SISTEMA INTEGRAL PARA SERVICIOS Y RETAIL
              </div>
              
              <h1 className="text-3xl sm:text-5xl lg:text-[4rem] font-extrabold leading-[1.15] tracking-tight mb-5 bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/70">
                Libera el potencial <br className="hidden lg:block"/> de tu negocio
              </h1>
              
              <p className="text-muted-foreground text-base sm:text-xl mb-8 leading-relaxed max-w-xl mx-auto lg:mx-0">
                Administra ventas, inventario, reparaciones y facturación vía API en una sola plataforma diseñada para crecer contigo.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mb-6">
                <Link
                  href="/register"
                  className="flex justify-center items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-7 py-3.5 rounded-full transition-all duration-300 shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-1 w-full sm:w-auto"
                >
                  Prueba 1 mes gratis <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            </div>

            {/* Columna Derecha: Composición Visual Enriquecida */}
            <div className="lg:col-span-7 relative w-full h-[320px] sm:h-[450px] lg:h-[650px] flex items-center justify-center mt-6 sm:mt-0">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-[90%] bg-gradient-to-tr from-primary/30 to-purple-500/20 blur-[90px] rounded-full pointer-events-none" />
              
              {/* Elemento 2: Dashboard Principal (Centro) */}
              <div className="absolute z-10 w-[95%] sm:w-[85%] lg:right-0 shadow-2xl rounded-xl sm:rounded-2xl overflow-hidden border border-border/50 bg-background transition-transform duration-700">
                <div className="bg-muted/60 border-b border-border/50 px-3 py-2 sm:px-4 sm:py-2.5 flex gap-1.5 backdrop-blur-sm">
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#FF5F56]" />
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#FFBD2E]" />
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#27C93F]" />
                </div>
                <Image src="/images/cap-2.png" width={1200} height={800} className="w-full h-auto" alt="Dashboard principal" priority />
              </div>

              {/* Elemento 4: Mockup Inferior Izquierdo (Punto de Venta) */}
              <div className="absolute z-20 w-[65%] sm:w-[55%] lg:w-[45%] -bottom-4 sm:-bottom-8 left-2 sm:-left-12 shadow-[0_20px_50px_rgba(0,0,0,0.4)] rounded-xl overflow-hidden border border-border bg-background">
                <div className="bg-muted/60 border-b border-border/50 px-2.5 py-1.5 sm:px-3 sm:py-2 flex gap-1.5 backdrop-blur-sm">
                  <span className="text-[9px] sm:text-[10px] font-medium text-muted-foreground">Punto de Venta</span>
                </div>
                <Image src="/images/cap-4.png" width={800} height={500} className="w-full h-auto" alt="Módulo POS" />
              </div>

              {/* Elemento 1: Mockup Superior Izquierdo (Inventario) */}
              <div className="hidden sm:block absolute z-30 w-[40%] -top-6 -left-4 shadow-[0_20px_40px_rgba(0,0,0,0.3)] rounded-xl overflow-hidden border border-border bg-background">
                <div className="bg-muted/60 border-b border-border/50 px-3 py-2 flex gap-1.5 backdrop-blur-sm">
                  <span className="text-[10px] font-medium text-muted-foreground">Inventario</span>
                </div>
                <Image src="/images/cap-1.png" width={600} height={400} className="w-full h-auto" alt="Módulo Inventario" />
              </div>
              
              {/* Elemento 3: Tarjeta Flotante Superior Derecha */}
              <div className="absolute z-40 right-2 sm:right-[-5%] top-[10%] sm:top-[15%] w-[45%] sm:w-[35%] lg:w-[30%] drop-shadow-xl transition-transform duration-700 rounded-xl overflow-hidden">
                <Image src="/images/cap-3.png" width={400} height={200} className="w-full h-auto object-contain" alt="Elemento 3" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
          <h2 className="text-2xl sm:text-4xl font-bold text-center tracking-tight">Todo lo que tu negocio necesita</h2>
          <p className="text-muted-foreground text-center mt-3 max-w-lg mx-auto text-base sm:text-lg">
            Sin módulos por separado ni integraciones a medias — un solo sistema conectado de punta a punta.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-12 sm:mt-16">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-background border border-border rounded-2xl p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                  <f.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm sm:text-base">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
          <h2 className="text-2xl sm:text-4xl font-bold text-center tracking-tight">Para el giro de tu negocio</h2>
          <p className="text-muted-foreground text-center mt-3 max-w-lg mx-auto text-base sm:text-lg">
            Al registrarte eliges tu rubro y la plataforma ajusta los nombres y el enfoque a tu operación.
          </p>
          <div className="flex flex-wrap justify-center gap-2.5 sm:gap-3 mt-10 sm:mt-12">
            {RUBROS.map((r) => (
              <div
                key={r.label}
                className="flex items-center gap-2 border border-border rounded-full px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-medium bg-background shadow-sm hover:border-primary/50 transition-colors cursor-default"
              >
                <r.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                {r.label}
              </div>
            ))}
            <div className="flex items-center gap-2 border border-dashed border-border rounded-full px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-medium text-muted-foreground bg-muted/20">
              +13 giros más
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center max-w-2xl mx-auto">
            <span className="inline-block bg-green-500/10 text-green-600 font-semibold px-3.5 py-1 rounded-full text-xs sm:text-sm mb-4 border border-green-500/20">
              🎁 Todos los planes incluyen 1 mes de prueba gratis
            </span>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight">Planes simples, sin sorpresas</h2>
            <p className="text-muted-foreground mt-3 text-base sm:text-lg">
              Elige tu vigencia al registrarte — 1, 3, 6 o 12 meses — con la opción de renovar automáticamente. Cancela cuando quieras.
            </p>
          </div>
          
          <div className="grid sm:grid-cols-3 gap-6 sm:gap-8 mt-12 max-w-6xl mx-auto">
            {PLANES.map((p) => (
              <div
                key={p.nombre}
                className={`rounded-2xl p-6 sm:p-8 border flex flex-col ${p.destacado ? "border-primary bg-background shadow-xl shadow-primary/10 relative transform sm:-translate-y-4" : "border-border bg-background"}`}
              >
                {p.destacado && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[12px] sm:text-[13px] font-bold px-4 py-1 rounded-full shadow-sm">
                    MÁS POPULAR
                  </span>
                )}
                <h3 className="font-bold text-xl">{p.nombre}</h3>
                <p className="text-3xl sm:text-4xl font-extrabold mt-4">
                  ${p.precio.toLocaleString("es-MX")}
                  <span className="text-sm sm:text-base font-normal text-muted-foreground"> MXN / mes</span>
                </p>
                <p className="text-muted-foreground mt-3 sm:mt-4 leading-relaxed text-xs sm:text-sm h-auto sm:h-10">{p.desc}</p>
                
                <div className="w-full h-px bg-border my-5 sm:my-6" />
                
                <ul className="space-y-3 sm:space-y-4 mb-8 flex-1">
                  {p.caracteristicas.map((c, i) => (
                    <li key={i} className="flex items-start gap-3 text-xs sm:text-sm">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span className="font-medium text-foreground/80">{c}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/register"
                  className={`flex items-center justify-center gap-2 w-full py-3 sm:py-3.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                    p.destacado
                      ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
                      : "border-2 border-border hover:border-primary/50 text-foreground"
                  }`}
                >
                  Empezar prueba gratis <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight">Crea tu cuenta en menos de dos minutos</h2>
          <p className="text-muted-foreground mt-3 max-w-md mx-auto text-base sm:text-lg">
            Sin instalar nada. Configura tu negocio y empieza a vender hoy mismo.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-7 sm:px-8 py-3.5 sm:py-4 rounded-xl mt-8 transition-all shadow-lg shadow-primary/25 hover:-translate-y-1 text-sm sm:text-base"
          >
            Comenzar mi mes gratis <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border bg-muted/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <Image
            src="/images/favicon.svg"
            alt="Linkity"
            width={24}
            height={24}
            className="opacity-60 grayscale hover:grayscale-0 transition-all"
          />
          <p className="text-xs sm:text-sm text-muted-foreground font-medium">
            (c) 2026 Linkity Soluciones. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-6 text-xs sm:text-sm text-muted-foreground font-medium">
            <Link href="/login" className="hover:text-foreground transition-colors">Iniciar sesión</Link>
            <Link href="/register" className="hover:text-foreground transition-colors">Crear cuenta</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
