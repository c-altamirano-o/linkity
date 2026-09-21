/**
 * Plantillas de Consentimiento Informado por rubro y tipo de procedimiento
 * (M17 — Fase 2, 2026-09-21). Sin "server-only": lo usan tanto la capa de
 * datos/acciones (servidor) como ClientesClient.tsx (cliente) para llenar
 * el selector de tipo de procedimiento — mismo criterio que
 * lib/odontograma-fdi.ts, para no repetir el bug de build de
 * "server-only" filtrándose a un Client Component.
 *
 * `cuerpo` es el texto informativo real de cada plantilla; NOTA_FIRMA_SIMULADA
 * se le concatena siempre al guardar (ver crearConsentimientoAction) — así
 * cada consentimiento generado deja explícito, dentro del propio documento,
 * que la firma es una captura simulada y no una firma electrónica avanzada.
 * Mismo criterio de "simulación honesta y documentada" que ya usa Linkity
 * para CFDI sin PAC — se lo advertimos a Carlos, no es letra chica.
 */

export interface PlantillaConsentimiento {
  id: string;
  etiqueta: string;
  cuerpo: string;
}

export const NOTA_FIRMA_SIMULADA =
  "Nota: esta firma se capturó de forma digital dentro del sistema, como respaldo de que el procedimiento fue explicado y aceptado por el paciente (o su representante). No es una firma electrónica avanzada (e.firma) ni sustituye, para efectos legales o notariales, una firma autógrafa en papel.";

export const PLANTILLAS_CONSENTIMIENTO: Record<string, PlantillaConsentimiento[]> = {
  consultorio_dental: [
    {
      id: "extraccion",
      etiqueta: "Extracción dental",
      cuerpo:
        "Se me ha explicado que necesito la extracción de una o más piezas dentales, así como las alternativas de tratamiento disponibles. Entiendo los riesgos generales del procedimiento (dolor, inflamación, sangrado, infección, lesión a dientes o estructuras vecinas) y las indicaciones de cuidado posterior que se me han dado. Autorizo al personal clínico a realizar el procedimiento.",
    },
    {
      id: "endodoncia",
      etiqueta: "Endodoncia (tratamiento de conducto)",
      cuerpo:
        "Se me ha explicado que necesito un tratamiento de conducto (endodoncia) en una o más piezas dentales, así como las alternativas disponibles (incluyendo la extracción). Entiendo que el tratamiento puede requerir más de una cita, que existe la posibilidad de que la pieza requiera tratamiento adicional o restauración con corona, y los riesgos generales del procedimiento. Autorizo al personal clínico a realizar el procedimiento.",
    },
    {
      id: "cirugia_oral",
      etiqueta: "Cirugía oral",
      cuerpo:
        "Se me ha explicado la naturaleza del procedimiento quirúrgico oral a realizar, sus alternativas, beneficios esperados y riesgos (incluyendo pero no limitado a sangrado, infección, inflamación, dolor prolongado, alteración de la sensibilidad). Entiendo las indicaciones pre y postoperatorias que se me han dado. Autorizo al personal clínico a realizar el procedimiento.",
    },
    {
      id: "tratamiento_general",
      etiqueta: "Tratamiento dental general",
      cuerpo:
        "Se me ha explicado el diagnóstico y el plan de tratamiento dental propuesto, así como sus alternativas. Entiendo los riesgos generales asociados a procedimientos dentales de rutina (limpieza, obturaciones, profilaxis) y autorizo al personal clínico a realizarlos.",
    },
  ],
  consultorio_medico: [
    {
      id: "procedimiento_menor",
      etiqueta: "Procedimiento médico menor",
      cuerpo:
        "Se me ha explicado la naturaleza del procedimiento menor a realizar (por ejemplo, sutura, drenaje de absceso, infiltración), sus alternativas y los riesgos generales (dolor, sangrado, infección, reacción alérgica). Autorizo al personal clínico a realizarlo.",
    },
    {
      id: "estudio_diagnostico",
      etiqueta: "Estudio o toma de muestra",
      cuerpo:
        "Se me ha explicado el propósito del estudio o la toma de muestra solicitada, así como el procedimiento a seguir para obtenerla. Entiendo que puede haber molestias asociadas (por ejemplo, en la punción venosa) y autorizo al personal clínico a realizarlo.",
    },
    {
      id: "cirugia_ambulatoria",
      etiqueta: "Cirugía ambulatoria",
      cuerpo:
        "Se me ha explicado la naturaleza del procedimiento quirúrgico ambulatorio a realizar, sus alternativas, beneficios esperados y riesgos generales (sangrado, infección, reacción a anestesia local, cicatrización anormal). Entiendo las indicaciones pre y postoperatorias. Autorizo al personal clínico a realizarlo.",
    },
    {
      id: "tratamiento_general",
      etiqueta: "Tratamiento médico general",
      cuerpo:
        "Se me ha explicado el diagnóstico y el plan de tratamiento propuesto, así como sus alternativas y los riesgos generales asociados. Autorizo al personal clínico a llevarlo a cabo.",
    },
  ],
  veterinaria: [
    {
      id: "cirugia_esterilizacion",
      etiqueta: "Cirugía o esterilización",
      cuerpo:
        "Como propietario responsable, se me ha explicado la naturaleza del procedimiento quirúrgico (incluyendo, en su caso, esterilización) a realizar en mi mascota, sus alternativas, beneficios esperados y riesgos generales asociados a la cirugía y anestesia (incluyendo, en casos excepcionales, riesgo de complicaciones graves). Autorizo al personal veterinario a realizarlo.",
    },
    {
      id: "procedimiento_sedacion",
      etiqueta: "Procedimiento con sedación",
      cuerpo:
        "Se me ha explicado que mi mascota requiere sedación o anestesia para el procedimiento a realizar, así como los riesgos generales asociados a la sedación. Autorizo al personal veterinario a realizarlo.",
    },
    {
      id: "estudio_diagnostico",
      etiqueta: "Estudio o toma de muestra",
      cuerpo:
        "Se me ha explicado el propósito del estudio, radiografía o toma de muestra solicitada para mi mascota. Autorizo al personal veterinario a realizarlo.",
    },
    {
      id: "tratamiento_general",
      etiqueta: "Tratamiento veterinario general",
      cuerpo:
        "Se me ha explicado el diagnóstico y el plan de tratamiento propuesto para mi mascota, así como sus alternativas y riesgos generales asociados. Autorizo al personal veterinario a llevarlo a cabo.",
    },
  ],
};

export function obtenerPlantilla(rubro: string, procedureType: string): PlantillaConsentimiento | null {
  const plantillas = PLANTILLAS_CONSENTIMIENTO[rubro];
  if (!plantillas) return null;
  return plantillas.find((p) => p.id === procedureType) ?? null;
}
