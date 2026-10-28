import mongoose from "mongoose";

// Collection: users. One document per GitHub account.
// Identity comes from GitHub OAuth, so there is no password field.
// Referenced (by ObjectId) from sessions.user, analyses.user and uploads.owner.
const userSchema = new mongoose.Schema(
  {
    // GitHub's numeric account id. Unique index: signing in again updates the
    // same document (upsert) instead of creating a duplicate user.
    githubId: { type: Number, required: true, unique: true },
    username: { type: String, required: true, trim: true, maxlength: 39 },
    avatarUrl: { type: String, maxlength: 500 },
    // The user's own Gemini API key, AES-256-GCM encrypted. select:false keeps it
    // out of every query result unless code asks for it with .select("+geminiKeyEnc").
    geminiKeyEnc: { type: String, select: false },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
