// User accounts (one per GitHub account) and each user's encrypted Gemini key.
//
// Called by: auth.controller.js (sign-in upsert), user.controller.js,
// analyze.controller.js (the user's Gemini key).
// MongoDB: users collection (User model).
import { User } from "./user.model.js";
import { encrypt, decrypt } from "../../utils/encryption.js";

// Shape returned to the rest of the app and the API: string id, and only a
// yes/no for the Gemini key - the encrypted value never leaves this file.
function toUser(doc) {
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    githubId: doc.githubId,
    username: doc.username,
    avatarUrl: doc.avatarUrl ?? null,
    hasGeminiKey: Boolean(doc.geminiKeyEnc),
  };
}

export const userService = {
  /**
   * Creates the user on first sign-in, or refreshes username/avatar on later ones.
   * Upsert on the unique githubId index, so one GitHub account = one document.
   */
  async upsertFromGitHub({ githubId, username, avatarUrl }) {
    const doc = await User.findOneAndUpdate(
      { githubId },
      { $set: { username, avatarUrl } },
      { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true }
    );
    return toUser(doc);
  },

  async findById(id) {
    // +geminiKeyEnc only so toUser can report hasGeminiKey; the value itself is dropped.
    return toUser(await User.findById(id).select("+geminiKeyEnc").lean());
  },

  async setGeminiKey(userId, plaintextKey) {
    await User.updateOne({ _id: userId }, { $set: { geminiKeyEnc: encrypt(plaintextKey) } });
  },

  async clearGeminiKey(userId) {
    await User.updateOne({ _id: userId }, { $unset: { geminiKeyEnc: 1 } });
  },

  /** @returns {Promise<string|null>} the decrypted key, for calling Gemini on the user's behalf */
  async getGeminiKey(userId) {
    const doc = await User.findById(userId).select("+geminiKeyEnc").lean();
    return doc?.geminiKeyEnc ? decrypt(doc.geminiKeyEnc) : null;
  },
};
