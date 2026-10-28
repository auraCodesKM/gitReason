// Uploaded documents: bytes on disk (UPLOAD_DIR), metadata in MongoDB.
//
// Called by: upload.controller.js, upload.middleware.js (quota),
// analysis.service.js (cascade delete).
// MongoDB: uploads collection (Upload model). Filesystem: UPLOAD_DIR.
//
// AUTHORIZATION RULE: reads and deletes filter on BOTH _id and owner, so
// another user's upload behaves exactly like one that does not exist.
// Creation is only reached after requireOwnedAnalysis has checked the analysis.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Upload } from "./upload.model.js";
import { uploadDir } from "../../config/env.js";

export const MAX_UPLOADS_PER_ANALYSIS = 20; // bounds disk use and the size of one list response

// storedName is generated here and re-checked by the schema regex
// (/^[a-f0-9]{32}\.(pdf|png|jpg|md|txt)$/), so it can never contain "/" or "..".
// path.join therefore always stays inside the upload folder.
function filePath(storedName) {
  return path.join(uploadDir(), storedName);
}

// API shape: no storedName or disk path ever leaves the server.
function toUpload(doc) {
  return {
    id: doc._id.toString(),
    analysisId: doc.analysis.toString(),
    originalName: doc.originalName,
    mimeType: doc.mimeType,
    size: doc.size,
    sha256: doc.sha256,
    description: doc.description ?? null,
    createdAt: new Date(doc.createdAt).getTime(),
  };
}

// force: true -> a file that is already gone is not an error.
async function removeFile(storedName) {
  await fs.rm(filePath(storedName), { force: true });
}

export const uploadService = {
  async countForAnalysis(analysisId) {
    return Upload.countDocuments({ analysis: analysisId });
  },

  /**
   * Writes the validated bytes to disk under a random name, then records the
   * metadata. If the database write fails, the file is deleted again, so
   * there are never bytes without a record.
   * @param {{ ownerId: string, analysisId: string, originalName: string, buffer: Buffer, mimeType: string, ext: string, description?: string }} input
   *   everything except description comes from requireAuth / the route / receiveDocument - never from the client directly
   * @returns {Promise<object>} the saved upload (API shape)
   * @throws filesystem errors (folder not writable) or mongoose ValidationError (e.g. description > 500 chars)
   */
  async create({ ownerId, analysisId, originalName, buffer, mimeType, ext, description }) {
    // 16 random bytes = 32 hex characters: unguessable and collision-free in practice.
    // The user's filename plays no part in where the file is stored.
    const storedName = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
    await fs.mkdir(uploadDir(), { recursive: true, mode: 0o700 }); // folder readable by the server user only
    // flag "wx": fail instead of overwriting an existing file. mode 0o600: owner read/write only.
    await fs.writeFile(filePath(storedName), buffer, { flag: "wx", mode: 0o600 });

    try {
      const doc = await Upload.create({
        owner: ownerId,
        analysis: analysisId,
        originalName,
        storedName,
        mimeType,
        size: buffer.length,
        sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
        description,
      });
      return toUpload(doc);
    } catch (err) {
      await removeFile(storedName); // no orphan bytes without metadata
      throw err;
    }
  },

  /** The analysis's documents that belong to this owner, newest first. */
  async listForAnalysis(analysisId, ownerId) {
    const docs = await Upload.find({ analysis: analysisId, owner: ownerId }).sort({ createdAt: -1 }).lean();
    return docs.map(toUpload);
  },

  /** @returns {Promise<object|null>} the upload plus its disk path (server-internal), or null if missing/not owned */
  async findOwned(id, ownerId) {
    const doc = await Upload.findOne({ _id: id, owner: ownerId }).lean();
    return doc ? { ...toUpload(doc), filePath: filePath(doc.storedName) } : null;
  },

  /**
   * Deletes the record first, then the file. If the file is already missing,
   * that is fine (force: true). If removing the file fails for another reason,
   * the error propagates (500) and the bytes stay on disk without a record.
   * @returns {Promise<boolean>} false if not found/not owned
   */
  async deleteOwned(id, ownerId) {
    const doc = await Upload.findOneAndDelete({ _id: id, owner: ownerId }).lean();
    if (!doc) return false;
    await removeFile(doc.storedName);
    return true;
  },

  /** Cascade used when an analysis is deleted: every record, then every file. */
  async deleteAllForAnalysis(analysisId) {
    const docs = await Upload.find({ analysis: analysisId }).select("storedName").lean();
    await Upload.deleteMany({ analysis: analysisId });
    await Promise.all(docs.map((d) => removeFile(d.storedName)));
  },
};
