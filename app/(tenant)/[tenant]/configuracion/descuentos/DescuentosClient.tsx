"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft, Percent, Plus, X, Pencil, Trash2, Tag, Loader2, Search,
} from "lucide-react";
import {
  crearDescuentoAction,
  actualizarDescuentoAction,
  alternarActivoDescuentoAction,
  eliminarDescuentoAction,
  type TipoDescuentoInput,
  type TipoValorInput,
  type AlcanceDescuentoInput,
} from "@/app/actions/discounts";

/**
 * Pantalla de administración de Descuentos (M18, 2026-10-01) — antes de
 * esto no existía ninguna forma de crear/editar un Discount desde la UI
 * (Carlos armó todo el cálculo en POS a mano, pero nunca el CRUD). Mismo
 * patrón visual que el resto de pantallas de Configuración/Catálogo/
 * Clientes: tarjetas con lista + modal de formulario, sin wizard.
 */

export interface DescuentoUI {
  id: string;
  name: string;
  code: string | null;
  type: TipoDescuentoInput;
  valueType: TipoValorInput;
  scope: AlcanceDescuentoInput;
  value: number;
  minPurchase: number | null;
  maxDiscount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usageCount: number;
  oncePerCustomer: boolean;
  accumulable: boolean;
  priority: number;
  isActive: boolean;
  customerId: string | null;
  customerName: string | null;
  productIds: string[];
  categoryIds: string[];
}

interface ProductoOpcion {
  id: string;
  name: string;
  categoryName: string;
}
interface CategoriaOpcion {
  id: string;
  name: string;
}
interface ClienteOpcion {
  id: string;
  name: string;
  phone: string | null;
}

interface DescuentosClientProps {
  tenantSlug: string;
  descuentosIniciales: DescuentoUI[];
  errorInicial: string | null;
  productos: ProductoOpcion[];
  categorias: CategoriaOpcion[];
  clientes: ClienteOpcion[];
}

const TIPO_LABEL: Record<TipoDescuentoInput, string> = {
  SEASONAL: "Temporada",
  CUSTOMER: "Cliente específico",
  ONE_TIME: "Un solo uso",
};
const ALCANCE_LABEL: Record<AlcanceDescuentoInput, string> = {
  SALE: "Toda la venta",
  PRODUCT: "Productos específicos",
  CATEGORY: "Categorías específicas",
};

const formatMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

function formatoValor(d: Pick<DescuentoUI, "valueType" | "value">): string {
  return d.valueType === "PERCENTAGE" ? `${d.value}%` : formatMXN(d.value);
}

