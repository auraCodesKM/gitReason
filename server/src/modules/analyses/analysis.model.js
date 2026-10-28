import mongoose from "mongoose";

const { Schema } = mongoose;

// Size caps. A 20k-entry tree is roughly 1-2 MB; most analyses are a few KB.
// They keep single documents far below MongoDB's 16 MB limit and stop one
// huge repository from eating a noticeable share of Atlas Free's 512 MB.
export const MAX_TREE_ENTRIES = 20000;
export const MAX_GRAPH_NODES = 200;
export const MAX_GRAPH_EDGES = 1000;
export const MAX_GRAPH_GROUPS = 50;

const maxItems = (max, name) => ({ validator: (v) => v.length <= max, message: `${name} is limited to ${max} entries` });

// Graph pieces are embedded: they are always read together with their analysis
// and never queried on their own. `id: false` stops Mongoose adding its own `id`
// virtual, because these sub-documents carry the LLM's own string ids.
const sub = { _id: false, id: false };

const treeEntrySchema = new Schema(
  {
    path: { type: String, required: true },
    type: { type: String, enum: ["file", "dir"], required: true },
    size: { type: Number, min: 0, default: 0 },
  },
  sub
);

const groupSchema = new Schema({ id: { type: String, required: true }, label: String }, sub);

const nodeSchema = new Schema(
  {
    id: { type: String, required: true },
    label: String,
    detail: String,
    path: { type: String, required: true },
    group: { type: String, default: null },
    kind: { type: String, enum: ["file", "dir"], default: "file" },
    role: { type: String, enum: ["entry", "service", "store", "default"], default: "default" },
  },
  sub
);

const edgeSchema = new Schema(
  { from: { type: String, required: true }, to: { type: String, required: true }, label: String },
  sub
);

const graphSchema = new Schema(
  {
    groups: { type: [groupSchema], validate: maxItems(MAX_GRAPH_GROUPS, "graph.groups") },
    nodes: {
      type: [nodeSchema],
      validate: { validator: (v) => v.length > 0 && v.length <= MAX_GRAPH_NODES, message: `graph must have 1-${MAX_GRAPH_NODES} nodes` },
    },
    edges: { type: [edgeSchema], validate: maxItems(MAX_GRAPH_EDGES, "graph.edges") },
  },
  sub
);

// Collection: analyses. One saved result of analyzing a repository, owned by
// one user. Uploaded documents (uploads.analysis) reference it.
const analysisSchema = new Schema(
  {
    // Owner. Every read/update/delete filters on this field (authorization).
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    repoOwner: { type: String, required: true },
    repoName: { type: String, required: true },
    repoFullName: { type: String, required: true },
    defaultBranch: { type: String }, // absent only on analyses migrated from the old SQLite store
    treeSha: { type: String }, // git tree SHA the analysis was built from
    language: { type: String, default: null },
    status: { type: String, default: "complete" },
    title: { type: String, trim: true, maxlength: 120 },
    notes: { type: String, trim: true, maxlength: 5000 },
    explanation: { type: String, maxlength: 20000 },
    fileTree: { type: [treeEntrySchema], validate: maxItems(MAX_TREE_ENTRIES, "fileTree") },
    graph: { type: graphSchema, required: true },
  },
  { timestamps: true }
);

// Compound index for the history list: "this user's analyses, newest first".
// MongoDB can answer the filter and the sort from the index without scanning
// other users' documents; _id breaks ties between equal timestamps.
analysisSchema.index({ user: 1, createdAt: -1, _id: -1 });

export const Analysis = mongoose.model("Analysis", analysisSchema);
