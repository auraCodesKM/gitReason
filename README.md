# GitReason

**Understand a codebase before you change it.**

GitReason analyzes a GitHub repository and turns its real structure into an architecture explanation and an interactive dependency map. Explore the repository visually, inspect source files, trace relationships, and reopen previous analyses without repeating the full model pass.

Public repositories can be analyzed without signing in. Private repositories use GitHub OAuth.

## What it does

- **Repository analysis** — fetches the real GitHub file tree and README, then filters build output, dependencies, lockfiles, binaries, and other noise before analysis.
- **Architecture explanation** — generates a concise plain-English summary of how the repository is organized.
- **Architecture view** — renders a structured architecture diagram grouped by system layer.
- **Interactive graph** — explore relationships spatially with search, pan/zoom, local graph, filtering, node inspection, and blast-radius exploration.
- **Source inspection** — open the actual source behind a node or file with syntax highlighting.
- **Private repositories** — authenticate with GitHub when repository access requires it.
- **Analysis history** — signed-in users can reopen, rename, annotate and delete saved analyses without paying for another model call.
- **Attached documents** — signed-in users can upload design notes or diagrams (PDF, PNG, JPG, Markdown, text) to a saved analysis.

## How it works

```text
GitHub repository
       │
       ▼
  Fetch metadata,
  tree + README
       │
       ▼
   Filter noise
       │
       ▼
  LLM explanation
       │
       ▼
  Graph generation
       │
       ▼
 Validate against
   real file paths
       │
       ▼
 Architecture + Graph
 + source inspection
       │
       ▼
 Persist for signed-in users
```

The graph is generated from repository data rather than a canned template. Graph nodes are validated against the actual repository tree before the result is rendered.

## Stack

### Client

- React 18 + Vite
- Mermaid for the structured architecture view
- D3 modules for the interactive graph experience
- Shiki for source highlighting
- `markdown-to-jsx` for analysis explanations
- Tailwind CSS / shadcn-style UI primitives

### Server

- Node.js 22+
- Express
- Server-Sent Events for analysis progress
- GitHub REST API
- Gemini API for repository analysis

### Persistence

- MongoDB (local or Atlas) through Mongoose models in `server/src/modules/*/*.model.js`
- Feature modules (`server/src/modules/`): routes → controllers → services → models, so route handlers hold no query code
- Uploaded files: Multer → validated bytes on disk (`UPLOAD_DIR`), metadata in MongoDB

### Authentication

- GitHub OAuth Authorization Code flow
- Opaque `HttpOnly` sessions
- GitHub access tokens encrypted at rest with AES-256-GCM
- Tokens are never exposed to the client or written to logs

## Local development

### Requirements

- Node.js 22.9+
- MongoDB 6+ (local install or a free MongoDB Atlas cluster)
- GitHub OAuth App
- Gemini API key

### Install

```bash
git clone https://github.com/auraCodesKM/gitReason.git
cd gitReason
(cd client && npm install)
(cd server && npm install)
```

### GitHub OAuth

