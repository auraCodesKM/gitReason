// Upload routes. Middleware runs left to right; each step can stop the request:
//   requireAuth          401 if not signed in               (authentication)
//   validateObjectId     400 if the id is malformed
//   requireOwnedAnalysis 404 if the analysis is not yours   (authorization)
//   enforceUploadQuota   409 if the analysis has 20 files
//   receiveDocument      Multer + content checks: 400/413/415
import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireOwnedAnalysis } from "../../middleware/require-ownership.js";
import { validateObjectId } from "../../middleware/validate.js";
import { receiveDocument, enforceUploadQuota } from "./upload.middleware.js";
import { handleCreateUpload, handleListUploads, handleDownloadUpload, handleDeleteUpload } from "./upload.controller.js";

export const uploadRoutes = Router();
const analysisId = validateObjectId("id");
const uploadId = validateObjectId("uploadId");

uploadRoutes.post(
  "/api/user/history/:id/uploads",
  requireAuth, analysisId, requireOwnedAnalysis, enforceUploadQuota, receiveDocument,
  asyncHandler(handleCreateUpload)
);
uploadRoutes.get("/api/user/history/:id/uploads", requireAuth, analysisId, requireOwnedAnalysis, asyncHandler(handleListUploads));
// Download and delete are authorized inside the query (filter on owner), so no separate ownership middleware.
uploadRoutes.get("/api/user/uploads/:uploadId", requireAuth, uploadId, asyncHandler(handleDownloadUpload));
uploadRoutes.delete("/api/user/uploads/:uploadId", requireAuth, uploadId, asyncHandler(handleDeleteUpload));
