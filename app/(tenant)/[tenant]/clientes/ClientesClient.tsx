"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, Plus, Edit, ShoppingCart, Wrench, Phone, ChevronLeft, X, Users, Stethoscope,
  ClipboardList, Trash2, Check, Ban, DollarSign, FileSignature, Eye, Pill,
} from "lucide-react";
import type { ClienteUI, EstadoReparacionCliente, EstadoVentaCliente } from "@/lib/clientes-data";
import type { ExpedienteCliente } from "@/lib/expediente-data";
import { type CondicionDiente, DIENTES_SUPERIOR, DIENTES_INFERIOR } from "@/lib/odontograma-fdi";
import type { PlanTratamientoUI } from "@/lib/tratamiento-data";
import type { ConsentimientoUI } from "@/lib/consentimiento-data";
import { type PlantillaConsentimiento, NOTA_FIRMA_SIMULADA } from "@/lib/consentimiento-templates";
import type { RecetaUI } from "@/lib/receta-data";
import type { DoctorOption } from "@/lib/citas-data";
import { label, type LabelDictionary } from "@/lib/labels";
import { crearClienteAction, editarClienteAction, type DatosCliente } from "@/app/actions/clientes-actions";
import {
  guardarAntecedentesAction, crearNotaEvolucionAction, actualizarDienteAction,
  type DatosAntecedentes, type DatosNotaEvolucion,
} from "@/app/actions/expediente-actions";
import {
  crearPlanTratamientoAction, actualizarEstadoItemAction, cobrarItemPlanAction,
  type NuevoItemPlan, type MetodoPagoPlanInput,
} from "@/app/actions/tratamiento-actions";
import { crearConsentimientoAction } from "@/app/actions/consentimiento-actions";
import { crearRecetaAction } from "@/app/actions/receta-actions";
import FirmaCanvas from "@/components/tenant/FirmaCanvas";
import { PAISES_TELEFONO, PAIS_TELEFONO_DEFAULT, telefonoWhatsapp, formatoTelefono } from "@/lib/paises";

interface ClientesClientProps {
  clientes: ClienteUI[];
  labels: LabelDictionary;
  tenantSlug: string;
  reparacionesActiva: boolean;
  // Expediente Clínico + Odontograma (M16, 2026-09-18) — ver el comentario
  // largo en schema.prisma. expedienteActiva es el módulo completo (el
  // negocio lo apagó/prendió desde Configuración); odontogramaActivo es
  // además condicionado al rubro (solo consultorio_dental tiene dientes que
  // registrar) — un negocio puede tener expediente activo SIN odontograma
  // (ej. un consultorio médico o una veterinaria).
  expedienteActiva: boolean;
  odontogramaActivo: boolean;
  expedientes: Record<string, ExpedienteCliente>;
  // Plan de Tratamiento (M17, Fase 2, 2026-09-19) — igual que expedientes,
  // ya viene resuelto por cliente desde el servidor.
  planesTratamiento: Record<string, PlanTratamientoUI[]>;
  doctores: DoctorOption[];
  branches: { id: string; name: string }[];
  // Consentimiento Informado (M17, Fase 2, 2026-09-21) — igual que
  // planesTratamiento, ya viene resuelto por cliente desde el servidor.
  // plantillasConsentimiento ya viene filtrada al rubro del tenant (ver
  // clientes/page.tsx) para no repetir esa lógica en el cliente.
  consentimientos: Record<string, ConsentimientoUI[]>;
  plantillasConsentimiento: PlantillaConsentimiento[];
  // Recetas digitales (M17, Fase 2, 2026-09-21) — mismo criterio.
  recetas: Record<string, RecetaUI[]>;
}

const EXPEDIENTE_VACIO: ExpedienteCliente = { antecedentes: null, notas: [], dientes: [] };

const ANTECEDENTES_VACIO: DatosAntecedentes = {
  tipoSangre: "", alergias: "", enfermedadesCronicas: "", medicamentosActuales: "",
  cirugiasPrevias: "", antecedentesFamiliares: "", notasGenerales: "",
};

const NOTA_VACIA: DatosNotaEvolucion = { motivo: "", diagnostico: "", tratamiento: "", notas: "" };

// Plan de Tratamiento (M17, Fase 2, 2026-09-19). El formulario guarda
// diente/costo como texto (no number) porque son <input> controlados — se
// parsean recién al enviar (handleGuardarPlan), mismo criterio que ya usa
// el resto de los formularios numéricos de este archivo.
interface ItemPlanFormRow {
  descripcion: string;
  diente: string;
  costo: string;
}

interface PlanFormState {
  branchId: string;
  doctorUserId: string;
  titulo: string;
  notas: string;
  items: ItemPlanFormRow[];
}

function planFormVacio(branches: { id: string; name: string }[], doctores: DoctorOption[]): PlanFormState {
  return {
    branchId: branches[0]?.id ?? "",
    doctorUserId: doctores[0]?.userId ?? "",
    titulo: "",
    notas: "",
    items: [{ descripcion: "", diente: "", costo: "" }],
  };
}

type ItemPlanFormEstado = "PROPUESTO" | "ACEPTADO" | "RECHAZADO" | "PAGADO";

const ESTADO_ITEM_TEXTO: Record<ItemPlanFormEstado, string> = {
  PROPUESTO: "Propuesto", ACEPTADO: "Aceptado", RECHAZADO: "Rechazado", PAGADO: "Pagado",
};

const ESTADO_ITEM_COLOR: Record<ItemPlanFormEstado, string> = {
  PROPUESTO: "bg-amber-50 text-amber-700",
  ACEPTADO: "bg-blue-50 text-blue-700",
  RECHAZADO: "bg-red-50 text-red-700 line-through",
  PAGADO: "bg-emerald-50 text-emerald-700",
};

// Los 10 valores del enum ToothCondition, en el mismo orden en que se
// declaran en schema.prisma — el texto que ve el usuario sale de
// lib/labels.ts (tooth.condition.*, personalizable por tenant si algún
// negocio quiere otro texto), aquí solo se necesita el orden fijo para
// construir el <select>.
const CONDICIONES_DIENTE: CondicionDiente[] = [
  "SANO", "CARIES", "OBTURADO", "CORONA", "ENDODONCIA", "AUSENTE",
  "EXTRACCION_INDICADA", "IMPLANTE", "FRACTURADO", "SELLANTE",
];

// Silueta anatómica de diente (corona + raíz(es) + línea cervical sutil)
// para el ícono del odontograma — no es una radiografía real (eso
// implicaría subir/almacenar una imagen por diente, fuera de alcance de
// Fase 1), es un dibujo pulido pero plano, pensado para reconocerse de un
// vistazo entre 32 dientes en pantalla. Reemplaza el diseño anterior (una
// casilla lisa con solo el número) a pedido de Carlos (2026-09-18); el
// primer rediseño (cápsula genérica) se refinó (2026-09-21) con
// proporciones más parecidas a un diente real, luego (mismo día, a pedido
// explícito de Carlos: "sería una representación vectorial precisa de cada
// diente no el mismo para todos") se reemplazó por 5 familias de forma
// según la posición FDI real, y por último (mismo día, Carlos comparó
// contra una captura de un software dental profesional: "quiero algo igual
// a la imagen más completa") se afinaron los trazos (raíces con
// adelgazamiento continuo en vez de tubo recto + punta, separación más
// marcada entre raíces de molar) y se adoptó la convención de las cartas
// dentales profesionales: el arco superior se dibuja con la raíz hacia
// arriba y la corona hacia abajo (espejo vertical), y el inferior al
// revés, de forma que ambas coronas "miran" hacia la línea de números del
// centro — igual que en el software de referencia. No son 32 formas 100%
// únicas (no aporta legibilidad extra a este tamaño de ícono y multiplica
// el riesgo de errores de trazo), sino las familias que un dentista
// reconocería: incisivo (corona angosta y plana, raíz única), canino (la
// corona y la raíz más puntiagudas — el "colmillo" clásico, y la raíz más
// larga de todas), premolar (corona bicúspide, dos lóbulos suaves arriba),
// molar superior (corona ancha, 3 raíces — trifurcada, anatómicamente
// correcto) y molar inferior (corona ancha, 2 raíces — bifurcada). La
// condición se codifica con la FORMA del ícono (implante = tornillo, no
// diente) y con relleno/marcas superpuestas (mancha=caries, parche=
// obturado, grieta=fracturado, línea de canal=endodoncia, puntos=sellante,
// X=extracción indicada, contorno punteado sin relleno=ausente).
type FamiliaDiente = "INCISIVO" | "CANINO" | "PREMOLAR" | "MOLAR_SUPERIOR" | "MOLAR_INFERIOR";

