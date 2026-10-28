// Builds the Express application: middleware order, routes, error handling.
// It does not connect to MongoDB or listen on a port - src/server.js does that,
// and the tests call createApp() directly against a test database.
//
// Request path through the app (top to bottom):
//   CORS -> JSON body parser (100 kb max) -> /health -> module routers
//   -> JSON 404 for unknown /api/* -> built frontend (if present) -> error handler
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { SERVER_ROOT } from "./config/env.js";
import { mongoStatus } from "./config/database.js";
import { corsMiddleware } from "./middleware/cors.js";
import { apiNotFound, errorHandler } from "./middleware/error-handler.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { userRoutes } from "./modules/users/user.routes.js";
import { analysisRoutes } from "./modules/analyses/analysis.routes.js";
import { uploadRoutes } from "./modules/uploads/upload.routes.js";

const clientDist = path.join(SERVER_ROOT, "..", "client", "dist");
const clientIndexHtml = path.join(clientDist, "index.html");

export function createApp() {
  const app = express();
  app.use(corsMiddleware());
  // Parses JSON bodies into req.body. Multipart uploads are parsed by Multer instead.
  app.use(express.json({ limit: "100kb" }));

  // Liveness + database check for the host and for the viva demo. 503 when MongoDB is down.
  app.get("/health", (_req, res) => {
    const db = mongoStatus();
    res.status(db.connected ? 200 : 503).json({
      status: db.connected ? "ok" : "degraded",
      database: db.connected ? "ok" : "disconnected",
      databaseName: db.name,
      environment: process.env.NODE_ENV || "development",
      version: process.env.npm_package_version || "0.0.1",
    });
  });

  // Each router declares full /api/... paths; see the *.routes.js files.
  app.use(authRoutes);
  app.use(userRoutes);
  app.use(analysisRoutes);
  app.use(uploadRoutes);

  app.use("/api", apiNotFound);

  // Single-server deployment: serve the built React app for every other URL.
  // The upload folder is never served statically - files only go out through the authorized download route.
  if (fs.existsSync(clientIndexHtml)) {
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => res.sendFile(clientIndexHtml));
  } else {
    app.get("*", (_req, res) => {
      res.status(404).json({ status: "not_found", message: "This server is API-only in this deployment." });
    });
  }

  app.use(errorHandler);
  return app;
}
