import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  handleRepoCheck,
  handleAuthStart,
  handleAuthCallback,
  handleAuthSession,
  handleAuthLogout,
} from "./auth.js";
import { handleAnalyzeStream, handleFileContent } from "./analyze.js";
import {
  handleUserMe,
  handleUserHistory,
  handleUserHistoryItem,
  handleSetGeminiKey,
  handleClearGeminiKey,
  handleUserGithubActivity,
  handleRepoLanguages,
} from "./user.js";

if (!process.env.SESSION_SECRET) {
  console.error(
    "SESSION_SECRET is not set. Generate one with:\n" +
      "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n" +
      "and add it to server/.env"
  );
  process.exit(1);
}

if (process.env.DATABASE_PROVIDER === "turso" && (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN)) {
  console.error("DATABASE_PROVIDER=turso requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, "..", "client", "dist");
const clientIndexHtml = path.join(clientDist, "index.html");
// Render only runs this server — no client/dist will exist there, since
// Vercel builds and serves the frontend separately. Static-serving still
// works for `npm start`-style combined local previews when the client has
// been built alongside the server.
const hasClientBuild = fs.existsSync(clientIndexHtml);

// Split-origin deployment (Vercel frontend, Render backend) makes every
// browser request genuinely cross-site — CORS must explicitly allow the
// configured frontend origin with credentials, never a wildcard (browsers
// reject wildcard + credentials anyway, but being explicit is the point).
// CLIENT_ORIGIN may be a comma-separated list to allow more than one
// origin (e.g. a preview deployment alongside production).
const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.sendStatus(204);
  }
  next();
}

// Express 4 doesn't forward a rejected promise from an async route handler
// to error middleware on its own — an unguarded await that throws (e.g. a
// transient Turso network blip) becomes an unhandledRejection, which
// crashes the whole process by default, taking every user down for one
// request's failure. Wrapping every handler at registration time catches
// that without touching any handler's own logic. handleAnalyzeStream is
// deliberately excluded below - it already has its own complete try/catch
// tailored to SSE (headers are sent immediately, so a generic JSON 500
// response after the fact isn't possible there).
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const app = express();
const PORT = process.env.PORT || 4000;

app.use(corsMiddleware);
app.use(express.json());

app.get("/health", async (_req, res) => {
  let database = "unknown";
  try {
    const { db } = await import("./db/client.js");
    await db.prepare("SELECT 1").get();
    database = "ok";
  } catch {
    database = "error";
  }
  res.json({
    status: "ok",
    database,
    environment: process.env.NODE_ENV || "development",
    version: process.env.npm_package_version || "0.0.1",
  });
});

app.get("/api/repo/check", asyncHandler(handleRepoCheck));
app.get("/api/repo/file", asyncHandler(handleFileContent));
app.get("/api/analyze/stream", handleAnalyzeStream); // own SSE-safe error handling, not wrapped
app.get("/api/auth/github/start", asyncHandler(handleAuthStart));
app.get("/api/auth/github/callback", asyncHandler(handleAuthCallback));
app.get("/api/auth/session", asyncHandler(handleAuthSession));
app.post("/api/auth/logout", asyncHandler(handleAuthLogout));
app.get("/api/user/me", asyncHandler(handleUserMe));
app.get("/api/user/history", asyncHandler(handleUserHistory));
app.get("/api/user/history/:id", asyncHandler(handleUserHistoryItem));
app.post("/api/user/gemini-key", asyncHandler(handleSetGeminiKey));
app.delete("/api/user/gemini-key", asyncHandler(handleClearGeminiKey));
app.get("/api/user/github-activity", asyncHandler(handleUserGithubActivity));
app.get("/api/user/repo-languages", asyncHandler(handleRepoLanguages));

if (hasClientBuild) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(clientIndexHtml);
  });
} else {
  app.get("*", (_req, res) => {
    res.status(404).json({ status: "not_found", message: "This server is API-only in this deployment." });
  });
}

// Catch-all for anything asyncHandler forwarded (or a sync throw Express
// itself caught) - logs server-side for debugging, never leaks internals
// (stack traces, error messages) to the client.
app.use((err, _req, res, _next) => {
  console.error("Unhandled request error:", err?.stack || err?.message || err);
  if (res.headersSent) return;
  res.status(500).json({ status: "error", message: "Something went wrong. Try again." });
});

// Defense in depth below the per-route asyncHandler wrapping: anything
// that still slips through (a fire-and-forget promise nothing awaited, a
// truly synchronous bug outside a request) would otherwise crash the
// process by Node's default and take every user down with it.
// unhandledRejection: log and keep serving - it's necessarily tied to one
// already-failed operation, not a sign the whole process is unsound.
// uncaughtException: state may genuinely be corrupted at that point: log,
// then exit so Render's process manager restarts clean, rather than limp
// on in an unknown state.
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err?.stack || err?.message || err);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err?.stack || err?.message || err);
  process.exit(1);
});

// Render (and most hosts) route traffic to the container by port only —
// binding to 0.0.0.0 rather than the implicit default is required for the
// health check and external traffic to actually reach the process.
app.listen(PORT, "0.0.0.0", () => {
  console.log(`GitReason server running on port ${PORT}`);
});
