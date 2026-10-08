import assert from "node:assert/strict";
import { calcularEstadoExceso as c, DIAS_GRACIA_EXCESO } from "../lib/exceso-plan-estado";

const base = new Date("2026-10-01T12:00:00Z");
const despues = (ms: number) => new Date(base.getTime() + ms);
const H = 60 * 60 * 1000;
const D = 24 * H;

assert.equal(DIAS_GRACIA_EXCESO, 7);
assert.deepEqual(c(null), { activo: false, diasRestantes: null, vencido: false });
assert.deepEqual(c(undefined), { activo: false, diasRestantes: null, vencido: false });
// Recién detectado: 7 días
assert.deepEqual(c(base, base), { activo: true, diasRestantes: 7, vencido: false });
// 1 hora después sigue en 7 (ceil)
assert.equal(c(base, despues(1 * H)).diasRestantes, 7);
// 1 día exacto → quedan 6
assert.equal(c(base, despues(1 * D)).diasRestantes, 6);
// 6 días y 1 hora → queda menos de 1 día, se muestra 1
assert.deepEqual(c(base, despues(6 * D + 1 * H)), { activo: true, diasRestantes: 1, vencido: false });
// Un milisegundo antes del límite aún no vence
assert.equal(c(base, despues(7 * D - 1)).vencido, false);
// Exactamente a los 7 días vence
assert.deepEqual(c(base, despues(7 * D)), { activo: true, diasRestantes: 0, vencido: true });
assert.equal(c(base, despues(30 * D)).vencido, true);
console.log("exceso-estado: OK");
