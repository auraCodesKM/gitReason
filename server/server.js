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
const hasClientBuild = fs.existsSync(clientIndexHtml);

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
app.get("/api/analyze/stream", handleAnalyzeStream);
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

app.use((err, _req, res, _next) => {
  console.error("Unhandled request error:", err?.stack || err?.message || err);
  if (res.headersSent) return;
  res.status(500).json({ status: "error", message: "Something went wrong. Try again." });
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err?.stack || err?.message || err);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err?.stack || err?.message || err);
  process.exit(1);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`GitReason server running on port ${PORT}`);
});
