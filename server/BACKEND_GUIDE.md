# GitReason backend guide

A reference for the code in `server/`. Everything here matches the current source; paths are relative to `server/`.
For a module-by-module study plan and viva questions, see `VIVA_GUIDE.md`. For a hands-on browser test, see `MANUAL_TESTING.md`.

## 1. Directory tree

```text
server/
├── package.json                 scripts: start, dev, test, test:atlas
├── src/
│   ├── server.js                entry point: check env → connect MongoDB → listen → graceful shutdown
│   ├── app.js                   createApp(): middleware order, mounts the four routers, 404, error handler
│   ├── config/
│   │   ├── env.js               every environment variable, read through small functions
│   │   └── database.js          connectMongo / disconnectMongo / mongoStatus / redactMongoError
│   ├── middleware/              cross-cutting request steps
│   │   ├── cors.js              CLIENT_ORIGIN allowlist, credentials allowed
│   │   ├── require-auth.js      AUTHENTICATION: cookie → session → req.auth (else 401)
│   │   ├── require-ownership.js AUTHORIZATION: is :id an analysis you own? (else 404)
│   │   ├── validate.js          validateObjectId (400), parsePagination
│   │   └── error-handler.js     JSON 404 for /api, central error → status code mapping
│   ├── utils/
│   │   ├── async-handler.js     sends async errors to the error handler
│   │   └── encryption.js        AES-256-GCM for the GitHub token and Gemini key
│   ├── integrations/            outbound HTTP only, no database
│   │   ├── github.js            GitHub REST/GraphQL + OAuth token exchange
│   │   └── gemini.js            Gemini generateContent + key check
│   └── modules/                 one folder per feature
│       ├── auth/                sign in / out
│       │   ├── auth.routes.js       4 routes
│       │   ├── auth.controller.js   OAuth start + callback, session status, logout
│       │   ├── auth.service.js      OAuth `state` (one-time, 10 min)
│       │   ├── session.model.js     sessions collection
│       │   ├── session.service.js   create / find / delete session (hashed id)
│       │   └── session.cookie.js    parse / set / clear the gr_session cookie
│       ├── users/
│       │   ├── user.routes.js       5 routes
│       │   ├── user.controller.js   /me, Gemini key, GitHub activity, languages
│       │   ├── user.service.js      upsert from GitHub, encrypted Gemini key
│       │   └── user.model.js        users collection
│       ├── analyses/
│       │   ├── analysis.routes.js   7 routes
│       │   ├── analyze.controller.js repo check, streamed analysis, file preview
│       │   ├── history.controller.js history list / read / update / delete
│       │   ├── analysis.service.js  all analyses queries (owner-filtered)
│       │   ├── analysis.ai.js       Gemini prompts, graph validation and cleanup
│       │   ├── noise-filter.js      drops node_modules, lock files, binaries
│       │   └── analysis.model.js    analyses collection
│       └── uploads/
│           ├── upload.routes.js     4 routes
│           ├── upload.controller.js create / list / download / delete
│           ├── upload.middleware.js Multer config, content checks, quota
│           ├── upload.service.js    disk + metadata, cleanup on failure
│           └── upload.model.js      uploads collection
├── scripts/migrate-sqlite-to-mongo.js   one-off import of the old SQLite data (not run yet)
├── test/
│   ├── unit/                    pure functions, no database (21 tests)
│   └── integration/             api.test.js (22 tests), startup.test.js (3 tests)
└── uploads/                     uploaded file bytes (git-ignored, created on first upload)
```

### What each layer does

| Layer | Responsibility | Example |
|---|---|---|
| **routes** | URL + HTTP method → ordered list of middleware → controller | `upload.routes.js` |
| **middleware** | a step every matching request passes through; can stop it early | `requireAuth` |
| **controllers** | read the request, call a service, choose the status code and JSON | `handleUserHistory` |
| **services** | business rules and database work; know nothing about HTTP | `analysisService.listByUser` |
| **models** | Mongoose schema: fields, validation, indexes | `analysis.model.js` |
| **integrations** | talk to GitHub / Gemini over HTTP | `fetchTree` |
| **config / utils** | settings, database connection, small shared helpers | `env.js`, `asyncHandler` |

