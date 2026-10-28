import mongoose from "mongoose";

// Collection: sessions. One document per signed-in browser.
//
// The browser only holds a random 32-byte id in the HttpOnly `gr_session`
// cookie. `_id` here is the SHA-256 hash of that id (see session.service.js), so
// someone who reads the database still cannot use a row as a cookie.
const sessionSchema = new mongoose.Schema(
  {
    _id: { type: String }, // sha256(cookie value), 64 hex characters
    // Which user this session belongs to. Indexed for lookups by user.
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // GitHub OAuth token, AES-256-GCM encrypted, hidden from queries by default.
    githubTokenEnc: { type: String, required: true, select: false },
    // TTL index (expires: 0): MongoDB's background monitor deletes the document
    // once expiresAt has passed. The monitor runs about once a minute, so
    // session.service.js also filters on expiresAt > now when reading.
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Session = mongoose.model("Session", sessionSchema);
