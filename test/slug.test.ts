import assert from "node:assert/strict";
import { slugify } from "../lib/slug";

assert.equal(slugify("Mi Negocio"), "mi-negocio");
assert.equal(slugify("Reparación Ñandú & Co."), "reparacion-nandu-co");
assert.equal(slugify("  --Hola--  "), "hola");
assert.equal(slugify("¡¡¡"), "");
assert.equal(slugify("Dr. Cell 2"), "dr-cell-2");

console.log("slug: OK");
