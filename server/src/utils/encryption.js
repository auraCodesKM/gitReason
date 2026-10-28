// Encrypts secrets we must be able to read back later (the user's GitHub token
// and their Gemini API key) before they are written to MongoDB.
//
// AES-256-GCM is authenticated encryption: decrypt() throws if the stored value
// was altered or was encrypted with a different SESSION_SECRET.
// Stored format: base64( 12-byte IV | 16-byte auth tag | ciphertext ).
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const SALT = "gitreason-session-salt";

let cachedKey = null;

// 32-byte key derived from SESSION_SECRET with scrypt (slow on purpose), computed once.
function key() {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" and put it in server/.env"
    );
  }
  cachedKey = scryptSync(secret, SALT, 32);
  return cachedKey;
}

/** @param {string} plaintext @returns {string} base64 IV + tag + ciphertext */
export function encrypt(plaintext) {
  const iv = randomBytes(IV_LEN); // fresh IV every time: same input never gives the same output
  const cipher = createCipheriv(ALGO, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/**
 * @param {string} encoded value produced by encrypt()
 * @returns {string} the original plaintext
 * @throws if the value was tampered with or encrypted under another key
 */
export function decrypt(encoded) {
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const authTag = buf.subarray(IV_LEN, IV_LEN + 16);
  const ciphertext = buf.subarray(IV_LEN + 16);
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
