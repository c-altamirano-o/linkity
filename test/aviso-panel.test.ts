import assert from "node:assert/strict";
import { calcularEstadoCiclo, avisoParaPanel } from "../lib/ciclo-suscripcion";

const DIA = 24 * 60 * 60 * 1000;
const AHORA = new Date("2026-10-09T12:00:00Z");
const enDias = (n: number) => new Date(AHORA.getTime() + n * DIA);

const aviso = (status: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELLED", finEnDias: number | null) =>
  avisoParaPanel(calcularEstadoCiclo({ status, endDate: finEnDias === null ? null : enDias(finEnDias) } as never, AHORA));

// PRUEBA GRATIS (TRIAL): nunca hay aviso en el panel, ni lejos ni a un día de terminar.
assert.equal(aviso("TRIAL", 25), null);
assert.equal(aviso("TRIAL", 7), null);
assert.equal(aviso("TRIAL", 3), null);
assert.equal(aviso("TRIAL", 0.5), null);
// Prueba terminada: queda bloqueada (la pantalla de bloqueo es otra cosa), sin aviso.
assert.equal(aviso("TRIAL", -1), null);

// Prueba con tarjeta de Hotmart (ACTIVE hasta el primer cobro): sin aviso mientras esté vigente.
assert.equal(aviso("ACTIVE", 20), null);
assert.equal(aviso("ACTIVE", 1), null);

// Plan de pago vigente o sin fecha de fin: sin aviso.
assert.equal(aviso("ACTIVE", 200), null);
assert.equal(aviso("ACTIVE", null), null);

// Plan de pago VENCIDO: aviso durante los 7 días de gracia, con el conteo correcto.
assert.deepEqual(aviso("ACTIVE", -0.5), { etapa: "en_gracia", diasRestantes: 7 });
assert.deepEqual(aviso("ACTIVE", -3), { etapa: "en_gracia", diasRestantes: 4 });
assert.deepEqual(aviso("ACTIVE", -6), { etapa: "en_gracia", diasRestantes: 1 });
// Al día 7 ya se bloquea: sin aviso (se ve la pantalla de bloqueo).
assert.equal(aviso("ACTIVE", -7), null);
assert.equal(aviso("ACTIVE", -30), null);

// Suspendida o cancelada a mano: sin aviso (se ve la pantalla de bloqueo).
assert.equal(aviso("SUSPENDED", 10), null);
assert.equal(aviso("CANCELLED", 10), null);

console.log("aviso-panel: OK");
