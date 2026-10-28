// End-to-end API tests.
//   npm test        -> throwaway in-memory MongoDB (mongodb-memory-server)
//   npm run test:atlas -> the real cluster from MONGODB_URI, but ONLY the separate
//                      "gitreason_test" database; the app's "gitreason" database is never touched.
// The uploads folder is always a temporary directory.
// GitHub and Gemini are replaced by a fetch stub; everything else is real:
// Express, middleware, Multer, Mongoose and MongoDB.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

const realFetch = globalThis.fetch;
const TEST_DB = "gitreason_test";
const LIVE = process.env.TEST_USE_MONGODB_URI === "1";
let geminiCalls = 0;

let mongod, httpServer, base;
let createApp, connectMongo, disconnectMongo, redactMongoError, userService, sessionService, analysisService;
let Analysis, Session, Upload;

async function startHttp() {
  httpServer = createApp().listen(0, "127.0.0.1");
  await once(httpServer, "listening");
  base = `http://127.0.0.1:${httpServer.address().port}`;
}

async function stopHttp() {
  await new Promise((resolve) => httpServer.close(resolve));
}

// Empties this run's own test database. Guarded so it can never run against
// any other database name. Indexes are kept.
async function clearTestDatabase() {
  assert.equal(mongoose.connection.name, TEST_DB, "refusing to clear a non-test database");
  await Promise.all([Analysis, Session, Upload, mongoose.model("User")].map((m) => m.deleteMany({})));
}

before(async () => {
  if (LIVE) {
    assert.ok(process.env.MONGODB_URI, "test:atlas needs MONGODB_URI");
  } else {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
  }
  process.env.MONGODB_DB = TEST_DB;
  process.env.SESSION_SECRET = "test-session-secret";
  process.env.GEMINI_API_KEY = "";
  // Fake OAuth App settings: GitHub itself is replaced by the fetch stub below.
  process.env.GITHUB_CLIENT_ID = "test-client-id";
  process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
  process.env.GITHUB_CALLBACK_URL = "http://localhost:4000/api/auth/github/callback";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";
  process.env.UPLOAD_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "gitreason-test-uploads-"));

  // Imported after env is set, because some modules read env at load time.
  ({ createApp } = await import("../../src/app.js"));
  ({ connectMongo, disconnectMongo, redactMongoError } = await import("../../src/config/database.js"));
  ({ userService } = await import("../../src/modules/users/user.service.js"));
  ({ sessionService } = await import("../../src/modules/auth/session.service.js"));
  ({ analysisService } = await import("../../src/modules/analyses/analysis.service.js"));
  ({ Analysis } = await import("../../src/modules/analyses/analysis.model.js"));
  ({ Session } = await import("../../src/modules/auth/session.model.js"));
  ({ Upload } = await import("../../src/modules/uploads/upload.model.js"));

  await connectMongo();
  if (LIVE) await clearTestDatabase();
  await startHttp();
  stubExternalApis();
});

