// The last two middleware in src/app.js.
import mongoose from "mongoose";

/** Unknown /api/* URL -> JSON 404 (instead of the frontend's index.html). */
export function apiNotFound(_req, res) {
  res.status(404).json({ status: "not_found", message: "Unknown API route." });
}

/**
 * Central error handler. Anything thrown in a handler (via asyncHandler) or
 * passed to next(err) ends up here.
 * - Bad input the schema or parser caught -> 400/413 with a short message.
 * - Anything else -> logged on the server, and the client gets a generic 500
 *   (no stack trace, query, connection string or session data).
 */
// Express recognises error middleware by its four parameters.
export function errorHandler(err, _req, res, next) {
  // The response already started (e.g. a file download failed half-way): a JSON
  // error can no longer be sent. Express's built-in handler closes the connection.
  if (res.headersSent) return next(err);

  // Schema rules (maxlength, enum, ...) and malformed values are client errors.
  if (err instanceof mongoose.Error.ValidationError || err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ status: "invalid", message: err.message });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ status: "invalid", message: "Malformed JSON body." });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ status: "too_large", message: "Request body too large." });
  }
  console.error("Unhandled request error:", err?.stack || err?.message || err);
  res.status(500).json({ status: "error", message: "Something went wrong. Try again." });
}
