import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, ShoppingCart, Wrench, GitBranch, FileText, BarChart3, ShieldCheck,
  Smartphone, Car, Bike, Scissors, Stethoscope, PawPrint, Store, Check,
  ClipboardList, Users, TrendingUp, ChevronDown, Building2, Quote,
} from "lucide-react";

// Colores cíclicos para el círculo de iniciales de cada reseña — mismo
// espíritu que chipPorCategoria (POS/Catálogo): nada de fotos de stock
// haciéndose pasar por la persona, solo sus iniciales.
const COLOR_INICIALES = [
  "bg-primary/10 text-primary",
  "bg-green-500/10 text-green-600",
  "bg-orange-500/10 text-orange-600",
];

function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

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
    desc: "Genera el documento de factura directo desde tus ventas, con folio y los datos fiscales de tu cliente.",
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
      "Módulo de facturación CFDI por separado"
    ],
    destacado: false,
  },
  {
    nombre: "Pro",
    precio: 999,
    desc: "Para negocios en crecimiento con más de una sucursal.",
    caracteristicas: [
      "De 1 a 3 Sucursales",
      "3 a 5 Usuarios por sucursal",
      "50 folios CFDI al mes incluidos"
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
      "200 folios CFDI al mes incluidos"
    ],
    destacado: false,
  },
];

const PASOS = [
  {
    icon: ClipboardList,
    title: "Elige tu rubro y regístrate",
    desc: "Al crear tu cuenta eliges el giro de tu negocio — celulares, taller automotriz, barbería y más — y Linkity ajusta nombres, catálogo de arranque y flujos a tu operación.",
  },
  {
    icon: Users,
    title: "Configura tu equipo y sucursales",
    desc: "Da de alta tus sucursales, tu personal con PIN propio y los roles que necesites, sin quedarte con plantillas genéricas.",
  },
  {
    icon: TrendingUp,
    title: "Vende y da seguimiento",
    desc: "Cobra en el punto de venta, da seguimiento a cada reparación paso a paso y revisa todo en tu Dashboard, sin armar reportes a mano.",
  },
];

// Reseñas reales de gente que ya usa el sistema en las sucursales que
// administra Carlos — solo nombre y puesto, a petición explícita suya
// (2026-09-28: decidido con Carlos no usar reseñas ficticias en la landing
// ya pública; estas 3 sí son de personas reales, el contenido y la
// atribución los dio él mismo).
const TESTIMONIOS = [
  {
    nombre: "Andrea Salcido",
    puesto: "Dueña",
    texto: "Muy fácil de entender, antes no sabía cómo administrar mi negocio.",
  },
  {
    nombre: "Rodrigo Orozco",
    puesto: "Supervisor de tiendas",
    texto: "Excelente la opción de ver el historial de días anteriores.",
  },
  {
    nombre: "Kevin Zamora",
    puesto: "Cajero",
    texto: "Es muy rápido dar de alta los artículos o importarlos desde mi viejo sistema.",
  },
];