after(async () => {
  globalThis.fetch = realFetch;
  await stopHttp();
  if (LIVE) await clearTestDatabase();
  await disconnectMongo();
  await mongod?.stop();
  await fs.rm(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

// ---------- helpers ----------

const GRAPH = {
  groups: [{ id: "api", label: "API Layer" }, { id: "data", label: "Data" }],
  nodes: [
    { id: "srv", label: "HTTP Server", detail: "Starts Express", path: "server.js", group: "api", kind: "file", role: "entry" },
    { id: "models", label: "Data Models", detail: "Defines schemas", path: "db/models.js", group: "data", kind: "file", role: "not-a-role" },
  ],
  edges: [{ from: "srv", to: "models", label: "queries" }],
};

function stubExternalApis() {
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith(base)) return realFetch(url, opts);
    if (u === "https://api.github.com/repos/acme/shop") {
      return Response.json({ full_name: "acme/shop", description: "demo", private: false, default_branch: "main", stargazers_count: 3, language: "JavaScript" });
    }
    if (u.startsWith("https://api.github.com/repos/acme/shop/git/trees/main")) {
      return Response.json({
        sha: "tree-sha-123",
        truncated: false,
        tree: [
          { path: "server.js", type: "blob", size: 120 },
          { path: "db", type: "tree" },
          { path: "db/models.js", type: "blob", size: 80 },
          { path: "node_modules/x/index.js", type: "blob", size: 1 },
        ],
      });
    }
    if (u === "https://api.github.com/repos/acme/shop/readme") return new Response("# Shop\nA tiny shop.");
    // OAuth: only the code "good-code" is accepted, and only with our client secret.
    if (u === "https://github.com/login/oauth/access_token") {
      const body = JSON.parse(opts.body);
      const ok = body.code === "good-code" && body.client_secret === "test-client-secret";
      return Response.json(ok ? { access_token: "gho_oauth_test_token" } : { error: "bad_verification_code" });
    }
    if (u === "https://api.github.com/user") {
      return Response.json({ id: 4242, login: "octo", avatar_url: "https://avatars.example/octo.png" });
    }
    if (u.includes("generativelanguage.googleapis.com")) {
      geminiCalls++;
      const body = JSON.parse(opts.body);
      const text = body.generationConfig ? JSON.stringify(GRAPH) : "Shop is an Express server backed by a data layer.";
      return Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
    }
    throw new Error(`Unexpected outbound fetch in test: ${u}`);
  };
}

let nextGithubId = 1000;
async function signIn(username, { geminiKey = "test-gemini-key" } = {}) {
  const user = await userService.upsertFromGitHub({ githubId: nextGithubId++, username, avatarUrl: null });
  if (geminiKey) await userService.setGeminiKey(user.id, geminiKey);
  const sessionId = await sessionService.create({ userId: user.id, token: "gho_test_token", ttlMs: 60 * 60 * 1000 });
  return { user, sessionId, cookie: `gr_session=${sessionId}` };
}

async function api(pathname, { cookie, method = "GET", json, form } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }
  const res = await realFetch(base + pathname, { method, headers, body });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, headers: res.headers, data, text };
}

function parseSse(text) {
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const event = block.match(/^event: (.*)$/m)?.[1];
      const data = block.match(/^data: (.*)$/m)?.[1];
      return { event, data: data ? JSON.parse(data) : null };
    });
}

async function runAnalysis(cookie) {
  const res = await realFetch(`${base}/api/analyze/stream?repo=acme/shop`, { headers: cookie ? { cookie } : {} });
  return parseSse(await res.text());
}

function fileForm(content, filename, description) {
  const form = new FormData();
  form.append("file", new Blob([content]), filename);
  if (description) form.append("description", description);
  return form;
}

async function seedAnalysis(userId, repo = "acme/other") {
  const [repoOwner, repoName] = repo.split("/");
  return analysisService.create({
    userId, repoOwner, repoName, defaultBranch: "main", treeSha: "t", language: "Go",
    fileTree: [{ path: "main.go", type: "file", size: 1 }],
    explanation: "x",
    graph: { groups: [], nodes: [{ id: "m", label: "Main", path: "main.go" }], edges: [] },
  });
}

// ---------- tests ----------

test("1. health reports the connected MongoDB test database", async () => {
  const { status, data } = await api("/health");
  assert.equal(status, 200);
  assert.equal(data.database, "ok");
  assert.equal(data.databaseName, TEST_DB);
});

test("4. unauthenticated requests to protected routes get 401", async () => {
  const id = "0123456789abcdef01234567";
  for (const [method, p] of [
    ["GET", "/api/user/history"],
    ["GET", `/api/user/history/${id}`],
    ["PATCH", `/api/user/history/${id}`],
    ["DELETE", `/api/user/history/${id}`],
    ["POST", `/api/user/history/${id}/uploads`],
    ["GET", `/api/user/history/${id}/uploads`],
    ["GET", `/api/user/uploads/${id}`],
    ["DELETE", `/api/user/uploads/${id}`],
    ["POST", "/api/user/gemini-key"],
  ]) {
    const { status } = await api(p, { method });
    assert.equal(status, 401, `${method} ${p}`);
  }
  assert.equal((await api("/api/user/history", { cookie: "gr_session=" + "f".repeat(64) })).status, 401, "unknown session");
  assert.equal((await api("/api/user/history", { cookie: "gr_session=%E0%A4%A" })).status, 401, "malformed cookie");
});

