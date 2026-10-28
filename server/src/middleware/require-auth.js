// AUTHENTICATION middleware: "who is calling?"
//
// Turns the gr_session cookie into the signed-in user and stores it on
// req.auth = { sessionId, userId, token }. Every later middleware and handler
// takes the user id from here - never from the request body, query or URL -
// so a client cannot claim to be someone else.
//
// Missing, malformed, unknown, expired or undecryptable session -> 401.
import { getSessionFromRequest } from "../modules/auth/session.service.js";

export async function requireAuth(req, res, next) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return res.status(401).json({ status: "error", message: "Not signed in." });
    req.auth = { sessionId: session.id, userId: session.userId, token: session.token };
    next();
  } catch (err) {
    next(err); // e.g. database unreachable -> generic 500 from the error handler
  }
}
