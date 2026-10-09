import assert from "node:assert/strict";
import { diaMXDe, inicioDeHoyMXDe, sesionAdminDeOtroDia, cajaEsDeDiaAnterior, formatoDiaMes } from "../lib/corte-diario-puro";

// Hora de México = UTC-6. "2026-10-09T05:59:59Z" = 8 oct 23:59:59 en México; "…06:00:00Z" = 9 oct 00:00:00.
const MX = (iso: string) => Date.parse(iso);

// Día calendario en México
assert.equal(diaMXDe(MX("2026-10-09T05:59:59Z")), "2026-10-08");
assert.equal(diaMXDe(MX("2026-10-09T06:00:00Z")), "2026-10-09");
assert.equal(diaMXDe(MX("2026-10-09T23:30:00Z")), "2026-10-09");

// Medianoche de hoy en México
assert.equal(inicioDeHoyMXDe(MX("2026-10-09T18:00:00Z")).toISOString(), "2026-10-09T06:00:00.000Z");
assert.equal(inicioDeHoyMXDe(MX("2026-10-09T05:00:00Z")).toISOString(), "2026-10-08T06:00:00.000Z");

// Sesión del administrador: mismo día = vigente
assert.equal(sesionAdminDeOtroDia("2026-10-09T14:00:00Z", MX("2026-10-09T20:00:00Z")), false);
// Inició a las 23:55 (México) y ya son las 00:05 del día siguiente = se cierra
assert.equal(sesionAdminDeOtroDia("2026-10-09T05:55:00Z", MX("2026-10-09T06:05:00Z")), true);
// Inició ayer, hoy a media mañana = se cierra
assert.equal(sesionAdminDeOtroDia("2026-10-08T16:00:00Z", MX("2026-10-09T16:00:00Z")), true);
// Sin dato o dato inválido: no se cierra
assert.equal(sesionAdminDeOtroDia(undefined, MX("2026-10-09T16:00:00Z")), false);
assert.equal(sesionAdminDeOtroDia(null, MX("2026-10-09T16:00:00Z")), false);
assert.equal(sesionAdminDeOtroDia("no-es-fecha", MX("2026-10-09T16:00:00Z")), false);

// Caja abierta: de hoy no avisa; de ayer (cualquier hora) sí
const AHORA = MX("2026-10-09T16:00:00Z"); // 10:00 en México
assert.equal(cajaEsDeDiaAnterior(new Date("2026-10-09T15:00:00Z"), AHORA), false);
assert.equal(cajaEsDeDiaAnterior(new Date("2026-10-09T06:00:00Z"), AHORA), false); // justo medianoche de hoy
assert.equal(cajaEsDeDiaAnterior(new Date("2026-10-09T05:59:59Z"), AHORA), true); // 23:59:59 de ayer
assert.equal(cajaEsDeDiaAnterior(new Date("2026-10-08T15:00:00Z"), AHORA), true);
assert.equal(cajaEsDeDiaAnterior(new Date("2026-10-01T15:00:00Z"), AHORA), true);

// Formato dd/mmm (día de México)
assert.equal(formatoDiaMes(new Date("2026-10-08T15:00:00Z")), "08/oct");
assert.equal(formatoDiaMes(new Date("2026-10-09T05:59:59Z")), "08/oct"); // 23:59 del 8 en México
assert.equal(formatoDiaMes(new Date("2026-10-09T06:00:00Z")), "09/oct");
assert.equal(formatoDiaMes(new Date("2026-01-01T07:00:00Z")), "01/ene");
assert.equal(formatoDiaMes(new Date("2026-12-31T20:00:00Z")), "31/dic");

console.log("corte-diario-puro: OK");
