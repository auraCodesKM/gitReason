import { db } from "../client.js";

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
};
