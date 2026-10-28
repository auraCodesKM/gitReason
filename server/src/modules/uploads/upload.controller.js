// HTTP handlers for documents attached to an analysis (the Knowledge tab).
// All run after requireAuth; create and list also after requireOwnedAnalysis.
import { uploadService } from "./upload.service.js";

/** POST /api/user/history/:id/uploads (multipart: file, description?) -> 201 { upload } */
export async function handleCreateUpload(req, res) {
  const description = typeof req.body?.description === "string" ? req.body.description : undefined;
  const upload = await uploadService.create({
    ownerId: req.auth.userId, // from the session
    analysisId: req.params.id, // ownership already checked by requireOwnedAnalysis
    description,
    ...req.upload, // buffer, ext, mimeType, originalName - set by receiveDocument after validation
  });
  // One line per upload so the terminal shows the Multer -> disk -> MongoDB path (no paths or secrets logged).
  console.log(`Upload saved: Multer received "${upload.originalName}" (${upload.mimeType}, ${upload.size} B) -> uploads document ${upload.id} for analysis ${upload.analysisId}`);
  res.status(201).json({ upload });
}

/** GET /api/user/history/:id/uploads -> { uploads } */
export async function handleListUploads(req, res) {
  res.json({ uploads: await uploadService.listForAnalysis(req.params.id, req.auth.userId) });
}

/**
 * GET /api/user/uploads/:uploadId -> the file, as a download.
 * Authorized by the owner-filtered lookup on every request: knowing an upload
 * id (or the random file name) is not enough. The disk path comes from the
 * database record, never from the URL.
 */
export async function handleDownloadUpload(req, res, next) {
  const upload = await uploadService.findOwned(req.params.uploadId, req.auth.userId);
  if (!upload) return res.status(404).json({ status: "not_found" });

  res.download(
    upload.filePath,
    upload.originalName, // Content-Disposition: attachment; filename="<original name>"
    {
      headers: {
        "Content-Type": upload.mimeType,
        "X-Content-Type-Options": "nosniff", // browser must not guess a different (executable) type
        "Content-Security-Policy": "default-src 'none'; sandbox", // even if opened, nothing in it can run
      },
    },
    (err) => {
      if (!err) return;
      // Record exists but the bytes are gone (e.g. the disk was wiped by a redeploy).
      if (err.code === "ENOENT" && !res.headersSent) return res.status(404).json({ status: "not_found" });
      next(err);
    }
  );
}

/** DELETE /api/user/uploads/:uploadId -> 204 (record and file removed) */
export async function handleDeleteUpload(req, res) {
  const deleted = await uploadService.deleteOwned(req.params.uploadId, req.auth.userId);
  if (!deleted) return res.status(404).json({ status: "not_found" });
  console.log(`Upload deleted: uploads document ${req.params.uploadId} and its stored file removed`);
  res.status(204).end();
}
