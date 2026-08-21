import crypto from "node:crypto";
import { db } from "../client.js";

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
  async create({ userId, repoFullName, status, fileTree, explanation = null, graph = null, errorMessage = null }) {
    const id = crypto.randomBytes(16).toString("hex");
    await db
      .prepare(
        `INSERT INTO analyses (id, user_id, repo_full_name, status, file_tree_json, explanation, graph_json, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, userId, repoFullName, status, JSON.stringify(fileTree), explanation, graph ? JSON.stringify(graph) : null, errorMessage, Date.now());
    return id;
  },

  async findById(id) {
    return parseAnalysisRow(await db.prepare(`SELECT * FROM analyses WHERE id = ?`).get(id));
  },

  async listByUser(userId, limit = 50) {
    // file_tree_json/graph_json are already sitting in these rows — no
    // schema change needed to surface file/node/relationship counts for
    // the dashboard, just parse what's already stored. Wrapped per-row so
    // one malformed/incomplete (e.g. failed) analysis can't break the list.
    const rows = await db
      .prepare(
        `SELECT id, repo_full_name, status, created_at, file_tree_json, graph_json
         FROM analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
      )
      .all(userId, limit);
    return rows.map((r) => {
      let fileCount = null;
      let nodeCount = null;
      let edgeCount = null;
      try {
        if (r.file_tree_json) fileCount = JSON.parse(r.file_tree_json).length;
        if (r.graph_json) {
          const graph = JSON.parse(r.graph_json);
          nodeCount = graph.nodes?.length ?? null;
          edgeCount = graph.edges?.length ?? null;
        }
      } catch {
        // leave counts null — a malformed row shouldn't break the list
      }
      return { id: r.id, repoFullName: r.repo_full_name, status: r.status, createdAt: r.created_at, fileCount, nodeCount, edgeCount };
    });
  },

  async findLatestByUserAndRepo(userId, repoFullName) {
    return parseAnalysisRow(
      await db
        .prepare(
          `SELECT * FROM analyses WHERE user_id = ? AND repo_full_name = ? AND status = 'complete' ORDER BY created_at DESC LIMIT 1`
        )
        .get(userId, repoFullName)
    );
  },
};
