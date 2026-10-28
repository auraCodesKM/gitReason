// Routes for the signed-in user's account. Full paths are written out so a URL
// from the browser can be found with a plain text search.
import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { requireAuth } from "../../middleware/require-auth.js";
import {
  handleUserMe,
  handleSetGeminiKey,
  handleClearGeminiKey,
  handleUserGithubActivity,
  handleRepoLanguages,
} from "./user.controller.js";

export const userRoutes = Router();

userRoutes.get("/api/user/me", asyncHandler(handleUserMe)); // public: reports signed in or not
userRoutes.post("/api/user/gemini-key", requireAuth, asyncHandler(handleSetGeminiKey));
userRoutes.delete("/api/user/gemini-key", requireAuth, asyncHandler(handleClearGeminiKey));
userRoutes.get("/api/user/github-activity", requireAuth, asyncHandler(handleUserGithubActivity));
userRoutes.get("/api/user/repo-languages", requireAuth, asyncHandler(handleRepoLanguages));
