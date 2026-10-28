# GitReason backend: evaluation readiness

Status as of 2026-10-28, after the modular refactor. Paths are relative to `server/`.

## 1. Verdict: READY WITH CAVEATS

**Verified:**
- Node.js/Express, MongoDB Atlas + Mongoose, GitHub OAuth with server-side sessions, ownership-based authorization, and Multer uploads are all implemented.
- 46/46 automated tests pass, both in memory and on Atlas (`gitreason_test`).
- `npm start` with the real configuration connects to Atlas `gitreason` and serves `/health` (checked on port 4100, then stopped).
- The frontend build passes.

**Not yet verified live:**
- The Knowledge tab upload/download/delete in a browser with a real session (`MANUAL_TESTING.md` §4).
- Logout in the browser.
- Your existing session expired, so you need to sign in again.

**Not checked:** deployment (Render/Vercel). No grading rubric was provided, so nothing here claims it is satisfied.

## 2. What changed in the refactor

No API URL, method, request format, response format, status code, collection, index, environment variable name or npm script name changed.

| Before | After | Why |
|---|---|---|
| 24 files flat in `server/` (`app.js`, `server.js`, `analyze.js`, `auth.js`, `user.js`, `uploads.js`, `session.js`, `github.js`, `llm.js`, `noiseFilter.js`, `db/`, `models/`, `middleware/`) | `src/` with `config/`, `middleware/`, `utils/`, `integrations/`, `modules/{auth,users,analyses,uploads}/` | one folder per feature; routes → controllers → services → models |
| All 21 routes registered in `app.js` | one router per module (`*.routes.js`), mounted in `app.js` | the route, its middleware and its handler sit together |
| `db/repository/*` (`usersRepo`, …) | `*.service.js` (`userService`, `sessionService`, `analysisService`, `uploadService`) | same functions, named after their layer |
| `analyze.js` (297 lines: prompts + validation + stream) | `analysis.ai.js` (prompts, `generateExplanation`, `generateGraph`, graph checks) + `analyze.controller.js` (stream) + `history.controller.js` (CRUD) | each file has one job |
| OAuth `state` map inside `auth.js` | `auth.service.js` | the controller reads as the OAuth steps |
| `session.js` | `session.cookie.js` (HTTP) + `session.service.js` (database) | cookie handling is separate from storage |
| Env reads scattered across files | `config/env.js` (plus `MONGODB_URI` in `database.js`, `SESSION_SECRET` in `encryption.js`) | one place to see every setting |
| File-type check inside the Multer callback | `detectDocumentType()` (pure, unit-tested) | testable without HTTP |
| `test/api.test.js` | `test/integration/api.test.js`, `test/integration/startup.test.js`, `test/unit/*.test.js` | unit vs integration |
| Few comments | header comment per module (purpose, callers, MongoDB use, security, failure) and JSDoc on exported functions | viva readability |

### Bugs fixed (each one proved by a test that failed first)

| Bug | Proof before the fix | Fix |
|---|---|---|
| A session whose token can't be decrypted (e.g. after `SESSION_SECRET` changes, or a tampered row) returned **500 on every route**, so the user couldn't even be shown as signed out | new test: `expected 401, actual 500` (`Unsupported state or unable to authenticate data`) | `sessionService.findById` treats it as no session → 401, and the user signs in again |
| Error handler: when a response had already started, it returned without ending it, so the connection hung | code review (Express docs pattern) | `if (res.headersSent) return next(err)`, so Express closes the connection |
| A malformed `%` cookie returned 500 instead of 401 (fixed 2026-10-26) | test 4 | `parseCookies` ignores it |

### Removed

The old files listed in the first table above. Nothing imported them (checked with grep before removing); they remain in Git history.

## 3. API inventory

Verified by the route-inventory test: 22 registrations, no duplicates, and authentication exactly where listed. Identical to the pre-refactor app (diffed).

| Method | Path | Auth | Ownership | Success | Errors |
|---|---|---|---|---|---|
| GET | `/health` | — | — | 200 | 503 DB down |
| GET | `/api/auth/github/start` | — | — | 302 → GitHub | 400 bad `repo`, 500 not configured |
| GET | `/api/auth/github/callback` | — | — | 302 → `/dashboard` + cookie | 302 → `/sign?auth=error&reason=…` |
| GET | `/api/auth/session` | optional | — | 200 `{authenticated, user}` | — |
| POST | `/api/auth/logout` | optional | — | 200 `{ok}` | — |
| GET | `/api/user/me` | optional | — | 200 | — |
| POST / DELETE | `/api/user/gemini-key` | required | own account | 200 | 400, 401 |
| GET | `/api/user/github-activity` | required | own account | 200 | 401 |
| GET | `/api/user/repo-languages` | required | — | 200 | 400, 401 |
| GET | `/api/repo/check` | optional | — | 200 | 400, 404, 429, 502 |
| GET | `/api/repo/file` | optional | — | 200 | 400, 404 |
| GET | `/api/analyze/stream` | optional (saves when signed in) | — | SSE `done` | SSE `error` |
| GET | `/api/user/history?page&limit` | required | query filter | 200 | 400, 401 |
| GET / PATCH / DELETE | `/api/user/history/:id` | required | query filter | 200 / 200 / 204 | 400, 401, 404 |
| POST | `/api/user/history/:id/uploads` | required | `requireOwnedAnalysis` | 201 | 400, 401, 404, 409, 413, 415 |
| GET | `/api/user/history/:id/uploads` | required | `requireOwnedAnalysis` | 200 | 400, 401, 404 |
| GET / DELETE | `/api/user/uploads/:uploadId` | required | query filter | 200 file / 204 | 400, 401, 404 |