test("routes: every API route is registered exactly once, with authentication where expected", () => {
  const routes = [];
  (function walk(stack) {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          routes.push({ key: `${method.toUpperCase()} ${layer.route.path}`, auth: layer.route.stack[0].name === "requireAuth" });
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  })(createApp()._router.stack);

  const keys = routes.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length, "no duplicate registrations");
  const isPublic = (key) => /\/health|\/api\/(auth|repo|analyze)\/|\/api\/user\/me$|^GET \*$/.test(key);
  for (const r of routes) assert.equal(r.auth, !isPublic(r.key), `${r.key} ${r.auth ? "requires" : "does not require"} auth`);
  assert.deepEqual(keys.sort(), [
    "DELETE /api/user/gemini-key", "DELETE /api/user/history/:id", "DELETE /api/user/uploads/:uploadId",
    "GET *", "GET /api/analyze/stream", "GET /api/auth/github/callback", "GET /api/auth/github/start",
    "GET /api/auth/session", "GET /api/repo/check", "GET /api/repo/file", "GET /api/user/github-activity",
    "GET /api/user/history", "GET /api/user/history/:id", "GET /api/user/history/:id/uploads", "GET /api/user/me",
    "GET /api/user/repo-languages", "GET /api/user/uploads/:uploadId", "GET /health",
    "PATCH /api/user/history/:id", "POST /api/auth/logout", "POST /api/user/gemini-key", "POST /api/user/history/:id/uploads",
  ]);
});

test("OAuth: start redirects to GitHub; callback checks state, creates the user and a session, sets the cookie", async () => {
  const visit = (p) => realFetch(base + p, { redirect: "manual" });
  const newState = async () => {
    const res = await visit("/api/auth/github/start");
    assert.equal(res.status, 302);
    const to = new URL(res.headers.get("location"));
    assert.equal(to.origin + to.pathname, "https://github.com/login/oauth/authorize");
    assert.equal(to.searchParams.get("client_id"), "test-client-id");
    assert.equal(to.searchParams.get("redirect_uri"), "http://localhost:4000/api/auth/github/callback");
    assert.equal(to.searchParams.get("scope"), "repo");
    assert.match(to.searchParams.get("state"), /^[a-f0-9]{48}$/);
    return to.searchParams.get("state");
  };
  const signReason = (res) => new URL(res.headers.get("location")).searchParams.get("reason");

  // Forged or unknown state: rejected, nothing created.
  const forged = await visit("/api/auth/github/callback?code=good-code&state=forged");
  assert.equal(signReason(forged), "state_mismatch");
  assert.equal(forged.headers.get("set-cookie"), null);

  // User pressed Cancel on GitHub.
  assert.equal(signReason(await visit(`/api/auth/github/callback?error=access_denied&state=${await newState()}`)), "cancelled");

  // GitHub refuses the code.
  assert.equal(signReason(await visit(`/api/auth/github/callback?code=bad-code&state=${await newState()}`)), "token_exchange_failed");

  // Success.
  const state = await newState();
  const ok = await visit(`/api/auth/github/callback?code=good-code&state=${state}`);
  assert.equal(ok.status, 302);
  assert.equal(ok.headers.get("location"), "http://localhost:5173/dashboard?auth=success");
  const cookie = ok.headers.get("set-cookie");
  assert.match(cookie, /^gr_session=[a-f0-9]{64}; HttpOnly; Path=\/; Max-Age=86400; SameSite=Lax$/);
  const sessionId = cookie.match(/^gr_session=([a-f0-9]{64})/)[1];

  const user = await mongoose.model("User").findOne({ githubId: 4242 }).lean();
  assert.equal(user.username, "octo");
  const session = await Session.findOne({ user: user._id }).select("+githubTokenEnc").lean();
  assert.notEqual(session._id, sessionId, "database stores the hash, not the cookie value");
  assert.ok(!session.githubTokenEnc.includes("gho_oauth_test_token"), "GitHub token encrypted");

  const me = await api("/api/auth/session", { cookie: `gr_session=${sessionId}` });
  assert.deepEqual(me.data, { authenticated: true, user: { username: "octo", avatarUrl: "https://avatars.example/octo.png" } });

  // The same state cannot be used twice (replay).
  assert.equal(signReason(await visit(`/api/auth/github/callback?code=good-code&state=${state}`)), "state_mismatch");
  // Signing in again updates the same user instead of creating a duplicate.
  await visit(`/api/auth/github/callback?code=good-code&state=${await newState()}`);
  assert.equal(await mongoose.model("User").countDocuments({ githubId: 4242 }), 1);
});

