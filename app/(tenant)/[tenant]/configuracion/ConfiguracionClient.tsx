"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateThemePreset, updateBusinessType, updateWeekStartDay, updateSupportPhone, updateCobrarEnDevolucion, updateMontoDevolucion, updateDatosTicket, guardarWhatsappBusinessAction, desconectarWhatsappBusinessAction, probarWhatsappBusinessAction, actualizarWhatsappNumeroManualAction } from "@/app/actions/tenant";
import { alternarModuloPropioAction, aplicarRecomendadoRubroAction } from "@/app/actions/modulos-tenant-actions";
import { subirLogoAction, eliminarLogoAction } from "@/app/actions/logo-actions";
import { listarSolicitudesPendientesAction, resolverSolicitudDispositivoAction } from "@/app/actions/dispositivos-actions";
import { BUSINESS_TYPE_OPTIONS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import type { FormatoTicket, QrDestinoTicket } from "@/lib/recibo-imprimible";
import {
  WINDOWS_THEMES, MATERIAL_THEMES, LINKITY_THEMES, resolverPresetTenant, TENANT_THEME_ROOT_ID,
  INTENSIDAD_DEFAULT, INTENSIDAD_MIN, INTENSIDAD_MAX,
  TEMA_PERSONALIZADO_ID, COLORES_PERSONALIZADOS_DEFAULT, parseColoresPersonalizados,
  type ColoresPersonalizados,
} from "@/lib/theme-presets";
import ActivarNotificacionesPush from "@/components/tenant/ActivarNotificacionesPush";
import {
  Palette, Check, Loader2, Briefcase, Lock, Eye, EyeOff, ArrowLeft, CheckCircle2,
  LayoutGrid, Sparkles, Image as ImageIcon, CalendarClock, Phone, Undo2,
  Bell, RefreshCw, Smartphone, X, Wrench, Circle, ArrowRight, Receipt,
  MessageCircle, Send, Unlink, Percent,
} from "lucide-react";
import type { EstadoTallerChecklist } from "@/lib/roles-server";

const TIPOS_LOGO_PERMITIDOS = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const TAMANO_MAXIMO_LOGO = 2 * 1024 * 1024; // 2 MB — mismo límite que valida logo-actions.ts en el servidor

// Aplica los tokens de color de un preset directo sobre el nodo que el
// layout del tenant ya usa para inyectar el tema real (mismo elemento,
// mismas variables) — así el cambio se ve al instante en TODA la interfaz
// (sidebar, botones, etc.), no solo en esta tarjeta, sin tocar la BD hasta
// que el negocio confirme con "Guardar cambios". Si el nodo no existe
// todavía (ej. muy al inicio del primer render) no hace nada — el layout
// ya lo habrá pintado con el valor real de la BD de cualquier forma.
//
// Llama a resolverPresetTenant — la MISMA función que usa el servidor para
// pintar el tema real — con la terna (tema, intensidad de fichas,
// intensidad de fondo) que el admin está eligiendo/arrastrando en este
// momento, para que la vista previa nunca pueda desincronizarse de lo que
// de verdad se va a guardar. `coloresPersonalizados` (2026-09-24) solo
// importa cuando themeId === TEMA_PERSONALIZADO_ID — se ignora para
// cualquier otro tema, igual que hace resolverPresetTenant.
function aplicarTemaEnVivo(themeId: string, intensidadFicha: number, intensidadFondo: number, coloresPersonalizados?: ColoresPersonalizados) {
  const preset = resolverPresetTenant(themeId, intensidadFicha, intensidadFondo, coloresPersonalizados);
  const nodo = document.getElementById(TENANT_THEME_ROOT_ID);
  if (!nodo) return;
  for (const [variable, valor] of Object.entries(preset)) {
    nodo.style.setProperty(variable, valor);
  }
}

// Los 10 temas estilo Windows Phone/Metro que Carlos aprobó (ver el
// comentario largo en lib/theme-presets.ts) — el swatch de cada tarjeta usa
// backgroundColor (el color de fondo de toda la ventana del POS), que es lo
// que más distingue un tema de otro a simple vista.
const THEMES = Object.entries(WINDOWS_THEMES).map(([id, tema]) => ({
  id,
  name: tema.name,
  swatch: tema.backgroundColor,
}));

// Los 6 temas estilo Material Design (2026-09-28, a petición de Carlos —
// ver el comentario largo junto a MATERIAL_THEMES en lib/theme-presets.ts)
// — misma tarjeta/swatch que los Windows Phone, en una galería aparte para
// que se note que es un estilo distinto.
const THEMES_MATERIAL = Object.entries(MATERIAL_THEMES).map(([id, tema]) => ({
  id,
  name: tema.name,
  swatch: tema.backgroundColor,
}));

// Tema oficial de la plataforma (2026-10-02, a petición de Carlos — ver el
// comentario largo junto a LINKITY_THEMES en lib/theme-presets.ts). Mismo
// tipo de tarjeta que las otras dos galerías, pero se muestra PRIMERO y con
// una etiqueta aparte: es el nuevo default para negocios nuevos.
const THEMES_LINKITY = Object.entries(LINKITY_THEMES).map(([id, tema]) => ({
  id,
  name: tema.name,
  swatch: tema.backgroundColor,
}));

// Etiquetas de las 5 fichas del tema personalizado — mismo orden que
// ColoresPersonalizados.tileColors/WINDOWS_THEMES[x].tileColors.
const ETIQUETAS_FICHAS = ["Ficha 1", "Ficha 2", "Ficha 3", "Ficha 4", "Ficha 5"];

const SIN_RUBRO = "";

// 0=domingo…6=sábado — mismo índice que Tenant.weekStartDay (schema.prisma)
// y lib/periodo-laboral.ts.
const DIAS_SEMANA_COMPLETOS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// Las 3 opciones de Tenant.reciboFormato (2026-09-26, "que el cliente
// seleccione el tipo de salida que quiera... las opciones mas comunes") —
// ver estilosImpresionTicket en lib/recibo-imprimible.ts para el CSS que
// arma cada una.
const FORMATOS_TICKET: { valor: FormatoTicket; nombre: string; descripcion: string }[] = [
  { valor: "TERMICA_58", nombre: "Térmica 58mm", descripcion: "Rollo angosto de punto de venta" },
  { valor: "TERMICA_80", nombre: "Térmica 80mm", descripcion: "Rollo ancho — la más común" },
  { valor: "CARTA", nombre: "Hoja normal", descripcion: "Carta / A4, o guardar como PDF" },
];

// Las 5 opciones de Tenant.reciboQrDestino (2026-10-01, a petición de
// Carlos: "sería opcional para ventas... que el cliente decidiera si
// mostrar o no un QR y que eligiera qué se mostraría en él — catálogo, su
// página, una promoción, la ubicación de las tiendas, etc.") — SOLO aplica
// al ticket de venta (nunca al de reparación, ver el comentario largo en
// POSClient.tsx). `necesitaUrl=false` únicamente en CATALOGO, que usa la
// página pública de catálogo + sucursales de siempre (/pub/[tenantSlug])
// sin pedir ningún dato — los otros 4 piden el link real en Tenant.reciboQrUrl.
const DESTINOS_QR_TICKET: { valor: QrDestinoTicket; nombre: string; descripcion: string; necesitaUrl: boolean; placeholderUrl?: string }[] = [
  { valor: "CATALOGO", nombre: "Catálogo y sucursales", descripcion: "La página pública de tu negocio (de siempre) — automática, sin nada que capturar", necesitaUrl: false },
  { valor: "SITIO_WEB", nombre: "Mi sitio web o red social", descripcion: "Tu página, Instagram, Facebook, WhatsApp...", necesitaUrl: true, placeholderUrl: "https://instagram.com/tunegocio" },
  { valor: "PROMOCION", nombre: "Una promoción", descripcion: "Un link a una promoción o descuento vigente", necesitaUrl: true, placeholderUrl: "https://tunegocio.com/promocion" },
  { valor: "UBICACION", nombre: "Ubicación de mis tiendas", descripcion: "Un link de Google Maps a tu sucursal", necesitaUrl: true, placeholderUrl: "https://maps.app.goo.gl/..." },
  { valor: "PERSONALIZADO", nombre: "Personalizado", descripcion: "Cualquier otro link, con tu propia etiqueta debajo del QR", necesitaUrl: true, placeholderUrl: "https://..." },
];

interface ModuloPersonalizable {
  code: string;
  name: string;
  activo: boolean;
}

interface ConfiguracionClientProps {
  tenantSlug: string;
  themePresetInicial: string;
  themeIntensityInicial: number;
  themeIntensityFondoInicial: number;
  // Json de Prisma — se recibe sin tipar (unknown de facto) y se valida con
  // parseColoresPersonalizados antes de usarse, nunca se confía en su forma.
  themeCustomColorsInicial?: unknown;
  businessTypeInicial: string | null;
  modulos: ModuloPersonalizable[];
  recomendadosOff: string[];
  logoInicial: string | null;
  weekStartDayInicial: number;
  supportPhoneInicial: string | null;
  cobrarEnDevolucionInicial: boolean;
  montoDevolucionInicial: number;
  direccionTicketInicial: string | null;
  rfcTicketInicial: string | null;
  mensajePieTicketInicial: string | null;
  extraTicketInicial: string | null;
  formatoTicketInicial: FormatoTicket;
  mostrarQRTicketInicial: boolean;
  qrDestinoTicketInicial: QrDestinoTicket;
  qrUrlTicketInicial: string | null;
  qrEtiquetaTicketInicial: string | null;
  // whatsappTieneTokenInicial (nunca el token real, ver el comentario largo
  // en page.tsx) — solo dice si YA hay uno guardado, para mostrar
  // "conectado" sin exponer el valor.
  whatsappPhoneNumberIdInicial: string | null;
  whatsappTieneTokenInicial: boolean;
  // WhatsApp MANUAL (2026-10-02) — alternativa sin API al modo de arriba,
  // ver el comentario largo junto a Tenant.whatsappNumeroManual
  // (schema.prisma). Nunca es secreto, a diferencia del token de arriba.
  whatsappNumeroManualInicial: string | null;
  checklistTaller: EstadoTallerChecklist;
}

export default function ConfiguracionClient({
  tenantSlug,
  themePresetInicial,
  themeIntensityInicial,
  themeIntensityFondoInicial,
  themeCustomColorsInicial,
  businessTypeInicial,
  modulos,
  recomendadosOff,
  logoInicial,
  weekStartDayInicial,
  supportPhoneInicial,
  cobrarEnDevolucionInicial,
  montoDevolucionInicial,
  direccionTicketInicial,
  rfcTicketInicial,
  mensajePieTicketInicial,
  extraTicketInicial,
  formatoTicketInicial,
  mostrarQRTicketInicial,
  qrDestinoTicketInicial,
  qrUrlTicketInicial,
  qrEtiquetaTicketInicial,
  whatsappPhoneNumberIdInicial,
  whatsappTieneTokenInicial,
  whatsappNumeroManualInicial,
  checklistTaller,
}: ConfiguracionClientProps) {
  const router = useRouter();

  // ── Tema ──────────────────────────────────────────────────
  const [temaSeleccionado, setTemaSeleccionado] = useState(themePresetInicial);
  const [intensidadSeleccionada, setIntensidadSeleccionada] = useState(themeIntensityInicial ?? INTENSIDAD_DEFAULT);
  // Intensidad del FONDO/color primario (2026-09-24, a petición de Carlos:
  // segundo modulador, independiente del de arriba — ver el comentario
  // largo en construirPresetWindowsPhone, lib/theme-presets.ts).
  const [intensidadFondoSeleccionada, setIntensidadFondoSeleccionada] = useState(themeIntensityFondoInicial ?? INTENSIDAD_DEFAULT);
  // Tema "Personalizado" (2026-09-24, a petición de Carlos: "hay que
  // agregar un tema totalmente customizable. Elegir el color de fondo y
  // los colores secundarios") — arranca con lo que ya tenía guardado el
  // negocio (parseColoresPersonalizados filtra cualquier dato corrupto) o,
  // si nunca lo ha configurado, el punto de partida por default.
  const [coloresPersonalizados, setColoresPersonalizados] = useState<ColoresPersonalizados>(
    () => parseColoresPersonalizados(themeCustomColorsInicial) ?? COLORES_PERSONALIZADOS_DEFAULT
  );
  const [temaPending, startTemaTransition] = useTransition();
  const [temaMensaje, setTemaMensaje] = useState("");

  // Guarda cuál es el tema/intensidades/colores REALMENTE guardados en BD
  // (no lo que se está previsualizando) — si el negocio sale de esta
  // pantalla sin darle "Guardar cambios", el efecto de limpieza de abajo
  // revierte la vista previa a estos valores, para que un color nunca
  // confirmado no se quede "pegado" en el resto de la app.
  const temaConfirmadoRef = useRef(themePresetInicial);
  const intensidadConfirmadaRef = useRef(themeIntensityInicial ?? INTENSIDAD_DEFAULT);
  const intensidadFondoConfirmadaRef = useRef(themeIntensityFondoInicial ?? INTENSIDAD_DEFAULT);
  const coloresConfirmadosRef = useRef(coloresPersonalizados);

  const seleccionarTema = (themeId: string) => {
    setTemaSeleccionado(themeId);
    aplicarTemaEnVivo(themeId, intensidadSeleccionada, intensidadFondoSeleccionada, coloresPersonalizados); // vista previa instantánea, sin esperar a guardar
  };

  const cambiarIntensidad = (valor: number) => {
    setIntensidadSeleccionada(valor);
    aplicarTemaEnVivo(temaSeleccionado, valor, intensidadFondoSeleccionada, coloresPersonalizados); // vista previa instantánea, mientras se arrastra el slider
  };

  const cambiarIntensidadFondo = (valor: number) => {
    setIntensidadFondoSeleccionada(valor);
    aplicarTemaEnVivo(temaSeleccionado, intensidadSeleccionada, valor, coloresPersonalizados); // vista previa instantánea, mientras se arrastra el slider
  };

  // Cambia UN campo de los colores personalizados (fondo, ícono/texto, o
  // una de las 5 fichas por índice) y refresca la vista previa en vivo —
  // solo tiene efecto visible mientras temaSeleccionado === "CUSTOM".
  const cambiarColorPersonalizado = (cambio: Partial<ColoresPersonalizados>) => {
    const nuevo = { ...coloresPersonalizados, ...cambio };
    setColoresPersonalizados(nuevo);
    aplicarTemaEnVivo(temaSeleccionado, intensidadSeleccionada, intensidadFondoSeleccionada, nuevo);
  };
  const cambiarFichaPersonalizada = (indice: number, hex: string) => {
    const tileColors = [...coloresPersonalizados.tileColors];
    tileColors[indice] = hex;
    cambiarColorPersonalizado({ tileColors });
  };

  useEffect(() => {
    return () => aplicarTemaEnVivo(temaConfirmadoRef.current, intensidadConfirmadaRef.current, intensidadFondoConfirmadaRef.current, coloresConfirmadosRef.current);
  }, []);

  const guardarTema = () => {
    startTemaTransition(async () => {
      const result = await updateThemePreset(
        tenantSlug, temaSeleccionado, intensidadSeleccionada, intensidadFondoSeleccionada,
        temaSeleccionado === TEMA_PERSONALIZADO_ID ? coloresPersonalizados : undefined,
      );
      setTemaMensaje(result.success ? "Tema actualizado correctamente." : (result.error ?? "Error al actualizar el tema."));
      if (result.success) {
        temaConfirmadoRef.current = temaSeleccionado;
        intensidadConfirmadaRef.current = intensidadSeleccionada;
        intensidadFondoConfirmadaRef.current = intensidadFondoSeleccionada;
        coloresConfirmadosRef.current = coloresPersonalizados;
        router.refresh();
        setTimeout(() => setTemaMensaje(""), 3000);
      }
    });
  };

  // ── Rubro del negocio ─────────────────────────────────────
  const [rubroSeleccionado, setRubroSeleccionado] = useState(businessTypeInicial ?? SIN_RUBRO);
  const [rubroPending, startRubroTransition] = useTransition();
  const [rubroMensaje, setRubroMensaje] = useState("");

  const guardarRubro = () => {
    startRubroTransition(async () => {
      const result = await updateBusinessType(tenantSlug, rubroSeleccionado === SIN_RUBRO ? null : rubroSeleccionado);
      setRubroMensaje(result.success ? "Rubro actualizado correctamente." : "Error al actualizar el rubro.");
      if (result.success) setTimeout(() => setRubroMensaje(""), 3000);
    });
  };

  // ── Semana laboral ─────────────────────────────────────────
  // 2026-09-18, a petición de Carlos: cada negocio elige su propio corte de
  // semana (para "esta semana" en Dashboard, horas trabajadas en Personal,
  // y el filtro "Semana" de Asistencia) en vez de que el sistema imponga
  // uno solo — ver el comentario largo en Tenant.weekStartDay
  // (schema.prisma) y lib/periodo-laboral.ts.
  const [weekStartDaySeleccionado, setWeekStartDaySeleccionado] = useState(weekStartDayInicial);
  const [weekStartDayPending, startWeekStartDayTransition] = useTransition();
  const [weekStartDayMensaje, setWeekStartDayMensaje] = useState("");

  const guardarWeekStartDay = () => {
    startWeekStartDayTransition(async () => {
      const result = await updateWeekStartDay(tenantSlug, weekStartDaySeleccionado);
      setWeekStartDayMensaje(result.success ? "Semana laboral actualizada correctamente." : (result.error ?? "Error al actualizar."));
      if (result.success) {
        router.refresh();
        setTimeout(() => setWeekStartDayMensaje(""), 3000);
      }
    });
  };

  // ── Teléfono de soporte ────────────────────────────────────
  // 2026-09-21, a petición de Carlos: aparece en los tickets de Reparaciones
  // y Ventas (impresos y digitales) para que el cliente sepa a qué número
  // llamar. Guarda Tenant.phone, que ya existía en el schema pero no tenía
  // pantalla propia — antes solo el panel maestro/superadmin podía tocarlo.
  const [supportPhone, setSupportPhone] = useState(supportPhoneInicial ?? "");
  const [supportPhonePending, startSupportPhoneTransition] = useTransition();
  const [supportPhoneMensaje, setSupportPhoneMensaje] = useState("");

  const guardarSupportPhone = () => {
    startSupportPhoneTransition(async () => {
      const result = await updateSupportPhone(tenantSlug, supportPhone);
      setSupportPhoneMensaje(result.success ? "Teléfono actualizado correctamente." : (result.error ?? "Error al actualizar."));
      if (result.success) {
        router.refresh();
        setTimeout(() => setSupportPhoneMensaje(""), 3000);
      }
    });
  };

  // ── Personalizar ticket ────────────────────────────────────
  // 2026-09-26, a petición de Carlos: "¿existe un apartado para
  // personalizar el ticket?". El nombre (mismo que ya se ve en el resto de
  // la app) y el teléfono/logo (secciones propias, arriba) ya se imprimen
  // solos — aquí solo faltaban dirección, RFC (Tenant.address/rfc, ya
  // existían en el schema para CFDI, sin pantalla propia hasta hoy) y el
  // mensaje de pie (Tenant.reciboMensajePie, campo nuevo).
  // extraTicket (Tenant.reciboExtra, segunda petición el mismo día): "un
  // cuadro de texto abierto... sin limite de caracteres... direcciones,
  // promociones, un saludo, lo que sea" — a propósito SIN maxLength en el
  // <textarea> de abajo (a diferencia de dirección/RFC/mensaje de pie, que
  // sí lo tienen) — ver el comentario largo en updateDatosTicket.
  const [direccionTicket, setDireccionTicket] = useState(direccionTicketInicial ?? "");
  const [rfcTicket, setRfcTicket] = useState(rfcTicketInicial ?? "");
  const [mensajePieTicket, setMensajePieTicket] = useState(mensajePieTicketInicial ?? "");
  const [extraTicket, setExtraTicket] = useState(extraTicketInicial ?? "");
  const [formatoTicket, setFormatoTicket] = useState<FormatoTicket>(formatoTicketInicial);
  // "No veo la opción de habilitar o deshabilitar el QR en el ticket de
  // venta" (Carlos, 2026-10-01) — ver el comentario largo en
  // DatosNegocioRecibo.mostrarQR (lib/recibo-imprimible.ts).
  const [mostrarQRTicket, setMostrarQRTicket] = useState(mostrarQRTicketInicial);
  const [qrDestinoTicket, setQrDestinoTicket] = useState<QrDestinoTicket>(qrDestinoTicketInicial);
  const [qrUrlTicket, setQrUrlTicket] = useState(qrUrlTicketInicial ?? "");
  const [qrEtiquetaTicket, setQrEtiquetaTicket] = useState(qrEtiquetaTicketInicial ?? "");
  const [datosTicketPending, startDatosTicketTransition] = useTransition();
  const [datosTicketMensaje, setDatosTicketMensaje] = useState("");

  const guardarDatosTicket = () => {
    startDatosTicketTransition(async () => {
      const result = await updateDatosTicket(tenantSlug, {
        direccion: direccionTicket, rfc: rfcTicket, mensajePie: mensajePieTicket, extra: extraTicket, formato: formatoTicket,
        mostrarQR: mostrarQRTicket, qrDestino: qrDestinoTicket, qrUrl: qrUrlTicket, qrEtiqueta: qrEtiquetaTicket,
      });
      setDatosTicketMensaje(result.success ? "Ticket actualizado correctamente." : (result.error ?? "Error al actualizar."));
      if (result.success) {
        router.refresh();
        setTimeout(() => setDatosTicketMensaje(""), 3000);
      }
    });
  };

  // ── WhatsApp Business del negocio (2026-09-29) ───────────────
  // Ver el comentario largo en lib/whatsapp-tenant.ts para la arquitectura
  // completa. whatsappAccessTokenInput arranca SIEMPRE vacío (el valor real
  // nunca llega aquí, ver whatsappTieneTokenInicial) — dejarlo vacío al
  // guardar significa "no cambiar el token ya guardado", nunca "bórralo".
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState(whatsappPhoneNumberIdInicial ?? "");
  const [whatsappAccessTokenInput, setWhatsappAccessTokenInput] = useState("");
  const [whatsappMostrarToken, setWhatsappMostrarToken] = useState(false);
  const [whatsappTieneToken, setWhatsappTieneToken] = useState(whatsappTieneTokenInicial);
  const [whatsappPending, startWhatsappTransition] = useTransition();
  const [whatsappMensaje, setWhatsappMensaje] = useState("");
  const [whatsappError, setWhatsappError] = useState("");

  const guardarWhatsapp = () => {
    setWhatsappError("");
    startWhatsappTransition(async () => {
      const result = await guardarWhatsappBusinessAction(tenantSlug, {
        phoneNumberId: whatsappPhoneNumberId,
        accessToken: whatsappAccessTokenInput,
      });
      if (!result.success) {
        setWhatsappError(result.error ?? "Error al guardar");
        return;
      }
      if (whatsappAccessTokenInput.trim()) {
        setWhatsappTieneToken(true);
        setWhatsappAccessTokenInput("");
      }
      setWhatsappMensaje("Guardado correctamente.");
      router.refresh();
      setTimeout(() => setWhatsappMensaje(""), 3000);
    });
  };

  const desconectarWhatsapp = () => {
    if (!window.confirm("¿Desconectar WhatsApp Business de este negocio? Ya no se mandará ningún mensaje automático hasta que lo vuelvas a conectar.")) return;
    setWhatsappError("");
    startWhatsappTransition(async () => {
      const result = await desconectarWhatsappBusinessAction(tenantSlug);
      if (!result.success) {
        setWhatsappError(result.error ?? "Error al desconectar");
        return;
      }
      setWhatsappPhoneNumberId("");
      setWhatsappTieneToken(false);
      setWhatsappMensaje("WhatsApp Business desconectado.");
      router.refresh();
      setTimeout(() => setWhatsappMensaje(""), 3000);
    });
  };

  const [whatsappTelefonoPrueba, setWhatsappTelefonoPrueba] = useState("");
  const [whatsappPruebaPending, startWhatsappPruebaTransition] = useTransition();
  const [whatsappPruebaResultado, setWhatsappPruebaResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  const enviarPruebaWhatsapp = () => {
    setWhatsappPruebaResultado(null);
    startWhatsappPruebaTransition(async () => {
      const result = await probarWhatsappBusinessAction(tenantSlug, whatsappTelefonoPrueba);
      setWhatsappPruebaResultado(
        result.success
          ? { ok: true, texto: "Mensaje de prueba enviado — revisa el WhatsApp de ese número." }
          : { ok: false, texto: result.error ?? "No se pudo enviar" }
      );
    });
  };

  // ── WhatsApp MANUAL (2026-10-02) ────────────────────────────
  // Alternativa sin API al bloque de arriba — ver whatsappModoActivo()
  // (lib/whatsapp-mensaje.ts) para cómo se decide cuál de los dos manda
  // cuando un negocio llega a tener ambos configurados.
  const [whatsappNumeroManual, setWhatsappNumeroManual] = useState(whatsappNumeroManualInicial ?? "");
  const [whatsappManualPending, startWhatsappManualTransition] = useTransition();
  const [whatsappManualMensaje, setWhatsappManualMensaje] = useState("");
  const [whatsappManualError, setWhatsappManualError] = useState("");

  const guardarWhatsappManual = () => {
    setWhatsappManualError("");
    startWhatsappManualTransition(async () => {
      const result = await actualizarWhatsappNumeroManualAction(tenantSlug, whatsappNumeroManual);
      if (!result.success) {
        setWhatsappManualError(result.error ?? "Error al guardar");
        return;
      }
      setWhatsappManualMensaje("Guardado correctamente.");
      router.refresh();
      setTimeout(() => setWhatsappManualMensaje(""), 3000);
    });
  };

  // ── Cobro en devoluciones ──────────────────────────────────
  // 2026-09-22, a petición de Carlos, ejemplo "Fix Expres": "eso debe ser
  // configurable desde la pantalla del administrador" — una sola regla
  // para TODO el negocio ("una sola regla para todo el negocio", respuesta
  // explícita de Carlos), no por sucursal. Guarda Tenant.cobrarEnDevolucion,
  // usado en avanzarEstadoAction/cobrarYEntregarAction (reparaciones-
  // actions.ts) para exigir o no un cobro al entregar un equipo marcado
  // como devolución (no se pudo reparar).
  const [cobrarEnDevolucion, setCobrarEnDevolucion] = useState(cobrarEnDevolucionInicial);
  const [cobrarEnDevolucionPending, startCobrarEnDevolucionTransition] = useTransition();
  const [cobrarEnDevolucionMensaje, setCobrarEnDevolucionMensaje] = useState("");

  const alternarCobrarEnDevolucion = (valor: boolean) => {
    setCobrarEnDevolucion(valor); // optimista
    setCobrarEnDevolucionMensaje("");
    startCobrarEnDevolucionTransition(async () => {
      const result = await updateCobrarEnDevolucion(tenantSlug, valor);
      if (!result.success) {
        setCobrarEnDevolucion(!valor); // revierte si el servidor lo rechazó
        setCobrarEnDevolucionMensaje(result.error ?? "Error al actualizar.");
        return;
      }
      router.refresh();
      setCobrarEnDevolucionMensaje("Configuración actualizada correctamente.");
      setTimeout(() => setCobrarEnDevolucionMensaje(""), 3000);
    });
  };

  // Monto fijo a cobrar por una devolución (2026-09-26, junto con la
  // unificación del botón "Entregar" — ver Tenant.montoDevolucion,
  // schema.prisma). Solo importa mientras cobrarEnDevolucion esté activo;
  // se guarda con su propio botón (no al instante como el switch de arriba)
  // porque es un campo de texto que el administrador escribe y confirma.
  const [montoDevolucion, setMontoDevolucion] = useState(String(montoDevolucionInicial));
  const [montoDevolucionPending, startMontoDevolucionTransition] = useTransition();
  const [montoDevolucionMensaje, setMontoDevolucionMensaje] = useState("");

  const guardarMontoDevolucion = () => {
    const valor = Number(montoDevolucion);
    startMontoDevolucionTransition(async () => {
      const result = await updateMontoDevolucion(tenantSlug, valor);
      setMontoDevolucionMensaje(result.success ? "Monto actualizado correctamente." : (result.error ?? "Error al actualizar."));
      if (result.success) {
        router.refresh();
        setTimeout(() => setMontoDevolucionMensaje(""), 3000);
      }
    });
  };

  // ── Módulos de tu negocio ─────────────────────────────────
  // Personalización por rubro (2026-09-17): cada negocio decide qué
  // módulos ve en su menú — "modulos" ya viene resuelto del servidor
  // (activo = sin fila desactivada explícita, ver page.tsx). Se guarda una
  // copia local editable para reflejar el toggle al instante sin esperar
  // el refresh completo de la página.
  const [modulosState, setModulosState] = useState(modulos);
  const [moduloEnCurso, setModuloEnCurso] = useState<string | null>(null);
  const [modulosMensaje, setModulosMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [aplicandoRecomendado, startAplicarRecomendadoTransition] = useTransition();
  const [, startModulosTransition] = useTransition();

  const alternarModulo = (code: string, activar: boolean) => {
    setModuloEnCurso(code);
    setModulosMensaje(null);
    setModulosState((prev) => prev.map((m) => (m.code === code ? { ...m, activo: activar } : m)));
    startModulosTransition(async () => {
      const result = await alternarModuloPropioAction({ tenantSlug, moduleCode: code, activar });
      setModuloEnCurso(null);
      if (!result.ok) {
        // Revierte el cambio optimista si el servidor lo rechazó.
        setModulosState((prev) => prev.map((m) => (m.code === code ? { ...m, activo: !activar } : m)));
        setModulosMensaje({ tipo: "error", texto: result.error });
        return;
      }
      router.refresh();
    });
  };

  const aplicarRecomendado = () => {
    setModulosMensaje(null);
    startAplicarRecomendadoTransition(async () => {
      const result = await aplicarRecomendadoRubroAction({ tenantSlug });
      if (!result.ok) {
        setModulosMensaje({ tipo: "error", texto: result.error });
        return;
      }
      setModulosState((prev) => prev.map((m) => ({ ...m, activo: !recomendadosOff.includes(m.code) })));
      setModulosMensaje({ tipo: "ok", texto: "Se aplicó la recomendación para tu rubro." });
      router.refresh();
      setTimeout(() => setModulosMensaje(null), 4000);
    });
  };

  // ── Logo de tu negocio ────────────────────────────────────
  // Aparte del logo de Linkity en el sidebar (que nunca cambia) — este es
  // el logo propio de cada negocio, que se muestra en el encabezado
  // superior (ver TenantShell.tsx). Se sube a Supabase Storage vía
  // app/actions/logo-actions.ts, que ya valida tipo/tamaño en el servidor;
  // aquí se valida lo mismo del lado del cliente solo para dar el mensaje
  // de error al instante, sin esperar el viaje al servidor.
  const [logoUrl, setLogoUrl] = useState(logoInicial);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoPending, startLogoTransition] = useTransition();
  const [logoMensaje, setLogoMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Libera el object URL de la vista previa al reemplazarlo o al salir de
  // la pantalla — si no, cada archivo elegido se queda ocupando memoria del
  // navegador hasta recargar la página.
  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  const seleccionarLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    setLogoMensaje(null);
    if (!archivo) return;

    if (!TIPOS_LOGO_PERMITIDOS.includes(archivo.type)) {
      setLogoMensaje({ tipo: "error", texto: "Formato no soportado. Usa PNG, JPG, WEBP o SVG." });
      e.target.value = "";
      return;
    }
    if (archivo.size > TAMANO_MAXIMO_LOGO) {
      setLogoMensaje({ tipo: "error", texto: "La imagen no debe pesar más de 2 MB." });
      e.target.value = "";
      return;
    }

    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoFile(archivo);
    setLogoPreview(URL.createObjectURL(archivo));
  };

  const subirLogo = () => {
    if (!logoFile) return;
    setLogoMensaje(null);
    startLogoTransition(async () => {
      const formData = new FormData();
      formData.append("logo", logoFile);
      const result = await subirLogoAction(tenantSlug, formData);
      if (!result.ok) {
        setLogoMensaje({ tipo: "error", texto: result.error });
        return;
      }
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      setLogoUrl(result.url);
      setLogoFile(null);
      setLogoPreview(null);
      if (logoInputRef.current) logoInputRef.current.value = "";
      setLogoMensaje({ tipo: "ok", texto: "Logo actualizado correctamente." });
      router.refresh();
      setTimeout(() => setLogoMensaje(null), 4000);
    });
  };

  const quitarLogo = () => {
    setLogoMensaje(null);
    startLogoTransition(async () => {
      const result = await eliminarLogoAction(tenantSlug);
      if (!result.ok) {
        setLogoMensaje({ tipo: "error", texto: result.error });
        return;
      }
      setLogoUrl(null);
      setLogoMensaje({ tipo: "ok", texto: "Logo eliminado." });
      router.refresh();
      setTimeout(() => setLogoMensaje(null), 4000);
    });
  };

  // ── Cambiar contraseña ────────────────────────────────────
  // Se guarda directo contra Supabase Auth del lado del cliente (igual
  // que login/page.tsx), no vía Server Action — updateUser() actúa sobre
  // la sesión ya autenticada del propio usuario, así que no hace falta
  // pedirle su contraseña actual (a diferencia de un cambio de contraseña
  // hecho por un tercero/admin). Pensado sobre todo para el primer login
  // con la contraseña temporal que genera Panel Maestro/auto-registro al
  // dar de alta un negocio nuevo.
  const [nuevaContrasena, setNuevaContrasena] = useState("");
  const [confirmarContrasena, setConfirmarContrasena] = useState("");
  const [verContrasena, setVerContrasena] = useState(false);
  const [contrasenaPending, setContrasenaPending] = useState(false);
  const [contrasenaMensaje, setContrasenaMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const guardarContrasena = async (e: React.FormEvent) => {
    e.preventDefault();
    setContrasenaMensaje(null);

    if (nuevaContrasena.length < 8) {
      setContrasenaMensaje({ tipo: "error", texto: "La contraseña debe tener al menos 8 caracteres." });
      return;
    }
    if (nuevaContrasena !== confirmarContrasena) {
      setContrasenaMensaje({ tipo: "error", texto: "Las contraseñas no coinciden." });
      return;
    }

    setContrasenaPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: nuevaContrasena });
    setContrasenaPending(false);

    if (error) {
      setContrasenaMensaje({ tipo: "error", texto: "No se pudo actualizar tu contraseña. Intenta de nuevo." });
      return;
    }

    setNuevaContrasena("");
    setConfirmarContrasena("");
    setContrasenaMensaje({ tipo: "ok", texto: "Contraseña actualizada correctamente." });
    setTimeout(() => setContrasenaMensaje(null), 4000);
  };

  // ── Dispositivos pendientes ────────────────────────────────
  // 2026-09-23, a petición de Carlos: respaldo dentro de Configuración para
  // cuando la notificación en vivo (campanita/toast, TenantShell.tsx) o el
  // push no llegan a tiempo — mismas acciones (aprobar/rechazar), solo que
  // consultadas a demanda en vez de en vivo. Ver dispositivos-actions.ts.
  const [solicitudes, setSolicitudes] = useState<
    { id: string; branchName: string; userAgent: string | null; fecha: string }[]
  >([]);
  const [solicitudesCargando, setSolicitudesCargando] = useState(true);
  const [solicitudEnCurso, setSolicitudEnCurso] = useState<string | null>(null);

  const cargarSolicitudes = async () => {
    setSolicitudesCargando(true);
    const result = await listarSolicitudesPendientesAction(tenantSlug);
    setSolicitudesCargando(false);
    if (result.ok) setSolicitudes(result.solicitudes);
  };

  useEffect(() => {
    cargarSolicitudes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolverSolicitud = async (solicitudId: string, aprobar: boolean) => {
    setSolicitudEnCurso(solicitudId);
    // 2026-09-23, corrección: antes esto no revisaba res.ok — si
    // resolverSolicitudDispositivoAction fallaba por CUALQUIER motivo (la
    // sesión de quien hace clic no calificó como admin, la solicitud ya
    // había vencido, otro administrador ya la había resuelto, etc.), el
    // botón igual desaparecía de la lista como si hubiera funcionado, sin
    // avisar nada — Carlos reportó justo este síntoma ("aunque autentique
    // al usuario no ingresa automáticamente": aprobaba aquí, pero del otro
    // lado nunca se aprobaba de verdad). Ahora si falla se avisa con el
    // motivo real y se recarga la lista (por si de verdad ya se había
    // resuelto por otro lado, para que no se quede huérfana en pantalla).
    const res = await resolverSolicitudDispositivoAction({ tenantSlug, solicitudId, aprobar }).catch(
      (): { ok: false; error: string } => ({ ok: false, error: "No se pudo conectar con el servidor — inténtalo de nuevo." })
    );
    if (res.ok) {
      setSolicitudes((prev) => prev.filter((s) => s.id !== solicitudId));
    } else {
      window.alert(res.error);
      await cargarSolicitudes();
    }
    setSolicitudEnCurso(null);
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto w-full h-full overflow-y-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Configuración del Sistema</h1>
          <p className="text-sm text-muted-foreground mt-1">Administra las preferencias visuales y de terminología de tu negocio.</p>
        </div>
        <Link
          href={`/${tenantSlug}/dashboard`}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground flex-shrink-0 mt-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Volver al dashboard
        </Link>
      </div>

      {/* ── Apariencia y Tema ─────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mb-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <Palette className="w-5 h-5 text-primary-text" />
          <h2 className="text-base font-semibold text-foreground">Apariencia y Tema</h2>
        </div>

        <div className="p-5">
          <p className="text-sm text-muted-foreground mb-5">Selecciona la paleta de colores principal para tu interfaz, estilo Windows Phone.</p>

          {/* Tema "Linkity" (2026-10-02) — ver el comentario junto a
              THEMES_LINKITY arriba. Va primero y con su propia etiqueta
              para distinguirlo de ser "uno más" de la galería Windows
              Phone de abajo. */}
          <div className="mb-6 pb-5 border-b border-border">
            <p className="text-sm text-muted-foreground mb-4">
              <span className="font-medium text-foreground">Linkity</span> — el tema oficial de la plataforma, con los colores de tu logo:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {THEMES_LINKITY.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => seleccionarTema(theme.id)}
                  className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                    temaSeleccionado === theme.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted"
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-full shadow-inner flex items-center justify-center"
                    style={{ backgroundColor: theme.swatch }}
                  >
                    {temaSeleccionado === theme.id && <Check className="w-5 h-5 text-white drop-shadow" />}
                  </div>
                  <span className="text-xs font-medium text-foreground">{theme.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                onClick={() => seleccionarTema(theme.id)}
                className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                  temaSeleccionado === theme.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted"
                }`}
              >
                <div
                  className="w-10 h-10 rounded-full shadow-inner flex items-center justify-center"
                  style={{ backgroundColor: theme.swatch }}
                >
                  {temaSeleccionado === theme.id && <Check className="w-5 h-5 text-white drop-shadow" />}
                </div>
                <span className="text-xs font-medium text-foreground">{theme.name}</span>
              </button>
            ))}

            {/* "Personalizado" (2026-09-24, a petición de Carlos: "hay que
                agregar un tema totalmente customizable. Elegir el color de
                fondo y los colores secundarios") — 11ª tarjeta, swatch en
                degradado (en vez de un solo color) para distinguirla a
                simple vista de los 10 temas fijos. */}
            <button
              onClick={() => seleccionarTema(TEMA_PERSONALIZADO_ID)}
              className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                temaSeleccionado === TEMA_PERSONALIZADO_ID ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted"
              }`}
            >
              <div
                className="w-10 h-10 rounded-full shadow-inner flex items-center justify-center"
                style={{ background: "conic-gradient(from 0deg, #D80073, #F09609, #32CD32, #00A4A4, #001AC0, #D80073)" }}
              >
                {temaSeleccionado === TEMA_PERSONALIZADO_ID && <Check className="w-5 h-5 text-white drop-shadow" />}
              </div>
              <span className="text-xs font-medium text-foreground">Personalizado</span>
            </button>
          </div>

          {/* Temas estilo Material Design (2026-09-28, a petición de Carlos:
              los temas Windows Phone de arriba "se me hacen un poco toscos"
              — ver el comentario largo junto a MATERIAL_THEMES en
              lib/theme-presets.ts). Galería aparte, mismo tipo de tarjeta,
              para que se note que es un estilo distinto de los de arriba. */}
          <div className="mt-6 pt-5 border-t border-border">
            <p className="text-sm text-muted-foreground mb-4">O, si prefieres un estilo Material Design:</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              {THEMES_MATERIAL.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => seleccionarTema(theme.id)}
                  className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                    temaSeleccionado === theme.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted"
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-full shadow-inner flex items-center justify-center"
                    style={{ backgroundColor: theme.swatch }}
                  >
                    {temaSeleccionado === theme.id && <Check className="w-5 h-5 text-white drop-shadow" />}
                  </div>
                  <span className="text-xs font-medium text-foreground">{theme.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Selector de colores del tema "Personalizado" — solo se muestra
              cuando ese es el tema elegido. 7 selectores: fondo, ícono/
              texto y las 5 fichas (respuesta explícita de Carlos: control
              total sobre los 7, sin calcular nada automático). */}
          {temaSeleccionado === TEMA_PERSONALIZADO_ID && (
            <div className="mt-5 border-t border-border pt-5">
              <p className="text-xs font-medium text-muted-foreground mb-3">Colores del tema personalizado</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Fondo / color primario</span>
                  <input
                    type="color"
                    value={coloresPersonalizados.backgroundColor}
                    onChange={(e) => cambiarColorPersonalizado({ backgroundColor: e.target.value })}
                    className="w-full h-9 rounded-lg border border-border cursor-pointer bg-card"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">Ícono / texto de fichas</span>
                  <input
                    type="color"
                    value={coloresPersonalizados.defaultIconColor}
                    onChange={(e) => cambiarColorPersonalizado({ defaultIconColor: e.target.value })}
                    className="w-full h-9 rounded-lg border border-border cursor-pointer bg-card"
                  />
                </label>
                {coloresPersonalizados.tileColors.map((hex, i) => (
                  <label key={i} className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground">{ETIQUETAS_FICHAS[i]}</span>
                    <input
                      type="color"
                      value={hex}
                      onChange={(e) => cambiarFichaPersonalizada(i, e.target.value)}
                      className="w-full h-9 rounded-lg border border-border cursor-pointer bg-card"
                    />
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 mt-4 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={coloresPersonalizados.baseStyle === "Light"}
                  onChange={(e) => cambiarColorPersonalizado({ baseStyle: e.target.checked ? "Light" : "Dark" })}
                />
                Interfaz clara (para fondos claros — igual que &quot;Windows 8 Start&quot;)
              </label>
            </div>
          )}

          {/* Intensidad (2026-09-23, a petición de Carlos: "hazlas
              personalizables para subir o bajar la intensidad de los
              colores") — escala solo la saturación de la paleta elegida
              arriba, ver escalarSaturacion en lib/theme-presets.ts. 100 =
              la paleta tal cual, sin tocar. */}
          <div className="mt-6 border-t border-border pt-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">Intensidad del color</label>
              <span className="text-xs font-semibold text-foreground tabular-nums">{intensidadSeleccionada}%</span>
            </div>
            <input
              type="range"
              min={INTENSIDAD_MIN}
              max={INTENSIDAD_MAX}
              step={5}
              value={intensidadSeleccionada}
              onChange={(e) => cambiarIntensidad(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-muted-foreground">Apagado</span>
              <span className="text-[11px] text-muted-foreground">Original</span>
              <span className="text-[11px] text-muted-foreground">Vivo</span>
            </div>
          </div>

          {/* Intensidad del fondo (2026-09-24, a petición de Carlos: "estoy
              complacido con el modulador de intensidad para las fichas,
              pero también falta uno para el fondo o color primario") —
              segundo modulador, INDEPENDIENTE del de arriba: este solo
              escala backgroundColor (ventana/color primario), nunca las
              fichas. Pasos de 10% (a diferencia del de arriba, de 5%), tal
              como Carlos pidió explícitamente ("aplicar variaciones de
              10% progresivos"). */}
          <div className="mt-6 border-t border-border pt-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">Intensidad del fondo</label>
              <span className="text-xs font-semibold text-foreground tabular-nums">{intensidadFondoSeleccionada}%</span>
            </div>
            <input
              type="range"
              min={INTENSIDAD_MIN}
              max={INTENSIDAD_MAX}
              step={10}
              value={intensidadFondoSeleccionada}
              onChange={(e) => cambiarIntensidadFondo(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-muted-foreground">Apagado</span>
              <span className="text-[11px] text-muted-foreground">Original</span>
              <span className="text-[11px] text-muted-foreground">Vivo</span>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-4 border-t border-border pt-5">
            <button
              onClick={guardarTema}
              disabled={temaPending}
              className="px-5 py-2.5 bg-primary hover:opacity-90 text-primary-foreground text-sm font-medium rounded-lg transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {temaPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {temaPending ? "Aplicando..." : "Guardar cambios"}
            </button>
            {temaMensaje && <span className="text-sm font-medium text-emerald-600 animate-in fade-in">{temaMensaje}</span>}
          </div>
        </div>
      </div>

      {/* ── Giro del negocio ──────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <Briefcase className="w-5 h-5 text-primary-text" />
          <h2 className="text-base font-semibold text-foreground">Giro del negocio</h2>
        </div>

        <div className="p-5">
          <p className="text-sm text-muted-foreground mb-5">
            Elige el giro de tu negocio para que el sistema use la terminología correcta en todos los módulos
            — por ejemplo, &quot;Reparaciones&quot; se convierte en &quot;Órdenes de Servicio&quot; para un taller
            automotriz. Si más adelante quieres un nombre distinto para tu negocio en particular, puedes
            personalizarlo aparte.
          </p>

          <div className="max-w-sm">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Rubro</label>
            <select
              value={rubroSeleccionado}
              onChange={(e) => setRubroSeleccionado(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value={SIN_RUBRO}>Sin especificar / Genérico</option>
              {BUSINESS_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="mt-8 flex items-center gap-4 border-t border-border pt-5">
            <button
              onClick={guardarRubro}
              disabled={rubroPending}
              className="btn-primary px-5 py-2.5 text-sm rounded-lg transition-all flex items-center gap-2"
            >
              {rubroPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {rubroPending ? "Aplicando..." : "Guardar cambios"}
            </button>
            {rubroMensaje && <span className="text-sm font-medium text-emerald-600 animate-in fade-in">{rubroMensaje}</span>}
          </div>
        </div>
      </div>

      {/* ── Configura tu Taller (checklist) ────────────────────── */}
      {/* 2026-09-24, a petición de Carlos: el escudo genérico de Taller no
          le decía nada al dueño — esta tarjeta es deliberadamente más
          vistosa (borde y fondo ámbar) y con un ícono específico (llave
          inglesa) para que sea imposible no verla. Los roles de Recepción/
          Aduana y Técnico/Taller ya se crean solos (ver el comentario largo
          de getEstadoTallerChecklist, lib/roles-server.ts) — lo único que
          puede faltar de verdad es personal asignado, así que el checklist
          mide eso, no si el rol "existe". No se muestra en rubros sin
          taller (ej. barbería, consultorio dental). */}
      {checklistTaller.aplica && (() => {
        const aduanaLista = checklistTaller.rolesAduana.some((r) => r.tieneStaff);
        const tallerListo = checklistTaller.rolesTaller.some((r) => r.tieneStaff);
        const todoListo = aduanaLista && tallerListo;
        return (
          <div className={`rounded-xl overflow-hidden shadow-sm mt-6 border ${todoListo ? "bg-card border-border" : "bg-amber-50 border-amber-300"}`}>
            <div className={`flex items-center gap-2 px-5 py-4 border-b ${todoListo ? "border-border bg-muted/50" : "border-amber-200 bg-amber-100/60"}`}>
              <Wrench className={`w-5 h-5 ${todoListo ? "text-primary-text" : "text-amber-700"}`} />
              <h2 className="text-base font-semibold text-foreground">Configura tu Taller</h2>
            </div>

            <div className="p-5">
              <p className="text-sm text-muted-foreground mb-5">
                {todoListo
                  ? "Tu taller ya tiene personal asignado en ambos puestos clave y está listo para operar."
                  : "Antes de recibir equipos en taller, asigna al menos una persona a cada uno de estos puestos. Los roles ya están creados — solo falta darles personal desde Personal."}
              </p>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  {aduanaLista ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="text-sm text-foreground font-medium">Taller (Recepción/Aduana)</p>
                    <p className="text-xs text-muted-foreground">
                      {checklistTaller.rolesAduana.length > 0
                        ? `Recibe el equipo, asigna técnico y ajusta costo/piezas (${checklistTaller.rolesAduana.map((r) => r.nombre).join(", ")}).`
                        : "Recibe el equipo, asigna técnico y ajusta costo/piezas."}
                      {" "}
                      {aduanaLista ? "Ya tiene personal asignado." : "Aún no tiene personal asignado."}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  {tallerListo ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="text-sm text-foreground font-medium">Técnico (Mis Reparaciones)</p>
                    <p className="text-xs text-muted-foreground">
                      {checklistTaller.rolesTaller.length > 0
                        ? `Repara el equipo asignado y puede alertar a Taller (${checklistTaller.rolesTaller.map((r) => r.nombre).join(", ")}).`
                        : "Repara el equipo asignado y puede alertar a Taller."}
                      {" "}
                      {tallerListo ? "Ya tiene personal asignado." : "Aún no tiene personal asignado."}
                    </p>
                  </div>
                </div>
              </div>

              {!todoListo && (
                <Link
                  href={`/${tenantSlug}/personal`}
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary-text hover:underline"
                >
                  Ir a Personal a asignar roles <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Semana laboral ─────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mt-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <CalendarClock className="w-5 h-5 text-primary-text" />
          <h2 className="text-base font-semibold text-foreground">Semana laboral</h2>
        </div>

        <div className="p-5">
          <p className="text-sm text-muted-foreground mb-5">
            Elige en qué día empieza tu semana de trabajo. Este es el día que usa el sistema para calcular
            &quot;ventas de esta semana&quot; en el Dashboard, las horas trabajadas de tu personal, y el filtro
            &quot;Semana&quot; de Asistencia — para que coincida con tu corte real de nómina, no con un calendario
            genérico.
          </p>

          <div className="max-w-sm">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tu semana laboral empieza el</label>
            <select
              value={weekStartDaySeleccionado}
              onChange={(e) => setWeekStartDaySeleccionado(Number(e.target.value))}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              {DIAS_SEMANA_COMPLETOS.map((nombre, i) => (
                <option key={nombre} value={i}>{nombre}</option>
              ))}
            </select>
          </div>

          <div className="mt-8 flex items-center gap-4 border-t border-border pt-5">
            <button
              onClick={guardarWeekStartDay}
              disabled={weekStartDayPending}
              className="btn-primary px-5 py-2.5 text-sm rounded-lg transition-all flex items-center gap-2"
            >
              {weekStartDayPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {weekStartDayPending ? "Aplicando..." : "Guardar cambios"}
            </button>
            {weekStartDayMensaje && <span className="text-sm font-medium text-emerald-600 animate-in fade-in">{weekStartDayMensaje}</span>}
          </div>
        </div>
      </div>

      {/* ── Teléfono de soporte ────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mt-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <Phone className="w-5 h-5 text-primary-text" />
          <h2 className="text-base font-semibold text-foreground">Teléfono de soporte</h2>
        </div>

        <div className="p-5">
          <p className="text-sm text-muted-foreground mb-5">
            Aparece en los tickets de reparación y venta (impresos y digitales) para que tus clientes
            sepan a qué número comunicarse.
          </p>

          <div className="max-w-sm">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Teléfono</label>
            <input
              type="tel"
              value={supportPhone}
              onChange={(e) => setSupportPhone(e.target.value)}
              placeholder="Ej. 55 1234 5678"
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="mt-8 flex items-center gap-4 border-t border-border pt-5">
            <button
              onClick={guardarSupportPhone}
              disabled={supportPhonePending}
              className="btn-primary px-5 py-2.5 text-sm rounded-lg transition-all flex items-center gap-2"
            >
              {supportPhonePending && <Loader2 className="w-4 h-4 animate-spin" />}
              {supportPhonePending ? "Aplicando..." : "Guardar cambios"}
            </button>
            {supportPhoneMensaje && <span className="text-sm font-medium text-emerald-600 animate-in fade-in">{supportPhoneMensaje}</span>}
          </div>
        </div>
      </div>

      {/* ── Personalizar ticket ─────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mt-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <Receipt className="w-5 h-5 text-primary-text" />
          <h2 className="text-base font-semibold text-foreground">Personalizar ticket</h2>
        </div>

        <div className="p-5">
          <p className="text-sm text-muted-foreground mb-5">
            Estos datos aparecen en el encabezado y pie de los tickets impresos (ventas y reparaciones).
            El nombre, logo y teléfono ya se toman de las secciones de arriba — aquí solo agregas dirección,
            RFC, un mensaje de despedida propio y un texto libre al fondo del ticket.
          </p>

          <div className="max-w-sm space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Dirección</label>
              <input
                type="text"
                value={direccionTicket}
                onChange={(e) => setDireccionTicket(e.target.value)}
                placeholder="Ej. Av. Reforma 123, CDMX"
                maxLength={150}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">RFC</label>
              <input
                type="text"
                value={rfcTicket}
                onChange={(e) => setRfcTicket(e.target.value.toUpperCase())}
                placeholder="Ej. XAXX010101000"
                maxLength={13}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Mensaje de pie</label>
              <textarea
                value={mensajePieTicket}
                onChange={(e) => setMensajePieTicket(e.target.value)}
                placeholder="Ej. ¡Gracias por tu preferencia! Garantía de 30 días presentando este ticket."
                maxLength={200}
                rows={3}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Extra <span className="font-normal">(sin límite de caracteres — direcciones, promociones, un saludo, lo que quieras)</span>
            </label>
            <textarea
              value={extraTicket}
              onChange={(e) => setExtraTicket(e.target.value)}
              placeholder="Ej. También nos encuentras en Insurgentes 456 · Síguenos en @tunegocio · 10% de descuento en tu próxima visita presentando este ticket"
              rows={5}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y"
            />
          </div>

          <div className="mt-6">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Formato de impresión</label>
            <p className="text-xs text-muted-foreground mb-2.5">
              Elige el tipo de impresora o salida que usas para que el ticket se ajuste al ancho de papel correcto.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-xl">
              {FORMATOS_TICKET.map((f) => (
                <button
                  key={f.valor}
                  type="button"
                  onClick={() => setFormatoTicket(f.valor)}
                  className={`text-left p-3 rounded-lg border text-xs transition-all ${
                    formatoTicket === f.valor
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border bg-muted hover:border-foreground/30"
                  }`}
                >
                  <p className="font-medium text-foreground">{f.nombre}</p>
                  <p className="text-muted-foreground mt-0.5">{f.descripcion}</p>
                </button>
              ))}
            </div>
          </div>

          {/* QR del ticket de VENTA (2026-10-01, a petición de Carlos: "sería
              opcional para ventas... que el cliente decidiera si mostrar o
              no un QR y que eligiera qué se mostraría en él") — a propósito
              SOLO afecta la venta normal de artículo/servicio; el QR del
              cobro de una reparación (aunque se cobre desde este mismo POS)
              se queda fijo apuntando a su página de seguimiento, nunca pasa
              por aquí (ver el comentario largo en POSClient.tsx). */}
          <div className="mt-6 border-t border-border pt-5">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={mostrarQRTicket}
                onChange={(e) => setMostrarQRTicket(e.target.checked)}
              />
              Mostrar código QR en el ticket de venta
            </label>
            <p className="text-xs text-muted-foreground mt-1 ml-6">
              Solo aplica a la venta de un artículo o servicio. El QR del cobro de una reparación siempre va a su página de seguimiento, sin importar lo que elijas aquí.
            </p>

            {mostrarQRTicket && (
              <div className="mt-4 ml-6 max-w-xl">
                <label className="block text-xs font-medium text-muted-foreground mb-2">Qué mostrar en el QR</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {DESTINOS_QR_TICKET.map((d) => (
                    <button
                      key={d.valor}
                      type="button"
                      onClick={() => setQrDestinoTicket(d.valor)}
                      className={`text-left p-3 rounded-lg border text-xs transition-all ${
                        qrDestinoTicket === d.valor
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border bg-muted hover:border-foreground/30"
                      }`}
                    >
                      <p className="font-medium text-foreground">{d.nombre}</p>
                      <p className="text-muted-foreground mt-0.5">{d.descripcion}</p>
                    </button>
                  ))}
                </div>

                {DESTINOS_QR_TICKET.find((d) => d.valor === qrDestinoTicket)?.necesitaUrl && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Link</label>
                    <input
                      type="text"
                      value={qrUrlTicket}
                      onChange={(e) => setQrUrlTicket(e.target.value)}
                      placeholder={DESTINOS_QR_TICKET.find((d) => d.valor === qrDestinoTicket)?.placeholderUrl}
                      maxLength={500}
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                )}

                {qrDestinoTicket === "PERSONALIZADO" && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      Etiqueta bajo el QR <span className="font-normal">(ej. &quot;Síguenos&quot;, &quot;Más información&quot;)</span>
                    </label>
                    <input
                      type="text"
                      value={qrEtiquetaTicket}
                      onChange={(e) => setQrEtiquetaTicket(e.target.value)}
                      placeholder="Más información"
                      maxLength={60}
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center gap-4 border-t border-border pt-5">
            <button
              onClick={guardarDatosTicket}
              disabled={datosTicketPending}
              className="btn-primary px-5 py-2.5 text-sm rounded-lg transition-all flex items-center gap-2"
            >
              {datosTicketPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {datosTicketPending ? "Aplicando..." : "Guardar cambios"}
            </button>
            {datosTicketMensaje && <span className="text-sm font-medium text-emerald-600 animate-in fade-in">{datosTicketMensaje}</span>}
          </div>
        </div>
      </div>

      {/* ── WhatsApp Business ───────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mt-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <MessageCircle className="w-5 h-5 text-primary-text" />
          <h2 className="text-base font-semibold text-foreground">WhatsApp Business</h2>
          {whatsappTieneToken && (
            <span className="ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">Conectado</span>
          )}
        </div>

        <div className="p-5">
          <p className="text-sm text-muted-foreground mb-2">
            Conecta la cuenta de WhatsApp Business de TU negocio (gratis, directo con Meta) para que tus
            clientes reciban un WhatsApp automático cuando reciban su equipo y cada vez que cambie de estatus —
            sin depender de nadie más marcando "avisar" a mano.
          </p>
          <p className="text-sm text-muted-foreground mb-5">
            Necesitas dos cosas de tu propia cuenta de Meta for Developers (developers.facebook.com): el{" "}
            <strong>Phone Number ID</strong> y un <strong>Access Token</strong> permanente, y además tener
            aprobada una plantilla de mensaje llamada exactamente <code className="text-xs bg-muted px-1 py-0.5 rounded">actualizacion_reparacion_linkity</code>{" "}
            (categoría Utilidad, idioma Español MX, cuerpo con un solo parámetro <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{{1}}"}</code>).
            Pídeme la guía paso a paso si no la tienes todavía.
          </p>

          <div className="max-w-sm space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Phone Number ID</label>
              <input
                type="text"
                value={whatsappPhoneNumberId}
                onChange={(e) => setWhatsappPhoneNumberId(e.target.value)}
                placeholder="Ej. 123456789012345"
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Access Token{" "}
                {whatsappTieneToken && <span className="font-normal text-muted-foreground">(ya hay uno guardado — déjalo vacío para no cambiarlo)</span>}
              </label>
              <div className="relative">
                <input
                  type={whatsappMostrarToken ? "text" : "password"}
                  value={whatsappAccessTokenInput}
                  onChange={(e) => setWhatsappAccessTokenInput(e.target.value)}
                  placeholder={whatsappTieneToken ? "•••••••••••••••••••••" : "Pega aquí tu Access Token"}
                  className="w-full px-3 py-2.5 pr-10 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setWhatsappMostrarToken((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {whatsappMostrarToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-3 flex-wrap border-t border-border pt-5">
            <button
              onClick={guardarWhatsapp}
              disabled={whatsappPending}
              className="btn-primary px-5 py-2.5 text-sm rounded-lg transition-all flex items-center gap-2"
            >
              {whatsappPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {whatsappPending ? "Aplicando..." : "Guardar cambios"}
            </button>
            {whatsappTieneToken && (
              <button
                onClick={desconectarWhatsapp}
                disabled={whatsappPending}
                className="btn-secondary px-4 py-2.5 text-sm rounded-lg transition-all flex items-center gap-2"
              >
                <Unlink className="w-3.5 h-3.5" /> Desconectar
              </button>
            )}
            {whatsappMensaje && <span className="text-sm font-medium text-emerald-600 animate-in fade-in">{whatsappMensaje}</span>}
            {whatsappError && <span className="text-sm font-medium text-destructive animate-in fade-in">{whatsappError}</span>}
          </div>

          {whatsappTieneToken && (
            <div className="mt-5 border-t border-border pt-5 max-w-sm">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Enviar mensaje de prueba</label>
              <p className="text-xs text-muted-foreground mb-2">Escribe un número con código de país (ej. 5215512345678) para verificar que todo quedó bien conectado.</p>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={whatsappTelefonoPrueba}
                  onChange={(e) => setWhatsappTelefonoPrueba(e.target.value)}
                  placeholder="5215512345678"
                  className="flex-1 px-3 py-2.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <button
                  onClick={enviarPruebaWhatsapp}
                  disabled={whatsappPruebaPending || !whatsappTelefonoPrueba.trim()}
                  className="px-4 py-2.5 bg-[#25D366] hover:bg-[#22c35e] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2 flex-shrink-0"
                >
                  {whatsappPruebaPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Enviar prueba
                </button>
              </div>
              {whatsappPruebaResultado && (
                <p className={`text-xs mt-2 ${whatsappPruebaResultado.ok ? "text-emerald-600" : "text-destructive"}`}>
                  {whatsappPruebaResultado.texto}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── WhatsApp manual (sin API) ────────────────────────────
          2026-10-02, a petición de Carlos: no todos los negocios quieren o
          pueden pasar por la verificación de negocio de Meta que exige el
          modo de arriba — esta es la alternativa de cero trámite: un
          enlace "wa.me/..." que abre WhatsApp con el mensaje ya escrito,
          para que alguien del negocio lo mande a mano. Si arriba ya está
          conectado el modo API, ese manda siempre (ver whatsappModoActivo
          en lib/whatsapp-mensaje.ts) — se lo advertimos aquí mismo para que
          no piense que necesita las dos cosas. */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mt-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <MessageCircle className="w-5 h-5 text-primary-text" />
          <h2 className="text-base font-semibold text-foreground">WhatsApp manual (sin API)</h2>
          {whatsappNumeroManual.trim() && !whatsappTieneToken && (
            <span className="ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">Activo</span>
          )}
        </div>

        <div className="p-5">
          <p className="text-sm text-muted-foreground mb-2">
            Para cuando no quieres (o no puedes todavía) pasar por la verificación de negocio de Meta: captura
            aquí el número de WhatsApp al que quieres que tus clientes escriban. No hay ningún envío automático
            — el botón "Avisar" de Reparaciones y la página pública de seguimiento abrirán WhatsApp con el
            mensaje ya escrito, y alguien de tu negocio lo manda a mano, como cualquier chat normal.
          </p>
          {whatsappTieneToken && (
            <p className="text-xs text-amber-600 mb-4">
              Ya tienes conectado el WhatsApp Business de arriba (modo automático) — mientras esté conectado, ese
              es el que se usa siempre, y este número manual no se mostrará. Solo sirve como respaldo si algún
              día desconectas el de arriba.
            </p>
          )}

          <div className="max-w-sm">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Número de WhatsApp</label>
            <input
              type="tel"
              value={whatsappNumeroManual}
              onChange={(e) => setWhatsappNumeroManual(e.target.value)}
              placeholder="Ej. 55 1234 5678"
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="mt-5 flex items-center gap-3 flex-wrap border-t border-border pt-5">
            <button
              onClick={guardarWhatsappManual}
              disabled={whatsappManualPending}
              className="btn-primary px-5 py-2.5 text-sm rounded-lg transition-all flex items-center gap-2"
            >
              {whatsappManualPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {whatsappManualPending ? "Aplicando..." : "Guardar cambios"}
            </button>
            {whatsappManualMensaje && <span className="text-sm font-medium text-emerald-600 animate-in fade-in">{whatsappManualMensaje}</span>}
            {whatsappManualError && <span className="text-sm font-medium text-destructive animate-in fade-in">{whatsappManualError}</span>}
          </div>
        </div>
      </div>

      {/* ── Cobro en devoluciones ──────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mt-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <Undo2 className="w-5 h-5 text-primary-text" />
          <h2 className="text-base font-semibold text-foreground">Cobro en devoluciones</h2>
        </div>

        <div className="p-5">
          <p className="text-sm text-muted-foreground mb-5">
            Cuando un equipo no se pudo reparar y se marca como devolución, decide si tu negocio cobra algo al
            cliente (por ejemplo, por el diagnóstico o el intento de reparación) antes de entregárselo. Esta
            regla aplica a TODAS tus sucursales por igual.
          </p>

          <label className="flex items-start gap-3 max-w-md cursor-pointer">
            <input
              type="checkbox"
              checked={cobrarEnDevolucion}
              disabled={cobrarEnDevolucionPending}
              onChange={(e) => alternarCobrarEnDevolucion(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-primary disabled:opacity-50"
            />
            <span className="text-sm text-foreground">
              Cobrar al entregar una devolución
              <span className="block text-xs text-muted-foreground mt-0.5">
                {cobrarEnDevolucion
                  ? "Activado — entregar una devolución exige pasar por \"Cobrar y entregar\" en tienda."
                  : "Desactivado — una devolución se entrega directo, sin cargo."}
              </span>
            </span>
          </label>

          {cobrarEnDevolucionMensaje && (
            <p className={`text-sm font-medium mt-4 animate-in fade-in ${cobrarEnDevolucionMensaje.startsWith("Error") || cobrarEnDevolucionMensaje.includes("No se pudo") ? "text-red-600" : "text-emerald-600"}`}>
              {cobrarEnDevolucionMensaje}
            </p>
          )}

          {/* Monto fijo a cobrar (2026-09-26) — solo aplica/se muestra
              habilitado cuando la casilla de arriba está activa. Este monto
              es el que se sugiere (editable) en el carrito de POS al usar
              "Entregar" sobre una devolución. */}
          {cobrarEnDevolucion && (
            <div className="mt-5 pt-5 border-t border-border max-w-md">
              <label className="block text-sm text-foreground mb-1.5">
                Monto a cobrar por devolución
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Se sugiere este monto al entregar una devolución en POS — el cajero lo puede ajustar ahí mismo si un caso particular lo requiere.
                </span>
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={montoDevolucion}
                    disabled={montoDevolucionPending}
                    onChange={(e) => setMontoDevolucion(e.target.value)}
                    className="w-full pl-6 pr-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground disabled:opacity-50"
                  />
                </div>
                <button
                  onClick={guardarMontoDevolucion}
                  disabled={montoDevolucionPending}
                  className="btn-primary px-4 py-2 rounded-lg text-sm transition-colors">
                  Guardar
                </button>
              </div>
              {montoDevolucionMensaje && (
                <p className={`text-sm font-medium mt-2 animate-in fade-in ${montoDevolucionMensaje.startsWith("Error") || montoDevolucionMensaje.includes("No se pudo") ? "text-red-600" : "text-emerald-600"}`}>
                  {montoDevolucionMensaje}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Módulos de tu negocio ──────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mt-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <LayoutGrid className="w-5 h-5 text-primary-text" />
          <h2 className="text-base font-semibold text-foreground">Módulos de tu negocio</h2>
        </div>

        <div className="p-5">
          <p className="text-sm text-muted-foreground mb-5">
            Elige qué módulos aparecen en tu menú. Apagar uno no borra ninguna información que ya
            hayas capturado — solo deja de mostrarse hasta que lo vuelvas a activar.
          </p>

          {recomendadosOff.length > 0 && (
            <div className="mb-5 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3.5">
              <Sparkles className="w-4 h-4 text-primary-text flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-foreground">
                  Para el rubro que elegiste, recomendamos apagar:{" "}
                  {recomendadosOff.map((code) => modulosState.find((m) => m.code === code)?.name ?? code).join(", ")}.
                </p>
                <button
                  onClick={aplicarRecomendado}
                  disabled={aplicandoRecomendado}
                  className="btn-ghost mt-2 -mx-1.5 px-1.5 py-0.5 rounded-md text-xs flex items-center gap-1.5"
                >
                  {aplicandoRecomendado && <Loader2 className="w-3 h-3 animate-spin" />}
                  Aplicar recomendado para tu rubro
                </button>
              </div>
            </div>
          )}

          <div className="divide-y divide-border">
            {modulosState.map((m) => (
              <div key={m.code} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-foreground">{m.name}</span>
                <button
                  type="button"
                  disabled={moduloEnCurso === m.code}
                  onClick={() => alternarModulo(m.code, !m.activo)}
                  className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
                    m.activo ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      m.activo ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>

          {modulosMensaje && (
            <p
              className={`mt-4 text-sm font-medium animate-in fade-in ${
                modulosMensaje.tipo === "ok" ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {modulosMensaje.texto}
            </p>
          )}
        </div>
      </div>

      {/* ── Descuentos y promociones ───────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mt-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <Percent className="w-5 h-5 text-primary-text" />
          <h2 className="text-base font-semibold text-foreground">Descuentos y promociones</h2>
        </div>
        <div className="p-5 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Crea descuentos por porcentaje o monto fijo — para toda la venta, un producto o una
            categoría — y se aplicarán automáticamente en el Punto de Venta.
          </p>
          <Link
            href={`/${tenantSlug}/configuracion/descuentos`}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground flex-shrink-0"
          >
            Administrar <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* ── Logo de tu negocio ─────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mt-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <ImageIcon className="w-5 h-5 text-primary-text" />
          <h2 className="text-base font-semibold text-foreground">Logo de tu negocio</h2>
        </div>

        <div className="p-5">
          <p className="text-sm text-muted-foreground mb-5">
            Sube el logo de tu negocio para que se muestre en tu sistema, junto al de Linkity Soluciones.
            Recomendado: imagen horizontal, PNG/JPG/WEBP/SVG, máximo 2 MB.
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-40 h-16 rounded-lg border border-dashed border-border bg-muted/40 flex items-center justify-center overflow-hidden flex-shrink-0">
              {logoPreview || logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo subido por el negocio, dominio/tamaño no se conocen de antemano
                <img
                  src={logoPreview ?? logoUrl ?? ""}
                  alt="Logo del negocio"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <span className="text-xs text-muted-foreground px-2 text-center">Sin logo todavía</span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={seleccionarLogo}
                className="block w-full text-xs text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary-text hover:file:bg-primary/20 file:cursor-pointer cursor-pointer"
              />

              <div className="mt-4 flex items-center gap-3 flex-wrap">
                <button
                  onClick={subirLogo}
                  disabled={!logoFile || logoPending}
                  className="btn-primary px-5 py-2.5 text-sm rounded-lg transition-all flex items-center gap-2"
                >
                  {logoPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {logoPending ? "Guardando..." : "Subir logo"}
                </button>
                {logoUrl && !logoFile && (
                  <button
                    onClick={quitarLogo}
                    disabled={logoPending}
                    className="btn-secondary px-4 py-2.5 text-sm rounded-lg transition-all"
                  >
                    Quitar logo
                  </button>
                )}
              </div>

              {logoMensaje && (
                <p
                  className={`mt-3 text-sm font-medium animate-in fade-in ${
                    logoMensaje.tipo === "ok" ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {logoMensaje.texto}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Notificaciones y dispositivos ──────────────────────── */}
      {/* 2026-09-23, a petición de Carlos ("que ningún empleado pueda
          entrar desde otro lugar y fingir que está en la tienda"): cada
          dispositivo (PC/tablet/navegador) se autoriza una sola vez por
          sucursal — ver el comentario largo en lib/dispositivos-confianza.ts
          y en SolicitudDispositivo (schema.prisma). Esta tarjeta junta las
          dos formas de aprobar un dispositivo nuevo: la notificación con
          push (arriba) y este listado de respaldo (abajo). */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mt-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <Bell className="w-5 h-5 text-primary-text" />
          <h2 className="text-base font-semibold text-foreground">Notificaciones y dispositivos</h2>
        </div>

        <div className="p-5">
          <ActivarNotificacionesPush tenantSlug={tenantSlug} />

          <div className="mt-6 border-t border-border pt-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-foreground">Dispositivos pendientes de autorizar</h3>
              <button
                onClick={cargarSolicitudes}
                disabled={solicitudesCargando}
                className="btn-ghost flex items-center gap-1.5 -mx-1.5 px-1.5 py-0.5 rounded-md text-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${solicitudesCargando ? "animate-spin" : ""}`} /> Actualizar
              </button>
            </div>

            {solicitudesCargando && solicitudes.length === 0 ? (
              <p className="text-xs text-muted-foreground flex items-center gap-2 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando solicitudes…
              </p>
            ) : solicitudes.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No hay dispositivos esperando autorización por ahora.</p>
            ) : (
              <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                {solicitudes.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 px-3.5 py-3 flex-wrap">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Smartphone className="w-4 h-4 text-primary-text flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground">Sucursal: {s.branchName}</p>
                        <p className="text-[10.5px] text-muted-foreground mt-0.5 truncate max-w-[220px]">
                          {s.userAgent ?? "Dispositivo sin identificar"}
                        </p>
                        <p className="text-[10.5px] text-muted-foreground mt-0.5">
                          {new Date(s.fecha).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => resolverSolicitud(s.id, true)}
                        disabled={solicitudEnCurso === s.id}
                        className="btn-primary flex items-center gap-1 text-[11.5px] px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <Check className="w-3 h-3" /> Aprobar
                      </button>
                      <button
                        onClick={() => resolverSolicitud(s.id, false)}
                        disabled={solicitudEnCurso === s.id}
                        className="flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground hover:text-red-600 transition-colors px-2.5 py-1.5 disabled:opacity-50"
                      >
                        <X className="w-3 h-3" /> Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Seguridad: cambiar contraseña ─────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm mt-6">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <Lock className="w-5 h-5 text-primary-text" />
          <h2 className="text-base font-semibold text-foreground">Seguridad</h2>
        </div>

        <div className="p-5">
          <p className="text-sm text-muted-foreground mb-5">
            Cambia tu contraseña de acceso — hazlo sobre todo si todavía usas la contraseña temporal
            con la que se creó tu cuenta.
          </p>

          <form onSubmit={guardarContrasena} className="max-w-sm space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nueva contraseña</label>
              <div className="relative">
                <input
                  type={verContrasena ? "text" : "password"}
                  autoComplete="new-password"
                  value={nuevaContrasena}
                  onChange={(e) => setNuevaContrasena(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full px-3 py-2.5 pr-10 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setVerContrasena((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {verContrasena ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Confirmar nueva contraseña</label>
              <input
                type={verContrasena ? "text" : "password"}
                autoComplete="new-password"
                value={confirmarContrasena}
                onChange={(e) => setConfirmarContrasena(e.target.value)}
                placeholder="Repite la contraseña"
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <div className="flex items-center gap-4 border-t border-border pt-5">
              <button
                type="submit"
                disabled={contrasenaPending}
                className="btn-primary px-5 py-2.5 text-sm rounded-lg transition-all flex items-center gap-2"
              >
                {contrasenaPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {contrasenaPending ? "Guardando..." : "Actualizar contraseña"}
              </button>
              {contrasenaMensaje && (
                <span
                  className={`text-sm font-medium animate-in fade-in ${
                    contrasenaMensaje.tipo === "ok" ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {contrasenaMensaje.texto}
                </span>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* ── Listo ──────────────────────────────────────────────── */}
      <Link
        href={`/${tenantSlug}/dashboard`}
        className="mt-6 w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-lg text-sm transition-all"
      >
        <CheckCircle2 className="w-4 h-4" />
        Listo, volver al dashboard
      </Link>
    </div>
  );
}
