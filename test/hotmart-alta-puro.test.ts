import assert from "node:assert/strict";
import {
  correoPareceValido,
  nombreProvisionalNegocio,
  nombreDelDueno,
  vigenciaInicial,
  esInicioDePrueba,
} from "../lib/hotmart-alta-puro";

// Correos
assert.equal(correoPareceValido("a@b.co"), true);
assert.equal(correoPareceValido("sin-arroba"), false);
assert.equal(correoPareceValido(null), false);
assert.equal(correoPareceValido("con espacio@x.com"), false);

// Nombre provisional del negocio
assert.equal(nombreProvisionalNegocio("María López", "m@x.com"), "Negocio de María");
assert.equal(nombreProvisionalNegocio(null, "juan.perez@x.com"), "Negocio de juan");
assert.equal(nombreProvisionalNegocio("  ", "@@@x"), "Negocio de cliente");
assert.equal(nombreProvisionalNegocio("<script>alert(1)</script> Ana", "a@x.com"), "Negocio de script");
assert.ok(!nombreProvisionalNegocio("Ana<>\"", "a@x.com").includes("<"));

// Nombre del dueño
assert.equal(nombreDelDueno("Carlos Altamirano", "c@x.com"), "Carlos Altamirano");
assert.equal(nombreDelDueno(null, "carlos@x.com"), "carlos");

// Vigencia
const ahora = new Date("2026-10-08T12:00:00Z");
const futuro = new Date("2026-11-07T12:00:00Z");
const pasado = new Date("2026-10-01T12:00:00Z");
assert.equal(vigenciaInicial({ precio: 0, proximoCobro: futuro }, ahora).getTime(), futuro.getTime());
assert.equal(vigenciaInicial({ precio: 0, proximoCobro: null }, ahora).toISOString(), "2026-11-07T12:00:00.000Z");
assert.equal(vigenciaInicial({ precio: 499, proximoCobro: null }, ahora).toISOString(), "2026-11-08T12:00:00.000Z");
assert.equal(vigenciaInicial({ precio: 499, proximoCobro: pasado }, ahora).toISOString(), "2026-11-08T12:00:00.000Z");
assert.equal(vigenciaInicial({ precio: null, proximoCobro: null }, ahora).toISOString(), "2026-11-08T12:00:00.000Z");

// Inicio de prueba
assert.equal(esInicioDePrueba({ precio: 0 }), true);
assert.equal(esInicioDePrueba({ precio: 499 }), false);
assert.equal(esInicioDePrueba({ precio: null }), false);

console.log("hotmart-alta-puro: OK");
