// Cross-origin access for the frontend (Vite dev server or the deployed site).
// Only origins listed in CLIENT_ORIGIN get CORS headers; credentials are
// allowed so the browser sends the session cookie with API calls.
import { clientOrigins } from "../config/env.js";

export function corsMiddleware() {
  const allowedOrigins = clientOrigins();
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }
    // Preflight: the browser asks which methods/headers are allowed before a PATCH/DELETE/JSON POST.
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.sendStatus(204);
    }
    next();
  };
}
