import assert from "node:assert/strict";
import { limpiarNombreNegocio, validarDatosNegocio } from "../lib/datos-negocio-puro";

const giros = ["reparacion_celulares", "barberia"];

assert.equal(limpiarNombreNegocio("  Cell   Express  "), "Cell Express");
assert.equal(limpiarNombreNegocio(""), "");

assert.deepEqual(
  validarDatosNegocio({ businessName: "  Cell  Express ", businessType: "barberia" }, giros),
  { ok: true, businessName: "Cell Express", businessType: "barberia" },
);

const sinNombre = validarDatosNegocio({ businessName: "   ", businessType: "barberia" }, giros);
assert.equal(sinNombre.ok, false);
const unaLetra = validarDatosNegocio({ businessName: "A", businessType: "barberia" }, giros);
assert.equal(unaLetra.ok, false);
const largo = validarDatosNegocio({ businessName: "x".repeat(81), businessType: "barberia" }, giros);
assert.equal(largo.ok, false);
const sinGiro = validarDatosNegocio({ businessName: "Mi negocio", businessType: "" }, giros);
assert.equal(sinGiro.ok, false);
const giroRaro = validarDatosNegocio({ businessName: "Mi negocio", businessType: "hacker" }, giros);
assert.equal(giroRaro.ok, false);

console.log("datos-negocio-puro: OK");