let alice, bob, aliceAnalysisId;

test("2 + 10. analysis pipeline saves a real document that the owner can list and read", async () => {
  alice = await signIn("alice");
  bob = await signIn("bob");

  const events = await runAnalysis(alice.cookie);
  const done = events.find((e) => e.event === "done");
  assert.ok(done, `expected done event, got ${JSON.stringify(events)}`);
  assert.match(done.data.analysisId, /^[a-f0-9]{24}$/);
  assert.deepEqual(done.data.tree.map((e) => e.path), ["server.js", "db", "db/models.js"], "noise filtered");
  aliceAnalysisId = done.data.analysisId;

  const doc = await Analysis.findById(aliceAnalysisId).lean();
  assert.equal(doc.user.toString(), alice.user.id);
  assert.equal(doc.repoFullName, "acme/shop");
  assert.equal(doc.treeSha, "tree-sha-123");
  assert.equal(doc.graph.nodes[1].role, "default", "invalid LLM role normalized before save");

  const list = await api("/api/user/history", { cookie: alice.cookie });
  assert.equal(list.status, 200);
  assert.equal(list.data.total, 1);
  assert.deepEqual(
    { id: list.data.history[0].id, fileCount: list.data.history[0].fileCount, nodeCount: list.data.history[0].nodeCount, edgeCount: list.data.history[0].edgeCount },
    { id: aliceAnalysisId, fileCount: 3, nodeCount: 2, edgeCount: 1 }
  );

  const one = await api(`/api/user/history/${aliceAnalysisId}`, { cookie: alice.cookie });
  assert.equal(one.status, 200);
  assert.equal(one.data.analysis.explanation, "Shop is an Express server backed by a data layer.");
  assert.equal(one.data.analysis.defaultBranch, "main");
});

test("free tier: re-analyzing an unchanged repo reuses the saved analysis (no Gemini call, no new document)", async () => {
  const callsBefore = geminiCalls;
  const docsBefore = await Analysis.countDocuments();
  const done = (await runAnalysis(alice.cookie)).find((e) => e.event === "done");
  assert.equal(done.data.reused, true);
  assert.equal(done.data.analysisId, aliceAnalysisId);
  assert.equal(done.data.graph.nodes.length, 2);
  assert.equal(geminiCalls, callsBefore);
  assert.equal(await Analysis.countDocuments(), docsBefore);
});

test("10b. anonymous analysis still works and is not persisted", async () => {
  process.env.GEMINI_API_KEY = "server-key";
  const before = await Analysis.countDocuments();
  const events = await runAnalysis(null);
  process.env.GEMINI_API_KEY = "";
  const done = events.find((e) => e.event === "done");
  assert.ok(done);
  assert.equal(done.data.analysisId, null);
  assert.equal(await Analysis.countDocuments(), before);
});

