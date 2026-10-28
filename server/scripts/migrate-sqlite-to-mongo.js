// One-off migration: copies users and analysis history from the old local
// SQLite file (server/data/gitreason.db, used before the MongoDB move) into
// the MongoDB database named in MONGODB_URI.
//
//   node --env-file-if-exists=.env scripts/migrate-sqlite-to-mongo.js [path-to-db]
//
// - Reads SQLite read-only; never modifies or deletes it.
// - Idempotent: users are upserted by githubId, and an analysis is skipped if
//   the same user already has one for the same repo with the same createdAt.
// - Sessions are not copied (users simply sign in again).
// - Gemini keys are copied still encrypted; this only works when SESSION_SECRET
//   is the same one the SQLite data was written with.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { connectMongo, disconnectMongo } from "../src/config/database.js";
import { User } from "../src/modules/users/user.model.js";
import { Analysis } from "../src/modules/analyses/analysis.model.js";
import { normalizeGraph } from "../src/modules/analyses/analysis.ai.js";

const defaultPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "gitreason.db");
const sqlite = new DatabaseSync(process.argv[2] || defaultPath, { readOnly: true });
const conn = await connectMongo();
console.log(`Migrating into MongoDB database "${conn.name}"`);

const userIdMap = new Map(); // SQLite users.id -> MongoDB ObjectId
for (const row of sqlite.prepare("SELECT * FROM users").all()) {
  const set = { username: row.username, avatarUrl: row.avatar_url ?? undefined };
  if (row.gemini_key_enc) set.geminiKeyEnc = row.gemini_key_enc;
  const user = await User.findOneAndUpdate(
    { githubId: row.github_id },
    { $set: set, $setOnInsert: { createdAt: new Date(row.created_at) } },
    { upsert: true, returnDocument: "after", runValidators: true, timestamps: false }
  );
  userIdMap.set(row.id, user._id);
}

let inserted = 0;
let skipped = 0;
for (const row of sqlite.prepare("SELECT * FROM analyses WHERE status = 'complete' ORDER BY created_at").all()) {
  const user = userIdMap.get(row.user_id);
  const createdAt = new Date(row.created_at);
  if (!user || !row.graph_json || (await Analysis.exists({ user, repoFullName: row.repo_full_name, createdAt }))) {
    skipped++;
    continue;
  }
  const [repoOwner, repoName] = row.repo_full_name.split("/");
  const graph = JSON.parse(row.graph_json);
  const doc = new Analysis({
    user,
    repoOwner,
    repoName,
    repoFullName: row.repo_full_name,
    language: row.language ?? null,
    explanation: row.explanation,
    fileTree: JSON.parse(row.file_tree_json),
    graph: normalizeGraph({ groups: graph.groups, nodes: graph.nodes || [], edges: graph.edges || [] }),
    createdAt,
    updatedAt: createdAt,
  });
  await doc.save({ timestamps: false });
  inserted++;
}

console.log(`Users: ${userIdMap.size} upserted. Analyses: ${inserted} inserted, ${skipped} skipped.`);
await disconnectMongo();