const DIENTE_FORMA: Record<FamiliaDiente, string> = {
  INCISIVO:
    "M12,2 C10.1,2 9.1,3 9.3,4.6 C9.5,6.3 9.9,7.7 9.75,9.5 C9.65,10.6 9.45,11.4 9.2,12.4 C8.75,15.3 8.35,18.8 8.05,22.2 C7.85,24.6 8.05,26.8 9.2,28.3 L12,30.4 L14.8,28.3 C15.95,26.8 16.15,24.6 15.95,22.2 C15.65,18.8 15.25,15.3 14.8,12.4 C14.55,11.4 14.35,10.6 14.25,9.5 C14.1,7.7 14.5,6.3 14.7,4.6 C14.9,3 13.9,2 12,2 Z",
  CANINO:
    "M12,1.6 L15,6.3 C14.6,7.9 14.1,9 13.85,10.6 C13.65,11.8 13.6,12.5 13.6,13.2 C13.9,17.3 14.25,21 14.55,24.6 C14.75,26.9 14.8,28.9 14.05,30.1 L12,31.4 L9.95,30.1 C9.2,28.9 9.25,26.9 9.45,24.6 C9.75,21 10.1,17.3 10.4,13.2 C10.4,12.5 10.35,11.8 10.15,10.6 C9.9,9 9.4,7.9 9,6.3 L12,1.6 Z",
  PREMOLAR:
    "M8.6,4.7 C8.45,3.1 9.4,2.2 10.6,3.1 C11.1,3.5 11.6,3.55 12,3.55 C12.4,3.55 12.9,3.5 13.4,3.1 C14.6,2.2 15.55,3.1 15.4,4.7 C15.25,6.4 14.6,7.8 14.5,9.5 C14.42,10.7 14.5,11.6 14.65,12.6 C15,15.6 15.25,18.7 15.15,21.8 C15.05,24 14.9,26 14.1,27.6 L12,29.4 L9.9,27.6 C9.1,26 8.95,24 8.85,21.8 C8.75,18.7 9,15.6 9.35,12.6 C9.5,11.6 9.58,10.7 9.5,9.5 C9.4,7.8 8.75,6.4 8.6,4.7 Z",
  MOLAR_INFERIOR:
    "M12,2 C9,2 6.3,3.1 5.5,5.7 C4.9,7.5 5.4,9 6.2,10.4 C6.8,11.5 7.1,12.4 7.15,13.7 C7.2,15 7,16 6.6,17 C6.3,17.7 6.2,18.5 6.5,19.4 C6.85,20.4 7.3,21.3 7.5,22.5 C7.65,23.4 7.6,24.3 7.4,25.3 C7.15,26.5 7.35,27.7 8.3,28.2 C9.15,28.65 9.8,27.9 10.05,26.8 C10.35,25.5 10.4,24.2 10.35,22.9 C10.32,21.9 10.45,21.1 10.8,20.3 C11.15,19.5 11.55,19 12,19 C12.45,19 12.85,19.5 13.2,20.3 C13.55,21.1 13.68,21.9 13.65,22.9 C13.6,24.2 13.65,25.5 13.95,26.8 C14.2,27.9 14.85,28.65 15.7,28.2 C16.65,27.7 16.85,26.5 16.6,25.3 C16.4,24.3 16.35,23.4 16.5,22.5 C16.7,21.3 17.15,20.4 17.5,19.4 C17.8,18.5 17.7,17.7 17.4,17 C17,16 16.8,15 16.85,13.7 C16.9,12.4 17.2,11.5 17.8,10.4 C18.6,9 19.1,7.5 18.5,5.7 C17.7,3.1 15,2 12,2 Z",
  MOLAR_SUPERIOR:
    "M12,2 C9,2 6.3,3.1 5.5,5.7 C4.9,7.5 5.4,9 6.2,10.4 C6.8,11.5 7.1,12.4 7.15,13.7 C7.2,15 7,16 6.6,17 C6.3,17.7 6.2,18.5 6.5,19.4 C6.85,20.4 7.3,21.2 7.45,22.2 C7.55,22.9 7.5,23.6 7.3,24.4 C7.05,25.4 7.25,26.4 8.05,26.8 C8.8,27.2 9.3,26.5 9.5,25.6 C9.65,24.9 9.7,24.2 9.9,23.6 C10.05,23.1 10.3,22.8 10.6,22.8 C10.75,22.8 10.85,23.3 10.95,24.1 C11.1,25.4 11.25,26.9 11.5,27.9 C11.65,28.5 11.85,28.7 12,28.7 C12.15,28.7 12.35,28.5 12.5,27.9 C12.75,26.9 12.9,25.4 13.05,24.1 C13.15,23.3 13.25,22.8 13.4,22.8 C13.7,22.8 13.95,23.1 14.1,23.6 C14.3,24.2 14.35,24.9 14.5,25.6 C14.7,26.5 15.2,27.2 15.95,26.8 C16.75,26.4 16.95,25.4 16.7,24.4 C16.5,23.6 16.45,22.9 16.55,22.2 C16.7,21.2 17.15,20.4 17.5,19.4 C17.8,18.5 17.7,17.7 17.4,17 C17,16 16.8,15 16.85,13.7 C16.9,12.4 17.2,11.5 17.8,10.4 C18.6,9 19.1,7.5 18.5,5.7 C17.7,3.1 15,2 12,2 Z",
};
// Línea cervical (unión corona/raíz) — un trazo por familia, para que
// quede a la altura correcta de cada silueta (los dientes angostos tienen
// el cuello más arriba que los molares anchos).
const DIENTE_CUELLO: Record<FamiliaDiente, string> = {
  INCISIVO: "M9.3,12.6 Q12,14.4 14.7,12.6",
  CANINO: "M9.3,11.1 Q12,12.6 14.7,11.1",
  PREMOLAR: "M8.9,12.8 Q12,14.8 15.1,12.8",
  MOLAR_INFERIOR: "M6.6,17.2 Q12,20 17.4,17.2",
  MOLAR_SUPERIOR: "M6.6,17.2 Q12,20 17.4,17.2",
};

// Determina la familia anatómica a partir del número FDI: el dígito de las
// unidades da la posición dentro del cuadrante (1-8) y el número completo
// da el arco (superior si < 30, inferior si >= 30) — así los molares
// superiores (3 raíces) se distinguen de los inferiores (2 raíces).
function familiaDiente(numero: number): FamiliaDiente {
  const posicion = numero % 10;
  const superior = numero < 30;
  if (posicion === 1 || posicion === 2) return "INCISIVO";
  if (posicion === 3) return "CANINO";
  if (posicion === 4 || posicion === 5) return "PREMOLAR";
  return superior ? "MOLAR_SUPERIOR" : "MOLAR_INFERIOR";
}

// Los estados NEUTROS (diente sano, contorno base, contorno de "ausente")
// usan tokens de tema — se ven bien en los 5 temas de color de Linkity. Los
// colores de CONDICIÓN CLÍNICA se dejan fijos a propósito: mismo criterio
// que ya documenta lib/theme-presets.ts para los colores de estatus
// (rojo/ámbar/verde) — "caries es rojo" debe significar lo mismo sin
// importar el tema activo del negocio.
const DIENTE_RELLENO: Record<CondicionDiente, string> = {
  SANO: "var(--card)", CARIES: "#fef2f2", OBTURADO: "#eff6ff", CORONA: "#f59e0b",
  ENDODONCIA: "#faf5ff", AUSENTE: "transparent", EXTRACCION_INDICADA: "#fee2e2",
  IMPLANTE: "transparent", FRACTURADO: "#fff7ed", SELLANTE: "#ecfdf5",
};
const DIENTE_BORDE: Record<CondicionDiente, string> = {
  SANO: "var(--border)", CARIES: "#b91c1c", OBTURADO: "#1d4ed8", CORONA: "#b45309",
  ENDODONCIA: "#7e22ce", AUSENTE: "var(--muted-foreground)", EXTRACCION_INDICADA: "#b91c1c",
  IMPLANTE: "#0891b2", FRACTURADO: "#c2410c", SELLANTE: "#047857",
};

// Categorías para la barra de selección de condición del panel de edición
// (reemplaza el <select> plano) — agrupadas como las pensaría un dentista:
// estado general primero, luego patologías, restauraciones y endodoncia.
const CATEGORIAS_CONDICION: { etiqueta: string; items: CondicionDiente[] }[] = [
  { etiqueta: "General", items: ["SANO", "AUSENTE"] },
  { etiqueta: "Patologías", items: ["CARIES", "FRACTURADO", "EXTRACCION_INDICADA"] },
  { etiqueta: "Restauraciones", items: ["OBTURADO", "CORONA", "SELLANTE", "IMPLANTE"] },
  { etiqueta: "Endodoncia", items: ["ENDODONCIA"] },
];

