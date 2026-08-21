import express from "express";
import path from "node:path";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, "..", "client", "dist");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

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

app.use(express.static(clientDist));

app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(PORT, () => {
  console.log(`GitReason server running on http://localhost:${PORT}`);
});
