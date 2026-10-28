// Every environment variable the backend reads, in one place.
//
// Values are read through small functions (not copied into constants at import
// time) so that a value set later - by the test suite, for example - is still
// picked up. Nothing here prints a value; callers only learn whether it is set.
//
// Loaded by `npm start`/`npm run dev` from server/.env and then
// ../atlas-credentials.env (see package.json). A real shell variable wins.
import path from "node:path";
import { fileURLToPath } from "node:url";

// server/ (this file lives in server/src/config/).
export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// The server refuses to start without these (checked in src/server.js).
export const REQUIRED_ENV = {
  SESSION_SECRET:
    "SESSION_SECRET is not set. Generate one with:\n" +
    "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n" +
    "and add it to server/.env",
  MONGODB_URI:
    "MONGODB_URI is not set. Put it in server/.env or ../atlas-credentials.env (both are loaded by npm start).",
};

/** @returns {string[]} names of required variables that are missing or empty */
export function missingRequiredEnv() {
  return Object.keys(REQUIRED_ENV).filter((name) => !process.env[name]);
}

export const port = () => process.env.PORT || 4000;
export const isProduction = () => process.env.NODE_ENV === "production";

// MongoDB database inside the cluster. The tests set MONGODB_DB=gitreason_test.
export const databaseName = () => process.env.MONGODB_DB || "gitreason";

/** Allowed browser origins (CORS) - comma-separated CLIENT_ORIGIN. The first one is where OAuth redirects back to. */
export function clientOrigins() {
  return (process.env.CLIENT_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** GitHub OAuth App settings; any of them may be undefined if not configured. */
export function githubOAuth() {
  return {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackUrl: process.env.GITHUB_CALLBACK_URL,
  };
}

export const geminiModel = () => process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
// Server-wide Gemini key, used only for anonymous analyses (signed-in users bring their own).
export const serverGeminiKey = () => process.env.GEMINI_API_KEY || null;

/** Folder for uploaded file bytes. Never publicly served. Default: server/uploads. */
export function uploadDir() {
  return path.resolve(process.env.UPLOAD_DIR || path.join(SERVER_ROOT, "uploads"));
}