Dependencies point one way: routes → controllers → services → models. Services never import Express, and models import nothing from the app.

## 2. Startup sequence (`src/server.js`)

1. `missingRequiredEnv()`: if `SESSION_SECRET` or `MONGODB_URI` is missing, print which one and exit with code 1.
2. `connectMongo()` (`config/database.js`):
   - `mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000, maxPoolSize: 10 })`.
   - Then `Model.init()` for all four models, which builds the unique, TTL and compound indexes.
   - On failure: log a redacted message (no connection string) and exit with code 1. There is no fallback database.
3. `createApp().listen(PORT)`, then log `GitReason server running on port …`.
4. On `SIGINT`/`SIGTERM`: stop accepting connections, close the MongoDB pool, exit 0. A 5 s fallback exists because open analysis streams would otherwise keep it waiting.

`npm start` loads `server/.env`, then `../atlas-credentials.env`; a later file overrides an earlier one. Database name: `MONGODB_DB`, default `gitreason`.

## 3. Request lifecycle: `PATCH /api/user/history/:id`

```text
browser fetch (cookie gr_session=<64 hex>)
 → cors.js                      origin allowed? add CORS headers
 → express.json                 body → req.body (max 100 kb, bad JSON → 400)
 → analysisRoutes               matches PATCH /api/user/history/:id
 → requireAuth                  sha256(cookie) → Session.findOne({_id, expiresAt > now}) → req.auth.userId   (else 401)
 → validateObjectId("id")       24 hex chars?                                                                (else 400)
 → handleUpdateHistoryItem      body may only contain title/notes, as strings                                (else 400)
 → analysisService.updateOwned  Analysis.findOneAndUpdate({_id, user: req.auth.userId}, {$set}, {runValidators})
 → 200 { analysis }   |   null → 404 (missing or someone else's)   |   ValidationError → 400 via error handler
```

## 4. Authentication vs authorization

