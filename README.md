<div align="center">

<img src="client/public/favicon.svg" alt="GitReason logo" width="120">

# GitReason

**Maps any GitHub repository into an architecture explanation and an interactive dependency graph, with every node
checked against the real file tree.**

[![live: git-reason.vercel.app](https://img.shields.io/badge/live-git--reason.vercel.app-000000?logo=vercel&logoColor=white)](https://git-reason.vercel.app)
[![tests: node --test](https://img.shields.io/badge/tests-node%20----test-339933?logo=nodedotjs&logoColor=white)](server/test)

![Gemini: API](https://img.shields.io/badge/Gemini-API-8E75B2?logo=googlegemini&logoColor=white)
![Node.js: 22](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)
![Express: 4](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![MongoDB: Mongoose](https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white)
![React: 18](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Vite: 8](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![D3: force graph](https://img.shields.io/badge/D3-force%20graph-F9A03C?logo=d3&logoColor=white)

</div>

GitReason reads a repository's file tree and README, asks Gemini for an architecture explanation and a graph, validates
the graph against the actual file paths, and renders it as an explorable map with source previews. Live at
[git-reason.vercel.app](https://git-reason.vercel.app).

## The problem

Opening an unfamiliar repository means hours of clicking through folders to build a mental model. LLM summaries help,
but a diagram is only useful if every box in it points at something real.

## What it does

- **Fetches the real repository.** GitHub tree and README for public repos without sign-in, private repos through GitHub
  OAuth.
- **Filters noise.** Drops dependency folders, build output, lockfiles and binaries before anything reaches the model.
- **Explains the architecture.** A plain-English summary of how the repository is organised.
- **Generates a graph and checks it.** Gemini returns the graph as JSON. Every node path is checked against the real
  tree; if anything is invalid, the list of problems goes back to Gemini for a corrected answer (up to 3 attempts), and
  anything still invalid is pruned before rendering.
- **Streams progress.** Each phase (access check, tree, README, explanation, graph, save) arrives over Server-Sent Events.
- **Lets you explore.** Layered architecture view (Mermaid) and an interactive force graph (D3): search, pan/zoom, local
  graph, filtering, blast-radius exploration, and syntax-highlighted source for any node.
- **Remembers analyses.** Signed-in users can reopen, rename, annotate and delete analyses. Re-analysing an unchanged
  repository (same git tree SHA) reuses the saved result instead of calling the model again.
- **Attaches documents.** Upload design notes or diagrams (PDF, PNG, JPG, Markdown, text) to a saved analysis.

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

The server is split into feature modules (`auth`, `users`, `analyses`, `uploads`), each with routes → controllers →
services → Mongoose models, so route handlers hold no query code. External calls live in `integrations/github.js` and
`integrations/gemini.js`.

## Security

- GitHub OAuth (Authorization Code flow) with opaque `HttpOnly` session cookies; the session id stored in MongoDB is the
  SHA-256 of the cookie value.
- GitHub tokens and users' own Gemini keys are encrypted at rest with AES-256-GCM and never sent to the client or logged.
- Signed-in users analyse with their own Gemini key (validated before it is saved); anonymous runs use the server key.
- Owner-only routes return 404 for other users' records, 400 for malformed ids, 401 without a session.
- Uploads: 5 MB max, 20 per analysis, and the bytes must match the extension (PDF/PNG/JPEG signatures, UTF-8 without NUL
  bytes for text). Files get random names with mode `0600`, are never served statically, and download as attachments
  with `nosniff`.

## Tech stack

| Layer | Used |
|---|---|
| Client | React 18, Vite, Mermaid, D3 (force, zoom, drag), Shiki, `markdown-to-jsx`, Tailwind CSS |
| Server | Node.js 22, Express, Server-Sent Events, Multer |
| AI | Gemini API (`generateContent`); model set by `GEMINI_MODEL` |
| Data | MongoDB (local or Atlas) through Mongoose |
| Hosting | Vercel (client), Render (server), MongoDB Atlas |

## Tests

```bash
cd server
npm test        # 46 tests, all passing (run 2026-11-21)
```

The suite starts a throwaway MongoDB (`mongodb-memory-server`) and a temporary uploads folder. GitHub and Gemini are
stubbed; Express, middleware, Multer, Mongoose and MongoDB are real. It covers the graph validator and repair, encryption,
session cookies, env checks, upload validation and the HTTP API, including ownership checks. `npm run test:atlas` runs
the same suite against a real cluster, using only a separate `gitreason_test` database.

## Quickstart

Requirements: Node.js 22.9+, MongoDB 6+ (local or a free Atlas cluster), a GitHub OAuth App, a Gemini API key from
[Google AI Studio](https://aistudio.google.com/apikey).

```bash
git clone https://github.com/auraCodesKM/gitReason.git
cd gitReason
(cd client && npm install)
(cd server && npm install)
cp server/.env.example server/.env
```

Create a [GitHub OAuth App](https://github.com/settings/developers) with homepage `http://localhost:5173` and callback
`http://localhost:4000/api/auth/github/callback`, then fill in `server/.env`:

```env
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_CALLBACK_URL=http://localhost:4000/api/auth/github/callback
CLIENT_ORIGIN=http://localhost:5173
SESSION_SECRET=...        # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
GEMINI_API_KEY=...
MONGODB_URI=mongodb://127.0.0.1:27017
```

`npm start` / `npm run dev` also read `../atlas-credentials.env` (the file Atlas generates); keep `MONGODB_URI` in one
place. The server refuses to start without a reachable MongoDB; collections and indexes are created on startup.

```bash
(cd server && npm run dev)     # terminal 1, http://localhost:4000
(cd client && npm run dev)     # terminal 2, http://localhost:5173
curl http://localhost:4000/health
# {"status":"ok","database":"ok","databaseName":"gitreason",...}
```

Upgrading from the older SQLite version: `cd server && node --env-file-if-exists=.env scripts/migrate-sqlite-to-mongo.js`
(read-only on the SQLite side, safe to re-run).

## API

All routes are under the server origin. Auth: *optional* = works signed out, *required* = needs a session, *owner* = the
record must belong to you.

| Area | Routes |
|---|---|
| Health | `GET /health` (server + MongoDB status) |
| Analysis | `GET /api/analyze/stream?repo=` (SSE, optional) · `GET /api/repo/check` · `GET /api/repo/file` |
| Auth | `GET /api/auth/github/start` · `GET /api/auth/github/callback` · `GET /api/auth/session` · `POST /api/auth/logout` |
| Account | `POST`/`DELETE /api/user/gemini-key` · `GET /api/user/github-activity` · `GET /api/user/repo-languages` (required) |
| History | `GET /api/user/history` (required, paged, max 100) · `GET`/`PATCH`/`DELETE /api/user/history/:id` (owner) |
| Uploads | `POST`/`GET /api/user/history/:id/uploads` · `GET`/`DELETE /api/user/uploads/:uploadId` (owner) |

MongoDB collections: `users`, `sessions` (TTL on `expiresAt`), `analyses` (graph and file tree embedded), `uploads`
(metadata only; bytes on disk in `UPLOAD_DIR`). Details: [`server/BACKEND_GUIDE.md`](server/BACKEND_GUIDE.md).

## Deployment

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

- **Render** (server): root `server`, build `npm install`, start `npm start`. Set the variables from `server/.env.example`
  with production values (`NODE_ENV=production`, Vercel origin, Render callback URL, `MONGODB_DB=gitreason`).
- **Vercel** (client): root `client`, framework Vite, output `dist`, `VITE_API_URL=https://<your-render-domain>`. Never put
  the MongoDB string in any `VITE_*` variable; those are bundled into browser code.
- **Atlas Free tier** (512 MB): the app stays small by design. It caps a saved analysis at 20,000 tree entries, 200 nodes,
  1,000 edges and 50 groups, reuses analyses for unchanged trees, never saves anonymous or failed runs, expires sessions
  with a TTL index, and caps the connection pool at 10.
- Render's filesystem is ephemeral: attach a persistent disk for `UPLOAD_DIR` if uploads must survive redeploys.

## Project structure

```text
client/src/
  pages/          application pages
  sections/       landing page sections
  graph/          interactive codebase graph
  lib/            API client and shared utilities
server/
  src/server.js   entry: env check → MongoDB → HTTP
  src/app.js      Express app: middleware order + routers
  src/config/     env.js, database.js
  src/middleware/ cors, require-auth, require-ownership, validate, error-handler
  src/integrations/ github.js, gemini.js
  src/modules/    auth, users, analyses, uploads
  scripts/        one-off SQLite → MongoDB migration
  test/           unit (pure functions) and integration (API + startup)
```

More: [`BACKEND_GUIDE.md`](server/BACKEND_GUIDE.md) · [`MANUAL_TESTING.md`](server/MANUAL_TESTING.md) ·
[`EVALUATION_READINESS.md`](server/EVALUATION_READINESS.md) · [`VIVA_GUIDE.md`](server/VIVA_GUIDE.md)

## Design choices and roadmap

- **Structure from the tree and README.** The model works from the filtered file tree and up to 4,000 characters of the
  README, which keeps each analysis to an explanation call plus a graph call (up to three with corrections); node paths are
  then validated against the real tree.
- **Reuse by tree SHA.** An unchanged repository returns its saved analysis instantly, with no model call and no duplicate
  storage, which also keeps the app inside the Atlas free tier.
- **Bring your own key.** Signed-in users run analyses on their own Gemini key, encrypted at rest, so usage scales without
  a shared quota.
- **Roadmap:** retrieval-augmented Q&A over the code, git-history risk and change-impact analysis, a graph-accuracy
  evaluation set, and agent-facing context through MCP.
