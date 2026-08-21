import crypto from "node:crypto";
import { db } from "./sqlite.js";
import { encrypt, decrypt } from "./crypto.js";

// A thin repository layer. Every other server module talks to users/sessions/
// analyses only through these functions — swapping SQLite for Mongoose later
// means rewriting this file, not hunting down call sites.

export const usersRepo = {
  upsertFromGitHub({ githubId, username, avatarUrl }) {
    const now = Date.now();
    db.prepare(
      `INSERT INTO users (github_id, username, avatar_url, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(github_id) DO UPDATE SET username = excluded.username, avatar_url = excluded.avatar_url`
    ).run(githubId, username, avatarUrl, now);
    return db.prepare(`SELECT * FROM users WHERE github_id = ?`).get(githubId);
  },

  findById(id) {
    return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) || null;
  },
};

export const sessionsRepo = {
  create({ userId, token, ttlMs }) {
    const id = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    db.prepare(
      `INSERT INTO sessions (id, user_id, github_token_enc, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`
    ).run(id, userId, encrypt(token), now, now + ttlMs);
    return id;
  },

  findById(id) {
    const row = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id);
    if (!row) return null;
    if (row.expires_at < Date.now()) {
      this.deleteById(id);
      return null;
    }
    return { id: row.id, userId: row.user_id, token: decrypt(row.github_token_enc), expiresAt: row.expires_at };
  },

  deleteById(id) {
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
  },
};

function parseAnalysisRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    repoFullName: row.repo_full_name,
    status: row.status,
    fileTree: JSON.parse(row.file_tree_json),
    explanation: row.explanation,
    graph: row.graph_json ? JSON.parse(row.graph_json) : null,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

export const analysesRepo = {
  create({ userId, repoFullName, status, fileTree, explanation = null, graph = null, errorMessage = null }) {
    const id = crypto.randomBytes(16).toString("hex");
    db.prepare(
      `INSERT INTO analyses (id, user_id, repo_full_name, status, file_tree_json, explanation, graph_json, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, userId, repoFullName, status, JSON.stringify(fileTree), explanation, graph ? JSON.stringify(graph) : null, errorMessage, Date.now());
    return id;
  },

  findById(id) {
    return parseAnalysisRow(db.prepare(`SELECT * FROM analyses WHERE id = ?`).get(id));
  },

  listByUser(userId, limit = 50) {
    return db
      .prepare(`SELECT id, repo_full_name, status, created_at FROM analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
      .all(userId, limit)
      .map((r) => ({ id: r.id, repoFullName: r.repo_full_name, status: r.status, createdAt: r.created_at }));
  },

  findLatestByUserAndRepo(userId, repoFullName) {
    return parseAnalysisRow(
      db
        .prepare(
          `SELECT * FROM analyses WHERE user_id = ? AND repo_full_name = ? AND status = 'complete' ORDER BY created_at DESC LIMIT 1`
        )
        .get(userId, repoFullName)
    );
  },
};