| | Authentication: *who are you?* | Authorization: *may you do this?* |
|---|---|---|
| Where | `modules/auth/*`, `middleware/require-auth.js` | `middleware/require-ownership.js` + the `{_id, user/owner}` filter in every service query |
| How | GitHub OAuth → a server-side session → `gr_session` cookie → `req.auth.userId` | compare the record's `user`/`owner` with `req.auth.userId` |
| Failure | 401 `Not signed in.` | 404 `not_found` (same as a missing record, so ids don't leak) |

**Sign-in flow** (`auth.controller.js`):
1. `/api/auth/github/start` creates a random one-time `state` (`auth.service.js`) and redirects to GitHub.
2. GitHub calls back to `/api/auth/github/callback?code&state`. The server:
   - checks the state is known, unused and less than 10 minutes old;
   - exchanges the code for a token server-to-server (`exchangeCodeForToken`);
   - fetches the GitHub profile;
   - `userService.upsertFromGitHub` (upsert on the unique `githubId`);
   - `sessionService.create`: 32 random bytes; stores `sha256(id)` plus the encrypted token, expiring in 24 h;
   - sets the cookie: `HttpOnly; Path=/; Max-Age=86400`, plus `SameSite=Lax` in development or `Secure; SameSite=None` in production.

**Every later request.** `requireAuth` hashes the cookie and finds a session with `expiresAt > now`. The session is rejected if the id is malformed, unknown or expired, or if its token can no longer be decrypted.

**Logout.** `POST /api/auth/logout` deletes the session document and expires the cookie. The old cookie value then gets 401 everywhere.

**Expiry.** It is checked in the query, and the TTL index (`expires: 0`) lets MongoDB delete the document about a minute later.

**Ownership is never taken from the client.** `PATCH` rejects any field except `title` and `notes`, and uploads get `owner` from `req.auth`.

## 5. MongoDB / Mongoose model relationships

```text
users ──< sessions          session.user     → users._id
users ──< analyses          analysis.user    → users._id
users ──< uploads           upload.owner     → users._id
analyses ──< uploads        upload.analysis  → analyses._id
analyses embeds: fileTree[], graph { groups[], nodes[], edges[] }
```

| Collection | Model file | Required / unique / validated | Indexes |
|---|---|---|---|
| `users` | `modules/users/user.model.js` | `githubId` required + unique; `username` ≤ 39; `geminiKeyEnc` `select:false` | `githubId` unique |
| `sessions` | `modules/auth/session.model.js` | `_id` = sha256 hex; `user`, `githubTokenEnc` (`select:false`), `expiresAt` required | `user`; `expiresAt` TTL (`expireAfterSeconds: 0`) |
| `analyses` | `modules/analyses/analysis.model.js` | `user`, `repoOwner`, `repoName`, `repoFullName`, `graph` required; title ≤ 120, notes ≤ 5000, explanation ≤ 20000; fileTree ≤ 20,000; nodes 1–200; edges ≤ 1000; role/kind enums | `{ user: 1, createdAt: -1, _id: -1 }` |
| `uploads` | `modules/uploads/upload.model.js` | `storedName` unique + regex; `mimeType` enum; `size` ≥ 1; `originalName` ≤ 255; `description` ≤ 500 | `storedName` unique; `{ analysis: 1, createdAt: -1 }`; `owner` |

- **Referenced vs embedded.** Users, sessions, analyses and uploads are queried and deleted independently, so they are referenced by ObjectId. The graph and file tree are always loaded with their analysis, so they are embedded.
- **Invalid ids.** Rejected with 400 by `validateObjectId` before any query runs. Any `CastError` that slips through becomes 400 in the error handler.
- **Duplicates.**
  - A repeat sign-in upserts the same user (unique `githubId`).
  - Re-analyzing an unchanged repo reuses the saved analysis (`findLatestForTree` on the git tree SHA), so no duplicate document is created.
- **Query limits.** History is paginated (`limit` ≤ 100) and the list returns counts rather than the large arrays. Each analysis can have at most 20 uploads.

## 6. Multer upload lifecycle

```text
POST /api/user/history/:id/uploads   (multipart/form-data: file, description?)
 → requireAuth            401 if not signed in
 → validateObjectId("id") 400 if :id malformed
 → requireOwnedAnalysis   404 if the analysis is not yours        ← before any bytes are read
 → enforceUploadQuota     409 if it already has 20 documents
 → receiveDocument        Multer memoryStorage
                            limits: 5 MB (413), 1 file, 2 fields, 1 KB per field, 3 parts
                            fileFilter: extension allowlist .pdf .png .jpg/.jpeg .md/.markdown .txt (415)
                          then detectDocumentType() checks the bytes (%PDF-, PNG signature, FF D8 FF, UTF-8 without NUL)
                            empty → 400, mismatch → 415; the browser's Content-Type is ignored
 → handleCreateUpload → uploadService.create
                            storedName = 32 random hex + ext   (the user's filename never becomes a path)
                            writeFile(UPLOAD_DIR/storedName, flag "wx", mode 0600)
                            Upload.create({ owner, analysis, originalName, storedName, mimeType, size, sha256 })
                            if the insert fails → delete the file again → 500
 → 201 { upload }
```

- **Download** (`GET /api/user/uploads/:uploadId`): `Upload.findOne({_id, owner})`. Not yours means 404. The disk path comes from the record, never from the URL. The file is sent as an attachment with `nosniff` and `CSP: sandbox`. Missing bytes return 404.
- **Delete** (`DELETE /api/user/uploads/:uploadId`): `findOneAndDelete({_id, owner})`, then removes the file (`force`, so an already-missing file is fine), then 204.
- **Deleting an analysis** deletes its uploads (records, then files). This is not a transaction.
- **Storage.** Bytes live on the server's disk (`UPLOAD_DIR`, default `server/uploads/`); metadata lives in MongoDB. Bytes survive a process restart on the same disk. On hosts with an ephemeral disk (e.g. Render without a persistent disk) a redeploy deletes them; the records remain and downloads return 404.

## 7. Status codes

| Code | When |
|---|---|
| 200 / 201 / 204 | OK / upload created / deleted |
| 400 | bad id, bad pagination, bad PATCH body, bad JSON, schema validation, malformed multipart, empty file |
| 401 | no / malformed / unknown / expired / undecryptable session |
| 404 | record missing **or owned by another user**; unknown `/api` route |
| 409 | upload quota reached |
| 413 | JSON body > 100 kb, file > 5 MB |
| 415 | file type or content not allowed |
| 500 | anything unexpected; generic message, details only in the server log |
| 503 | `/health` while MongoDB is disconnected |

## 8. Running and testing

```bash
cd server
npm install
npm start            # src/server.js, real config (.env + ../atlas-credentials.env)
npm run dev          # same, restarts on file changes (breaks a sign-in in progress)
npm test             # unit + integration, in-memory MongoDB (no credentials needed)
npm run test:atlas   # same tests on the real Atlas cluster, database gitreason_test only
```

| Test file | Kind | What it covers |
|---|---|---|
| `test/unit/*.test.js` | unit | validation, cookie parsing/flags, encryption, file-type detection, graph checks, env helpers |
| `test/integration/api.test.js` | integration (HTTP + MongoDB) | route inventory; OAuth start/callback; CRUD; ownership A vs B; uploads; sessions; DB failure; reconnect |
| `test/integration/startup.test.js` | integration (child process) | missing env → exit 1; bad URI → exit 1 with the password redacted; good config → /health; SIGTERM → exit 0 |

Safety:
- GitHub and Gemini are replaced by a fetch stub.
- `test:atlas` forces `MONGODB_DB=gitreason_test`, and its cleanup asserts that database name before deleting anything.
- Uploads go to a temporary folder.

## 9. Glossary

| Term | Meaning here |
|---|---|
| Middleware | a function `(req, res, next)` that runs before the handler; it calls `next()` to continue or sends a response to stop |
| Controller | the function that turns an HTTP request into a service call and a response |
| Service | business logic plus database queries, without HTTP |
| Model / Schema | Mongoose definition of a collection's fields, rules and indexes |
| ObjectId | MongoDB's 12-byte id, shown as 24 hex characters |
| Index | a lookup structure that makes a query fast or enforces uniqueness (`unique`) or expiry (TTL) |
| TTL index | MongoDB deletes the document once the date in the indexed field has passed |
| Upsert | update the match, or insert it if there is none |
| `lean()` | return plain objects instead of Mongoose documents (faster, read-only) |
| `select: false` | the field is left out of query results unless asked for explicitly |
| OAuth `state` | random one-time value proving the callback belongs to a sign-in we started |
| Session | server-side record of a sign-in; the browser only holds an opaque id |
| HttpOnly cookie | a cookie that page JavaScript cannot read |
| multipart/form-data | request body format that carries files plus text fields |
| Magic bytes | the first bytes of a file that identify its real format |
| SSE | Server-Sent Events: one long HTTP response that streams progress events |

## 10. Files to open during the viva

1. `src/server.js`: startup order.
2. `src/app.js`: middleware order and routers.
3. `src/modules/uploads/upload.routes.js`: the full middleware chain in one line.
4. `src/middleware/require-auth.js` and `require-ownership.js`: authentication vs authorization.
5. `src/modules/auth/session.service.js`: the hashed session id and the expiry check.
6. `src/modules/auth/auth.controller.js` `handleAuthCallback`: the OAuth flow.
7. `src/modules/uploads/upload.middleware.js` and `upload.service.js`: Multer, validation, storage, cleanup.
8. `src/modules/analyses/analysis.service.js`: CRUD, pagination aggregate, owner filter.
9. Models: `analysis.model.js` (validators, embedded schemas, compound index), `session.model.js` (TTL).
10. `test/integration/api.test.js`: tests "5.", "8.", "8b." and the OAuth test.

## 11. Known limitations

- OAuth `state` is kept in memory and is not bound to the browser. A sign-in that spans a restart fails; login CSRF is not prevented.
- Upload bytes are on local disk. A host with an ephemeral disk loses them on redeploy.
- Deleting an analysis and its uploads is not one transaction. The upload quota is count-then-insert.
- Anonymous analyses use the server Gemini key with no rate limit.
- Changing `SESSION_SECRET` signs everyone out, and makes saved Gemini keys undecryptable (users must re-enter them).
- Editing title/notes and deleting an analysis are API-only (no UI).
