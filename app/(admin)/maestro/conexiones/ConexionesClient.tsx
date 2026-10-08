"use client";

import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, CheckCircle2, Circle, Copy, ExternalLink, Loader2, MessageCircle, ShoppingCart, XCircle } from "lucide-react";
import type { ConexionesData } from "@/lib/conexiones-data";
import { enlacesMeta } from "@/lib/conexiones-meta";
import { guardarHotmartAction, guardarWhatsappAction, probarWhatsappAction, type PruebaItem } from "./actions";

/**
 * Panel Maestro → Conexiones (2026-10-08). Una sola pantalla para dejar
 * WhatsApp y Hotmart funcionando, pensada para un dueño sin conocimientos
 * técnicos: pasos numerados, un botón de copiar en cada dato que Linkity da,
 * enlaces directos a la pantalla correcta de Meta/Hotmart, y una prueba que
 * responde en palabras simples.
 *
 * Las claves se escriben en campos de texto con los caracteres ocultos por CSS
 * (no type="password") a propósito: así el navegador no las confunde con una
 * contraseña y no autocompleta correos ni contraseñas guardadas ahí.
 */

const CLASE_INPUT =
  "mt-1 w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]";
const OCULTO = { WebkitTextSecurity: "disc" } as CSSProperties;
const BOTON_PRIMARIO =
  "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#4F46E5] text-white text-[13px] font-medium hover:bg-[#4338CA] disabled:opacity-50 disabled:cursor-not-allowed";
const BOTON_SECUNDARIO =
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-[13px] hover:bg-slate-50";

