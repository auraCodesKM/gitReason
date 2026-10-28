// Repository analysis routes (public, session optional) and the signed-in
// user's analysis history (CRUD, protected).
import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { validateObjectId } from "../../middleware/validate.js";
import { handleRepoCheck, handleAnalyzeStream, handleFileContent } from "./analyze.controller.js";
import {
  handleUserHistory,
  handleUserHistoryItem,
  handleUpdateHistoryItem,
  handleDeleteHistoryItem,
} from "./history.controller.js";

export const analysisRoutes = Router();
const analysisId = validateObjectId("id");

// Public: anyone may analyze a public repository; signing in saves the result.
analysisRoutes.get("/api/repo/check", asyncHandler(handleRepoCheck));
analysisRoutes.get("/api/repo/file", asyncHandler(handleFileContent));
// Streams its own errors as SSE events, so it is not wrapped in asyncHandler.
analysisRoutes.get("/api/analyze/stream", handleAnalyzeStream);

// History CRUD: authentication first, then id validation, then the ownership-filtered query.
analysisRoutes.get("/api/user/history", requireAuth, asyncHandler(handleUserHistory));
analysisRoutes.get("/api/user/history/:id", requireAuth, analysisId, asyncHandler(handleUserHistoryItem));
analysisRoutes.patch("/api/user/history/:id", requireAuth, analysisId, asyncHandler(handleUpdateHistoryItem));
analysisRoutes.delete("/api/user/history/:id", requireAuth, analysisId, asyncHandler(handleDeleteHistoryItem));
