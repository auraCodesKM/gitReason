// Multer: receives multipart/form-data uploads, then checks the actual bytes.
//
// Route order (upload.routes.js):
//   requireAuth -> validateObjectId -> requireOwnedAnalysis -> enforceUploadQuota -> receiveDocument -> controller
// so authentication, ownership and the quota are all checked before any file bytes are read.
import path from "node:path";
import { isUtf8 } from "node:buffer";
import multer from "multer";
import { uploadService, MAX_UPLOADS_PER_ANALYSIS } from "./upload.service.js";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isText = (buf) => !buf.includes(0) && isUtf8(buf); // no NUL bytes and valid UTF-8

// Allowlist: extension -> canonical MIME type + a check on the actual bytes
// ("magic numbers"). The browser's Content-Type is ignored: a renamed .exe
// called "notes.pdf" fails because it does not start with %PDF-.
const ALLOWED = {
  pdf: { mimeType: "application/pdf", matches: (buf) => buf.subarray(0, 5).toString("latin1") === "%PDF-" },
  png: { mimeType: "image/png", matches: (buf) => buf.subarray(0, 8).equals(PNG_SIGNATURE) },
  jpg: { mimeType: "image/jpeg", matches: (buf) => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff },
  md: { mimeType: "text/markdown", matches: isText },
  txt: { mimeType: "text/plain", matches: isText },
};
const ALIASES = { jpeg: "jpg", markdown: "md" };

/** "Diagram.JPEG" -> "jpg"; unknown extensions are returned as-is (and then rejected). */
export function extensionOf(filename) {
  const ext = path.extname(filename || "").slice(1).toLowerCase();
  return ALIASES[ext] || ext;
}

/**
 * Decides whether a file is acceptable, from its name AND its content.
 * @returns {{ ok: true, ext: string, mimeType: string } | { ok: false, reason: "unsupported_type"|"empty"|"content_mismatch" }}
 */
export function detectDocumentType(filename, buffer) {
  const ext = extensionOf(filename);
  if (!ALLOWED[ext]) return { ok: false, reason: "unsupported_type" };
  if (buffer.length === 0) return { ok: false, reason: "empty" };
  if (!ALLOWED[ext].matches(buffer)) return { ok: false, reason: "content_mismatch" };
  return { ok: true, ext, mimeType: ALLOWED[ext].mimeType };
}

class UnsupportedTypeError extends Error {}

const upload = multer({
  // Memory storage: the bytes are validated before anything touches disk.
  // Safe because the 5 MB limit bounds memory use per request.
  storage: multer.memoryStorage(),
  // One file, at most two text fields ("description" and one spare), and small field values.
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 2, fieldSize: 1024, parts: 3 },
  // Runs as soon as the file part's headers arrive, before its bytes are read:
  // an unsupported extension is rejected without buffering the file.
  fileFilter(_req, file, cb) {
    if (!ALLOWED[extensionOf(file.originalname)]) {
      return cb(new UnsupportedTypeError("Only .pdf, .png, .jpg, .md and .txt files are allowed."));
    }
    cb(null, true);
  },
});

// Maps Multer/parse errors to status codes the frontend can show.
function uploadError(res, err) {
  if (err instanceof UnsupportedTypeError) return res.status(415).json({ status: "unsupported_type", message: err.message });
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ status: "too_large", message: `Files are limited to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` });
    }
    return res.status(400).json({ status: "invalid", message: `Upload rejected: ${err.code}.` });
  }
  // busboy parse failures (bad boundary, truncated body, not multipart at all)
  return res.status(400).json({ status: "invalid", message: "Malformed multipart upload." });
}

/**
 * Runs Multer for a single "file" field (+ optional "description" text field),
 * then checks the bytes. On success sets req.upload = { buffer, ext, mimeType, originalName }.
 * Responds 400 (no file / empty / malformed), 413 (too big) or 415 (wrong type or content).
 */
export function receiveDocument(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err) return uploadError(res, err);
    if (!req.file) return res.status(400).json({ status: "invalid", message: 'Attach a file in the "file" form field.' });

    const type = detectDocumentType(req.file.originalname, req.file.buffer);
    if (type.reason === "empty") return res.status(400).json({ status: "invalid", message: "File is empty." });
    if (!type.ok) {
      return res.status(415).json({ status: "unsupported_type", message: `File content is not a valid .${extensionOf(req.file.originalname)} file.` });
    }

    req.upload = {
      buffer: req.file.buffer,
      ext: type.ext,
      mimeType: type.mimeType,
      // Display name only: strip any directory part ("../../etc/x.md" -> "x.md") and control characters.
      originalName: path.basename(req.file.originalname).replace(/[\x00-\x1f\x7f]/g, "").slice(0, 255) || `upload.${type.ext}`,
    };
    next();
  });
}

/**
 * At most MAX_UPLOADS_PER_ANALYSIS documents per analysis (409 beyond that).
 * Runs before Multer, so a full analysis never even receives the bytes.
 * Count-then-insert: two simultaneous uploads could both pass at 19.
 */
export async function enforceUploadQuota(req, res, next) {
  try {
    if ((await uploadService.countForAnalysis(req.params.id)) >= MAX_UPLOADS_PER_ANALYSIS) {
      return res.status(409).json({ status: "limit_reached", message: `An analysis can have at most ${MAX_UPLOADS_PER_ANALYSIS} documents.` });
    }
    next();
  } catch (err) {
    next(err);
  }
}
