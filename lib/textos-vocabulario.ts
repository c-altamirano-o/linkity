// Resuelve marcas {token} dentro de textos fijos (tours "Muéstrame cómo" y
// Ayuda) con el vocabulario del negocio (rubro + personalización, ver
// lib/labels.ts). Sin "use client" NI "server-only": función pura.
//
// Marcas disponibles (en minúsculas salvo que se indique; con la primera
// letra en mayúscula —{Objeto}, {Esp}...— se capitaliza el resultado):
//   {objeto}     lo que recibe el negocio (dispositivo, vehículo, artículo...)
//   {esp}/{esps} quien presta el servicio (técnico/técnicos, barbero...)
//   {lugar}      dónde se trabaja (taller, área de trabajo)
//   {entidad}/{entidades}  nombre del trabajo (reparación, orden de servicio, servicio)
//   {marca} {modelo} {falla} {desbloqueo} {descripcion}  nombres de los campos de recepción
//   {ejMarca} {ejModelo}  " (ej. ...)" con ejemplos del rubro, o vacío
//   {encargado}  rol "Encargado de {especialistas}"
//   {ejCita}     ejemplo de motivo de cita del rubro
//   {parte}/{partes}  segundo tipo del catálogo (refacción, insumo, material)
//   {paciente}   quien recibe la atención y firma (paciente, dueño)
//   {recepcion} {mistrabajos} {reparaciones}  nombre de esos módulos en el menú
//   {{reparaciones}}  (formato anterior) nombre del módulo de Reparaciones

import { label, vocabReparacion, etiquetaEncargado, type LabelDictionary } from "@/lib/labels";
import type { FlujoPasos } from "@/lib/ayuda-contenido";

function capitalizar(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function resolverTextoVocabulario(texto: string, labels: LabelDictionary): string {
  const v = vocabReparacion(labels);
  const min = (k: string) => label(labels, k).toLowerCase();
  const ejemplo = (k: string) => {
    const e = (labels[k] ?? "").trim();
    return e ? ` (ej. ${e})` : "";
  };

  const valores: Record<string, string> = {
    objeto: v.objeto.toLowerCase(),
    esp: v.espMin,
    esps: v.espPluralMin,
    lugar: v.lugar,
    entidad: min("entity.repair.singular"),
    entidades: min("entity.repair.plural"),
    marca: v.marca.toLowerCase(),
    modelo: v.modelo.toLowerCase(),
    falla: v.falla.toLowerCase(),
    desbloqueo: v.desbloqueo.toLowerCase(),
    descripcion: v.etiquetaDescripcion.toLowerCase(),
    ejmarca: ejemplo("example.repair.brand"),
    ejmodelo: ejemplo("example.repair.model"),
    encargado: etiquetaEncargado(labels),
    ejcita: label(labels, "example.appointment.reason"),
    parte: min("catalog.part.singular"),
    partes: min("catalog.part.plural"),
    paciente: min("vocab.paciente"),
    recepcion: label(labels, "module.reception.name"),
    mistrabajos: label(labels, "module.workshop.name"),
    reparaciones: label(labels, "module.repair.name"),
  };

  return texto
    .replaceAll("{{reparaciones}}", valores.reparaciones)
    .replace(/\{([A-Za-z]+)\}/g, (completo, clave: string) => {
      const minuscula = clave.toLowerCase();
      if (!(minuscula in valores)) return completo;
      const valor = valores[minuscula];
      // {recepcion}, {mistrabajos} y {reparaciones} ya son nombres propios del menú: se dejan tal cual.
      if (["recepcion", "mistrabajos", "reparaciones", "ejcita", "encargado"].includes(minuscula)) return valor;
      return clave.charAt(0) === clave.charAt(0).toUpperCase() ? capitalizar(valor) : valor;
    });
}

/**
 * Flujos de Ayuda ya listos para mostrarse: omite los que no aplican al rubro
 * (`rubros`), quita los pasos condicionados que el negocio no usa
 * ("[dosCampos]", "[unaDescripcion]", "[desbloqueo]" al inicio del paso) y
 * resuelve las marcas {token} con el vocabulario del negocio.
 */
export function flujosVisibles(
  flujos: FlujoPasos[],
  labels: LabelDictionary,
  businessType: string | null | undefined
): FlujoPasos[] {
  const v = vocabReparacion(labels);
  const aplica = (condicion: string) =>
    !(
      (condicion === "dosCampos" && v.unaDescripcion) ||
      (condicion === "unaDescripcion" && !v.unaDescripcion) ||
      (condicion === "desbloqueo" && !v.usaDesbloqueo)
    );
  return flujos
    .filter((f) => !f.rubros || (businessType != null && f.rubros.includes(businessType)))
    .map((f) => ({
      ...f,
      titulo: resolverTextoVocabulario(f.titulo, labels),
      pasos: f.pasos
        .map((paso) => {
          const m = paso.match(/^\[(\w+)\]/);
          if (!m) return paso;
          return aplica(m[1]) ? paso.slice(m[0].length) : null;
        })
        .filter((paso): paso is string => paso !== null)
        .map((paso) => resolverTextoVocabulario(paso, labels)),
    }));
}
