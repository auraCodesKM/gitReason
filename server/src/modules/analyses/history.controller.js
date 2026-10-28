// CRUD over the signed-in user's saved analyses ("history").
// Every handler runs after requireAuth (and validateObjectId for :id), so
// req.auth.userId is the session's user. Ownership is enforced inside each
// analysisService query: a missing OR foreign analysis both return 404.
import { analysisService } from "./analysis.service.js";
import { parsePagination } from "../../middleware/validate.js";

const EDITABLE_FIELDS = ["title", "notes"];

/** GET /api/user/history?page&limit -> { history, page, limit, total } */
export async function handleUserHistory(req, res) {
  const pagination = parsePagination(req.query);
  if (!pagination) return res.status(400).json({ status: "invalid", message: "page must be >= 1 and limit 1-100." });

  const { items, total } = await analysisService.listByUser(req.auth.userId, pagination);
  res.json({ history: items, page: pagination.page, limit: pagination.limit, total });
}

/** GET /api/user/history/:id -> { analysis } (file tree, explanation, graph) */
export async function handleUserHistoryItem(req, res) {
  const analysis = await analysisService.findOwned(req.params.id, req.auth.userId);
  if (!analysis) return res.status(404).json({ status: "not_found" });
  res.json({ analysis });
}

/**
 * PATCH /api/user/history/:id { title?, notes? }
 * Only these two fields can be changed. Anything else in the body (user,
 * repoFullName, graph, ...) is rejected rather than silently written.
 */
export async function handleUpdateHistoryItem(req, res) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const keys = Object.keys(body);
  const unknown = keys.filter((k) => !EDITABLE_FIELDS.includes(k));
  if (keys.length === 0 || unknown.length) {
    return res.status(400).json({ status: "invalid", message: "Send only title and/or notes." });
  }
  if (keys.some((k) => typeof body[k] !== "string")) {
    return res.status(400).json({ status: "invalid", message: "title and notes must be strings." });
  }

  // Too-long values fail the schema's maxlength (runValidators) -> 400 from the error handler.
  const analysis = await analysisService.updateOwned(req.params.id, req.auth.userId, body);
  if (!analysis) return res.status(404).json({ status: "not_found" });
  res.json({ analysis });
}

/** DELETE /api/user/history/:id -> 204; also deletes the analysis's uploads. */
export async function handleDeleteHistoryItem(req, res) {
  const deleted = await analysisService.deleteOwned(req.params.id, req.auth.userId);
  if (!deleted) return res.status(404).json({ status: "not_found" });
  res.status(204).end();
}