function formatoFecha(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

// ISO (lo que manda el servidor) → "YYYY-MM-DD" (lo que entiende <input type="date">)
function fechaParaInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

type FormDescuento = {
  name: string;
  code: string;
  type: TipoDescuentoInput;
  valueType: TipoValorInput;
  scope: AlcanceDescuentoInput;
  value: string;
  minPurchase: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  oncePerCustomer: boolean;
  accumulable: boolean;
  priority: string;
  isActive: boolean;
  customerId: string;
  productIds: string[];
  categoryIds: string[];
};

const FORM_VACIO: FormDescuento = {
  name: "",
  code: "",
  type: "SEASONAL",
  valueType: "PERCENTAGE",
  scope: "SALE",
  value: "",
  minPurchase: "",
  maxDiscount: "",
  startsAt: "",
  endsAt: "",
  usageLimit: "",
  oncePerCustomer: false,
  accumulable: false,
  priority: "0",
  isActive: true,
  customerId: "",
  productIds: [],
  categoryIds: [],
};

function descuentoAForm(d: DescuentoUI): FormDescuento {
  return {
    name: d.name,
    code: d.code ?? "",
    type: d.type,
    valueType: d.valueType,
    scope: d.scope,
    value: String(d.value),
    minPurchase: d.minPurchase != null ? String(d.minPurchase) : "",
    maxDiscount: d.maxDiscount != null ? String(d.maxDiscount) : "",
    startsAt: fechaParaInput(d.startsAt),
    endsAt: fechaParaInput(d.endsAt),
    usageLimit: d.usageLimit != null ? String(d.usageLimit) : "",
    oncePerCustomer: d.oncePerCustomer,
    accumulable: d.accumulable,
    priority: String(d.priority),
    isActive: d.isActive,
    customerId: d.customerId ?? "",
    productIds: d.productIds,
    categoryIds: d.categoryIds,
  };
}

const INPUT_CLS =
  "mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";
const LABEL_CLS = "text-xs font-medium text-muted-foreground";

export default function DescuentosClient({
  tenantSlug,
  descuentosIniciales,
  errorInicial,
  productos,
  categorias,
  clientes,
}: DescuentosClientProps) {
  const [descuentos, setDescuentos] = useState<DescuentoUI[]>(descuentosIniciales);
  const [errorCarga] = useState(errorInicial);

  const [modoModal, setModoModal] = useState<"crear" | "editar" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormDescuento>(FORM_VACIO);
  const [formError, setFormError] = useState<string | null>(null);
  const [filtroCatalogo, setFiltroCatalogo] = useState("");
  const [guardando, startGuardar] = useTransition();
  const [enCurso, setEnCurso] = useState<string | null>(null); // id en toggle/borrado

  const abrirCrear = () => {
    setForm(FORM_VACIO);
    setFormError(null);
    setFiltroCatalogo("");
    setEditId(null);
    setModoModal("crear");
  };

  const abrirEditar = (d: DescuentoUI) => {
    setForm(descuentoAForm(d));
    setFormError(null);
    setFiltroCatalogo("");
    setEditId(d.id);
    setModoModal("editar");
  };

  const cerrarModal = () => {
    setModoModal(null);
    setEditId(null);
  };

  const toggleEnLista = (lista: string[], id: string): string[] =>
    lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];

  const handleGuardar = () => {
    setFormError(null);

    const valorNum = parseFloat(form.value);
    if (!form.name.trim()) return setFormError("El nombre es obligatorio");
    if (!Number.isFinite(valorNum) || valorNum <= 0) return setFormError("El valor del descuento debe ser mayor a cero");
    if (form.valueType === "PERCENTAGE" && valorNum > 100) return setFormError("Un descuento en porcentaje no puede ser mayor a 100%");
    if (form.scope === "PRODUCT" && form.productIds.length === 0) return setFormError("Elige al menos un producto");
    if (form.scope === "CATEGORY" && form.categoryIds.length === 0) return setFormError("Elige al menos una categoría");

    const datos = {
      tenantSlug,
      name: form.name,
      code: form.code.trim() || null,
      type: form.type,
      valueType: form.valueType,
      scope: form.scope,
      value: valorNum,
      minPurchase: form.minPurchase.trim() ? parseFloat(form.minPurchase) : null,
      maxDiscount: form.maxDiscount.trim() ? parseFloat(form.maxDiscount) : null,
      startsAt: form.startsAt || null,
      endsAt: form.endsAt || null,
      usageLimit: form.usageLimit.trim() ? parseInt(form.usageLimit, 10) : null,
      oncePerCustomer: form.oncePerCustomer,
      accumulable: form.accumulable,
      priority: form.priority.trim() ? parseInt(form.priority, 10) : 0,
      isActive: form.isActive,
      customerId: form.type === "CUSTOMER" ? form.customerId || null : null,
      productIds: form.scope === "PRODUCT" ? form.productIds : [],
      categoryIds: form.scope === "CATEGORY" ? form.categoryIds : [],
    };

    startGuardar(async () => {
      const res =
        modoModal === "editar" && editId
          ? await actualizarDescuentoAction({ ...datos, discountId: editId }).catch(
              (): { ok: false; error: string } => ({ ok: false, error: "No se pudo conectar con el servidor — inténtalo de nuevo." })
            )
          : await crearDescuentoAction(datos).catch(
              (): { ok: false; error: string } => ({ ok: false, error: "No se pudo conectar con el servidor — inténtalo de nuevo." })
            );

      if (!res.ok) {
        setFormError(res.error);
        return;
      }

      const customerName = form.customerId ? clientes.find((c) => c.id === form.customerId)?.name ?? null : null;
      const actualizado: DescuentoUI = {
        id: res.id,
        name: datos.name.trim(),
        code: datos.code,
        type: datos.type,
        valueType: datos.valueType,
        scope: datos.scope,
        value: datos.value,
        minPurchase: datos.minPurchase,
        maxDiscount: datos.maxDiscount,
        startsAt: datos.startsAt,
        endsAt: datos.endsAt,
        usageLimit: datos.usageLimit,
        usageCount: modoModal === "editar" ? descuentos.find((d) => d.id === res.id)?.usageCount ?? 0 : 0,
        oncePerCustomer: datos.oncePerCustomer,
        accumulable: datos.accumulable,
        priority: datos.priority,
        isActive: datos.isActive,
        customerId: datos.customerId,
        customerName,
        productIds: datos.productIds,
        categoryIds: datos.categoryIds,
      };

      setDescuentos((prev) =>
        modoModal === "editar" ? prev.map((d) => (d.id === res.id ? actualizado : d)) : [actualizado, ...prev]
      );
      cerrarModal();
    });
  };

  const handleToggleActivo = async (d: DescuentoUI) => {
    setEnCurso(d.id);
    const res = await alternarActivoDescuentoAction({ tenantSlug, discountId: d.id, activo: !d.isActive }).catch(
      (): { ok: false; error: string } => ({ ok: false, error: "No se pudo conectar con el servidor — inténtalo de nuevo." })
    );
    if (res.ok) {
      setDescuentos((prev) => prev.map((x) => (x.id === d.id ? { ...x, isActive: !x.isActive } : x)));
    } else {
      window.alert(res.error);
    }
    setEnCurso(null);
  };

  const handleEliminar = async (d: DescuentoUI) => {
    if (!window.confirm(`¿Eliminar el descuento "${d.name}"? Esto no se puede deshacer.`)) return;
    setEnCurso(d.id);
    const res = await eliminarDescuentoAction({ tenantSlug, discountId: d.id }).catch(
      (): { ok: false; error: string } => ({ ok: false, error: "No se pudo conectar con el servidor — inténtalo de nuevo." })
    );
    if (res.ok) {
      setDescuentos((prev) => prev.filter((x) => x.id !== d.id));
    } else {
      window.alert(res.error);
    }
    setEnCurso(null);
  };

  const productosFiltrados = useMemo(() => {
    const q = filtroCatalogo.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter((p) => p.name.toLowerCase().includes(q) || p.categoryName.toLowerCase().includes(q));
  }, [productos, filtroCatalogo]);

  const categoriasFiltradas = useMemo(() => {
    const q = filtroCatalogo.trim().toLowerCase();
    if (!q) return categorias;
    return categorias.filter((c) => c.name.toLowerCase().includes(q));
  }, [categorias, filtroCatalogo]);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto w-full h-full overflow-y-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Descuentos y promociones</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configura los descuentos que se aplican automáticamente en el Punto de Venta.
          </p>
        </div>
        <Link
          href={`/${tenantSlug}/configuracion`}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground flex-shrink-0 mt-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Volver a Configuración
        </Link>
      </div>

      {errorCarga && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">{errorCarga}</div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-border bg-muted/50">
          <div className="flex items-center gap-2">
            <Percent className="w-5 h-5 text-primary-text" />
            <h2 className="text-base font-semibold text-foreground">Tus descuentos</h2>
          </div>
          <button
            onClick={abrirCrear}
            className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" /> Nuevo descuento
          </button>
        </div>

        {descuentos.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Tag className="w-7 h-7 text-primary-text" />
            </div>
            <p className="text-sm font-medium text-foreground">Aún no tienes descuentos configurados</p>
            <p className="text-xs text-muted-foreground mt-1">
              Crea uno para que se aplique automáticamente en el Punto de Venta.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {descuentos.map((d) => (
              <div key={d.id} className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground truncate">{d.name}</p>
                    {d.code && (
                      <span className="px-1.5 py-0.5 rounded bg-muted text-[10.5px] font-mono text-muted-foreground">
                        {d.code}
                      </span>
                    )}
                    {!d.isActive && (
                      <span className="px-1.5 py-0.5 rounded bg-muted text-[10.5px] text-muted-foreground">Inactivo</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatoValor(d)} · {ALCANCE_LABEL[d.scope]} · {TIPO_LABEL[d.type]}
                    {d.customerName ? ` (${d.customerName})` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground/80 mt-1">
                    {d.minPurchase != null && <>Compra mín. {formatMXN(d.minPurchase)} · </>}
                    {d.maxDiscount != null && <>Tope {formatMXN(d.maxDiscount)} · </>}
                    {(d.startsAt || d.endsAt) && (
                      <>
                        Vigencia {d.startsAt ? formatoFecha(d.startsAt) : "siempre"} – {d.endsAt ? formatoFecha(d.endsAt) : "indefinido"} ·{" "}
                      </>
                    )}
                    {d.usageLimit != null && <>Usado {d.usageCount}/{d.usageLimit} · </>}
                    {d.accumulable ? "Acumulable" : "No acumulable"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    disabled={enCurso === d.id}
                    onClick={() => handleToggleActivo(d)}
                    title={d.isActive ? "Desactivar" : "Activar"}
                    className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
                      d.isActive ? "bg-primary" : "bg-muted-foreground/30"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        d.isActive ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <button onClick={() => abrirEditar(d)} className="p-1.5 rounded-md hover:bg-muted" title="Editar">
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => handleEliminar(d)}
                    disabled={enCurso === d.id}
                    className="p-1.5 rounded-md hover:bg-muted disabled:opacity-50"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modoModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={cerrarModal}>
          <div
            className="bg-card rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <p className="text-sm font-semibold text-foreground">
                {modoModal === "crear" ? "Nuevo descuento" : "Editar descuento"}
              </p>
              <button onClick={cerrarModal} className="p-1 rounded-md hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* ── Datos básicos ── */}
              <div>
                <label className={LABEL_CLS}>Nombre *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={INPUT_CLS}
                  placeholder='Ej. "Buen Fin 15%"'
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Código (opcional)</label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    className={`${INPUT_CLS} uppercase`}
                    placeholder="Ej. BUENFIN15"
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Tipo</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as TipoDescuentoInput })}
                    className={INPUT_CLS}
                  >
                    {(Object.keys(TIPO_LABEL) as TipoDescuentoInput[]).map((t) => (
                      <option key={t} value={t}>
                        {TIPO_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {form.type === "CUSTOMER" && (
                <div>
                  <label className={LABEL_CLS}>Cliente</label>
                  <select
                    value={form.customerId}
                    onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                    className={INPUT_CLS}
                  >
                    <option value="">Elige un cliente…</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.phone ? ` (${c.phone})` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10.5px] text-muted-foreground mt-1">
                    Solo se aplicará cuando esta persona esté seleccionada como cliente en la venta.
                  </p>
                </div>
              )}

              {/* ── Valor ── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Tipo de valor</label>
                  <select
                    value={form.valueType}
                    onChange={(e) => setForm({ ...form, valueType: e.target.value as TipoValorInput })}
                    className={INPUT_CLS}
                  >
                    <option value="PERCENTAGE">Porcentaje (%)</option>
                    <option value="FIXED">Monto fijo ($)</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLS}>Valor *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                    className={INPUT_CLS}
                    placeholder={form.valueType === "PERCENTAGE" ? "Ej. 15" : "Ej. 50.00"}
                  />
                </div>
              </div>

              {/* ── Alcance ── */}
              <div>
                <label className={LABEL_CLS}>Aplica a</label>
                <select
                  value={form.scope}
                  onChange={(e) => setForm({ ...form, scope: e.target.value as AlcanceDescuentoInput })}
                  className={INPUT_CLS}
                >
                  {(Object.keys(ALCANCE_LABEL) as AlcanceDescuentoInput[]).map((s) => (
                    <option key={s} value={s}>
                      {ALCANCE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>

              {(form.scope === "PRODUCT" || form.scope === "CATEGORY") && (
                <div>
                  <label className={LABEL_CLS}>
                    {form.scope === "PRODUCT" ? "Productos" : "Categorías"} *
                  </label>
                  <div className="mt-1 relative">
                    <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={filtroCatalogo}
                      onChange={(e) => setFiltroCatalogo(e.target.value)}
                      placeholder="Buscar…"
                      className="w-full pl-8 pr-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div className="mt-2 max-h-40 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                    {form.scope === "PRODUCT"
                      ? productosFiltrados.map((p) => (
                          <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-xs text-foreground cursor-pointer hover:bg-muted/50">
                            <input
                              type="checkbox"
                              checked={form.productIds.includes(p.id)}
                              onChange={() => setForm({ ...form, productIds: toggleEnLista(form.productIds, p.id) })}
                            />
                            {p.name} <span className="text-muted-foreground">· {p.categoryName}</span>
                          </label>
                        ))
                      : categoriasFiltradas.map((c) => (
                          <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-xs text-foreground cursor-pointer hover:bg-muted/50">
                            <input
                              type="checkbox"
                              checked={form.categoryIds.includes(c.id)}
                              onChange={() => setForm({ ...form, categoryIds: toggleEnLista(form.categoryIds, c.id) })}
                            />
                            {c.name}
                          </label>
                        ))}
                    {((form.scope === "PRODUCT" && productosFiltrados.length === 0) ||
                      (form.scope === "CATEGORY" && categoriasFiltradas.length === 0)) && (
                      <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>
                    )}
                  </div>
                  <p className="text-[10.5px] text-muted-foreground mt-1">
                    {form.scope === "PRODUCT" ? form.productIds.length : form.categoryIds.length} seleccionado(s)
                  </p>
                </div>
              )}

              {/* ── Condiciones ── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Compra mínima (opcional)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.minPurchase}
                    onChange={(e) => setForm({ ...form, minPurchase: e.target.value })}
                    className={INPUT_CLS}
                    placeholder="$"
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Tope máximo (opcional)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.maxDiscount}
                    onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                    className={INPUT_CLS}
                    placeholder="$"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Vigente desde (opcional)</label>
                  <input
                    type="date"
                    value={form.startsAt}
                    onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Vigente hasta (opcional)</label>
                  <input
                    type="date"
                    value={form.endsAt}
                    onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                    className={INPUT_CLS}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Límite de usos (opcional)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.usageLimit}
                    onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                    className={INPUT_CLS}
                    placeholder="Sin límite"
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Prioridad</label>
                  <input
                    type="number"
                    step="1"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className={INPUT_CLS}
                  />
                  <p className="text-[10.5px] text-muted-foreground mt-1">Un número más alto se evalúa primero.</p>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-[12.5px] text-foreground/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.accumulable}
                    onChange={(e) => setForm({ ...form, accumulable: e.target.checked })}
                  />
                  Se puede acumular con otros descuentos
                </label>
                <label className="flex items-center gap-2 text-[12.5px] text-foreground/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.oncePerCustomer}
                    onChange={(e) => setForm({ ...form, oncePerCustomer: e.target.checked })}
                  />
                  Un cliente solo puede usarlo una vez
                </label>
                {modoModal === "editar" && (
                  <label className="flex items-center gap-2 text-[12.5px] text-foreground/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    />
                    Activo
                  </label>
                )}
              </div>

              {formError && <p className="text-xs text-red-600">{formError}</p>}
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button
                onClick={cerrarModal}
                className="btn-secondary px-4 py-2 text-sm rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardar}
                disabled={guardando}
                className="btn-primary flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg"
              >
                {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
