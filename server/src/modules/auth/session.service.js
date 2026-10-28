// Server-side sessions: create one after GitHub sign-in, look it up on every
// request, delete it on logout.
//
// Called by: auth.controller.js (create/delete), middleware/require-auth.js and
// the public routes that personalise their answer (getSessionFromRequest).
// MongoDB: sessions collection (Session model).
import crypto from "node:crypto";
import { Session } from "./session.model.js";
import { getSessionCookieId } from "./session.cookie.js";
import { encrypt, decrypt } from "../../utils/encryption.js";

// The cookie carries the raw id; the database only ever sees its SHA-256 hash.
// A leaked sessions collection therefore contains no usable cookies.
function hashId(id) {
  return crypto.createHash("sha256").update(id).digest("hex");
}

export const sessionService = {
  /**
   * Creates a session for a user who just signed in.
   * @param {{ userId: string, token: string, ttlMs: number }} params token = GitHub access token
   * @returns {Promise<string>} the raw session id - goes into the cookie, never into the database
   */
  async create({ userId, token, ttlMs }) {
    const id = crypto.randomBytes(32).toString("hex"); // 256 bits of randomness: cannot be guessed
    await Session.create({
      _id: hashId(id),
      user: userId,
      githubTokenEnc: encrypt(token),
      expiresAt: new Date(Date.now() + ttlMs),
    });
    return id;
  },

  /**
   * @param {string} id raw session id from the cookie
   * @returns {Promise<{ id: string, userId: string, token: string, expiresAt: Date } | null>}
   *   null when the id is malformed, unknown, expired, or its token can no longer be decrypted
   */
  async findById(id) {
    if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)) return null; // not a value we ever issue
    // The TTL monitor deletes expired rows only about once a minute, so expiry is also checked here.
    const doc = await Session.findOne({ _id: hashId(id), expiresAt: { $gt: new Date() } })
      .select("+githubTokenEnc")
      .lean();
    if (!doc) return null;

    let token;
    try {
      token = decrypt(doc.githubTokenEnc);
    } catch {
      // Encrypted under a different SESSION_SECRET (or tampered with): the session
      // is unusable, so treat the visitor as signed out and let them sign in again.
      return null;
    }
    return { id, userId: doc.user.toString(), token, expiresAt: doc.expiresAt };
  },

  /** Logout. Deleting the row invalidates the cookie everywhere at once. */
  async deleteById(id) {
    if (typeof id !== "string") return;
    await Session.deleteOne({ _id: hashId(id) });
  },
};

/**
 * Resolves the request's cookie to a live session (or null). Used where signing
 * in is optional; protected routes use middleware/require-auth.js instead.
 */
export async function getSessionFromRequest(req) {
  const id = getSessionCookieId(req);
  if (!id) return null;
  return sessionService.findById(id);
}