Create an OAuth App in [GitHub Developer Settings](https://github.com/settings/developers).

For local development:

- Homepage URL: `http://localhost:5173`
- Authorization callback URL: `http://localhost:4000/api/auth/github/callback`

### Environment

```bash
cd server
cp .env.example .env
```

Fill in:

```env
GITHUB_CLIENT_ID=<your GitHub OAuth client id>
GITHUB_CLIENT_SECRET=<your GitHub OAuth client secret>
GITHUB_CALLBACK_URL=http://localhost:4000/api/auth/github/callback
CLIENT_ORIGIN=http://localhost:5173

SESSION_SECRET=<32+ byte random secret>
GEMINI_API_KEY=<your Gemini API key>
GEMINI_MODEL=<optional model override>

MONGODB_URI=<MongoDB connection string>
MONGODB_DB=<optional, defaults to gitreason>
UPLOAD_DIR=<optional, defaults to server/uploads>
```

`npm start` / `npm run dev` load `server/.env` and then `../atlas-credentials.env` (the file MongoDB Atlas generates, kept at the repository root). Keep `MONGODB_URI` in only one of them. Both files are gitignored. The database name comes from `MONGODB_DB` (default `gitreason`), so the Atlas connection string can be used unchanged.

### MongoDB

Either run MongoDB locally:

```bash
brew tap mongodb/brew && brew install mongodb-community mongosh
brew services start mongodb-community
# MONGODB_URI=mongodb://127.0.0.1:27017
```

or create a free cluster on [MongoDB Atlas](https://www.mongodb.com/atlas), add a database user, allow your IP under Network Access, and put the `mongodb+srv://...` connection string in `atlas-credentials.env` or `server/.env`.

The server refuses to start without `MONGODB_URI` or when MongoDB is unreachable; there is no silent fallback. Collections and indexes are created on startup.

Upgrading from the old SQLite version? Copy your existing users and analysis history once (read-only on the SQLite side, safe to re-run):

```bash
cd server
node --env-file-if-exists=.env scripts/migrate-sqlite-to-mongo.js
```

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Get a Gemini key from [Google AI Studio](https://aistudio.google.com/apikey).

### Run

Terminal 1:

```bash
cd server
npm run dev
```

Terminal 2:

```bash
cd client
npm run dev
```

Open `http://localhost:5173`.

Check the backend and its database connection:

```bash
curl http://localhost:4000/health
# {"status":"ok","database":"ok","databaseName":"gitreason",...}
```

### Tests

```bash
cd server
npm test
```

The suite starts a throwaway MongoDB (`mongodb-memory-server`, database `gitreason_test`) and a temporary uploads folder, so it never touches your real data. GitHub and Gemini are stubbed; Express, middleware, Multer, Mongoose and MongoDB are real.

`npm run test:atlas` runs the same suite against the real cluster in `MONGODB_URI`, using only the separate `gitreason_test` database (it empties that database before and after; the app's `gitreason` database is never touched).

## Backend

### Collections

| Collection | Model | Purpose | Key indexes |
|---|---|---|---|
| `users` | `server/src/modules/users/user.model.js` | GitHub identity, encrypted Gemini key (`select: false`) | `githubId` unique |
| `sessions` | `server/src/modules/auth/session.model.js` | Server-side login sessions; `_id` is SHA-256 of the cookie value, GitHub token AES-256-GCM encrypted | `user`; TTL on `expiresAt` |
| `analyses` | `server/src/modules/analyses/analysis.model.js` | Saved analyses: repo, branch, tree SHA, explanation, file tree, graph (embedded), title, notes | `{ user: 1, createdAt: -1, _id: -1 }` |
| `uploads` | `server/src/modules/uploads/upload.model.js` | Metadata for documents attached to an analysis; bytes live in `UPLOAD_DIR` | `storedName` unique; `{ analysis: 1, createdAt: -1 }`; `owner` |

`sessions.user`, `analyses.user`, `uploads.owner` and `uploads.analysis` are ObjectId references. The analysis graph and file tree are embedded because they are always read with their analysis.

### API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | — | Server + MongoDB status |
| GET | `/api/repo/check?url=` | optional | Check a repository is reachable |
| GET | `/api/repo/file?repo&path&ref` | optional | Source of one file |
| GET | `/api/analyze/stream?repo=` | optional | Run an analysis (Server-Sent Events); saved when signed in, reused when the repository is unchanged |
| GET | `/api/auth/github/start` | — | Begin GitHub OAuth |
| GET | `/api/auth/github/callback` | — | OAuth callback; creates the session |
| GET | `/api/auth/session`, `/api/user/me` | optional | Current sign-in state |
| POST | `/api/auth/logout` | optional | Delete the session |
| POST / DELETE | `/api/user/gemini-key` | required | Save (validated, encrypted) / remove own Gemini key |
| GET | `/api/user/github-activity` | required | GitHub contribution calendar |
| GET | `/api/user/repo-languages?repo=` | required | Repository language breakdown |
| GET | `/api/user/history?page=&limit=` | required | Own analyses, newest first (limit 1–100, default 50) |
| GET | `/api/user/history/:id` | owner | One analysis |
| PATCH | `/api/user/history/:id` | owner | Update `title` / `notes` |
| DELETE | `/api/user/history/:id` | owner | Delete analysis and its uploads |
| POST | `/api/user/history/:id/uploads` | owner | Upload a document (multipart field `file`, optional `description`) |
| GET | `/api/user/history/:id/uploads` | owner | List an analysis's documents |
| GET | `/api/user/uploads/:uploadId` | owner | Download a document |
| DELETE | `/api/user/uploads/:uploadId` | owner | Delete a document |

"owner" routes answer 404 for other users' records, 400 for malformed ids and 401 without a session.

Uploads: max 5 MB, one file per request, 20 per analysis, `.pdf` `.png` `.jpg/.jpeg` `.md` `.txt`. The bytes must match the extension (PDF/PNG/JPEG signatures, UTF-8 without NUL bytes for text). Files are saved under random names with mode `0600`, are never served statically, and are always downloaded as attachments with `nosniff`.

### Trying the API with curl

Sign in through the app, then copy the `gr_session` cookie value from the browser's DevTools (Application → Cookies → `http://localhost:4000`).

```bash
COOKIE="gr_session=<value>"
curl -b "$COOKIE" "http://localhost:4000/api/user/history?limit=5"
curl -b "$COOKIE" -X PATCH -H "Content-Type: application/json" \
  -d '{"title":"Payments service","notes":"Review the queue worker"}' \
  http://localhost:4000/api/user/history/<analysisId>
curl -b "$COOKIE" -F "file=@design.md" -F "description=Design notes" \
  http://localhost:4000/api/user/history/<analysisId>/uploads
curl -b "$COOKIE" -OJ http://localhost:4000/api/user/uploads/<uploadId>
```

### Inspecting the database

Atlas: *Clusters → Browse Collections → gitreason*. Compass: paste the connection string. `mongosh`: copy the command from *Atlas → Connect → Shell* (it asks for the password instead of putting it on the command line), then:

```js
use gitreason
show collections
["users","sessions","analyses","uploads"].forEach(c => print(c, db[c].countDocuments()))
db.users.find({}, { geminiKeyEnc: 0 }).limit(5)
db.sessions.find({}, { githubTokenEnc: 0 }).limit(5)
db.analyses.find({}, { fileTree: 0, explanation: 0, "graph.nodes": 0, "graph.edges": 0 }).sort({ createdAt: -1 }).limit(5)
db.uploads.find().sort({ createdAt: -1 }).limit(5)
["users","sessions","analyses","uploads"].forEach(c => printjson(db[c].getIndexes()))
db.stats()
```

## Project structure

```text
client/
  src/
    pages/          application pages
    sections/       landing page sections
    graph/          interactive codebase graph
    lib/            shared client utilities

server/
  src/
    server.js       entry point: env check → MongoDB → HTTP
    app.js          Express app: middleware order + routers
    config/         env.js (all env vars), database.js (MongoDB connection)
    middleware/     cors, require-auth, require-ownership, validate, error-handler
    utils/          async-handler, encryption (AES-256-GCM)
    integrations/   github.js, gemini.js (external HTTP APIs)
    modules/
      auth/         GitHub OAuth, sessions (model, service, cookie)
      users/        user model/service, account routes
      analyses/     analysis pipeline, history CRUD
      uploads/      Multer upload, Knowledge documents
  scripts/          one-off SQLite → MongoDB migration
  test/unit/        pure functions (no database)
  test/integration/ API + startup tests (in-memory MongoDB or Atlas gitreason_test)
  BACKEND_GUIDE.md, VIVA_GUIDE.md, MANUAL_TESTING.md, EVALUATION_READINESS.md
```

## Deployment

The current V1 deployment topology is:

```text
Vercel
  │
  │ frontend
  ▼
React / Vite
  │
  │ HTTPS
  ▼
Render
  │
  │ Node / Express
  ▼
MongoDB Atlas
  │
  └── persistent application data
```

Gemini is used as the production model provider. Local development can use the same application with a local provider where configured.

### MongoDB Atlas

1. Create a cluster and a database user in [MongoDB Atlas](https://www.mongodb.com/atlas).
2. Allow the Render service's outbound IPs (or `0.0.0.0/0`) under Network Access.
3. Set `MONGODB_URI` to the `mongodb+srv://...` string with `/gitreason` as the database.

Collections and indexes are created automatically on startup.

#### Atlas Free tier

Current Atlas limits for a Free cluster ([Atlas service limits](https://www.mongodb.com/docs/atlas/reference/atlas-limits/)): 512 MB storage including indexes (a hard limit), 500 connections, and about 100 operations per second (excess is queued/throttled). Check *Cluster → Metrics* (storage, connections, opcounters) and *Data Explorer* for collection sizes. When storage is full, writes fail: new analyses are still shown to the user but are not saved (the server logs `Saving analysis failed`), and uploads return 500. Nothing upgrades automatically.

What keeps GitReason small: history pages are capped at 100 items with projections that skip the file tree; one analysis holds at most 20,000 tree entries, 200 nodes, 1,000 edges and 50 groups; re-analyzing an unchanged repository (same git tree SHA) reuses the saved analysis instead of saving a duplicate; anonymous and failed analyses are never saved; sessions expire through a TTL index; at most 20 documents per analysis, 5 MB each, with the bytes on the server's disk rather than in Atlas; the connection pool is capped at 10.

Uploaded files are written to `UPLOAD_DIR` on the server's disk. Render's default filesystem is ephemeral, so attach a persistent disk and point `UPLOAD_DIR` at it if uploads must survive redeploys.

### Render

Create a Node web service with `server` as the root directory.

- Build: `npm install`
- Start: `npm start`

Set the production environment variables, including:

```env
NODE_ENV=production
CLIENT_ORIGIN=https://<your-vercel-domain>
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_CALLBACK_URL=https://<your-render-domain>/api/auth/github/callback
SESSION_SECRET=...
GEMINI_API_KEY=...
GEMINI_MODEL=...
MONGODB_URI=...
MONGODB_DB=gitreason
UPLOAD_DIR=...
```

Render does not read your local `.env` or `atlas-credentials.env`; set these in the service's Environment settings. Never add the connection string to the Vercel project or to any `VITE_*` variable, because those are bundled into browser code.

Verify the backend with:

```text
GET https://<your-render-domain>/health
```

### Vercel

Create a Vercel project using `client` as the root directory.

- Framework: Vite
- Build: `npm run build`
- Output: `dist`
- Environment variable:

```env
VITE_API_URL=https://<your-render-domain>
```

Configure the GitHub OAuth App with the deployed Vercel homepage and Render callback URL.

## Current scope

GitReason currently focuses on repository structure and architecture understanding: repository ingestion, architecture explanation, structured diagrams, interactive graph exploration, source inspection, authentication, analysis history, and attached documents.

Planned directions include retrieval-augmented codebase Q&A, git-history risk analysis, change-impact analysis, persistent codebase knowledge, and agent-facing context/MCP integrations.

## Why GitReason

Coding agents are good at working inside a codebase. GitReason focuses on the step before that: building a fast, visual mental model of an unfamiliar system.

**Paste a repository. Map the system. Understand what you're changing.**
