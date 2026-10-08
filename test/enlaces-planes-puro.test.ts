import assert from "node:assert/strict";
import { construirEnlaceCheckout } from "../lib/enlaces-planes-puro";

assert.equal(construirEnlaceCheckout("https://pay.hotmart.com/A12345678B", "abc123"), "https://pay.hotmart.com/A12345678B?off=abc123");
// conserva otros parámetros y reemplaza un off anterior
assert.equal(
  construirEnlaceCheckout("https://pay.hotmart.com/A12345678B?checkoutMode=10&off=viejo", " nuevo "),
  "https://pay.hotmart.com/A12345678B?checkoutMode=10&off=nuevo",
);
// sin código de oferta o sin link válido: sin enlace
assert.equal(construirEnlaceCheckout("https://pay.hotmart.com/A12345678B", null), null);
assert.equal(construirEnlaceCheckout("https://pay.hotmart.com/A12345678B", "  "), null);
assert.equal(construirEnlaceCheckout(null, "abc"), null);
assert.equal(construirEnlaceCheckout("no es un link", "abc"), null);
assert.equal(construirEnlaceCheckout("http://pay.hotmart.com/A1", "abc"), null);
assert.equal(construirEnlaceCheckout("javascript:alert(1)", "abc"), null);

console.log("enlaces-planes-puro: OK");