The frontend still calls exactly these paths (checked with grep over `client/src`).

## 4. Collections (real Atlas `gitreason`, read-only, 2026-10-28)

| Collection | Model | Count | Indexes (verified on Atlas) |
|---|---|---|---|
| `users` | `modules/users/user.model.js` | 1 | `githubId` unique |
| `sessions` | `modules/auth/session.model.js` | 0 (your last session expired and was removed by the TTL index) | `user`; `expiresAt` TTL |
| `analyses` | `modules/analyses/analysis.model.js` | 2 (`expressjs/cors`, `auraCodesKM/sleek-portfolio`) | `{user, createdAt, _id}` |
| `uploads` | `modules/uploads/upload.model.js` | 0 | `storedName` unique; `{analysis, createdAt}`; `owner` |

These counts were identical before and after the Atlas test run. `gitreason_test` is empty afterwards.

## 5. Test results (2026-10-28)

| Command | Result | Notes |
|---|---|---|
| `npm test` | **46/46 pass** | in-memory MongoDB: 21 unit + 22 API + 3 startup |
| `npm run test:atlas` | **46/46 pass** (about 39 s) | real Atlas, database `gitreason_test` only; no URI or token patterns in the output |
| Pre-refactor baseline | 19/19 | same commands, before any change |
| Mutation checks | caught | removing the owner filter in `findOwned` fails test "5."; removing upload cleanup fails "8b." |
| `npm start` (real config, PORT=4100) | connected to `gitreason`; `/health` 200; `/api/user/history` 401; unknown `/api` route 404; clean SIGINT shutdown | then stopped |
| `client: npm run build` | pass | |
| Lint / type check | not configured | |
| Manual browser test | **not run yet** | `MANUAL_TESTING.md` |

**Coverage by area:**
- **Startup:** valid config, missing env, bad URI with the password redacted, SIGTERM.
- **OAuth:** start redirect parameters; forged state; cancel; bad code; success creates the user and a hashed session with an encrypted token and an HttpOnly cookie; state replay rejected; repeat sign-in leaves one user.
- **Sessions:**
  - missing, unknown, malformed, expired and undecryptable cookies all give 401;
  - logout invalidates the session.
- **Authorization:** user B gets 404 on user A's analysis read, update, delete, upload list, upload create, download and delete.
- **CRUD:** create, read, list, paginate, update with validation, delete with cascade.
- **Uploads:**
  - valid PDF/PNG/MD;
  - rejects: over 5 MB, `.exe`, `.html`, fake PDF, NUL text, empty, missing field, non-multipart, long description, quota;
  - list and download;
  - delete;
  - missing bytes;
  - storage failure and DB failure clean up after themselves.
- **Failures:** MongoDB down gives `/health` 503 and a generic 500; data persists across a reconnect.

## 6. Known limitations

| Limitation | Effect | Mitigation |
|---|---|---|
| Upload bytes on local disk | lost on a redeploy to an ephemeral disk (e.g. Render without a persistent disk); records remain and downloads return 404 | persistent disk + `UPLOAD_DIR`, or object storage (not added) |
| OAuth `state` in memory, not bound to the browser | a restart during sign-in fails; login CSRF possible | state cookie or MongoDB-stored state (not added) |
| Analysis delete and its uploads are not one transaction; upload quota is count-then-insert | stray files possible; quota +1 under a race | acceptable at this scale |
| Anonymous analyses use the server Gemini key, no rate limit | quota abuse if public | rate limit before a public deploy |
| Changing `SESSION_SECRET` | everyone is signed out (now a clean 401); saved Gemini keys can't be decrypted | keep it stable; users re-enter keys |
| Title/notes edit and analysis delete have no UI | demo them with curl | — |
| `README.md` line 61 claims Tailwind/shadcn | false (those dependencies are unused) | remove the line or don't cite it |
| Express transitive `npm audit` advisories | reported vulnerabilities | not changed (no dependency updates in this task) |

## 7. Remaining blockers before the demo

1. **Restart the backend.** The process started before the refactor is still running old code from files that no longer exist. Press `Ctrl+C` in that terminal, then run `npm start`.
2. **Sign in again.** There is no live session.
3. **Run the Knowledge-tab test once** (`MANUAL_TESTING.md` §4) so the upload flow has been seen working live against Atlas.
4. **Check Atlas Network Access** if your network changed.

## 8. Demonstration (about 5 minutes)

1. `cd server && npm start`. Point at `MongoDB connected: database "gitreason"`. Then `curl localhost:4000/health`.
2. Open `src/app.js` (middleware order and routers) and `src/modules/uploads/upload.routes.js` (the full middleware chain).
3. Sign in with GitHub. In Atlas, show the new `sessions` document (hashed `_id`, `expiresAt`), using projection `{ _id: 0, githubTokenEnc: 0 }`.
4. Dashboard → codebase → **Knowledge** → upload `gitreason-adr-test.md`. In Atlas `uploads`, show `owner`, `analysis`, `storedName`, `mimeType`, `size`; then show the random-named file in `server/uploads/`.
5. Download it. Try an `.exe` → rejected. Delete it → the record and file are gone.
6. curl without a cookie → 401; a bad id → 400.
7. `npm test` → 46/46. Point at tests "5.", "8." and "8b." (cross-user 404s) and the OAuth test.
8. Sign out. The `sessions` document is gone; the old cookie gets 401.

For questions and answers, see `VIVA_GUIDE.md`.