function fechaLarga(iso: string) {
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

// ---------------------------------------------------------------------------
// Piezas pequeñas
// ---------------------------------------------------------------------------

function Pastilla({ listo, textoListo, textoFalta }: { listo: boolean; textoListo: string; textoFalta: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-0.5 rounded-full ${
        listo ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      {listo ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
      {listo ? textoListo : textoFalta}
    </span>
  );
}

function Paso({ n, titulo, hecho, children }: { n: number; titulo: string; hecho?: boolean; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div
        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-medium ${
          hecho ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600"
        }`}
      >
        {hecho ? <Check className="w-3.5 h-3.5" /> : n}
      </div>
      <div className="flex-1 min-w-0 pb-5">
        <p className="text-[13.5px] font-medium text-slate-800 mb-2">{titulo}</p>
        {children}
      </div>
    </div>
  );
}

function Ayuda({ titulo = "¿Dónde lo encuentro?", children }: { titulo?: string; children: ReactNode }) {
  return (
    <details className="mt-1 text-[12.5px] text-slate-500">
      <summary className="cursor-pointer text-[#4F46E5] select-none">{titulo}</summary>
      <div className="mt-1 space-y-1 leading-relaxed">{children}</div>
    </details>
  );
}

function Copiable({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* si el navegador lo impide, el valor se puede seleccionar a mano */
    }
  }
  return (
    <div>
      <label className="text-[12px] font-medium text-slate-500">{etiqueta}</label>
      <div className="flex gap-2 mt-1">
        <input readOnly value={valor} onFocus={(e) => e.currentTarget.select()} className="flex-1 min-w-0 px-2.5 py-1.5 border border-slate-200 rounded-lg text-[12.5px] font-mono bg-slate-50 text-slate-700" />
        <button type="button" onClick={copiar} className={`${BOTON_SECUNDARIO} flex-shrink-0 w-[96px] justify-center`}>
          {copiado ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

function EnlaceExterno({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={BOTON_SECUNDARIO}>
      <ExternalLink className="w-3.5 h-3.5" />
      {children}
    </a>
  );
}

function ResultadoPrueba({ item }: { item: PruebaItem }) {
  const icono =
    item.nivel === "ok" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : item.nivel === "aviso" ? <AlertTriangle className="w-4 h-4 text-amber-600" /> : <XCircle className="w-4 h-4 text-red-600" />;
  return (
    <div className="flex gap-2 items-start">
      <span className="mt-0.5 flex-shrink-0">{icono}</span>
      <div>
        <p className="text-[13px] font-medium text-slate-800">{item.titulo}</p>
        <p className="text-[12.5px] text-slate-500">{item.detalle}</p>
      </div>
    </div>
  );
}

function Mensaje({ tipo, children }: { tipo: "error" | "ok"; children: ReactNode }) {
  return <p className={`text-[12.5px] ${tipo === "error" ? "text-red-600" : "text-emerald-600"}`}>{children}</p>;
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

function TarjetaWhatsapp({ data }: { data: ConexionesData }) {
  const router = useRouter();
  const wa = data.whatsapp;
  const enlaces = enlacesMeta(wa.appId);

  const [phoneNumberId, setPhoneNumberId] = useState(wa.phoneNumberId ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [plantilla, setPlantilla] = useState(wa.plantilla);
  const [idioma, setIdioma] = useState(wa.idioma);
  const [error, setError] = useState("");
  const [guardado, setGuardado] = useState(false);
  const [items, setItems] = useState<PruebaItem[] | null>(null);
  const [pendiente, iniciar] = useTransition();

  const datosListos = !!wa.phoneNumberId && wa.accessToken.configurado && wa.appSecret.configurado;
  const metaListo = !!wa.metaContactoAt;
  const pruebaOk = items !== null && items.length > 0 && items.every((i) => i.nivel !== "error");
  const listo = datosListos && metaListo;
  const urlWebhook = `${data.sitio}/api/webhooks/whatsapp`;

  function probar() {
    setError("");
    iniciar(async () => {
      const r = await probarWhatsappAction();
      if (!r.ok) setError(r.error);
      else setItems(r.items);
      router.refresh();
    });
  }

  function guardarYProbar() {
    setError("");
    setGuardado(false);
    const cambios = {
      phoneNumberId: phoneNumberId.trim() !== (wa.phoneNumberId ?? "") ? phoneNumberId : undefined,
      accessToken: accessToken.trim() || undefined,
      appSecret: appSecret.trim() || undefined,
    };
    const hayCambios = !!(cambios.phoneNumberId || cambios.accessToken || cambios.appSecret);
    iniciar(async () => {
      if (hayCambios) {
        const g = await guardarWhatsappAction(cambios);
        if (!g.ok) {
          setError(g.error);
          return;
        }
        setGuardado(true);
        setAccessToken("");
        setAppSecret("");
      }
      const r = await probarWhatsappAction();
      if (!r.ok) setError(r.error);
      else setItems(r.items);
      router.refresh();
    });
  }

  function guardarAvanzado() {
    setError("");
    setGuardado(false);
    iniciar(async () => {
      const g = await guardarWhatsappAction({ plantilla, idioma });
      if (!g.ok) setError(g.error);
      else setGuardado(true);
      router.refresh();
    });
  }

  return (
    <section className="bg-white border border-slate-200 rounded-lg">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-slate-100">
        <MessageCircle className="w-5 h-5 text-emerald-600" />
        <div className="flex-1 min-w-[200px]">
          <h2 className="text-[14px] font-medium text-slate-800">WhatsApp de Linkity</h2>
          <p className="text-[12.5px] text-slate-400">Con este número Linkity avisa a los negocios de su suscripción (prueba por terminar, vencimiento, bloqueo).</p>
        </div>
        <Pastilla listo={listo} textoListo="Listo" textoFalta="Faltan pasos" />
      </div>

      <div className="px-5 pt-5">
        {!data.cifradoListo && (
          <p className="mb-4 text-[12.5px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            Falta configurar la llave de cifrado en el servidor (CONFIG_ENCRYPTION_KEY). Sin ella no se pueden guardar las claves.
          </p>
        )}

        <Paso n={1} titulo="Copia 3 datos de Meta y pégalos aquí" hecho={datosListos}>
          <div className="mb-3">
            <EnlaceExterno href={enlaces.api}>Abrir Meta</EnlaceExterno>
            <p className="mt-1.5 text-[12.5px] text-slate-500">
              En Meta entra a tu app → <b>Casos de uso</b> → <b>Personalizar</b> → <b>Configuración de la API</b>.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[12px] font-medium text-slate-500">Identificador del número de teléfono (Phone Number ID)</label>
              <input
                type="text"
                name="linkity_wa_phone_id"
                inputMode="numeric"
                autoComplete="off"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="Solo números, por ejemplo 1358955560631923"
                className={CLASE_INPUT}
              />
              <Ayuda>
                <p>En «Configuración de la API», debajo de tu número, dice «Identificador de número de teléfono». Son solo números.</p>
              </Ayuda>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-medium text-slate-500">Token de acceso</label>
                {wa.accessToken.configurado && <span className="text-[12px] text-emerald-600">Guardado · ••••{wa.accessToken.ultimos}</span>}
              </div>
              <input
                type="text"
                name="linkity_wa_token"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                style={OCULTO}
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder={wa.accessToken.configurado ? "Déjalo vacío para conservar el guardado" : "Texto largo que empieza con EAA"}
                className={CLASE_INPUT}
              />
              <Ayuda>
                <p>En la misma pantalla, arriba, pulsa <b>Generar token de acceso</b>, elige tu cuenta de WhatsApp y copia el texto que empieza con EAA.</p>
                <p><b>Ojo:</b> ese token dura solo 24 horas. Sirve para probar. Para usarlo con clientes crea uno permanente (abajo, «Token permanente»).</p>
              </Ayuda>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-medium text-slate-500">App Secret (clave secreta de la app)</label>
                {wa.appSecret.configurado && <span className="text-[12px] text-emerald-600">Guardado · ••••{wa.appSecret.ultimos}</span>}
              </div>
              <input
                type="text"
                name="linkity_wa_secret"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                style={OCULTO}
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                placeholder={wa.appSecret.configurado ? "Déjalo vacío para conservar el guardado" : "32 letras y números"}
                className={CLASE_INPUT}
              />
              <Ayuda>
                <p>
                  En Meta: <b>Configuración de la app</b> → <b>Básica</b> → <b>Clave secreta de la app</b> → pulsa <b>Mostrar</b>.{" "}
                  <a href={enlaces.basico} target="_blank" rel="noreferrer" className="underline">Abrir esa pantalla</a>
                </p>
              </Ayuda>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={guardarYProbar} disabled={pendiente || !data.cifradoListo} className={BOTON_PRIMARIO}>
              {pendiente && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {pendiente ? "Guardando y probando…" : "Guardar y probar"}
            </button>
            {guardado && !error && <Mensaje tipo="ok">Guardado.</Mensaje>}
            {error && <Mensaje tipo="error">{error}</Mensaje>}
          </div>

          <details className="mt-3 text-[12.5px] text-slate-500">
            <summary className="cursor-pointer text-[#4F46E5] select-none">Token permanente (para usar con clientes)</summary>
            <ol className="mt-1 list-decimal pl-5 space-y-0.5 leading-relaxed">
              <li>Abre <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noreferrer" className="underline">Usuarios del sistema</a> en Meta.</li>
              <li>Crea un usuario del sistema con rol de administrador.</li>
              <li>Pulsa <b>Asignar activos</b>: elige tu app y tu cuenta de WhatsApp con control total.</li>
              <li>Pulsa <b>Generar token</b>, elige tu app y marca los permisos <b>whatsapp_business_messaging</b> y <b>whatsapp_business_management</b>. Si pregunta cuándo vence, elige que no venza.</li>
              <li>Pega ese token arriba y pulsa «Guardar y probar». La prueba debe decir «El token es permanente».</li>
            </ol>
          </details>
        </Paso>

        <Paso n={2} titulo="Pega esto en Meta (una sola vez)" hecho={metaListo}>
          <div className="space-y-3">
            <Copiable etiqueta="Dirección (URL de devolución de llamada)" valor={urlWebhook} />
            {wa.verifyToken ? (
              <Copiable etiqueta="Token de verificación" valor={wa.verifyToken} />
            ) : (
              <p className="text-[12.5px] text-red-600">No se pudo generar el token de verificación (falta la llave de cifrado en el servidor).</p>
            )}
          </div>
          <ol className="mt-3 list-decimal pl-5 space-y-0.5 text-[12.5px] text-slate-600 leading-relaxed">
            <li>Abre la pantalla de Webhook de Meta (botón de abajo).</li>
            <li>Pega la dirección y el token en sus cuadros.</li>
            <li>Deja <b>apagado</b> «Adjunta un certificado de cliente».</li>
            <li>Pulsa <b>Verificar y guardar</b>.</li>
            <li>Baja hasta la fila <b>messages</b> y enciende su interruptor para que diga <b>Suscrito</b>.</li>
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <EnlaceExterno href={enlaces.webhook}>Abrir Webhook en Meta</EnlaceExterno>
            {wa.metaContactoAt ? (
              <span className="text-[12.5px] text-emerald-600" suppressHydrationWarning>
                Meta ya se conectó · {fechaLarga(wa.metaContactoAt)}
              </span>
            ) : (
              <span className="text-[12.5px] text-slate-400">Meta todavía no se ha conectado.</span>
            )}
          </div>
        </Paso>

        <Paso n={3} titulo="Comprueba que todo funcione" hecho={pruebaOk && metaListo}>
          <p className="text-[12.5px] text-slate-500 mb-2">No envía ningún mensaje: solo revisa tus datos con Meta.</p>
          <button type="button" onClick={probar} disabled={pendiente} className={BOTON_SECUNDARIO}>
            {pendiente && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Probar conexión
          </button>
          {items && (
            <div className="mt-3 space-y-2.5 border border-slate-100 rounded-lg p-3 bg-slate-50/60">
              {items.map((i) => (
                <ResultadoPrueba key={i.id} item={i} />
              ))}
            </div>
          )}
          {!items && wa.numero && <p className="mt-2 text-[12.5px] text-slate-500">Número conectado: {wa.numero}</p>}
        </Paso>

        <details className="pb-5 text-[12.5px]">
          <summary className="cursor-pointer text-slate-500 select-none">Opciones avanzadas (normalmente no hace falta tocarlas)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[12px] font-medium text-slate-500">Plantilla de WhatsApp aprobada en Meta</label>
              <input type="text" name="linkity_wa_plantilla" autoComplete="off" value={plantilla} onChange={(e) => setPlantilla(e.target.value)} className={CLASE_INPUT} />
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-500">Idioma de la plantilla</label>
              <input type="text" name="linkity_wa_idioma" autoComplete="off" value={idioma} onChange={(e) => setIdioma(e.target.value)} placeholder="es_MX" className={CLASE_INPUT} />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button type="button" onClick={guardarAvanzado} disabled={pendiente} className={BOTON_SECUNDARIO}>Guardar opciones</button>
            <a href="https://business.facebook.com/latest/whatsapp_manager/message_templates/" target="_blank" rel="noreferrer" className="text-[#4F46E5] underline">Ver mis plantillas en Meta</a>
          </div>
        </details>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Hotmart
// ---------------------------------------------------------------------------

function TarjetaHotmart({ data }: { data: ConexionesData }) {
  const router = useRouter();
  const hm = data.hotmart;
  const [checkoutUrl, setCheckoutUrl] = useState(hm.checkoutUrl ?? "");
  const [hottok, setHottok] = useState("");
  const [error, setError] = useState("");
  const [guardado, setGuardado] = useState(false);
  const [pendiente, iniciar] = useTransition();

  const clavesListas = hm.hottok.configurado && !!hm.checkoutUrl;
  const planesListos = hm.planesActivos > 0 && hm.planesSinCodigo === 0;
  const listo = clavesListas && planesListos;
  const urlWebhook = `${data.sitio}/api/webhooks/hotmart`;

  function guardar() {
    setError("");
    setGuardado(false);
    iniciar(async () => {
      const g = await guardarHotmartAction({
        checkoutUrl: checkoutUrl.trim() !== (hm.checkoutUrl ?? "") ? checkoutUrl : undefined,
        hottok: hottok.trim() || undefined,
      });
      if (!g.ok) setError(g.error);
      else {
        setGuardado(true);
        setHottok("");
      }
      router.refresh();
    });
  }

  return (
    <section className="bg-white border border-slate-200 rounded-lg">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-slate-100">
        <ShoppingCart className="w-5 h-5 text-orange-500" />
        <div className="flex-1 min-w-[200px]">
          <h2 className="text-[14px] font-medium text-slate-800">Cobros con Hotmart</h2>
          <p className="text-[12.5px] text-slate-400">Cuando un cliente paga en Hotmart, su cuenta se activa sola.</p>
        </div>
        <Pastilla listo={listo} textoListo="Listo" textoFalta="Faltan pasos" />
      </div>

      <div className="px-5 pt-5">
        <Paso n={1} titulo="Copia 2 datos de Hotmart y pégalos aquí" hecho={clavesListas}>
          <div className="mb-3">
            <EnlaceExterno href="https://app.hotmart.com/">Abrir Hotmart</EnlaceExterno>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-[12px] font-medium text-slate-500">Link de pago de tu producto</label>
              <input
                type="text"
                name="linkity_hm_checkout"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={checkoutUrl}
                onChange={(e) => setCheckoutUrl(e.target.value)}
                placeholder="https://pay.hotmart.com/…"
                className={CLASE_INPUT}
              />
              <Ayuda>
                <p>En Hotmart: <b>Productos</b> → tu producto → <b>Ofertas</b>. Copia el link de pago de la oferta. Es el que verán tus clientes cuando se acabe su prueba.</p>
              </Ayuda>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-medium text-slate-500">Clave de Hotmart (Hottok)</label>
                {hm.hottok.configurado && <span className="text-[12px] text-emerald-600">Guardada · ••••{hm.hottok.ultimos}</span>}
              </div>
              <input
                type="text"
                name="linkity_hm_hottok"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                style={OCULTO}
                value={hottok}
                onChange={(e) => setHottok(e.target.value)}
                placeholder={hm.hottok.configurado ? "Déjala vacía para conservar la guardada" : "Texto largo que da Hotmart"}
                className={CLASE_INPUT}
              />
              <Ayuda>
                <p>En Hotmart: <b>Herramientas</b> → <b>Webhook</b>. Ahí aparece el «Hottok» (se llama también «token»).</p>
              </Ayuda>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={guardar} disabled={pendiente || !data.cifradoListo} className={BOTON_PRIMARIO}>
              {pendiente && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {pendiente ? "Guardando…" : "Guardar"}
            </button>
            {guardado && !error && <Mensaje tipo="ok">Guardado.</Mensaje>}
            {error && <Mensaje tipo="error">{error}</Mensaje>}
          </div>
        </Paso>

        <Paso n={2} titulo="Registra esto en Hotmart (una sola vez)" hecho={!!hm.ultimoEventoAt}>
          <Copiable etiqueta="Dirección del webhook" valor={urlWebhook} />
          <ol className="mt-3 list-decimal pl-5 space-y-0.5 text-[12.5px] text-slate-600 leading-relaxed">
            <li>En Hotmart entra a <b>Herramientas</b> → <b>Webhook</b> y crea uno nuevo.</li>
            <li>Pega la dirección de arriba. Versión: <b>2.0.0</b>.</li>
            <li>Marca estos eventos: <b>Compra aprobada</b>, <b>Compra completa</b>, <b>Compra reembolsada</b>, <b>Chargeback</b> y <b>Cancelación de suscripción</b>.</li>
            <li>Guarda y usa el botón <b>Enviar prueba</b> de Hotmart: abajo debe aparecer la fecha del último aviso.</li>
          </ol>
          <p className="mt-2 text-[12.5px]" suppressHydrationWarning>
            {hm.ultimoEventoAt ? (
              <span className="text-emerald-600">Último aviso de Hotmart: {fechaLarga(hm.ultimoEventoAt)}</span>
            ) : (
              <span className="text-slate-400">Todavía no llega ningún aviso de Hotmart.</span>
            )}
          </p>
        </Paso>

        <Paso n={3} titulo="Cada plan debe saber qué producto de Hotmart es" hecho={planesListos}>
          {planesListos ? (
            <p className="text-[12.5px] text-emerald-600">Tus {hm.planesActivos} planes ya tienen su producto u oferta de Hotmart.</p>
          ) : (
            <p className="text-[12.5px] text-amber-700">
              {hm.planesActivos === 0 ? "No hay planes activos." : `${hm.planesSinCodigo} de ${hm.planesActivos} planes no tienen producto u oferta de Hotmart: ese pago no activaría la cuenta.`}{" "}
              <Link href="/maestro/planes-comerciales" className="underline">Poner los códigos</Link>
            </p>
          )}
          {hm.pendientes > 0 && (
            <p className="mt-1.5 text-[12.5px] text-amber-700">
              Hay {hm.pendientes} {hm.pendientes === 1 ? "compra" : "compras"} por revisar. <Link href="/maestro/hotmart" className="underline">Verlas</Link>
            </p>
          )}
          {hm.pendientes === 0 && (
            <p className="mt-1.5 text-[12.5px] text-slate-500">
              <Link href="/maestro/hotmart" className="underline">Ver el historial de compras</Link>
            </p>
          )}
        </Paso>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

export default function ConexionesClient({ data }: { data: ConexionesData }) {
  const wa = data.whatsapp;
  const hm = data.hotmart;
  const waListo = !!wa.phoneNumberId && wa.accessToken.configurado && wa.appSecret.configurado && !!wa.metaContactoAt;
  const hmListo = hm.hottok.configurado && !!hm.checkoutUrl && hm.planesActivos > 0 && hm.planesSinCodigo === 0;

  const Fila = ({ ok, texto }: { ok: boolean; texto: string }) => (
    <div className="flex items-center gap-2 text-[13px] text-slate-600">
      {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Circle className="w-4 h-4 text-slate-300" />}
      {texto}
    </div>
  );

  return (
    <div className="max-w-3xl space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 grid gap-1.5 sm:grid-cols-2">
        <Fila ok={waListo} texto={waListo ? "WhatsApp: listo" : "WhatsApp: faltan pasos"} />
        <Fila ok={hmListo} texto={hmListo ? "Hotmart: listo" : "Hotmart: faltan pasos"} />
      </div>
      <TarjetaWhatsapp data={data} />
      <TarjetaHotmart data={data} />
    </div>
  );
}
