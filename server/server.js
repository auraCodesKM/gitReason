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
import { handleUserMe, handleUserHistory, handleUserHistoryItem } from "./user.js";

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
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.sendStatus(204);
  }
  next();
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

app.get("/api/repo/check", handleRepoCheck);
app.get("/api/repo/file", handleFileContent);
app.get("/api/analyze/stream", handleAnalyzeStream);
app.get("/api/auth/github/start", handleAuthStart);
app.get("/api/auth/github/callback", handleAuthCallback);
app.get("/api/auth/session", handleAuthSession);
app.post("/api/auth/logout", handleAuthLogout);
app.get("/api/user/me", handleUserMe);
app.get("/api/user/history", handleUserHistory);
app.get("/api/user/history/:id", handleUserHistoryItem);

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

// Render (and most hosts) route traffic to the container by port only —
// binding to 0.0.0.0 rather than the implicit default is required for the
// health check and external traffic to actually reach the process.
app.listen(PORT, "0.0.0.0", () => {
  console.log(`GitReason server running on port ${PORT}`);
});
