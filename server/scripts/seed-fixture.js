// Dev-only helper for testing the analysis UI without burning Gemini calls.
// Not routed, not imported anywhere in the app — run directly:
//
//   node --env-file-if-exists=.env scripts/seed-fixture.js <repoFullName> <path-to-json>
//
// <path-to-json> must be {tree, explanation, graph} — e.g. captured from a
// real /api/analyze/stream `done` event. Requires at least one signed-in
// user already in the DB (sign in once via GitHub OAuth first); seeds
// against whichever user row was created most recently.
import fs from "node:fs";
import { analysesRepo } from "../db/index.js";
import { db } from "../db/client.js";

const [repoFullName, jsonPath] = process.argv.slice(2);
if (!repoFullName || !jsonPath) {
  console.error("Usage: node scripts/seed-fixture.js <owner/repo> <path-to-json>");
  process.exit(1);
}

const fixture = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const userRow = await db.prepare("SELECT id FROM users ORDER BY id DESC LIMIT 1").get();
if (!userRow) {
  console.error("No signed-in user found — sign in once via GitHub OAuth first.");
  process.exit(1);
}

const analysisId = await analysesRepo.create({
  userId: userRow.id,
  repoFullName,
  status: "complete",
  fileTree: fixture.tree,
  explanation: fixture.explanation,
  graph: fixture.graph,
});

console.log(JSON.stringify({ analysisId, url: `/analyze?repo=${encodeURIComponent(repoFullName)}&cached=${analysisId}` }));
