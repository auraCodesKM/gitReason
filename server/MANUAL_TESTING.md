# GitReason: manual end-to-end test

A browser test of the real stack: GitHub OAuth, the Knowledge tab (Multer uploads), and MongoDB Atlas (`gitreason` database).
Tick a box only after you have done the step and seen the expected result. **Never paste a cookie value, token or connection string into chats, screenshots or documents.**

## 0. Prerequisites

- Node 22.9 or newer. Run `npm install` in `server/` and in `client/`.
- `server/.env` and/or `../atlas-credentials.env` contain the required settings: `SESSION_SECRET`, `MONGODB_URI`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`, `CLIENT_ORIGIN`.
- GitHub OAuth App:
  - Authorization callback URL: `http://localhost:4000/api/auth/github/callback`
  - Homepage URL: `http://localhost:5173`
- Atlas → Security → Network Access includes your current IP. It changes when your network changes.
- To create a **new** analysis: a Gemini API key, saved in the app's Settings. Opening an existing analysis needs no Gemini call.

**Baseline before this test** (Atlas `gitreason`, read-only check on 2026-10-28): users 1, sessions 0, analyses 2 (`expressjs/cors`, `auraCodesKM/sleek-portfolio`), uploads 0.

## 1. Start safely

Use `npm start`, not `npm run dev`: the OAuth `state` lives in server memory, and `--watch` restarts on any file save, which breaks a sign-in in progress.
If an older backend is still running, stop it first (`Ctrl+C`). The entry point moved to `src/server.js`; `npm start` already points there.

```bash
# terminal 1
cd server && npm start
# expect: MongoDB connected: database "gitreason"
#         GitReason server running on port 4000

# terminal 2
cd client && npm run dev
# expect: Local: http://localhost:5173/
```

- [ ] `curl -s localhost:4000/health` → `"database":"ok","databaseName":"gitreason"`
- [ ] `curl -s -o /dev/null -w '%{http_code}\n' localhost:4000/api/user/history` → `401` (protected route, no cookie)

Open **http://localhost:5173**. Use `localhost`, not `127.0.0.1`, or the cookie will not be shared.

## 2. Sign in (authentication)

1. Landing page → **Sign In / Sign Up** → **Continue with GitHub** → approve.
2. You land on **/dashboard** with your avatar in the header.

- [ ] Atlas `sessions`: 0 → **1**. `user` = your user's `_id`; `expiresAt` about 24 h ahead; `_id` is 64 hex characters (a hash, not your cookie).
- [ ] Atlas `users` still **1**. Signing in again updates the same document (unique `githubId`).
- [ ] Reload `/dashboard`: still signed in.
- [ ] Stop the backend and `npm start` again, then reload: still signed in. The session is in MongoDB, not server memory.

## 3. Open an analysis

- Dashboard → a codebase card → **Open →**. The page loads the saved analysis from MongoDB (`?cached=<id>` in the URL). No Gemini call.
- Optional, uses 2–4 Gemini calls: **Analyze repository** with a small public repo. Only if you need a new analysis; don't retry in a loop.

- [ ] Architecture and Graph tabs render; the dashboard cards show Codebases 2, Files 349, Architecture nodes 20, Relationships 15.

## 4. Knowledge tab: upload, list, download, delete (Multer)

Create a clearly labelled test file:

```bash
printf '# ADR-001: Keep CORS options as a plain object\n\nTest document for GitReason.\n' > ~/Desktop/gitreason-adr-test.md
```

1. Dashboard → a codebase card → **Knowledge** (or the **Knowledge** tab on the analysis page).
2. **Choose file** → `gitreason-adr-test.md`. Its name and size appear before anything is sent.
3. **Upload**: the button shows "Uploading…", then "Uploaded gitreason-adr-test.md." The row shows *Markdown · size · just now*.
4. Reload the page and open **Knowledge** again: the file is still listed (it comes from MongoDB).
5. **View**: the document opens below the list. Markdown is rendered; text, images and PDFs are shown as they are. The header shows the **record id**, which is the document's `_id` in Atlas `uploads`. **Hide** or **Close** closes it.
6. **Download**: the same file is saved.
7. Rejections:
   - a `.exe` or `.zip` (switch the file picker to "All files") → "Only .pdf, .png, .jpg, .md and .txt files are allowed."
   - a file over 5 MB → refused before upload.
8. **Delete** → confirm → the row disappears. Reload: still gone.

- [ ] Terminal 1 printed `Upload saved: Multer received "gitreason-adr-test.md" (text/markdown, … B) -> uploads document <id> for analysis <id>`
- [ ] After step 3, Atlas `uploads`: 0 → **1** with:
  - `owner` = your user `_id`
  - `analysis` = the `cached=` id in the page URL
  - `originalName: "gitreason-adr-test.md"`
  - `mimeType: "text/markdown"`
  - `size` as shown
  - `storedName` like `<32 hex>.md`
- [ ] A file named after that `storedName` exists in `server/uploads/`. Your filename is **not** used on disk.
- [ ] After step 8, terminal 1 printed `Upload deleted: …`, and `uploads` is back to **0** and the file is gone from `server/uploads/`.
- [ ] `users` and `analyses` counts unchanged throughout.

## 5. Inspect MongoDB Atlas safely

**Atlas UI:** *Clusters → Browse Collections → `gitreason`*. Paste these into the **Project** field so secrets stay hidden:

- users: `{ geminiKeyEnc: 0 }`
- sessions: `{ _id: 0, githubTokenEnc: 0 }`
- analyses: `{ fileTree: 0, explanation: 0, graph: 0 }`
- uploads: no projection needed (no secrets)

**mongosh** (optional): use the command from *Atlas → Connect → Shell*, which prompts for the password.

```js
use gitreason
["users", "sessions", "analyses", "uploads"].forEach(c => print(c, db[c].countDocuments()))
db.sessions.find({}, { _id: 0, user: 1, createdAt: 1, expiresAt: 1 })
db.analyses.find({}, { user: 1, repoFullName: 1, title: 1, createdAt: 1,
  files: { $size: "$fileTree" }, nodes: { $size: "$graph.nodes" }, edges: { $size: "$graph.edges" } })
db.uploads.find({}, { owner: 1, analysis: 1, originalName: 1, storedName: 1, mimeType: 1, size: 1, createdAt: 1 })
// upload → owner and analysis, resolved
db.uploads.aggregate([
  { $lookup: { from: "users", localField: "owner", foreignField: "_id", as: "u" } },
  { $lookup: { from: "analyses", localField: "analysis", foreignField: "_id", as: "a" } },
  { $project: { originalName: 1, owner: { $first: "$u.username" }, repo: { $first: "$a.repoFullName" } } }
])
["users", "sessions", "analyses", "uploads"].forEach(c => printjson(db[c].getIndexes()))
```

These never print tokens, encrypted keys, session ids or the connection string.

## 6. Authentication and ownership checks (curl)

Get your cookie: DevTools → Application → Cookies → `http://localhost:5173` → value of `gr_session`. Keep it private.

```bash
COOKIE="gr_session=<paste value>"
ID=<analysis id from the page URL (cached=...)>

curl -s -b "$COOKIE" "localhost:4000/api/user/history?page=1&limit=5"            # 200, total: 2
curl -s -w ' %{http_code}\n' -b "$COOKIE" "localhost:4000/api/user/history?limit=500"  # 400 (limit 1-100)
curl -s -w ' %{http_code}\n' -b "$COOKIE" localhost:4000/api/user/history/not-an-id    # 400
curl -s -w ' %{http_code}\n' -b "$COOKIE" localhost:4000/api/user/history/0123456789abcdef01234567  # 404
curl -s -w ' %{http_code}\n' localhost:4000/api/user/history/$ID/uploads               # 401 (no cookie)
curl -s -w ' %{http_code}\n' -b "gr_session=%E0%A4%A" localhost:4000/api/user/history  # 401 (malformed cookie)
curl -s -w ' %{http_code}\n' -b "$COOKIE" -X PATCH -H "Content-Type: application/json" \
  -d '{"user":"someone-else"}' localhost:4000/api/user/history/$ID                    # 400 (only title/notes)
```

- [ ] All status codes as commented.
- [ ] Cross-user access needs a second GitHub account. Without one, show the automated tests: `npm test` → tests "5.", "8." and "8b." (user B gets 404 on user A's analysis and uploads).

## 7. Logout

1. Account menu → **Sign out**. You land on the landing page.

- [ ] Atlas `sessions` 1 → **0**. `users`, `analyses` and `uploads` unchanged.
- [ ] `/dashboard` now redirects to `/sign`.
- [ ] The old cookie is dead: `curl -s -o /dev/null -w '%{http_code}\n' -b "$COOKIE" localhost:4000/api/user/history` → **401**.

## Expected Atlas counts (`gitreason`)

| After | users | sessions | analyses | uploads |
|---|---|---|---|---|
| Baseline | 1 | 0 | 2 | 0 |
| Sign in | 1 | 1 | 2 | 0 |
| Upload test file | 1 | 1 | 2 | 1 |
| Delete test file | 1 | 1 | 2 | 0 |
| Logout | 1 | 0 | 2 | 0 |

## Cleanup

Only remove what this test created:
- Delete the test upload with **Delete** in the Knowledge tab, which removes both the record and the file.
- Delete `~/Desktop/gitreason-adr-test.md`.

Don't delete analyses, users or collections.

## Common errors

| Symptom | Cause / fix |
|---|---|
| GitHub says "redirect_uri is not associated with this application" | Set the OAuth App's callback URL to `http://localhost:4000/api/auth/github/callback` |
| Back on `/sign` with "Sign-in session expired" | Backend restarted during sign-in (state is in memory). Click Continue with GitHub again |
| Signed in, then immediately sent to `/sign` | Opened via `127.0.0.1`. Use `http://localhost:5173` |
| Knowledge tab says "Your session has expired" | Sessions last 24 h; sign in again |
| Upload: "Only .pdf, .png, .jpg, .md and .txt files are allowed." / "File content is not a valid … file." | Expected for other types, or a file renamed to a fake extension |
| Upload: "Files are limited to 5 MB." | Expected for files over 5 MB |
| Download shows `{"status":"not_found"}` | The record exists but the bytes are gone from `server/uploads/` (e.g. a wiped disk) |
| Backend exits with `Could not connect to MongoDB` | Atlas Network Access must include your current IP; otherwise check the credentials file |
| `/health` shows `gitreason_test` | `MONGODB_DB` is set in your shell or `.env`. Unset it |
| "Add your own Gemini API key in Settings" | Only for **new** analyses: Settings → Gemini → paste key → Configure |
