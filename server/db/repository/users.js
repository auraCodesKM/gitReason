import { db } from "../client.js";
import { encrypt, decrypt } from "../crypto.js";

export const usersRepo = {
  async upsertFromGitHub({ githubId, username, avatarUrl }) {
    const now = Date.now();
    await db
      .prepare(
        `INSERT INTO users (github_id, username, avatar_url, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(github_id) DO UPDATE SET username = excluded.username, avatar_url = excluded.avatar_url`
      )
      .run(githubId, username, avatarUrl, now);
    return await db.prepare(`SELECT * FROM users WHERE github_id = ?`).get(githubId);
  },

  async findById(id) {
    return (await db.prepare(`SELECT * FROM users WHERE id = ?`).get(id)) || null;
  },

  // Bring-your-own-key: lets a signed-in user use their own Gemini quota
  // instead of the shared server key. Encrypted at rest with the same
  // AES-256-GCM scheme as GitHub tokens; the plaintext key is never
  // returned from here or from any HTTP handler, only used server-side to
  // call the Gemini API.
  async setGeminiKey(userId, plaintextKey) {
    await db.prepare(`UPDATE users SET gemini_key_enc = ? WHERE id = ?`).run(encrypt(plaintextKey), userId);
  },

  async clearGeminiKey(userId) {
    await db.prepare(`UPDATE users SET gemini_key_enc = NULL WHERE id = ?`).run(userId);
  },

  async getGeminiKey(userId) {
    const row = await db.prepare(`SELECT gemini_key_enc FROM users WHERE id = ?`).get(userId);
    return row?.gemini_key_enc ? decrypt(row.gemini_key_enc) : null;
  },
};