test("5. user B cannot read, list, update or delete user A's analysis", async () => {
  assert.equal((await api(`/api/user/history/${aliceAnalysisId}`, { cookie: bob.cookie })).status, 404);
  assert.equal((await api(`/api/user/history/${aliceAnalysisId}`, { cookie: bob.cookie, method: "PATCH", json: { title: "mine" } })).status, 404);
  assert.equal((await api(`/api/user/history/${aliceAnalysisId}`, { cookie: bob.cookie, method: "DELETE" })).status, 404);
  assert.equal((await api(`/api/user/history/${aliceAnalysisId}/uploads`, { cookie: bob.cookie })).status, 404);
  assert.equal((await api("/api/user/history", { cookie: bob.cookie })).data.total, 0);
  assert.ok(await Analysis.exists({ _id: aliceAnalysisId }), "still there");
});

test("9. invalid ObjectIds get 400, missing records get 404", async () => {
  assert.equal((await api("/api/user/history/not-an-id", { cookie: alice.cookie })).status, 400);
  assert.equal((await api("/api/user/uploads/123", { cookie: alice.cookie })).status, 400);
  assert.equal((await api("/api/user/history/0123456789abcdef01234567", { cookie: alice.cookie })).status, 404);
  assert.equal((await api("/api/user/uploads/0123456789abcdef01234567", { cookie: alice.cookie })).status, 404);
});

