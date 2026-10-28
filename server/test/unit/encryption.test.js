// Unit tests: AES-256-GCM encryption used for GitHub tokens and Gemini keys at rest.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET = "unit-test-secret"; // the key is derived on first use
const { encrypt, decrypt } = await import("../../src/utils/encryption.js");

test("encrypt/decrypt round-trip; the stored value does not contain the secret", () => {
  const secret = "gho_example_token_value";
  const stored = encrypt(secret);
  assert.ok(!stored.includes(secret));
  assert.equal(decrypt(stored), secret);
});

test("the same input encrypts differently every time (random IV)", () => {
  assert.notEqual(encrypt("same"), encrypt("same"));
});

test("a tampered value is rejected instead of decrypting to garbage", () => {
  const buf = Buffer.from(encrypt("important"), "base64");
  buf[buf.length - 1] ^= 1; // flip one bit of the ciphertext
  assert.throws(() => decrypt(buf.toString("base64")));
  assert.throws(() => decrypt(Buffer.from("not encrypted").toString("base64")));
});
