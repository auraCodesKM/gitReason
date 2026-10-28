import mongoose from "mongoose";

const { Schema } = mongoose;

// Collection: uploads. Metadata for a document a user attached to one of their
// analyses (ADR, design doc, diagram). The file bytes live on disk in
// UPLOAD_DIR under `storedName`; MongoDB holds only what is needed to list,
// authorize and serve the file. This keeps Atlas's 512 MB for application data.
const uploadSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true }, // who may read/delete it
    analysis: { type: Schema.Types.ObjectId, ref: "Analysis", required: true }, // what it is attached to
    // The name the user's computer gave the file. Display only - it is never used to build a path.
    originalName: { type: String, required: true, maxlength: 255 },
    // Server-generated name on disk: 32 random hex characters + allowlisted extension.
    // The regex makes it impossible to store "../" or "/" here, and the unique index rules out collisions.
    storedName: { type: String, required: true, unique: true, match: /^[a-f0-9]{32}\.(pdf|png|jpg|md|txt)$/ },
    // Decided by the server from the validated file content, not taken from the browser.
    mimeType: { type: String, required: true, enum: ["application/pdf", "image/png", "image/jpeg", "text/markdown", "text/plain"] },
    size: { type: Number, required: true, min: 1 }, // bytes
    sha256: { type: String, required: true }, // content fingerprint
    description: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

// List an analysis's documents newest first.
uploadSchema.index({ analysis: 1, createdAt: -1 });
// Look up a user's documents.
uploadSchema.index({ owner: 1 });

export const Upload = mongoose.model("Upload", uploadSchema);
