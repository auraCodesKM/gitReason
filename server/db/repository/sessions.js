import crypto from "node:crypto";
import { db } from "../client.js";
import { encrypt, decrypt } from "../crypto.js";

export const sessionsRepo = {
  async create({ userId, token, ttlMs }) {
    const id = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    await db
      .prepare(`INSERT INTO sessions (id, user_id, github_token_enc, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`)
      .run(id, userId, encrypt(token), now, now + ttlMs);
    return id;
  },

  async findById(id) {
    const row = await db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id);
    if (!row) return null;
    if (row.expires_at < Date.now()) {
      await this.deleteById(id);
      return null;
    }
    return { id: row.id, userId: row.user_id, token: decrypt(row.github_token_enc), expiresAt: row.expires_at };
  },

  async deleteById(id) {
    await db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
  },
};
