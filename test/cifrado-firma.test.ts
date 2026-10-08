import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { cifrar, descifrar, leerLlaveCifrado } from "../lib/cifrado-config";
import { verificarFirmaMeta } from "../lib/firma-meta";

// --- cifrado ---
const llave = randomBytes(32);
const secreto = "EAAG-token-de-prueba_áéí 123";
const guardado = cifrar(secreto, llave);
assert.ok(guardado.startsWith("v1."));
assert.ok(!guardado.includes(secreto));
assert.equal(descifrar(guardado, llave), secreto);
assert.notEqual(cifrar(secreto, llave), guardado); // IV distinto cada vez
assert.equal(descifrar(guardado, randomBytes(32)), null); // otra llave
assert.equal(descifrar(guardado.slice(0, -4) + "AAAA", llave), null); // alterado
assert.equal(descifrar("basura", llave), null);
assert.equal(descifrar(guardado, null), null);
assert.throws(() => cifrar("x", null));
// formatos de llave
assert.equal(leerLlaveCifrado(llave.toString("base64"))?.length, 32);
assert.equal(leerLlaveCifrado(llave.toString("hex"))?.length, 32);
assert.equal(leerLlaveCifrado("corta"), null);
assert.equal(leerLlaveCifrado(""), null);
assert.equal(leerLlaveCifrado(undefined as unknown as string), leerLlaveCifrado(process.env.CONFIG_ENCRYPTION_KEY));

// --- firma de Meta ---
const cuerpo = '{"object":"whatsapp_business_account","entry":[]}';
const secret = "0123456789abcdef0123456789abcdef";
const firma = "sha256=" + createHmac("sha256", secret).update(cuerpo).digest("hex");
assert.equal(verificarFirmaMeta(cuerpo, firma, secret), true);
assert.equal(verificarFirmaMeta(cuerpo + " ", firma, secret), false); // cuerpo alterado
assert.equal(verificarFirmaMeta(cuerpo, firma, "otro-secreto-distinto-123456789012"), false);
assert.equal(verificarFirmaMeta(cuerpo, null, secret), false);
assert.equal(verificarFirmaMeta(cuerpo, "", secret), false);
assert.equal(verificarFirmaMeta(cuerpo, "sha256=zz", secret), false);
assert.equal(verificarFirmaMeta(cuerpo, firma.replace("sha256=", "sha1="), secret), false);
assert.equal(verificarFirmaMeta(cuerpo, firma, ""), false);
console.log("cifrado-firma: OK");
