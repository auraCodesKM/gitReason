// Saved analyses: create, read, list (paginated), update, delete.
//
// Called by: analyze.controller.js (create, reuse), history.controller.js (CRUD),
// middleware/require-ownership.js (existsOwned).
// MongoDB: analyses collection (Analysis model); delete also removes the
// analysis's uploads through uploadService.
//
// AUTHORIZATION RULE: every read/update/delete filters on BOTH _id and user, so
// another user's analysis behaves exactly like one that does not exist (null -> 404).
import mongoose from "mongoose";
import { Analysis } from "./analysis.model.js";
import { uploadService } from "../uploads/upload.service.js";

// API shape the frontend already uses: string `id`, epoch-milliseconds dates.
function toAnalysis(doc) {
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    userId: doc.user.toString(),
    repoFullName: doc.repoFullName,
    defaultBranch: doc.defaultBranch ?? null,
    treeSha: doc.treeSha ?? null,
    status: doc.status,
    title: doc.title ?? null,
    notes: doc.notes ?? null,
    fileTree: doc.fileTree,
    explanation: doc.explanation ?? null,
    graph: doc.graph,
    language: doc.language ?? null,
    createdAt: new Date(doc.createdAt).getTime(),
    updatedAt: new Date(doc.updatedAt).getTime(),
  };
}

export const analysisService = {
  /**
   * Saves a finished analysis. Schema validation (size caps, enums) runs here.
   * @returns {Promise<string>} the new analysis id
   * @throws mongoose ValidationError if the data breaks a schema rule
   */
  async create({ userId, repoOwner, repoName, defaultBranch, treeSha, fileTree, explanation, graph, language }) {
    const doc = await Analysis.create({
      user: userId,
      repoOwner,
      repoName,
      repoFullName: `${repoOwner}/${repoName}`,
      defaultBranch,
      treeSha,
      fileTree,
      explanation,
      graph,
      language,
    });
    return doc._id.toString();
  },

  /** @returns {Promise<object|null>} the analysis, or null if missing OR owned by someone else */
  async findOwned(id, userId) {
    return toAnalysis(await Analysis.findOne({ _id: id, user: userId }).lean());
  },

  /** Same user + same repo + same git tree = same input: reuse it instead of calling Gemini again. */
  async findLatestForTree(userId, repoFullName, treeSha) {
    const doc = await Analysis.findOne({ user: userId, repoFullName, treeSha }).sort({ createdAt: -1 }).lean();
    return toAnalysis(doc);
  },

  /** Cheap ownership check (no document body is loaded). */
  async existsOwned(id, userId) {
    return Boolean(await Analysis.exists({ _id: id, user: userId }));
  },

  /**
   * One page of the user's history, newest first, plus the total count.
   * Returns counts (files/nodes/edges) instead of the large fileTree and graph,
   * so a list response stays small.
   */
  async listByUser(userId, { page = 1, limit = 50 } = {}) {
    const user = new mongoose.Types.ObjectId(userId);
    const [items, total] = await Promise.all([
      Analysis.aggregate([
        { $match: { user } },
        { $sort: { createdAt: -1, _id: -1 } }, // _id breaks ties so pages never overlap
        { $skip: (page - 1) * limit },
        { $limit: limit },
        {
          $project: {
            repoFullName: 1, status: 1, title: 1, language: 1, createdAt: 1,
            fileCount: { $size: { $ifNull: ["$fileTree", []] } },
            nodeCount: { $size: { $ifNull: ["$graph.nodes", []] } },
            edgeCount: { $size: { $ifNull: ["$graph.edges", []] } },
          },
        },
      ]),
      Analysis.countDocuments({ user }),
    ]);

    return {
      total,
      items: items.map((r) => ({
        id: r._id.toString(),
        repoFullName: r.repoFullName,
        status: r.status,
        title: r.title ?? null,
        language: r.language ?? null,
        createdAt: new Date(r.createdAt).getTime(),
        fileCount: r.fileCount,
        nodeCount: r.nodeCount,
        edgeCount: r.edgeCount,
      })),
    };
  },

  /**
   * @param {{ title?: string, notes?: string }} changes already whitelisted by the controller
   * @returns {Promise<object|null>} the updated analysis, or null if not found/not owned
   * @throws mongoose ValidationError (runValidators applies maxlength on update too)
   */
  async updateOwned(id, userId, changes) {
    const doc = await Analysis.findOneAndUpdate(
      { _id: id, user: userId },
      { $set: changes },
      { returnDocument: "after", runValidators: true }
    ).lean();
    return toAnalysis(doc);
  },

  /**
   * Deletes the analysis, then its uploads (records and files). Not a
   * transaction: if the second step fails, the analysis is already gone.
   * @returns {Promise<boolean>} false if not found/not owned
   */
  async deleteOwned(id, userId) {
    const doc = await Analysis.findOneAndDelete({ _id: id, user: userId }).lean();
    if (!doc) return false;
    await uploadService.deleteAllForAnalysis(doc._id);
    return true;
  },
};
