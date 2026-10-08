import assert from "node:assert/strict";
import {
  mensajeErrorMeta,
  horasRestantes,
  resumenVigenciaToken,
  formatearNumeroInternacional,
  enlacesMeta,
  urlPublicaDelSitio,
} from "../lib/conexiones-meta";

// Errores de Meta → frase con la acción a seguir
assert.match(mensajeErrorMeta({ code: 190 }), /ya no sirve/);
assert.match(mensajeErrorMeta({ code: 100 }, "numero"), /Phone Number ID/);
assert.match(mensajeErrorMeta({ code: 803 }, "numero"), /Phone Number ID/);
assert.match(mensajeErrorMeta({ code: 10 }), /permiso/);
assert.match(mensajeErrorMeta({ code: 4 }), /esperar/);
assert.match(mensajeErrorMeta({ code: 100 }, "secret"), /App Secret/);
assert.match(mensajeErrorMeta({ code: 190 }, "secret"), /ya no sirve/); // un token vencido manda sobre el contexto
assert.match(mensajeErrorMeta({ code: 999, message: "algo raro" }), /algo raro/);
assert.match(mensajeErrorMeta(null), /no respondió/);

// Vigencia del token
const AHORA = 1_800_000_000_000;
assert.equal(horasRestantes(0, AHORA), null);
assert.equal(horasRestantes(undefined, AHORA), null);
assert.equal(horasRestantes(AHORA / 1000 + 3600 * 24, AHORA), 24);
assert.equal(resumenVigenciaToken(null).nivel, "ok");
assert.equal(resumenVigenciaToken(-1).nivel, "error");
assert.equal(resumenVigenciaToken(0).nivel, "error");
assert.equal(resumenVigenciaToken(24).nivel, "aviso");
assert.match(resumenVigenciaToken(24).texto, /24 horas/);
assert.match(resumenVigenciaToken(1.5).texto, /1 hora:/);
assert.equal(resumenVigenciaToken(24 * 60).nivel, "ok");
assert.match(resumenVigenciaToken(24 * 60).texto, /60 días/);

// Número
assert.equal(formatearNumeroInternacional("+52 1 639 115 6227"), "+5216391156227");
assert.equal(formatearNumeroInternacional("123"), null);
assert.equal(formatearNumeroInternacional(null), null);

// Enlaces de Meta
assert.equal(enlacesMeta(null).api, "https://developers.facebook.com/apps/");
assert.equal(enlacesMeta("abc").webhook, "https://developers.facebook.com/apps/");
assert.match(enlacesMeta("2152797838737502").webhook, /apps\/2152797838737502\/use_cases\/customize\/wa-settings/);
assert.match(enlacesMeta("2152797838737502").basico, /settings\/basic/);

// Dirección pública: respeta el www con el que se abrió Panel Maestro
assert.equal(urlPublicaDelSitio("www.linkitysoluciones.mx", "https", undefined), "https://www.linkitysoluciones.mx");
assert.equal(urlPublicaDelSitio("www.linkitysoluciones.mx, otro.com", "https", undefined), "https://www.linkitysoluciones.mx");
assert.equal(urlPublicaDelSitio("localhost:3000", "http", undefined), "http://localhost:3000");
assert.equal(urlPublicaDelSitio("127.0.0.1:3000", null, undefined), "http://127.0.0.1:3000");
assert.equal(urlPublicaDelSitio(null, null, "https://miapp.mx/"), "https://miapp.mx");
assert.equal(urlPublicaDelSitio("x y", null, undefined), "https://linkitysoluciones.mx");
assert.equal(urlPublicaDelSitio("evil.com/path", null, undefined), "https://linkitysoluciones.mx");

console.log("conexiones-meta: OK");
