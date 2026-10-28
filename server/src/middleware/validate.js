// Small input checks shared by several routes. They run before any database query.

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

/**
 * Route middleware: rejects a malformed MongoDB id in req.params[param] with 400,
 * so a value like "abc" never reaches Mongoose (where it would be a CastError).
 * @param {string} param e.g. "id" or "uploadId"
 */
export function validateObjectId(param) {
  return (req, res, next) => {
    if (!OBJECT_ID_RE.test(req.params[param] || "")) {
      return res.status(400).json({ status: "invalid", message: `Invalid ${param}.` });
    }
    next();
  };
}

/**
 * Reads ?page=&limit= for list endpoints. The cap on limit bounds how much one
 * request can read from the database.
 * @returns {{ page: number, limit: number } | null} null when a value is out of range
 */
export function parsePagination(query, { defaultLimit = 50, maxLimit = 100 } = {}) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? defaultLimit : Number(query.limit);
  if (!Number.isInteger(page) || page < 1) return null;
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) return null;
  return { page, limit };
}