test("update: owner can set title/notes; schema validation is enforced", async () => {
  const ok = await api(`/api/user/history/${aliceAnalysisId}`, {
    cookie: alice.cookie, method: "PATCH", json: { title: "  Shop backend  ", notes: "Check the data layer." },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.analysis.title, "Shop backend", "trimmed by schema");
  assert.equal((await Analysis.findById(aliceAnalysisId).lean()).notes, "Check the data layer.");

  const tooLong = await api(`/api/user/history/${aliceAnalysisId}`, { cookie: alice.cookie, method: "PATCH", json: { title: "x".repeat(121) } });
  assert.equal(tooLong.status, 400);
  const unknownField = await api(`/api/user/history/${aliceAnalysisId}`, { cookie: alice.cookie, method: "PATCH", json: { user: bob.user.id } });
  assert.equal(unknownField.status, 400, "cannot reassign ownership through the body");
  const badJson = await realFetch(`${base}/api/user/history/${aliceAnalysisId}`, {
    method: "PATCH", headers: { cookie: alice.cookie, "Content-Type": "application/json" }, body: "{oops",
  });
  assert.equal(badJson.status, 400);
});

test("pagination: page/limit slice the history and reject bad values", async () => {
  const carol = await signIn("carol");
  for (const repo of ["c/one", "c/two", "c/three"]) await seedAnalysis(carol.user.id, repo);

  const p1 = await api("/api/user/history?page=1&limit=2", { cookie: carol.cookie });
  assert.equal(p1.status, 200);
  assert.deepEqual([p1.data.history.length, p1.data.total], [2, 3]);
  assert.equal(p1.data.history[0].repoFullName, "c/three", "newest first");
  const p2 = await api("/api/user/history?page=2&limit=2", { cookie: carol.cookie });
  assert.deepEqual(p2.data.history.map((h) => h.repoFullName), ["c/one"]);

  assert.equal((await api("/api/user/history?limit=0", { cookie: carol.cookie })).status, 400);
  assert.equal((await api("/api/user/history?limit=500", { cookie: carol.cookie })).status, 400);
  assert.equal((await api("/api/user/history?page=abc", { cookie: carol.cookie })).status, 400);
});

let uploadId;

test("6. permitted upload is stored on disk with metadata in MongoDB", async () => {
  const content = "# Architecture notes\n\nOrders flow through the API layer.\n";
  const res = await api(`/api/user/history/${aliceAnalysisId}/uploads`, {
    cookie: alice.cookie, method: "POST", form: fileForm(content, "../../etc/notes.md", "Design notes"),
  });
  assert.equal(res.status, 201, res.text);
  uploadId = res.data.upload.id;
  assert.equal(res.data.upload.originalName, "notes.md", "directory part stripped");
  assert.equal(res.data.upload.mimeType, "text/markdown");

  const doc = await Upload.findById(uploadId).lean();
  assert.equal(doc.owner.toString(), alice.user.id);
  assert.equal(doc.analysis.toString(), aliceAnalysisId);
  assert.match(doc.storedName, /^[a-f0-9]{32}\.md$/);
  assert.equal(await fs.readFile(path.join(process.env.UPLOAD_DIR, doc.storedName), "utf8"), content);

  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
  const pngRes = await api(`/api/user/history/${aliceAnalysisId}/uploads`, { cookie: alice.cookie, method: "POST", form: fileForm(png, "diagram.PNG") });
  assert.equal(pngRes.status, 201, pngRes.text);

  const list = await api(`/api/user/history/${aliceAnalysisId}/uploads`, { cookie: alice.cookie });
  assert.equal(list.data.uploads.length, 2);
});

test("7. oversized, unsupported, mismatched, empty and missing uploads are rejected", async () => {
  const url = `/api/user/history/${aliceAnalysisId}/uploads`;
  const post = (form) => api(url, { cookie: alice.cookie, method: "POST", form });
  const before = await Upload.countDocuments();
  const filesBefore = (await fs.readdir(process.env.UPLOAD_DIR)).length;

  assert.equal((await post(fileForm(Buffer.alloc(5 * 1024 * 1024 + 1, 97), "big.txt"))).status, 413);
  assert.equal((await post(fileForm("MZ...", "tool.exe"))).status, 415);
  assert.equal((await post(fileForm("<script>alert(1)</script>", "page.html"))).status, 415);
  assert.equal((await post(fileForm("just text, not a pdf", "fake.pdf"))).status, 415, "magic bytes checked");
  assert.equal((await post(fileForm(Buffer.from([0x68, 0x00, 0x69]), "binary.txt"))).status, 415, "NUL byte in text");
  assert.equal((await post(fileForm("", "empty.md"))).status, 400);
  assert.equal((await post(new FormData())).status, 400, "no file field");
  assert.equal((await api(url, { cookie: alice.cookie, method: "POST", json: { file: "nope" } })).status, 400, "not multipart");

  const descTooLong = fileForm("ok", "a.txt", "d".repeat(501));
  assert.equal((await post(descTooLong)).status, 400, "schema maxlength on description");

  assert.equal(await Upload.countDocuments(), before, "no metadata written");
  assert.equal((await fs.readdir(process.env.UPLOAD_DIR)).length, filesBefore, "no orphan files written");
});

test("free tier: an analysis accepts at most 20 documents", async () => {
  const extraId = await seedAnalysis(alice.user.id, "acme/quota");
  const url = `/api/user/history/${extraId}/uploads`;
  for (let i = 0; i < 20; i++) {
    const r = await api(url, { cookie: alice.cookie, method: "POST", form: fileForm(`note ${i}`, `n${i}.txt`) });
    assert.equal(r.status, 201, r.text);
  }
  const over = await api(url, { cookie: alice.cookie, method: "POST", form: fileForm("one too many", "n20.txt") });
  assert.equal(over.status, 409);
  assert.equal((await api(url, { cookie: alice.cookie })).data.uploads.length, 20);
  assert.equal((await api(`/api/user/history/${extraId}`, { cookie: alice.cookie, method: "DELETE" })).status, 204);
});

test("8. only the owner can download or delete an upload", async () => {
  assert.equal((await api(`/api/user/uploads/${uploadId}`)).status, 401);
  assert.equal((await api(`/api/user/uploads/${uploadId}`, { cookie: bob.cookie })).status, 404);
  assert.equal((await api(`/api/user/uploads/${uploadId}`, { cookie: bob.cookie, method: "DELETE" })).status, 404);
  assert.equal((await api(`/api/user/history/${aliceAnalysisId}/uploads`, { cookie: bob.cookie, method: "POST", form: fileForm("x", "x.txt") })).status, 404);

  const dl = await api(`/api/user/uploads/${uploadId}`, { cookie: alice.cookie });
  assert.equal(dl.status, 200);
  assert.match(dl.text, /^# Architecture notes/);
  assert.match(dl.headers.get("content-disposition"), /^attachment; filename="notes.md"/);
  assert.equal(dl.headers.get("x-content-type-options"), "nosniff");
});

test("8b. owner deletes an upload; missing files and storage/database failures leave no orphans", async (t) => {
  const url = `/api/user/history/${aliceAnalysisId}/uploads`;
  const post = (form) => api(url, { cookie: alice.cookie, method: "POST", form });
  const filePathOf = async (id) => path.join(process.env.UPLOAD_DIR, (await Upload.findById(id).lean()).storedName);
  const generic = { status: "error", message: "Something went wrong. Try again." };

  assert.equal((await api("/api/user/history/not-an-id/uploads", { cookie: alice.cookie, method: "POST", form: fileForm("x", "x.txt") })).status, 400);

  // Owner delete: metadata and bytes both go; later requests see 404.
  const created = await post(fileForm("temporary", "temp.txt"));
  assert.equal(created.status, 201, created.text);
  const id = created.data.upload.id;
  const file = await filePathOf(id);
  assert.equal((await api(`/api/user/uploads/${id}`, { cookie: alice.cookie, method: "DELETE" })).status, 204);
  assert.equal(await Upload.exists({ _id: id }), null);
  await assert.rejects(fs.access(file), "file removed from disk");
  assert.equal((await api(`/api/user/uploads/${id}`, { cookie: alice.cookie })).status, 404);
  assert.ok(!(await api(url, { cookie: alice.cookie })).data.uploads.some((u) => u.id === id), "gone from the list");

  // Bytes lost (e.g. ephemeral disk wiped): download is a clean 404 and delete still removes the metadata.
  const lost = await post(fileForm("lost", "lost.txt"));
  await fs.rm(await filePathOf(lost.data.upload.id));
  assert.equal((await api(`/api/user/uploads/${lost.data.upload.id}`, { cookie: alice.cookie })).status, 404);
  assert.equal((await api(`/api/user/uploads/${lost.data.upload.id}`, { cookie: alice.cookie, method: "DELETE" })).status, 204);
  assert.equal(await Upload.exists({ _id: lost.data.upload.id }), null);

  const countBefore = await Upload.countDocuments();
  const filesBefore = (await fs.readdir(process.env.UPLOAD_DIR)).length;

  // Storage failure: the upload folder cannot be created -> 500, no metadata written.
  const realDir = process.env.UPLOAD_DIR;
  const blocker = path.join(realDir, "not-a-directory");
  await fs.writeFile(blocker, "");
  process.env.UPLOAD_DIR = path.join(blocker, "uploads");
  try {
    const res = await post(fileForm("x", "x.txt"));
    assert.equal(res.status, 500);
    assert.deepEqual(res.data, generic);
  } finally {
    process.env.UPLOAD_DIR = realDir;
    await fs.rm(blocker);
  }

  // Database failure after the bytes are written -> 500 and the written file is removed again.
  const create = t.mock.method(Upload, "create", async () => {
    throw new Error("simulated database write failure");
  });
  try {
    const res = await post(fileForm("x", "x.txt"));
    assert.equal(res.status, 500);
    assert.deepEqual(res.data, generic);
  } finally {
    create.mock.restore();
  }

  assert.equal(await Upload.countDocuments(), countBefore, "no metadata written");
  assert.equal((await fs.readdir(process.env.UPLOAD_DIR)).length, filesBefore, "no orphan files written");
});

test("2 + 14. with MongoDB down: /health says so, requests fail generically, nothing leaks", async () => {
  await disconnectMongo();
  const health = await api("/health");
  assert.equal(health.status, 503);
  assert.equal(health.data.database, "disconnected");

  const res = await api(`/api/user/history/${aliceAnalysisId}`, { cookie: alice.cookie }); // waits for Mongoose's 10 s buffer timeout
  assert.equal(res.status, 500);
  assert.deepEqual(res.data, { status: "error", message: "Something went wrong. Try again." });
  assert.doesNotMatch(res.text, /mongodb|stack|at \w+ \(|gr_session|gho_/i);

  const msg = redactMongoError(new Error("querySrv ENOTFOUND mongodb+srv://user:hunter2@cluster0.example.mongodb.net/?x=1"));
  assert.doesNotMatch(msg, /hunter2|user:/);
  await connectMongo();
});

test("3 + 13. analyses and uploads survive a server + database reconnect", async () => {
  await stopHttp();
  await disconnectMongo();
  await connectMongo();
  await startHttp();

  const one = await api(`/api/user/history/${aliceAnalysisId}`, { cookie: alice.cookie });
  assert.equal(one.status, 200, "session and analysis both persisted");
  assert.equal(one.data.analysis.title, "Shop backend");
  assert.equal((await api(`/api/user/uploads/${uploadId}`, { cookie: alice.cookie })).status, 200);
});

test("delete: removing an analysis also removes its uploads (metadata and bytes)", async () => {
  const storedNames = (await Upload.find({ analysis: aliceAnalysisId }).lean()).map((u) => u.storedName);
  assert.equal(storedNames.length, 2);

  const del = await api(`/api/user/history/${aliceAnalysisId}`, { cookie: alice.cookie, method: "DELETE" });
  assert.equal(del.status, 204);
  assert.equal(await Analysis.exists({ _id: aliceAnalysisId }), null);
  assert.equal(await Upload.countDocuments({ analysis: aliceAnalysisId }), 0);
  for (const name of storedNames) {
    await assert.rejects(fs.access(path.join(process.env.UPLOAD_DIR, name)), "file removed from disk");
  }
  assert.equal((await api(`/api/user/history/${aliceAnalysisId}`, { cookie: alice.cookie, method: "DELETE" })).status, 404);
});

test("sessions: stored hashed, expire, and logout invalidates them", async () => {
  const dave = await signIn("dave");
  assert.equal(await Session.findById(dave.sessionId), null, "raw cookie value is not the database key");
  const stored = await Session.findOne({ user: dave.user.id }).select("+githubTokenEnc").lean();
  assert.ok(stored.githubTokenEnc && !stored.githubTokenEnc.includes("gho_test_token"), "token encrypted at rest");

  const expiredId = await sessionService.create({ userId: dave.user.id, token: "t", ttlMs: -1000 });
  assert.equal((await api("/api/user/history", { cookie: `gr_session=${expiredId}` })).status, 401);

  assert.equal((await api("/api/user/history", { cookie: dave.cookie })).status, 200);
  const out = await api("/api/auth/logout", { cookie: dave.cookie, method: "POST" });
  assert.equal(out.status, 200);
  assert.match(out.headers.get("set-cookie"), /gr_session=;.*Max-Age=0/);
  assert.equal((await api("/api/user/history", { cookie: dave.cookie })).status, 401);
});

test("sessions: a session that can no longer be decrypted (e.g. SESSION_SECRET changed) is treated as signed out", async () => {
  const frank = await signIn("frank");
  const hash = crypto.createHash("sha256").update(frank.sessionId).digest("hex");
  await Session.updateOne({ _id: hash }, { $set: { githubTokenEnc: Buffer.from("not encrypted with this key").toString("base64") } });
  assert.equal((await api("/api/user/history", { cookie: frank.cookie })).status, 401);
  assert.deepEqual((await api("/api/auth/session", { cookie: frank.cookie })).data, { authenticated: false, user: null });
});

test("signed-in user without a Gemini key is told to add one", async () => {
  const erin = await signIn("erin", { geminiKey: null });
  const events = await runAnalysis(erin.cookie);
  assert.deepEqual(events.at(-1), { event: "error", data: { message: "gemini_key_required" } });
});