const FAQS = [
  {
    q: "¿Necesito instalar algo?",
    a: "No. Linkity funciona 100% desde el navegador — solo necesitas internet, ya sea en una computadora, tablet o celular.",
  },
  {
    q: "¿Mis datos se mezclan con los de otros negocios?",
    a: "No. Cada negocio vive en su propio espacio de datos, completamente aislado — nadie más puede ver tu información, ni tú la de otros negocios en la plataforma.",
  },
  {
    q: "¿Puedo cancelar cuando quiera?",
    a: "Sí. No hay contrato forzoso — eliges la vigencia (1, 3, 6 o 12 meses) al registrarte y decides si renuevas o no.",
  },
  {
    q: "¿Qué pasa si mi negocio crece y necesito más sucursales o usuarios?",
    a: "Puedes cambiar de plan cuando quieras, sin perder tu información ni tener que reconfigurar nada.",
  },
  {
    q: "¿Cómo funciona la facturación CFDI?",
    a: "Linkity genera el documento de venta con el formato y los datos fiscales que pide un CFDI, directo desde cada venta. El timbrado directo con el SAT está en desarrollo — te avisaremos en cuanto esté disponible.",
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
                Administra ventas, inventario, reparaciones y facturación en una sola plataforma diseñada para crecer contigo.
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

            {/* Columna Derecha: Composición Visual Enriquecida para Móvil y Desktop */}
            <div className="lg:col-span-7 relative w-full h-[320px] sm:h-[450px] lg:h-[650px] flex items-center justify-center mt-6 sm:mt-0">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-[90%] bg-gradient-to-tr from-primary/30 to-purple-500/20 blur-[90px] rounded-full pointer-events-none" />
              
              {/* Dashboard Principal */}
              <div className="absolute z-10 w-[95%] sm:w-[85%] lg:right-0 shadow-2xl rounded-xl sm:rounded-2xl overflow-hidden border border-border/50 bg-background transition-transform duration-700">
                <div className="bg-muted/60 border-b border-border/50 px-3 py-2 sm:px-4 sm:py-2.5 flex gap-1.5 backdrop-blur-sm">
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#FF5F56]" />
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#FFBD2E]" />
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#27C93F]" />
                </div>
                <Image src="/images/dashboard-preview.png" width={1200} height={800} className="w-full h-auto" alt="Dashboard principal" priority />
              </div>

              {/* Mockup POS Secundario (Visible también en Móvil con escala adecuada) */}
              <div className="absolute z-20 w-[65%] sm:w-[55%] lg:w-[45%] -bottom-4 sm:-bottom-8 left-2 sm:-left-12 shadow-[0_20px_50px_rgba(0,0,0,0.4)] rounded-xl overflow-hidden border border-border bg-background">
                <div className="bg-muted/60 border-b border-border/50 px-2.5 py-1.5 sm:px-3 sm:py-2 flex gap-1.5 backdrop-blur-sm">
                  <span className="text-[9px] sm:text-[10px] font-medium text-muted-foreground">Punto de Venta</span>
                </div>
                <Image src="/images/POS-preview.png" width={800} height={500} className="w-full h-auto" alt="Módulo POS" />
              </div>

              {/* Mockup Inventario (Visible en pantallas medianas y grandes) */}
              <div className="hidden sm:block absolute z-30 w-[40%] -top-6 -left-4 shadow-[0_20px_40px_rgba(0,0,0,0.3)] rounded-xl overflow-hidden border border-border bg-background">
                <div className="bg-muted/60 border-b border-border/50 px-3 py-2 flex gap-1.5 backdrop-blur-sm">
                  <span className="text-[10px] font-medium text-muted-foreground">Inventario</span>
                </div>
                <Image src="/images/inventario-preview.png" width={600} height={400} className="w-full h-auto" alt="Módulo Inventario" />
              </div>
              
              {/* Tarjeta de Ventas Flotante */}
              <div className="absolute z-40 right-2 sm:right-[-5%] top-[10%] sm:top-[15%] bg-background/95 backdrop-blur-md border border-border/50 p-3 sm:p-4 rounded-xl sm:rounded-2xl shadow-xl flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-500/10 rounded-full flex items-center justify-center text-green-500 shrink-0">
                  <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider">Ventas de hoy</p>
                  <p className="text-base sm:text-xl font-bold">+$12,450.00</p>
                </div>
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

      {/* SECCIÓN DE CREDIBILIDAD (honesta: sin nombres/reseñas inventadas — ver
          decisión con Carlos 2026-09-28: la landing ya es pública y no hay
          clientes reales todavía, así que en vez de testimonios ficticios se
          respalda con hechos verificables sobre quién y cómo se construyó
          Linkity) */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center justify-center gap-2 bg-primary/10 text-primary rounded-full w-14 h-14 mb-6">
              <Building2 className="w-6 h-6" />
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight">Hecho por quien repara celulares todos los días</h2>
            <p className="text-muted-foreground mt-4 text-base sm:text-lg leading-relaxed">
              Linkity no nació en una mesa de planeación genérica: quien está detrás de Linkity administra sus propias sucursales de reparación de celulares y, antes de este sistema, ya operaba con un sistema propio hecho a la medida. Cada módulo — desde el PIN de personal hasta el ticket de recepción con seguimiento — responde a algo que pasó de verdad en un mostrador.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 sm:gap-8 mt-12 max-w-3xl mx-auto text-center">
            <div>
              <p className="text-2xl sm:text-4xl font-extrabold text-primary">20+</p>
              <p className="text-muted-foreground text-xs sm:text-sm mt-1 font-medium">Giros de negocio soportados</p>
            </div>
            <div>
              <p className="text-2xl sm:text-4xl font-extrabold text-primary">14</p>
              <p className="text-muted-foreground text-xs sm:text-sm mt-1 font-medium">Módulos en un solo sistema</p>
            </div>
            <div>
              <p className="text-2xl sm:text-4xl font-extrabold text-primary">100%</p>
              <p className="text-muted-foreground text-xs sm:text-sm mt-1 font-medium">Datos aislados por negocio</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30">
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

      {/* CÓMO FUNCIONA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
          <h2 className="text-2xl sm:text-4xl font-bold text-center tracking-tight">Cómo funciona</h2>
          <p className="text-muted-foreground text-center mt-3 max-w-lg mx-auto text-base sm:text-lg">
            De registrarte a tener tu negocio operando, en el mismo día.
          </p>
          <div className="grid sm:grid-cols-3 gap-6 sm:gap-8 mt-12 sm:mt-16 max-w-5xl mx-auto">
            {PASOS.map((p, i) => (
              <div key={p.title} className="relative bg-background border border-border rounded-2xl p-6 sm:p-8">
                <span className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center shadow-sm">
                  {i + 1}
                </span>
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                  <p.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-bold text-lg mb-2">{p.title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm sm:text-base">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIOS */}
      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
          <h2 className="text-2xl sm:text-4xl font-bold text-center tracking-tight">Lo que dice quien ya lo usa</h2>
          <div className="grid sm:grid-cols-3 gap-6 sm:gap-8 mt-12 sm:mt-16 max-w-6xl mx-auto">
            {TESTIMONIOS.map((t, i) => (
              <div key={t.nombre} className="bg-background border border-border rounded-2xl p-6 sm:p-8 flex flex-col">
                <Quote className="w-7 h-7 text-primary/30 mb-4" />
                <p className="text-foreground/90 leading-relaxed text-sm sm:text-base flex-1">
                  “{t.texto}”
                </p>
                <div className="flex items-center gap-3 mt-6 pt-6 border-t border-border">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${COLOR_INICIALES[i % COLOR_INICIALES.length]}`}>
                    {iniciales(t.nombre)}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{t.nombre}</p>
                    <p className="text-muted-foreground text-xs">{t.puesto}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECCIÓN DE PLANES */}
      <section className="border-t border-border">
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

      {/* FAQ */}
      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16 sm:py-24">
          <h2 className="text-2xl sm:text-4xl font-bold text-center tracking-tight">Preguntas frecuentes</h2>
          <div className="mt-10 sm:mt-12 space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="group bg-background border border-border rounded-xl px-5 sm:px-6 py-1 open:shadow-sm">
                <summary className="flex items-center justify-between gap-4 py-4 sm:py-5 cursor-pointer list-none font-semibold text-sm sm:text-base marker:content-none [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground shrink-0 transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <p className="text-muted-foreground text-sm sm:text-base leading-relaxed pb-4 sm:pb-5 pr-8">
                  {f.a}
                </p>
              </details>
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