// numero: posición FDI del diente (1-8, 11-18, 21-28, 31-38, 41-48) — decide
// qué familia de forma (ver familiaDiente) se dibuja. Los call-sites que no
// representan un diente físico real en el mapa (la leyenda de condiciones,
// el encabezado/la barra de condición cuando aún no hay diente seleccionado)
// pasan un número representativo fijo en vez de omitirlo, para que siempre
// se dibuje una silueta con proporciones válidas.
// espejo: solo lo pasa en true el botón de la cuadrícula del odontograma
// (para dientes del arco superior, numero < 30) — ahí sí importa que la
// corona "mire" hacia la fila de números del centro, como en una carta
// dental real. La leyenda de condiciones y las vistas previas sueltas
// (encabezado del panel de edición, barra de condición) se dejan siempre
// en la orientación canónica corona-arriba, porque ahí el diente no está
// en el contexto de un arco y espejarlo se vería simplemente al revés.
function ToothIcon({ condicion, numero, espejo = false, className }: { condicion: CondicionDiente; numero: number; espejo?: boolean; className?: string }) {
  const familia = familiaDiente(numero);
  const transformEspejo = espejo ? "translate(0,32) scale(1,-1)" : undefined;

  if (condicion === "IMPLANTE") {
    // No es un diente natural — se dibuja como un tornillo para que se
    // distinga de un vistazo del resto de las condiciones.
    return (
      <svg viewBox="0 0 24 32" className={className}>
        <g transform={transformEspejo}>
          <path d="M8 3h8l-1 5.5H9L8 3z" fill="#0891b2" />
          <rect x="10.2" y="8.5" width="3.6" height="18" fill="#0891b2" />
          {[10.5, 13, 15.5, 18, 20.5, 23].map((y) => (
            <line key={y} x1="8.6" y1={y} x2="15.4" y2={y} stroke="#a5f3fc" strokeWidth="1" />
          ))}
        </g>
      </svg>
    );
  }

  if (condicion === "AUSENTE") {
    return (
      <svg viewBox="0 0 24 32" className={className} fill="none">
        <g transform={transformEspejo}>
          <path d={DIENTE_FORMA[familia]} stroke={DIENTE_BORDE.AUSENTE} strokeWidth="1.2" strokeDasharray="2.2 2" />
        </g>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 32" className={className} fill="none">
      <g transform={transformEspejo}>
        <path d={DIENTE_FORMA[familia]} fill={DIENTE_RELLENO[condicion]} stroke={DIENTE_BORDE[condicion]} strokeWidth="1.3" />
        <path d={DIENTE_CUELLO[familia]} stroke="var(--border)" strokeWidth="0.8" fill="none" opacity={0.6} />
        {condicion === "CARIES" && <circle cx="10.3" cy="9.5" r="2" fill="#7f1d1d" />}
        {condicion === "OBTURADO" && <circle cx="10.3" cy="9.5" r="2" fill="#93c5fd" stroke="#1d4ed8" strokeWidth="0.6" />}
        {condicion === "SELLANTE" && (
          <>
            <circle cx="8" cy="7.8" r="1" fill="#10b981" />
            <circle cx="12" cy="6.9" r="1" fill="#10b981" />
            <circle cx="16" cy="7.8" r="1" fill="#10b981" />
          </>
        )}
        {condicion === "ENDODONCIA" && (
          <>
            <line x1="9.3" y1="15" x2="8.4" y2="23" stroke="#a855f7" strokeWidth="1.1" />
            <line x1="14.7" y1="15" x2="15.6" y2="23" stroke="#a855f7" strokeWidth="1.1" />
          </>
        )}
        {condicion === "FRACTURADO" && (
          <path d="M13.5 3.5l-3 4.5 2.2 1.7-2.8 4.5" stroke="#c2410c" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {condicion === "EXTRACCION_INDICADA" && (
          <>
            <line x1="6.5" y1="6" x2="17.5" y2="24" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="17.5" y1="6" x2="6.5" y2="24" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round" />
          </>
        )}
      </g>
    </svg>
  );
}

// Mismo criterio de color que ReparacionesClient.tsx (ESTADO_BADGE), para
// que el estado de una reparación se vea igual en ambos módulos.
const REPARACION_BADGE: Record<EstadoReparacionCliente, string> = {
  RECEIVED: "bg-blue-50 text-blue-700",
  DIAGNOSING: "bg-blue-50 text-blue-700",
  WAITING_PARTS: "bg-amber-50 text-amber-700",
  IN_REPAIR: "bg-purple-50 text-purple-700",
  READY: "bg-emerald-50 text-emerald-700",
  DELIVERED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-red-50 text-red-600",
  WORKSHOP_READY: "bg-emerald-50 text-emerald-700",
  WORKSHOP_RETURN: "bg-orange-50 text-orange-700",
  SHOP_READY: "bg-cyan-50 text-cyan-700",
  SHOP_RETURN: "bg-red-50 text-red-600",
};

const VENTA_BADGE: Record<EstadoVentaCliente, string> = {
  COMPLETED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-600",
  REFUNDED: "bg-amber-50 text-amber-700",
};

const VENTA_TEXTO: Record<EstadoVentaCliente, string> = {
  COMPLETED: "Pagado",
  CANCELLED: "Cancelada",
  REFUNDED: "Reembolsada",
};

const AVATAR_PALETTE = [
  { bg: "bg-purple-50", color: "text-purple-700" },
  { bg: "bg-orange-50", color: "text-orange-700" },
  { bg: "bg-emerald-50", color: "text-emerald-700" },
  { bg: "bg-blue-50", color: "text-blue-700" },
  { bg: "bg-cyan-50", color: "text-cyan-700" },
  { bg: "bg-amber-50", color: "text-amber-700" },
];

function inicialesDe(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const ini = (partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "");
  return ini.toUpperCase() || "?";
}

function colorPara(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function formatMXN(n: number): string {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });
}

function formatFechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

function formatFechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

function tiempoRelativo(iso: string | null): string {
  if (!iso) return "Sin visitas";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  if (dias < 7) return `Hace ${dias} días`;
  if (dias < 30) return `Hace ${Math.floor(dias / 7)} sem`;
  return formatFechaCorta(iso);
}

function whatsappHref(phone: string | null, countryCode: string | null): string | null {
  const numero = telefonoWhatsapp(phone, countryCode);
  return numero ? `https://wa.me/${numero}` : null;
}

type FiltroHistorial = "Todo" | "Compras" | "Reparaciones";

const FORM_VACIO: DatosCliente = { name: "", phone: "", phoneCountryCode: PAIS_TELEFONO_DEFAULT, email: "", rfc: "", address: "" };

export default function ClientesClient({
  clientes, labels, tenantSlug, reparacionesActiva, expedienteActiva, odontogramaActivo, expedientes,
  planesTratamiento, doctores, branches, consentimientos, plantillasConsentimiento, recetas,
}: ClientesClientProps) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(clientes[0]?.id ?? null);
  const [filtroHistorial, setFiltroHistorial] = useState<FiltroHistorial>("Todo");
  const [mostrarDetalle, setMostrarDetalle] = useState(false);

  // Body del detalle: "historial" (compras/reparaciones, comportamiento de
  // siempre) o "expediente" (M16) — solo existe la segunda opción cuando el
  // negocio tiene el módulo activo.
  const [vistaDetalle, setVistaDetalle] = useState<"historial" | "expediente">("historial");

  const [antecedentesForm, setAntecedentesForm] = useState<DatosAntecedentes>(ANTECEDENTES_VACIO);
  const [antecedentesGuardando, startAntecedentesGuardar] = useTransition();
  const [antecedentesGuardado, setAntecedentesGuardado] = useState(false);

  const [notaModalAbierto, setNotaModalAbierto] = useState(false);
  const [notaForm, setNotaForm] = useState<DatosNotaEvolucion>(NOTA_VACIA);
  const [notaError, setNotaError] = useState<string | null>(null);
  const [notaGuardando, startNotaGuardar] = useTransition();

  const [dienteSeleccionado, setDienteSeleccionado] = useState<number | null>(null);
  const [dienteCondicion, setDienteCondicion] = useState<CondicionDiente>("SANO");
  const [dienteNotas, setDienteNotas] = useState("");
  const [dienteGuardando, startDienteGuardar] = useTransition();

  // Plan de Tratamiento (M17, Fase 2, 2026-09-19).
  const [planModalAbierto, setPlanModalAbierto] = useState(false);
  const [planForm, setPlanForm] = useState<PlanFormState>(() => planFormVacio(branches, doctores));
  const [planError, setPlanError] = useState<string | null>(null);
  const [planGuardando, startPlanGuardar] = useTransition();
  // itemId del botón que está procesando una acción (aceptar/rechazar/cobrar)
  // — evita doble clic mientras la Server Action está en vuelo, sin
  // necesitar un useTransition por cada fase de cada plan.
  const [itemEnCurso, setItemEnCurso] = useState<string | null>(null);
  const [cobroModal, setCobroModal] = useState<{ itemId: string; descripcion: string; costo: number } | null>(null);
  const [cobroMetodo, setCobroMetodo] = useState<MetodoPagoPlanInput>("CASH");

  // Consentimiento Informado (M17, Fase 2, 2026-09-21).
  const [consentModalAbierto, setConsentModalAbierto] = useState(false);
  const [consentProcedureType, setConsentProcedureType] = useState("");
  const [consentItemPlanId, setConsentItemPlanId] = useState("");
  const [consentFirmadoPor, setConsentFirmadoPor] = useState("");
  const [consentFirma, setConsentFirma] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [consentGuardando, startConsentGuardar] = useTransition();
  const [consentVerModal, setConsentVerModal] = useState<ConsentimientoUI | null>(null);

  // Recetas digitales (M17, Fase 2, 2026-09-21) — mismo patrón que
  // Consentimiento Informado, pero aquí firma el DOCTOR (doctorUserId
  // elegido de un selector, igual que Plan de Tratamiento), no el paciente.
  const [recetaModalAbierto, setRecetaModalAbierto] = useState(false);
  const [recetaDoctorUserId, setRecetaDoctorUserId] = useState("");
  const [recetaMedications, setRecetaMedications] = useState("");
  const [recetaIndications, setRecetaIndications] = useState("");
  const [recetaFirma, setRecetaFirma] = useState<string | null>(null);
  const [recetaError, setRecetaError] = useState<string | null>(null);
  const [recetaGuardando, startRecetaGuardar] = useTransition();
  const [recetaVerModal, setRecetaVerModal] = useState<RecetaUI | null>(null);

  // Negocio con el módulo de Reparaciones apagado (ej. una barbería): ni la
  // pestaña "Reparaciones" del historial ni ningún registro de tipo
  // "reparacion" que pudiera haber quedado de antes deben aparecer aquí.
  const filtrosTabs: FiltroHistorial[] = reparacionesActiva
    ? ["Todo", "Compras", "Reparaciones"]
    : ["Todo", "Compras"];

  const [modalAbierto, setModalAbierto] = useState(false);
  const [modoModal, setModoModal] = useState<"crear" | "editar">("crear");
  const [form, setForm] = useState<DatosCliente>(FORM_VACIO);
  const [formError, setFormError] = useState<string | null>(null);
  const [guardando, startGuardar] = useTransition();

  const clientesFiltrados = clientes.filter(
    (c) => c.name.toLowerCase().includes(busqueda.toLowerCase()) || (c.phone ?? "").includes(busqueda)
  );
  const seleccionado = clientes.find((c) => c.id === seleccionadoId) ?? null;
  const expedienteSeleccionado: ExpedienteCliente =
    (seleccionado && expedientes[seleccionado.id]) || EXPEDIENTE_VACIO;
  const planesSeleccionado: PlanTratamientoUI[] =
    (seleccionado && planesTratamiento[seleccionado.id]) || [];
  const consentimientosSeleccionado: ConsentimientoUI[] =
    (seleccionado && consentimientos[seleccionado.id]) || [];
  const recetasSeleccionado: RecetaUI[] =
    (seleccionado && recetas[seleccionado.id]) || [];
  const plantillaConsentSeleccionada: PlantillaConsentimiento | null =
    plantillasConsentimiento.find((p) => p.id === consentProcedureType) ?? null;
  // Fases del plan de tratamiento del paciente seleccionado, aplanadas, para
  // el selector opcional "ligar a fase" del modal de nuevo consentimiento.
  const fasesPlanParaConsentimiento = planesSeleccionado.flatMap((plan) =>
    plan.items.map((it) => ({
      id: it.id,
      etiqueta: it.diente != null ? `${it.descripcion} · Diente ${it.diente}` : it.descripcion,
    }))
  );

  // Indicador ligero de "tratamiento pendiente" sobre el odontograma — NO es
  // una fusión del Plan de Tratamiento dentro del odontograma (ese diseño se
  // descartó a propósito, ver comentario junto al JSX del odontograma), solo
  // un punto de color por diente para que el doctor note de un vistazo que
  // ese diente tiene una fase propuesta o aceptada (no pagada) sin tener que
  // leer las dos secciones a la vez. PROPUESTO pesa más que ACEPTADO porque
  // es lo que todavía necesita una decisión del paciente.
  const pendientePorDiente: Record<number, "PROPUESTO" | "ACEPTADO"> = {};
  for (const plan of planesSeleccionado) {
    for (const it of plan.items) {
      if (it.diente == null) continue;
      if (it.estado === "PROPUESTO") pendientePorDiente[it.diente] = "PROPUESTO";
      else if (it.estado === "ACEPTADO" && pendientePorDiente[it.diente] !== "PROPUESTO") {
        pendientePorDiente[it.diente] = "ACEPTADO";
      }
    }
  }

  // Al cambiar de cliente (o de antecedentes ya guardados desde el server
  // tras un router.refresh()), el formulario de antecedentes se re-sincroniza
  // con lo último persistido — evita que quede pegado el texto de otro
  // paciente al cambiar de selección, y limpia el aviso de "Guardado".
  useEffect(() => {
    const a = expedienteSeleccionado.antecedentes;
    setAntecedentesForm(
      a
        ? {
            tipoSangre: a.tipoSangre ?? "",
            alergias: a.alergias ?? "",
            enfermedadesCronicas: a.enfermedadesCronicas ?? "",
            medicamentosActuales: a.medicamentosActuales ?? "",
            cirugiasPrevias: a.cirugiasPrevias ?? "",
            antecedentesFamiliares: a.antecedentesFamiliares ?? "",
            notasGenerales: a.notasGenerales ?? "",
          }
        : ANTECEDENTES_VACIO
    );
    setAntecedentesGuardado(false);
    setDienteSeleccionado(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionadoId, expedienteSeleccionado.antecedentes]);

  function abrirDiente(numero: number) {
    const existente = expedienteSeleccionado.dientes.find((d) => d.numero === numero);
    setDienteSeleccionado(numero);
    setDienteCondicion(existente?.condicion ?? "SANO");
    setDienteNotas(existente?.notas ?? "");
  }

  function handleGuardarAntecedentes() {
    if (!seleccionado) return;
    startAntecedentesGuardar(async () => {
      const res = await guardarAntecedentesAction({ tenantSlug, customerId: seleccionado.id, ...antecedentesForm });
      if (res.ok) {
        setAntecedentesGuardado(true);
        router.refresh();
      }
    });
  }

  function abrirModalNota() {
    setNotaForm(NOTA_VACIA);
    setNotaError(null);
    setNotaModalAbierto(true);
  }

  function handleGuardarNota() {
    if (!seleccionado) return;
    if (!notaForm.motivo.trim()) {
      setNotaError("Describe el motivo de la consulta");
      return;
    }
    setNotaError(null);
    startNotaGuardar(async () => {
      const res = await crearNotaEvolucionAction({ tenantSlug, customerId: seleccionado.id, ...notaForm });
      if (res.ok) {
        setNotaModalAbierto(false);
        router.refresh();
      } else {
        setNotaError(res.error);
      }
    });
  }

  function handleGuardarDiente() {
    if (!seleccionado || dienteSeleccionado == null) return;
    startDienteGuardar(async () => {
      const res = await actualizarDienteAction({
        tenantSlug,
        customerId: seleccionado.id,
        numero: dienteSeleccionado,
        condicion: dienteCondicion,
        notas: dienteNotas,
      });
      if (res.ok) {
        setDienteSeleccionado(null);
        router.refresh();
      }
    });
  }

  // Plan de Tratamiento (M17, Fase 2, 2026-09-19).
  function abrirModalPlan() {
    setPlanForm(planFormVacio(branches, doctores));
    setPlanError(null);
    setPlanModalAbierto(true);
  }

  function actualizarFilaItem(i: number, campo: keyof ItemPlanFormRow, valor: string) {
    setPlanForm((f) => ({
      ...f,
      items: f.items.map((it, idx) => (idx === i ? { ...it, [campo]: valor } : it)),
    }));
  }

  function agregarFilaItem() {
    setPlanForm((f) => ({ ...f, items: [...f.items, { descripcion: "", diente: "", costo: "" }] }));
  }

  function quitarFilaItem(i: number) {
    setPlanForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  }

  function handleGuardarPlan() {
    if (!seleccionado) return;
    if (!planForm.titulo.trim()) {
      setPlanError("Dale un título al plan de tratamiento");
      return;
    }
    const items: NuevoItemPlan[] = [];
    for (const it of planForm.items) {
      if (!it.descripcion.trim()) continue; // fila vacía, se ignora en vez de forzar a borrarla
      const costo = Number(it.costo);
      if (!Number.isFinite(costo) || costo < 0) {
        setPlanError(`Costo no válido en "${it.descripcion}"`);
        return;
      }
      const diente = it.diente.trim() ? Number(it.diente) : null;
      items.push({ descripcion: it.descripcion.trim(), diente, costo });
    }
    if (items.length === 0) {
      setPlanError("Agrega al menos una fase con descripción");
      return;
    }
    setPlanError(null);
    startPlanGuardar(async () => {
      const res = await crearPlanTratamientoAction({
        tenantSlug,
        customerId: seleccionado.id,
        branchId: planForm.branchId,
        doctorUserId: planForm.doctorUserId,
        titulo: planForm.titulo,
        notas: planForm.notas,
        items,
      });
      if (res.ok) {
        setPlanModalAbierto(false);
        router.refresh();
      } else {
        setPlanError(res.error);
      }
    });
  }

  function handleAccionItem(itemId: string, estado: "ACEPTADO" | "RECHAZADO") {
    setItemEnCurso(itemId);
    startPlanGuardar(async () => {
      await actualizarEstadoItemAction({ tenantSlug, itemId, estado });
      setItemEnCurso(null);
      router.refresh();
    });
  }

  function abrirCobro(itemId: string, descripcion: string, costo: number) {
    setCobroMetodo("CASH");
    setCobroModal({ itemId, descripcion, costo });
  }

  function handleConfirmarCobro() {
    if (!cobroModal) return;
    const itemId = cobroModal.itemId;
    setItemEnCurso(itemId);
    startPlanGuardar(async () => {
      await cobrarItemPlanAction({ tenantSlug, itemId, metodoPago: cobroMetodo });
      setItemEnCurso(null);
      setCobroModal(null);
      router.refresh();
    });
  }

  // Consentimiento Informado (M17, Fase 2, 2026-09-21).
  function abrirModalConsentimiento() {
    setConsentProcedureType(plantillasConsentimiento[0]?.id ?? "");
    setConsentItemPlanId("");
    setConsentFirmadoPor(seleccionado?.name ?? "");
    setConsentFirma(null);
    setConsentError(null);
    setConsentModalAbierto(true);
  }

  function handleGuardarConsentimiento() {
    if (!seleccionado) return;
    if (!consentProcedureType) {
      setConsentError("Selecciona el tipo de procedimiento");
      return;
    }
    if (!consentFirmadoPor.trim()) {
      setConsentError("Escribe el nombre de quien firma");
      return;
    }
    if (!consentFirma) {
      setConsentError("Falta capturar la firma");
      return;
    }
    setConsentError(null);
    startConsentGuardar(async () => {
      const res = await crearConsentimientoAction({
        tenantSlug,
        customerId: seleccionado.id,
        procedureType: consentProcedureType,
        treatmentPlanItemId: consentItemPlanId || null,
        firmaImagen: consentFirma,
        firmadoPor: consentFirmadoPor,
      });
      if (res.ok) {
        setConsentModalAbierto(false);
        router.refresh();
      } else {
        setConsentError(res.error);
      }
    });
  }

  // Recetas digitales (M17, Fase 2, 2026-09-21).
  function abrirModalReceta() {
    setRecetaDoctorUserId(doctores[0]?.userId ?? "");
    setRecetaMedications("");
    setRecetaIndications("");
    setRecetaFirma(null);
    setRecetaError(null);
    setRecetaModalAbierto(true);
  }

  function handleGuardarReceta() {
    if (!seleccionado) return;
    if (!recetaDoctorUserId) {
      setRecetaError("Selecciona un doctor");
      return;
    }
    if (!recetaMedications.trim()) {
      setRecetaError("Especifica al menos un medicamento");
      return;
    }
    if (!recetaFirma) {
      setRecetaError("Falta capturar la firma del doctor");
      return;
    }
    setRecetaError(null);
    startRecetaGuardar(async () => {
      const res = await crearRecetaAction({
        tenantSlug,
        customerId: seleccionado.id,
        doctorUserId: recetaDoctorUserId,
        medications: recetaMedications,
        indications: recetaIndications,
        firmaImagen: recetaFirma,
      });
      if (res.ok) {
        setRecetaModalAbierto(false);
        router.refresh();
      } else {
        setRecetaError(res.error);
      }
    });
  }

  const historialVisible =
    seleccionado && !reparacionesActiva
      ? seleccionado.historial.filter((h) => h.tipo !== "reparacion")
      : seleccionado?.historial ?? [];

  const historialFiltrado = historialVisible.filter((h) => {
    if (filtroHistorial === "Todo") return true;
    if (filtroHistorial === "Compras") return h.tipo === "venta";
    return h.tipo === "reparacion";
  });

  function abrirModalNuevo() {
    setModoModal("crear");
    setForm(FORM_VACIO);
    setFormError(null);
    setModalAbierto(true);
  }

  function abrirModalEditar(c: ClienteUI) {
    setModoModal("editar");
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      phoneCountryCode: c.phoneCountryCode || PAIS_TELEFONO_DEFAULT,
      email: c.email ?? "",
      rfc: c.rfc ?? "",
      address: c.address ?? "",
    });
    setFormError(null);
    setModalAbierto(true);
  }

  function handleGuardar() {
    if (!form.name.trim()) {
      setFormError("El nombre es obligatorio");
      return;
    }
    setFormError(null);
    startGuardar(async () => {
      const res =
        modoModal === "crear"
          ? await crearClienteAction({ tenantSlug, ...form })
          : await editarClienteAction({ tenantSlug, clienteId: seleccionado!.id, ...form });
      if (res.ok) {
        setModalAbierto(false);
        if (modoModal === "crear") setSeleccionadoId(res.id);
        router.refresh();
      } else {
        setFormError(res.error);
      }
    });
  }

  const modal = modalAbierto && (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground">
            {modoModal === "crear" ? "Nuevo cliente" : "Editar cliente"}
          </p>
          <button onClick={() => setModalAbierto(false)} className="p-1 rounded-md hover:bg-muted">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nombre completo *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="Nombre y apellido"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Teléfono</label>
            <div className="mt-1 flex gap-2">
              <select
                value={form.phoneCountryCode || PAIS_TELEFONO_DEFAULT}
                onChange={(e) => setForm({ ...form, phoneCountryCode: e.target.value })}
                className="px-2 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary flex-shrink-0"
              >
                {PAISES_TELEFONO.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.flag} {p.code}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={form.phone ?? ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="flex-1 min-w-0 px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="Número"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Correo electrónico</label>
            <input
              type="email"
              value={form.email ?? ""}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="opcional"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">RFC</label>
              <input
                type="text"
                value={form.rfc ?? ""}
                onChange={(e) => setForm({ ...form, rfc: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="opcional"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Dirección</label>
              <input
                type="text"
                value={form.address ?? ""}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="opcional"
              />
            </div>
          </div>
          {formError && <p className="text-xs text-red-600">{formError}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={() => setModalAbierto(false)}
            className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={guardando}
            className="px-4 py-2 text-sm rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );

  // ---- Negocio nuevo sin clientes todavía ----
  if (clientes.length === 0) {
    return (
      <>
        <div className="flex h-full items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7 text-primary" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">Aún no tienes clientes registrados</p>
            <p className="text-xs text-muted-foreground mb-5">
              Da de alta a tu primer cliente aquí, o se registrará solo la próxima vez que hagas una venta o
              recibas un equipo a reparar.
            </p>
            <button
              onClick={abrirModalNuevo}
              className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg"
            >
              <Plus className="w-4 h-4" /> Agregar cliente
            </button>
          </div>
        </div>
        {modal}
      </>
    );
  }

  return (
    <div className="flex h-full">
      {/* ── Lista clientes ───────────────────────────────── */}
      <div
        className={`
        ${mostrarDetalle ? "hidden md:flex" : "flex"}
        w-full md:w-72 flex-col bg-card border-r border-border flex-shrink-0
      `}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-medium text-foreground">Clientes</span>
          <button
            onClick={abrirModalNuevo}
            className="flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium px-2.5 py-1.5 rounded-lg"
          >
            <Plus className="w-3 h-3" /> Nuevo
          </button>
        </div>

        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre o teléfono..."
              className="w-full pl-7 pr-3 py-1.5 border border-border rounded-lg text-xs bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {clientesFiltrados.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">Sin resultados</div>
          ) : (
            clientesFiltrados.map((c) => {
              const avatar = colorPara(c.id);
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setSeleccionadoId(c.id);
                    setMostrarDetalle(true);
                  }}
                  className={`flex items-center gap-3 px-3 py-3 border-b border-border cursor-pointer border-l-2 transition-all ${
                    seleccionadoId === c.id ? "bg-primary/5 border-l-primary" : "hover:bg-muted/40 border-l-transparent"
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${avatar.bg} ${avatar.color}`}
                  >
                    {inicialesDe(c.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{c.name}</p>
                    <div className="flex items-center gap-1 text-[11.5px] text-muted-foreground mt-0.5">
                      <Phone className="w-2.5 h-2.5 flex-shrink-0" />
                      <span className="truncate">{formatoTelefono(c.phone, c.phoneCountryCode) ?? "Sin teléfono"}</span>
                      <span className="text-muted-foreground/50 flex-shrink-0">·</span>
                      <span className="flex-shrink-0">{c.visitas} {c.visitas === 1 ? "visita" : "visitas"}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Detalle cliente ──────────────────────────────── */}
      <div
        className={`
        ${mostrarDetalle ? "flex" : "hidden md:flex"}
        flex-1 flex-col bg-muted/20 overflow-hidden
      `}
      >
        {!seleccionado ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
            Selecciona un cliente para ver su detalle
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-card border-b border-border px-4 sm:px-5 py-4">
              <button
                onClick={() => setMostrarDetalle(false)}
                className="md:hidden flex items-center gap-1 text-primary text-xs font-medium mb-3"
              >
                <ChevronLeft className="w-4 h-4" /> Volver a clientes
              </button>

              <div className="flex items-start justify-between mb-4 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-sm font-semibold flex-shrink-0 ${colorPara(seleccionado.id).bg} ${colorPara(seleccionado.id).color}`}
                  >
                    {inicialesDe(seleccionado.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm sm:text-[15px] font-semibold text-foreground">{seleccionado.name}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Phone className="w-3 h-3 flex-shrink-0" />
                      <span>{formatoTelefono(seleccionado.phone, seleccionado.phoneCountryCode) ?? "Sin teléfono"}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5 sm:gap-2 flex-wrap justify-end flex-shrink-0">
                  <button
                    onClick={() => abrirModalEditar(seleccionado)}
                    className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted"
                  >
                    <Edit className="w-3 h-3" />
                    <span className="hidden sm:inline">Editar</span>
                  </button>
                  {whatsappHref(seleccionado.phone, seleccionado.phoneCountryCode) && (
                    <a
                      href={whatsappHref(seleccionado.phone, seleccionado.phoneCountryCode)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 bg-[#25D366] hover:bg-[#22c35e] text-white rounded-lg text-xs font-medium transition-colors"
                    >
                      <span className="text-xs font-bold">W</span>
                      <span className="hidden sm:inline">WhatsApp</span>
                    </a>
                  )}
                  <Link
                    href={`/${tenantSlug}/pos`}
                    className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-medium transition-colors"
                  >
                    <ShoppingCart className="w-3 h-3" />
                    <span className="hidden sm:inline">Nueva venta</span>
                  </Link>
                </div>
              </div>

              <div className={`grid grid-cols-2 gap-2 sm:gap-3 ${reparacionesActiva ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
                {[
                  { label: "Total gastado", value: formatMXN(seleccionado.totalGastado), sub: `${seleccionado.visitas} visitas` },
                  ...(reparacionesActiva
                    ? [
                        {
                          label: label(labels, "entity.repair.plural"),
                          value: String(seleccionado.reparaciones),
                          sub: seleccionado.reparacionesActivas > 0 ? `${seleccionado.reparacionesActivas} activa(s)` : "Sin activas",
                        },
                      ]
                    : []),
                  { label: "Última visita", value: tiempoRelativo(seleccionado.ultimaVisita), sub: "" },
                  { label: "Cliente desde", value: formatFechaCorta(seleccionado.createdAt), sub: "" },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg p-2.5 sm:p-3 bg-muted/40">
                    <p className="text-[10.5px] sm:text-[11.5px] text-muted-foreground mb-1">{s.label}</p>
                    <p className="text-base sm:text-[15px] font-semibold text-foreground">{s.value}</p>
                    {s.sub && <p className="text-[10.5px] sm:text-[11.5px] text-muted-foreground mt-0.5">{s.sub}</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* Selector Historial / Expediente Clínico (M16) — solo existe
                si el negocio tiene el módulo activo; si no, el body se
                queda exactamente como antes de este cambio. */}
            {expedienteActiva && (
              <div className="flex gap-2 px-3 sm:px-4 pt-3 bg-card border-b border-border">
                {(["historial", "expediente"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setVistaDetalle(v)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                      vistaDetalle === v
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {v === "expediente" && <Stethoscope className="w-3.5 h-3.5" />}
                    {v === "historial" ? "Historial" : label(labels, "module.clinicalRecord.name")}
                  </button>
                ))}
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4">
              {(!expedienteActiva || vistaDetalle === "historial") ? (
                <>
                  <div className="flex gap-2 mb-3 overflow-x-auto">
                    {filtrosTabs.map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setFiltroHistorial(tab)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                          filtroHistorial === tab
                            ? "bg-primary text-primary-foreground"
                            : "bg-card border border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  <p className="text-[11.5px] font-semibold text-muted-foreground tracking-widest mb-3">HISTORIAL</p>

                  <div className="space-y-2">
                    {historialFiltrado.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-xs">Sin registros en esta categoría</div>
                    ) : (
                      historialFiltrado.map((h) => (
                        <div
                          key={`${h.tipo}-${h.id}`}
                          className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl hover:border-muted-foreground/30 transition-colors"
                        >
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              h.tipo === "reparacion" ? "bg-purple-50" : "bg-emerald-50"
                            }`}
                          >
                            {h.tipo === "reparacion" ? (
                              <Wrench className="w-4 h-4 text-purple-600" />
                            ) : (
                              <ShoppingCart className="w-4 h-4 text-emerald-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{h.titulo}</p>
                            <p className="text-[11.5px] text-muted-foreground">
                              {h.folio} · {formatFechaLarga(h.fecha)}
                            </p>
                          </div>
                          <span
                            className={`text-[10.5px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${
                              h.tipo === "reparacion"
                                ? REPARACION_BADGE[h.estado as EstadoReparacionCliente]
                                : VENTA_BADGE[h.estado as EstadoVentaCliente]
                            }`}
                          >
                            {h.tipo === "reparacion"
                              ? label(labels, `repair.status.${h.estado}`)
                              : VENTA_TEXTO[h.estado as EstadoVentaCliente]}
                          </span>
                          <span className="text-xs font-semibold text-foreground min-w-[60px] text-right flex-shrink-0">
                            {h.monto > 0 ? formatMXN(h.monto) : "Por definir"}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-5">
                  {/* Antecedentes */}
                  <div className="bg-card border border-border rounded-xl p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">ANTECEDENTES</p>
                      {antecedentesGuardado && <span className="text-[11.5px] text-emerald-600">Guardado</span>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Tipo de sangre</label>
                        <input
                          type="text"
                          value={antecedentesForm.tipoSangre ?? ""}
                          onChange={(e) => { setAntecedentesForm({ ...antecedentesForm, tipoSangre: e.target.value }); setAntecedentesGuardado(false); }}
                          placeholder="ej. O+"
                          className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Alergias</label>
                        <input
                          type="text"
                          value={antecedentesForm.alergias ?? ""}
                          onChange={(e) => { setAntecedentesForm({ ...antecedentesForm, alergias: e.target.value }); setAntecedentesGuardado(false); }}
                          placeholder="ej. Penicilina"
                          className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Enfermedades crónicas</label>
                        <input
                          type="text"
                          value={antecedentesForm.enfermedadesCronicas ?? ""}
                          onChange={(e) => { setAntecedentesForm({ ...antecedentesForm, enfermedadesCronicas: e.target.value }); setAntecedentesGuardado(false); }}
                          placeholder="ej. Diabetes, hipertensión"
                          className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Medicamentos actuales</label>
                        <input
                          type="text"
                          value={antecedentesForm.medicamentosActuales ?? ""}
                          onChange={(e) => { setAntecedentesForm({ ...antecedentesForm, medicamentosActuales: e.target.value }); setAntecedentesGuardado(false); }}
                          placeholder="opcional"
                          className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Cirugías previas</label>
                        <input
                          type="text"
                          value={antecedentesForm.cirugiasPrevias ?? ""}
                          onChange={(e) => { setAntecedentesForm({ ...antecedentesForm, cirugiasPrevias: e.target.value }); setAntecedentesGuardado(false); }}
                          placeholder="opcional"
                          className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Antecedentes familiares</label>
                        <input
                          type="text"
                          value={antecedentesForm.antecedentesFamiliares ?? ""}
                          onChange={(e) => { setAntecedentesForm({ ...antecedentesForm, antecedentesFamiliares: e.target.value }); setAntecedentesGuardado(false); }}
                          placeholder="opcional"
                          className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-xs font-medium text-muted-foreground">Notas generales</label>
                        <textarea
                          value={antecedentesForm.notasGenerales ?? ""}
                          onChange={(e) => { setAntecedentesForm({ ...antecedentesForm, notasGenerales: e.target.value }); setAntecedentesGuardado(false); }}
                          rows={2}
                          placeholder="opcional"
                          className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end mt-3">
                      <button
                        onClick={handleGuardarAntecedentes}
                        disabled={antecedentesGuardando}
                        className="px-4 py-1.5 text-xs rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium disabled:opacity-50"
                      >
                        {antecedentesGuardando ? "Guardando…" : "Guardar antecedentes"}
                      </button>
                    </div>
                  </div>

                  {/* Odontograma — solo consultorio dental */}
                  {odontogramaActivo && (
                    <div className="bg-card border border-border rounded-xl p-3 sm:p-4">
                      <p className="text-[11.5px] font-semibold text-muted-foreground tracking-widest mb-3">ODONTOGRAMA</p>
                      <div className="space-y-1.5 overflow-x-auto pb-1">
                        {[DIENTES_SUPERIOR, DIENTES_INFERIOR].map((fila, i) => (
                          <div key={i} className="flex gap-1 justify-center min-w-max">
                            {fila.map((numero) => {
                              const diente = expedienteSeleccionado.dientes.find((d) => d.numero === numero);
                              const condicion = diente?.condicion ?? "SANO";
                              const pendiente = pendientePorDiente[numero];
                              return (
                                <button
                                  key={numero}
                                  onClick={() => abrirDiente(numero)}
                                  title={`Diente ${numero} — ${label(labels, `tooth.condition.${condicion}`)}${pendiente ? ` · Tratamiento ${pendiente === "PROPUESTO" ? "propuesto" : "aceptado"}` : ""}`}
                                  className={`relative w-9 h-11 sm:w-10 sm:h-12 rounded-md border bg-card flex flex-col items-center justify-center gap-0.5 transition-colors ${dienteSeleccionado === numero ? "border-primary ring-2 ring-primary" : "border-border hover:border-foreground/40"}`}
                                >
                                  <ToothIcon condicion={condicion} numero={numero} espejo={numero < 30} className="w-5 h-6 sm:w-6 sm:h-7" />
                                  <span className="text-[9.5px] font-semibold text-muted-foreground leading-none">{numero}</span>
                                  {pendiente && (
                                    <span
                                      className={`absolute -top-1 -right-1 w-2 h-2 rounded-full border border-card ${pendiente === "PROPUESTO" ? "bg-amber-500" : "bg-blue-600"}`}
                                    />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>

                      {/* Leyenda — con el ícono ya no basta el color solo (accesibilidad),
                          así que cada entrada repite forma + color + texto. */}
                      <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3 pt-3 border-t border-border">
                        {CONDICIONES_DIENTE.map((c) => (
                          <div key={c} className="flex items-center gap-1">
                            <ToothIcon condicion={c} numero={11} className="w-3.5 h-4" />
                            <span className="text-[11.5px] text-muted-foreground">{label(labels, `tooth.condition.${c}`)}</span>
                          </div>
                        ))}
                        <div className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          <span className="text-[11.5px] text-muted-foreground">Tratamiento propuesto</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-blue-600" />
                          <span className="text-[11.5px] text-muted-foreground">Tratamiento aceptado</span>
                        </div>
                      </div>

                      {dienteSeleccionado != null && (
                        <div className="mt-4 p-3 rounded-lg bg-muted/40 border border-border">
                          <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                            <ToothIcon condicion={dienteCondicion} numero={dienteSeleccionado ?? 11} className="w-4 h-5" />
                            Diente {dienteSeleccionado} — {label(labels, `tooth.condition.${dienteCondicion}`)}
                          </p>
                          {/* Barra de condición agrupada por categoría — reemplaza el
                              <select> plano anterior. Deliberadamente NO se fusiona
                              con Plan de Tratamiento (sección aparte, más abajo):
                              cada diente solo muestra un punto de color (ver leyenda)
                              cuando tiene una fase pendiente, para no forzar al doctor
                              a saltar entre dos flujos ya validados por separado. */}
                          <div className="flex flex-wrap gap-3 mb-3">
                            {CATEGORIAS_CONDICION.map((grupo) => (
                              <div key={grupo.etiqueta}>
                                <p className="text-[10.5px] font-semibold text-muted-foreground tracking-wide uppercase mb-1">{grupo.etiqueta}</p>
                                <div className="flex gap-1">
                                  {grupo.items.map((c) => (
                                    <button
                                      key={c}
                                      type="button"
                                      onClick={() => setDienteCondicion(c)}
                                      title={label(labels, `tooth.condition.${c}`)}
                                      className={`w-9 h-10 rounded-md border bg-card flex items-center justify-center transition-colors ${dienteCondicion === c ? "border-primary ring-2 ring-primary" : "border-border hover:border-foreground/40"}`}
                                    >
                                      <ToothIcon condicion={c} numero={dienteSeleccionado ?? 11} className="w-5 h-6" />
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              value={dienteNotas}
                              onChange={(e) => setDienteNotas(e.target.value)}
                              placeholder="Notas del diente (opcional)"
                              className="flex-1 px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={handleGuardarDiente}
                                disabled={dienteGuardando}
                                className="px-4 py-2 text-xs rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium disabled:opacity-50 whitespace-nowrap"
                              >
                                {dienteGuardando ? "Guardando…" : "Guardar"}
                              </button>
                              <button
                                onClick={() => setDienteSeleccionado(null)}
                                className="px-3 py-2 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Plan de Tratamiento por fases — M17, Fase 2, 2026-09-19.
                      No se condiciona a odontogramaActivo: un consultorio
                      médico o una veterinaria también cotizan tratamientos
                      por fases, solo un consultorio dental además puede
                      ligar una fase a un diente FDI (campo opcional). */}
                  <div className="bg-card border border-border rounded-xl p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">PLAN DE TRATAMIENTO</p>
                      <button
                        onClick={abrirModalPlan}
                        className="flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium px-2.5 py-1.5 rounded-lg"
                      >
                        <ClipboardList className="w-3 h-3" /> Nuevo plan
                      </button>
                    </div>
                    {planesSeleccionado.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-xs">Sin planes de tratamiento todavía</div>
                    ) : (
                      <div className="space-y-3">
                        {planesSeleccionado.map((plan) => {
                          const total = plan.items.reduce((s, it) => s + it.costo, 0);
                          const pagado = plan.items.filter((it) => it.estado === "PAGADO").reduce((s, it) => s + it.costo, 0);
                          return (
                            <div key={plan.id} className="border border-border rounded-lg p-3">
                              <div className="flex items-start justify-between gap-3 mb-1">
                                <div>
                                  <p className="text-xs font-medium text-foreground">{plan.titulo}</p>
                                  <p className="text-[11.5px] text-muted-foreground">
                                    Dr(a). {plan.doctor} · {new Date(plan.creadoEn).toLocaleDateString("es-MX")}
                                  </p>
                                </div>
                                <div className="text-right whitespace-nowrap">
                                  <p className="text-xs font-semibold text-foreground">
                                    {total.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}
                                  </p>
                                  <p className="text-[11.5px] text-muted-foreground">
                                    {pagado.toLocaleString("es-MX", { style: "currency", currency: "MXN" })} pagado
                                  </p>
                                </div>
                              </div>
                              {plan.notas && <p className="text-[12.5px] text-muted-foreground mb-2">{plan.notas}</p>}
                              <div className="space-y-1.5 mt-2">
                                {plan.items.map((it) => (
                                  <div key={it.id} className="flex items-center justify-between gap-2 text-xs py-1.5 px-2 rounded-md bg-muted/30">
                                    <div className="flex-1 min-w-0 truncate">
                                      <span className="text-foreground">{it.descripcion}</span>
                                      {it.diente != null && <span className="text-muted-foreground"> · Diente {it.diente}</span>}
                                    </div>
                                    <span className="text-muted-foreground whitespace-nowrap">
                                      {it.costo.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}
                                    </span>
                                    <span className={`px-1.5 py-0.5 rounded text-[11.5px] font-medium whitespace-nowrap ${ESTADO_ITEM_COLOR[it.estado]}`}>
                                      {ESTADO_ITEM_TEXTO[it.estado]}
                                    </span>
                                    {it.estado === "PROPUESTO" && (
                                      <div className="flex gap-1 shrink-0">
                                        <button
                                          disabled={itemEnCurso === it.id}
                                          onClick={() => handleAccionItem(it.id, "ACEPTADO")}
                                          title="El paciente acepta esta fase"
                                          className="p-1 rounded hover:bg-emerald-100 text-emerald-700 disabled:opacity-50"
                                        >
                                          <Check className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          disabled={itemEnCurso === it.id}
                                          onClick={() => handleAccionItem(it.id, "RECHAZADO")}
                                          title="El paciente rechaza esta fase"
                                          className="p-1 rounded hover:bg-red-100 text-red-700 disabled:opacity-50"
                                        >
                                          <Ban className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    )}
                                    {it.estado === "ACEPTADO" && (
                                      <button
                                        disabled={itemEnCurso === it.id}
                                        onClick={() => abrirCobro(it.id, it.descripcion, it.costo)}
                                        className="flex items-center gap-1 px-2 py-1 rounded bg-primary hover:bg-primary/90 text-primary-foreground text-[11.5px] font-medium disabled:opacity-50 shrink-0"
                                      >
                                        <DollarSign className="w-3 h-3" /> Cobrar
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Consentimiento Informado — M17, Fase 2, 2026-09-21.
                      Firma dibujada (canvas) simulada, no e.firma real — ver
                      NOTA_FIRMA_SIMULADA en lib/consentimiento-templates.ts,
                      que se muestra en el modal antes de firmar. */}
                  <div className="bg-card border border-border rounded-xl p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">CONSENTIMIENTO INFORMADO</p>
                      <button
                        onClick={abrirModalConsentimiento}
                        disabled={plantillasConsentimiento.length === 0}
                        className="flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                      >
                        <FileSignature className="w-3 h-3" /> Nuevo consentimiento
                      </button>
                    </div>
                    {consentimientosSeleccionado.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-xs">Sin consentimientos firmados todavía</div>
                    ) : (
                      <div className="space-y-2">
                        {consentimientosSeleccionado.map((c) => {
                          const etiqueta = plantillasConsentimiento.find((p) => p.id === c.procedureType)?.etiqueta ?? c.procedureType;
                          return (
                            <div key={c.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/30">
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-foreground truncate">{etiqueta}</p>
                                <p className="text-[11.5px] text-muted-foreground truncate">
                                  Dr(a). {c.doctor} · {new Date(c.creadoEn).toLocaleDateString("es-MX")}
                                  {c.itemPlanDescripcion && ` · ${c.itemPlanDescripcion}`}
                                </p>
                              </div>
                              <button
                                onClick={() => setConsentVerModal(c)}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-muted-foreground hover:bg-muted text-[11.5px] font-medium shrink-0"
                              >
                                <Eye className="w-3.5 h-3.5" /> Ver
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Recetas digitales — M17, Fase 2, 2026-09-21. Mismo
                      patrón que Consentimiento Informado, pero la firma es
                      del DOCTOR que prescribe (doctores, mismo selector que
                      ya usa Plan de Tratamiento), no del paciente. */}
                  <div className="bg-card border border-border rounded-xl p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">RECETAS</p>
                      <button
                        onClick={abrirModalReceta}
                        disabled={doctores.length === 0}
                        className="flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                      >
                        <Pill className="w-3 h-3" /> Nueva receta
                      </button>
                    </div>
                    {recetasSeleccionado.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-xs">Sin recetas todavía</div>
                    ) : (
                      <div className="space-y-2">
                        {recetasSeleccionado.map((r) => (
                          <div key={r.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/30">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">{r.medications}</p>
                              <p className="text-[11.5px] text-muted-foreground truncate">
                                Dr(a). {r.doctor} · {new Date(r.creadoEn).toLocaleDateString("es-MX")}
                              </p>
                            </div>
                            <button
                              onClick={() => setRecetaVerModal(r)}
                              className="flex items-center gap-1 px-2 py-1 rounded-md text-muted-foreground hover:bg-muted text-[11.5px] font-medium shrink-0"
                            >
                              <Eye className="w-3.5 h-3.5" /> Ver
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Notas de evolución */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[11.5px] font-semibold text-muted-foreground tracking-widest">NOTAS DE EVOLUCIÓN</p>
                      <button
                        onClick={abrirModalNota}
                        className="flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium px-2.5 py-1.5 rounded-lg"
                      >
                        <Plus className="w-3 h-3" /> Nueva nota
                      </button>
                    </div>
                    <div className="space-y-2">
                      {expedienteSeleccionado.notas.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-xs">Sin notas de evolución todavía</div>
                      ) : (
                        expedienteSeleccionado.notas.map((n) => (
                          <div key={n.id} className="p-3 bg-card border border-border rounded-xl">
                            <div className="flex items-start justify-between gap-3 mb-1">
                              <p className="text-xs font-medium text-foreground">{n.motivo}</p>
                              <span className="text-[11.5px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                                {formatFechaLarga(n.fecha)}
                              </span>
                            </div>
                            {n.diagnostico && <p className="text-xs text-muted-foreground"><span className="font-medium">Diagnóstico:</span> {n.diagnostico}</p>}
                            {n.tratamiento && <p className="text-xs text-muted-foreground"><span className="font-medium">Tratamiento:</span> {n.tratamiento}</p>}
                            {n.notas && <p className="text-xs text-muted-foreground mt-1">{n.notas}</p>}
                            <p className="text-[11.5px] text-muted-foreground mt-1.5">Atendió: {n.doctor}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {notaModalAbierto && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <p className="text-sm font-semibold text-foreground">Nueva nota de evolución</p>
              <button onClick={() => setNotaModalAbierto(false)} className="p-1 rounded-md hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Motivo de la consulta *</label>
                <input
                  type="text"
                  value={notaForm.motivo}
                  onChange={(e) => setNotaForm({ ...notaForm, motivo: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="ej. Limpieza dental, revisión"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Diagnóstico</label>
                <input
                  type="text"
                  value={notaForm.diagnostico ?? ""}
                  onChange={(e) => setNotaForm({ ...notaForm, diagnostico: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="opcional"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Tratamiento</label>
                <input
                  type="text"
                  value={notaForm.tratamiento ?? ""}
                  onChange={(e) => setNotaForm({ ...notaForm, tratamiento: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="opcional"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Notas</label>
                <textarea
                  value={notaForm.notas ?? ""}
                  onChange={(e) => setNotaForm({ ...notaForm, notas: e.target.value })}
                  rows={3}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  placeholder="opcional"
                />
              </div>
              {notaError && <p className="text-xs text-red-600">{notaError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button
                onClick={() => setNotaModalAbierto(false)}
                className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardarNota}
                disabled={notaGuardando}
                className="px-4 py-2 text-sm rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium disabled:opacity-50"
              >
                {notaGuardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {planModalAbierto && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <p className="text-sm font-semibold text-foreground">Nuevo plan de tratamiento</p>
              <button onClick={() => setPlanModalAbierto(false)} className="p-1 rounded-md hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Título *</label>
                <input
                  type="text"
                  value={planForm.titulo}
                  onChange={(e) => setPlanForm({ ...planForm, titulo: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="ej. Rehabilitación oral, Plan de ortodoncia"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Sucursal</label>
                  <select
                    value={planForm.branchId}
                    onChange={(e) => setPlanForm({ ...planForm, branchId: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Doctor</label>
                  <select
                    value={planForm.doctorUserId}
                    onChange={(e) => setPlanForm({ ...planForm, doctorUserId: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    {doctores.map((d) => (
                      <option key={d.userId} value={d.userId}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Fases del plan *</label>
                  <button onClick={agregarFilaItem} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                    <Plus className="w-3 h-3" /> Agregar fase
                  </button>
                </div>
                <div className="space-y-2">
                  {planForm.items.map((it, i) => (
                    <div key={i} className="flex gap-1.5 items-start">
                      <input
                        type="text"
                        value={it.descripcion}
                        onChange={(e) => actualizarFilaItem(i, "descripcion", e.target.value)}
                        placeholder="Descripción (ej. Corona diente 16)"
                        className="flex-1 min-w-0 px-2.5 py-1.5 border border-border rounded-lg text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                      {odontogramaActivo && (
                        <input
                          type="text"
                          value={it.diente}
                          onChange={(e) => actualizarFilaItem(i, "diente", e.target.value)}
                          placeholder="Diente"
                          title="Número FDI (opcional)"
                          className="w-16 px-2.5 py-1.5 border border-border rounded-lg text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      )}
                      <input
                        type="number"
                        value={it.costo}
                        onChange={(e) => actualizarFilaItem(i, "costo", e.target.value)}
                        placeholder="Costo"
                        className="w-24 px-2.5 py-1.5 border border-border rounded-lg text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                      <button
                        onClick={() => quitarFilaItem(i)}
                        disabled={planForm.items.length === 1}
                        className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Notas</label>
                <textarea
                  value={planForm.notas}
                  onChange={(e) => setPlanForm({ ...planForm, notas: e.target.value })}
                  rows={2}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  placeholder="opcional"
                />
              </div>
              {planError && <p className="text-xs text-red-600">{planError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button
                onClick={() => setPlanModalAbierto(false)}
                className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardarPlan}
                disabled={planGuardando}
                className="px-4 py-2 text-sm rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium disabled:opacity-50"
              >
                {planGuardando ? "Guardando…" : "Guardar plan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cobroModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-lg w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <p className="text-sm font-semibold text-foreground">Cobrar fase</p>
              <button onClick={() => setCobroModal(null)} className="p-1 rounded-md hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground">{cobroModal.descripcion}</p>
              <p className="text-xl font-semibold text-foreground">
                {cobroModal.costo.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}
              </p>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Método de pago</label>
                <select
                  value={cobroMetodo}
                  onChange={(e) => setCobroMetodo(e.target.value as MetodoPagoPlanInput)}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="CASH">Efectivo</option>
                  <option value="CARD">Tarjeta</option>
                  <option value="TRANSFER">Transferencia</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button
                onClick={() => setCobroModal(null)}
                className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarCobro}
                disabled={itemEnCurso === cobroModal.itemId}
                className="px-4 py-2 text-sm rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium disabled:opacity-50"
              >
                {itemEnCurso === cobroModal.itemId ? "Cobrando…" : "Confirmar cobro"}
              </button>
            </div>
          </div>
        </div>
      )}

      {consentModalAbierto && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <p className="text-sm font-semibold text-foreground">Nuevo consentimiento informado</p>
              <button onClick={() => setConsentModalAbierto(false)} className="p-1 rounded-md hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Tipo de procedimiento *</label>
                <select
                  value={consentProcedureType}
                  onChange={(e) => setConsentProcedureType(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  {plantillasConsentimiento.map((p) => (
                    <option key={p.id} value={p.id}>{p.etiqueta}</option>
                  ))}
                </select>
              </div>

              {fasesPlanParaConsentimiento.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Ligar a una fase del plan de tratamiento (opcional)</label>
                  <select
                    value={consentItemPlanId}
                    onChange={(e) => setConsentItemPlanId(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="">Ninguna</option>
                    {fasesPlanParaConsentimiento.map((f) => (
                      <option key={f.id} value={f.id}>{f.etiqueta}</option>
                    ))}
                  </select>
                </div>
              )}

              {plantillaConsentSeleccionada && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs text-foreground whitespace-pre-line">{plantillaConsentSeleccionada.cuerpo}</p>
                  <p className="text-[11.5px] text-muted-foreground mt-2 italic">{NOTA_FIRMA_SIMULADA}</p>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-muted-foreground">Firmado por *</label>
                <input
                  type="text"
                  value={consentFirmadoPor}
                  onChange={(e) => setConsentFirmadoPor(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="Nombre del paciente o su representante"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Firma *</label>
                <FirmaCanvas onChange={setConsentFirma} className="mt-1" />
              </div>

              {consentError && <p className="text-xs text-red-600">{consentError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button
                onClick={() => setConsentModalAbierto(false)}
                className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardarConsentimiento}
                disabled={consentGuardando}
                className="px-4 py-2 text-sm rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium disabled:opacity-50"
              >
                {consentGuardando ? "Guardando…" : "Guardar y firmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {consentVerModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <p className="text-sm font-semibold text-foreground">
                {plantillasConsentimiento.find((p) => p.id === consentVerModal.procedureType)?.etiqueta ?? consentVerModal.procedureType}
              </p>
              <button onClick={() => setConsentVerModal(null)} className="p-1 rounded-md hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground">
                Dr(a). {consentVerModal.doctor} · {new Date(consentVerModal.creadoEn).toLocaleDateString("es-MX")}
                {consentVerModal.itemPlanDescripcion && ` · ${consentVerModal.itemPlanDescripcion}`}
              </p>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-foreground whitespace-pre-line">{consentVerModal.content}</p>
              </div>
              {consentVerModal.firmaImagen && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Firmado por {consentVerModal.firmadoPor}
                    {consentVerModal.firmadoEn && ` · ${new Date(consentVerModal.firmadoEn).toLocaleString("es-MX")}`}
                  </label>
                  {/* h-40 + object-contain fijos (2026-09-21, bug reportado
                      por Carlos): una firma real de FirmaCanvas.tsx ya viene
                      del tamaño correcto, pero un placeholder de 1x1 (dato
                      de demo) estirado a w-full con alto automático se veía
                      como un cuadro gigante — con alto fijo y
                      object-contain se ve bien sin importar el tamaño real
                      de la imagen. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={consentVerModal.firmaImagen}
                    alt="Firma del paciente"
                    className="mt-1 w-full h-40 object-contain rounded-lg border border-border bg-white"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button
                onClick={() => setConsentVerModal(null)}
                className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-muted"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {recetaModalAbierto && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <p className="text-sm font-semibold text-foreground">Nueva receta</p>
              <button onClick={() => setRecetaModalAbierto(false)} className="p-1 rounded-md hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Doctor(a) *</label>
                <select
                  value={recetaDoctorUserId}
                  onChange={(e) => setRecetaDoctorUserId(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  {doctores.map((d) => (
                    <option key={d.userId} value={d.userId}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Medicamentos *</label>
                <textarea
                  value={recetaMedications}
                  onChange={(e) => setRecetaMedications(e.target.value)}
                  rows={4}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  placeholder={"Ej. Amoxicilina 500mg, 1 cápsula cada 8 horas por 7 días"}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Indicaciones (opcional)</label>
                <textarea
                  value={recetaIndications}
                  onChange={(e) => setRecetaIndications(e.target.value)}
                  rows={2}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  placeholder="Ej. Tomar con alimentos, evitar alcohol"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Firma del doctor(a) *</label>
                <FirmaCanvas onChange={setRecetaFirma} className="mt-1" />
              </div>

              {recetaError && <p className="text-xs text-red-600">{recetaError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button
                onClick={() => setRecetaModalAbierto(false)}
                className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardarReceta}
                disabled={recetaGuardando}
                className="px-4 py-2 text-sm rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium disabled:opacity-50"
              >
                {recetaGuardando ? "Guardando…" : "Guardar y firmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {recetaVerModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <p className="text-sm font-semibold text-foreground">Receta</p>
              <button onClick={() => setRecetaVerModal(null)} className="p-1 rounded-md hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground">
                Dr(a). {recetaVerModal.doctor} · {new Date(recetaVerModal.creadoEn).toLocaleDateString("es-MX")}
              </p>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Medicamentos</p>
                <p className="text-xs text-foreground whitespace-pre-line">{recetaVerModal.medications}</p>
              </div>
              {recetaVerModal.indications && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Indicaciones</p>
                  <p className="text-xs text-foreground whitespace-pre-line">{recetaVerModal.indications}</p>
                </div>
              )}
              {recetaVerModal.firmaImagen && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Firma del doctor(a)</label>
                  {/* Mismo h-40 + object-contain que la firma del paciente en
                      "Ver consentimiento" — ver el comentario de ese bloque
                      arriba (bug del placeholder de demo estirado). */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={recetaVerModal.firmaImagen}
                    alt="Firma del doctor"
                    className="mt-1 w-full h-40 object-contain rounded-lg border border-border bg-white"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button
                onClick={() => setRecetaVerModal(null)}
                className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:bg-muted"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {modal}
    </div>
  );
}
