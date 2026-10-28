// Authentication routes. All public: they are how a visitor becomes signed in (or out).
import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { handleAuthStart, handleAuthCallback, handleAuthSession, handleAuthLogout } from "./auth.controller.js";

export const authRoutes = Router();

authRoutes.get("/api/auth/github/start", asyncHandler(handleAuthStart));
authRoutes.get("/api/auth/github/callback", asyncHandler(handleAuthCallback));
authRoutes.get("/api/auth/session", asyncHandler(handleAuthSession));
authRoutes.post("/api/auth/logout", asyncHandler(handleAuthLogout));
