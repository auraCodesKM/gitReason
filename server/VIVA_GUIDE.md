# GitReason backend: viva learning map

Learn one module at a time, in this order. Each section says what the module is for, how a request flows through it, and one likely question.
File paths are relative to `server/src/`. Reference details (tree, status codes, glossary) are in `BACKEND_GUIDE.md`.

## The big picture

```text
                 ┌──────────── Browser (React, Vite) ────────────┐
                 │ fetch(..., { credentials: "include" })         │
                 └──────────────────────┬─────────────────────────┘
                                        │ HTTP + gr_session cookie
┌───────────────────────────────────────▼──────────────────────────────────────┐
│ Express app (app.js)                                                         │
│  cors → express.json → routers → 404 → errorHandler                          │
│                                                                              │
│  routes ──► middleware (requireAuth, validateObjectId, requireOwnedAnalysis, │
│             enforceUploadQuota, receiveDocument/Multer)                      │
│        ──► controllers ──► services ──► Mongoose models ──► MongoDB Atlas    │
│                               │                                              │
│                               ├──► integrations: GitHub API, Gemini API      │
│                               └──► disk: UPLOAD_DIR (uploaded file bytes)    │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Route → controller → service → model

| Route | Middleware (in order) | Controller | Service call | Model / MongoDB operation |
|---|---|---|---|---|
| `GET /api/auth/github/start` | — | `handleAuthStart` | `createOAuthState` | — (memory) |
| `GET /api/auth/github/callback` | — | `handleAuthCallback` | `userService.upsertFromGitHub`, `sessionService.create` | `User.findOneAndUpdate(upsert)`, `Session.create` |
| `GET /api/auth/session` | — | `handleAuthSession` | `getSessionFromRequest`, `userService.findById` | `Session.findOne`, `User.findById` |
| `POST /api/auth/logout` | — | `handleAuthLogout` | `sessionService.deleteById` | `Session.deleteOne` |
| `GET /api/user/me` | — | `handleUserMe` | as `/api/auth/session` | `Session.findOne`, `User.findById` |
| `POST /api/user/gemini-key` | requireAuth | `handleSetGeminiKey` | `userService.setGeminiKey` | `User.updateOne($set)` |
| `DELETE /api/user/gemini-key` | requireAuth | `handleClearGeminiKey` | `userService.clearGeminiKey` | `User.updateOne($unset)` |
| `GET /api/user/github-activity` | requireAuth | `handleUserGithubActivity` | `userService.findById` | `User.findById` (+ GitHub GraphQL) |
| `GET /api/user/repo-languages` | requireAuth | `handleRepoLanguages` | — | — (GitHub API) |
| `GET /api/repo/check` | — | `handleRepoCheck` | — | `Session.findOne` (optional) |
| `GET /api/repo/file` | — | `handleFileContent` | — | `Session.findOne` (optional) |
| `GET /api/analyze/stream` | — | `handleAnalyzeStream` | `analysisService.findLatestForTree` / `.create` | `Analysis.findOne` / `Analysis.create` |
| `GET /api/user/history` | requireAuth | `handleUserHistory` | `analysisService.listByUser` | `Analysis.aggregate` + `countDocuments` |
| `GET /api/user/history/:id` | requireAuth, validateObjectId | `handleUserHistoryItem` | `analysisService.findOwned` | `Analysis.findOne({_id, user})` |
| `PATCH /api/user/history/:id` | requireAuth, validateObjectId | `handleUpdateHistoryItem` | `analysisService.updateOwned` | `Analysis.findOneAndUpdate({_id, user})` |
| `DELETE /api/user/history/:id` | requireAuth, validateObjectId | `handleDeleteHistoryItem` | `analysisService.deleteOwned` | `Analysis.findOneAndDelete` + `Upload.deleteMany` |
| `POST /api/user/history/:id/uploads` | requireAuth, validateObjectId, requireOwnedAnalysis, enforceUploadQuota, receiveDocument | `handleCreateUpload` | `uploadService.create` | `Upload.create` (+ file write) |
| `GET /api/user/history/:id/uploads` | requireAuth, validateObjectId, requireOwnedAnalysis | `handleListUploads` | `uploadService.listForAnalysis` | `Upload.find({analysis, owner})` |
| `GET /api/user/uploads/:uploadId` | requireAuth, validateObjectId | `handleDownloadUpload` | `uploadService.findOwned` | `Upload.findOne({_id, owner})` (+ file read) |
| `DELETE /api/user/uploads/:uploadId` | requireAuth, validateObjectId | `handleDeleteUpload` | `uploadService.deleteOwned` | `Upload.findOneAndDelete({_id, owner})` (+ file delete) |
| `GET /health` | — | inline in `app.js` | `mongoStatus` | — (connection state) |

---

## 1. Startup and configuration: `server.js`, `config/env.js`, `config/database.js`

1. **Problem it solves.** The API must not run half-configured: no encryption secret means sessions can't be protected, and no database means nothing can be saved.
2. **Why separate.** All environment variables are read in one file (`env.js`), and the single MongoDB connection lives in one file (`database.js`). Every other file imports from these.
3. **Flow.** `missingRequiredEnv()` → `connectMongo()` → `createApp().listen()` → on SIGINT/SIGTERM `disconnectMongo()`.
4. **Functions.**
   - `missingRequiredEnv`: lists absent required variables.
   - `databaseName`: `MONGODB_DB` or `gitreason`.
   - `connectMongo`: connect, then `Model.init()` to build the indexes.
   - `redactMongoError`: strips the connection string from logs.
   - `mongoStatus`: used by `/health`.
5. **Data in/out.** Reads environment variables; returns a Mongoose connection.
6. **Security.** The password inside `MONGODB_URI` is never logged (tested). The URI is never exposed to the frontend.
7. **MongoDB.** Connect with `maxPoolSize: 10` and a 10 s server-selection timeout; create indexes.
8. **Q: What happens if Atlas is unreachable at startup?** `connectMongo` throws after 10 s. `server.js` logs "Could not connect to MongoDB" with the URI redacted and exits with code 1. There is no fallback database, so the app never silently loses data.

## 2. Authentication: `modules/auth/*`, `middleware/require-auth.js`

1. **Problem.** Know which user is making each request, without passwords.
2. **Why separate.**
   - OAuth (`auth.controller.js`, `auth.service.js`) happens once per sign-in.
   - Sessions (`session.service.js`, `session.cookie.js`, `session.model.js`) are checked on every request.
3. **Flow.**
   - Sign-in: `handleAuthStart` (random `state`, redirect to GitHub) → user approves → `handleAuthCallback`:
     - `consumeOAuthState` (known, unused, under 10 min);
     - `exchangeCodeForToken`;
     - `fetchGitHubUser`;
     - `upsertFromGitHub`;
     - `sessionService.create`;
     - `setSessionCookie`;
     - redirect to the dashboard.
   - Later requests: `requireAuth` → `getSessionFromRequest` → `sessionService.findById` → `req.auth`.
4. **Functions.**
   - `sessionService.create` returns the raw id for the cookie and stores only `sha256(id)`.
   - `findById` rejects malformed, expired and undecryptable sessions.
   - `deleteById` is the logout.
   - `parseCookies` ignores malformed cookies.
5. **Data in/out.** In: `code` and `state` from GitHub, then the cookie on every request. Out: `req.auth = { sessionId, userId, token }`.
6. **Security.**
   - The state is single-use.
   - The token exchange happens server-side, so the client secret never reaches the browser.
   - Session ids are 256-bit random values, and only their hash is stored.
   - The cookie is HttpOnly.
   - The GitHub token is AES-256-GCM encrypted.
   - Expiry is enforced in the query and by the TTL index.
7. **MongoDB.** `User.findOneAndUpdate({githubId}, …, {upsert})`, `Session.create`, `Session.findOne({_id: hash, expiresAt: {$gt: now}})`, `Session.deleteOne`.
8. **Q: Why store a hash of the session id instead of the id itself?** The cookie value is effectively a password. If the database leaked, stored raw ids could be pasted into a browser to impersonate users. A SHA-256 hash can't be turned back into the cookie. The id is 256 random bits, so a fast hash is enough; salting is only needed for guessable inputs like passwords.

## 3. Authorization: `middleware/require-ownership.js` + owner filters in services

1. **Problem.** A signed-in user must only see and change their own analyses and uploads.
2. **Why separate.** Authentication answers "who"; authorization answers "may they". Keeping them apart makes each rule visible in the route definition.
3. **Flow.**
   - Upload create/list: `requireOwnedAnalysis` → `analysisService.existsOwned(id, req.auth.userId)` → 404 or `next()`.
   - Everything else: the service query itself filters on `{ _id, user }` or `{ _id, owner }`.
4. **Functions.** `requireOwnedAnalysis`, `analysisService.findOwned/updateOwned/deleteOwned`, `uploadService.findOwned/deleteOwned/listForAnalysis`.
5. **Data.** In: `req.params.id` and `req.auth.userId`. Out: continue, or 404.
6. **Security.**
   - The user id comes only from the session, never from the body or URL.
   - The answer is 404 rather than 403, so an attacker can't learn which ids exist.
   - Ownership is checked before Multer reads any bytes.
7. **MongoDB.** `Analysis.exists({_id, user})`, `findOne({_id, user})`, `Upload.findOne({_id, owner})`.
8. **Q: What stops user B from guessing user A's analysis id?** Even with the right id, every query also requires `user: <B's id from B's session>`. No document matches, so B gets 404, exactly as for an id that doesn't exist. Tests "5." and "8." check this for read, update, delete, list, upload, download and delete-upload.

## 4. Users: `modules/users/*`

1. **Problem.** Store one profile per GitHub account and the user's own Gemini key.
2. **Why separate.** The account data is used by auth (upsert at sign-in) and by analyses (the Gemini key).
3. **Flow.** `POST /api/user/gemini-key` → `requireAuth` → `handleSetGeminiKey`:
   - `validateGeminiKey`, a free model-list call to Google;
   - `userService.setGeminiKey`, which encrypts and then runs `User.updateOne`.
4. **Functions.**
   - `upsertFromGitHub`.
   - `findById`, which returns `hasGeminiKey` (a yes/no), never the key.
   - `setGeminiKey`, `clearGeminiKey`, `getGeminiKey` (decrypts).
5. **Data.** `{ id, githubId, username, avatarUrl, hasGeminiKey }`.
6. **Security.** `geminiKeyEnc` has `select: false`, so it can't be returned by accident. The key is stored encrypted.
7. **MongoDB.** `findOneAndUpdate` with `upsert`, `updateOne` with `$set`/`$unset`, `findById().select("+geminiKeyEnc")`.
8. **Q: Why is there no password field?** Identity is delegated to GitHub through OAuth. GitReason never sees a password, so there is nothing to hash or leak.

## 5. Analyses: `modules/analyses/*`

1. **Problem.** Analyze a repository, save the result for the signed-in user, and let them list, read, rename and delete saved results.
2. **Why separate.**
   - `analyze.controller.js` is the slow, streamed pipeline.
   - `history.controller.js` is plain CRUD.
   - `analysis.ai.js` holds the prompts and graph checks.
   - `analysis.service.js` holds all the queries.
3. **Flow.**
   - Analyze: `handleAnalyzeStream` → `fetchRepo` → `fetchTree` → `filterTree` → (`findLatestForTree` reuse) → `fetchReadme` → `generateExplanation` → `generateGraph` (validate, retry, repair, normalize) → `analysisService.create` → SSE `done`.
   - History: `requireAuth` → `validateObjectId` → controller → owner-filtered service query.
4. **Functions.**
   - `listByUser`: aggregate with `$match`, `$sort`, `$skip`, `$limit`, and `$project` counts.
   - `updateOwned`: `runValidators`.
   - `deleteOwned`: cascades to uploads.
   - `validateGraph`: rejects invented paths.
5. **Data.** History list: `{ history[], page, limit, total }`. One analysis: `{ analysis: { id, repoFullName, fileTree, explanation, graph, … } }`.
6. **Security.**
   - History needs authentication, and every query filters by owner.
   - `PATCH` accepts only `title` and `notes`.
   - Signed-in users must use their own Gemini key.
7. **MongoDB.** `create`, `findOne`, `aggregate`, `countDocuments`, `findOneAndUpdate`, `findOneAndDelete`. Index `{user: 1, createdAt: -1, _id: -1}`.
8. **Q: How does pagination work, and why is `_id` in the sort?**
   - `?page&limit` are validated: `limit` must be 1–100.
   - The pipeline skips `(page-1)*limit` documents and takes `limit`, sorted newest first.
   - Two analyses can share a `createdAt`; sorting on `_id` as well gives a stable order, so an item can't appear on two pages. (A test caught exactly this bug.)

## 6. Uploads (Knowledge tab): `modules/uploads/*`

1. **Problem.** Attach supporting documents (ADRs, design docs, specs, diagrams) to an analysis, privately.
2. **Why separate.**
   - Multer and file checks live in `upload.middleware.js`, because they are about HTTP parsing.
   - Disk and database work live in `upload.service.js`.
   - The controller only maps results to HTTP.
3. **Flow.** See the end-to-end example below.
4. **Functions.**
   - `receiveDocument`: Multer, then `detectDocumentType`.
   - `enforceUploadQuota`.
   - `uploadService.create`: random name, write the file, insert the record, clean up on failure.
   - `findOwned`, `deleteOwned`, `deleteAllForAnalysis`.
5. **Data.** In: multipart `file` (+ `description`). Out: `{ upload: { id, analysisId, originalName, mimeType, size, sha256, description, createdAt } }`. No disk path is ever returned.
6. **Security.**
   - Authentication and ownership are checked before Multer.
   - Size, count and field limits.
   - Extension allowlist plus a check on the actual bytes.
   - Server-generated file names.
   - Owner-filtered download and delete.
   - Downloads are attachments with `nosniff` and a sandbox CSP.
7. **MongoDB.** `Upload.countDocuments`, `create`, `find`, `findOne`, `findOneAndDelete`, `deleteMany`.
8. **Q: What happens if the database insert fails after the file was written?** `uploadService.create` catches the error, deletes the file it just wrote, and re-throws, so the client gets a 500. You never get bytes on disk without a record. Test "8b." simulates both a database failure and an unwritable folder, and checks that the record count and file count are unchanged.

### End-to-end: an authenticated upload

```text
1. Browser (AnalysisDocuments.jsx)
   const form = new FormData(); form.append("file", file);
   fetch("/api/user/history/6ade…665d/uploads", { method: "POST", body: form, credentials: "include" })
   → Content-Type: multipart/form-data; boundary=…   Cookie: gr_session=<64 hex>

2. upload.routes.js runs, in order:
   requireAuth           sha256(cookie) → Session.findOne(...) → req.auth.userId = "6ade5124…"
   validateObjectId      "6ade…665d" is 24 hex ✓
   requireOwnedAnalysis  Analysis.exists({ _id: "6ade…665d", user: "6ade5124…" }) ✓
   enforceUploadQuota    Upload.countDocuments({ analysis }) = 0 < 20 ✓
   receiveDocument       Multer parses the body into req.file (memory, ≤ 5 MB)
                         detectDocumentType("adr-001.md", bytes) → { ok, ext: "md", mimeType: "text/markdown" }
                         req.upload = { buffer, ext, mimeType, originalName: "adr-001.md" }

3. handleCreateUpload → uploadService.create({ ownerId: req.auth.userId, analysisId: req.params.id, ...req.upload })
   storedName = "3f9c…e1.md"  → fs.writeFile("server/uploads/3f9c…e1.md", bytes, { flag: "wx", mode: 0o600 })
   Upload.create({ owner, analysis, originalName: "adr-001.md", storedName, mimeType: "text/markdown", size: 61, sha256 })

4. MongoDB document (uploads collection):
   { _id: ObjectId("…"), owner: ObjectId("6ade5124…"), analysis: ObjectId("6ade…665d"),
     originalName: "adr-001.md", storedName: "3f9c…e1.md", mimeType: "text/markdown",
     size: 61, sha256: "…", createdAt: ISODate("…"), updatedAt: ISODate("…") }

5. Response: 201 { "upload": { "id": "…", "analysisId": "6ade…665d", "originalName": "adr-001.md",
                               "mimeType": "text/markdown", "size": 61, "sha256": "…", "description": null, "createdAt": 1761… } }
```

## 7. Errors and validation: `middleware/error-handler.js`, `middleware/validate.js`, `utils/async-handler.js`

1. **Problem.** Give consistent, safe answers for bad input and unexpected failures.
2. **Why separate.** One place maps every error to a status code, so controllers stay short.
3. **Flow.** An async handler throws → `asyncHandler` catches it → `next(err)` → `errorHandler`.
4. **Functions.** `validateObjectId`, `parsePagination`, `apiNotFound`, `errorHandler`.
5. **Data.** Errors arrive in; JSON `{ status, message }` goes out.
6. **Security.** A 500 never includes a stack trace, query, connection string or session data. Tested with MongoDB disconnected.
7. **MongoDB.** None directly. Mongoose `ValidationError` and `CastError` become 400.
8. **Q: Why is `asyncHandler` needed?** Express 4 doesn't catch rejected promises. Without the wrapper, an error inside an `async` handler would leave the request hanging with no response.

---

## Likely viva questions

1. **Why MongoDB?** Analyses are naturally nested documents (a file tree plus a graph of nodes and edges). A document database stores them as one record, with no joins needed to read one. Atlas Free gives a managed cluster at no cost.
2. **Why Mongoose on top of the MongoDB driver?** MongoDB itself doesn't enforce a structure. Mongoose adds schemas (types, required, enum, maxlength, custom validators), defaults, timestamps, references and index definitions, plus convenient model methods.
3. **What is a schema vs a model?** The schema describes the fields and rules. The model (`mongoose.model("Upload", schema)`) is the class used to query and save documents in the `uploads` collection.
4. **Show each CRUD operation in the code.** All in `analysis.service.js`:
   - Create: `Analysis.create`.
   - Read: `findOne({_id, user})`.
   - List: `aggregate` with pagination.
   - Update: `findOneAndUpdate` with `runValidators`.
   - Delete: `findOneAndDelete`, then the uploads cascade.
5. **What is middleware? Give an example chain.** A function that runs between the request and the handler, and can stop it. For an upload: `requireAuth → validateObjectId → requireOwnedAnalysis → enforceUploadQuota → receiveDocument`.
6. **Authentication vs authorization here?**
   - Authentication: `requireAuth` turns the cookie into `req.auth.userId`, or returns 401.
   - Authorization: `requireOwnedAnalysis` and the `{_id, user}` query filters, which return 404 when the record isn't yours.
7. **Describe the OAuth flow.** Redirect to GitHub with `client_id`, `redirect_uri`, `scope` and a random `state`. GitHub redirects back with `code` and `state`. The server checks the state, exchanges the code for a token server-to-server, reads the GitHub profile, upserts the user, creates a session and sets an HttpOnly cookie.
8. **What is the `state` parameter for?** It proves the callback answers a sign-in this server started. It is random, single-use and expires after 10 minutes, so forged or replayed callbacks are rejected (tested).
9. **Why server-side sessions instead of JWT?** Logout really works, because deleting the row kills the cookie immediately. The GitHub token stays on the server, encrypted, instead of in the browser.
10. **How do sessions expire?** `expiresAt` is 24 h after creation. Queries require `expiresAt > now`, and a TTL index makes MongoDB delete expired rows automatically (about once a minute).
11. **What does Multer do?** It parses `multipart/form-data`, the format browsers use for file uploads. Here it holds the file in memory (`req.file.buffer`), enforces size, count and field limits, and runs a `fileFilter` on the extension.
12. **Why multipart and not JSON?** JSON can only carry text. A file would have to be base64-encoded, which is 33% bigger and must be fully buffered. Multipart sends the raw bytes plus text fields in one request.
13. **How do you stop dangerous or fake files?** Four layers:
    - an extension allowlist;
    - a check on the real bytes (a renamed `.exe` fails the `%PDF-` check);
    - no NUL bytes and valid UTF-8 for text;
    - a 5 MB limit.
    Files are also stored under random names, never served statically, and downloaded as attachments with `nosniff`.
14. **Where are the bytes and where is the metadata?** Bytes go to `UPLOAD_DIR` on the server's disk. Metadata and the owner/analysis references go to MongoDB `uploads`. This keeps Atlas's 512 MB for application data.
15. **What happens on a restart? On a redeploy?** A restart keeps everything: sessions, analyses and upload records are in Atlas, and files stay on the same disk. On a host with an ephemeral disk, a redeploy deletes the files: the records remain and downloads return 404. The fix would be a persistent disk or object storage.
16. **Why is the original filename not used on disk?** It is controlled by the user, so it could contain `../`, clash with another file, or include odd characters. The server generates `32 random hex + extension` (checked by a schema regex), and the original name is only shown and used as the download filename.
17. **Which indexes exist and why?**
    - `users.githubId` unique: one user per GitHub account.
    - `sessions.expiresAt` TTL: automatic expiry.
    - `sessions.user`: lookups by user.
    - `analyses {user, createdAt, _id}`: the history list.
    - `uploads.storedName` unique: no collisions.
    - `uploads {analysis, createdAt}`: the upload list.
    - `uploads.owner`: lookups by owner.
18. **How are invalid ids handled?** `validateObjectId` returns 400 before any query. A valid but unknown id returns 404.
19. **How do the tests avoid touching real data?** `npm test` uses an in-memory MongoDB. `npm run test:atlas` uses the separate `gitreason_test` database, and its cleanup refuses to run if connected to any other database. Uploads go to a temp folder, and GitHub and Gemini are stubbed.
20. **How do you keep within the Atlas Free tier?**
    - pool size 10;
    - paginated lists capped at 100;
    - size caps on trees and graphs;
    - 20 uploads per analysis, 5 MB each, stored on disk;
    - an unchanged repo is reused instead of creating a new analysis;
    - sessions are auto-deleted.
21. **Where are environment variables read, and how is `MONGODB_URI` kept secret?** In `config/env.js` (plus `database.js` and `encryption.js` for the two secrets). They are loaded from git-ignored files, and `MONGODB_URI` is never a `VITE_*` variable, so it can't reach the browser bundle. Startup errors redact it.
22. **How would you extend this for the final evaluation?** Architecture Decision Records pinned to specific repository paths, with uploads as their evidence, plus a check that flags a decision when the files it refers to change in a later analysis. Deferred on purpose; not implemented.
