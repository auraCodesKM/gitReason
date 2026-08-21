# GitReason

Point GitReason at a GitHub repository and it produces a plain-English explanation of the codebase's architecture plus an interactive dependency diagram, generated from the repo's real file tree and README — not a canned template. Click a diagram node or a file in the tree and its actual source opens in a syntax-highlighted preview panel.

Public repositories work without signing in. Private repositories are gated behind GitHub OAuth. Signed-in users get a dashboard with their analysis history, so reopening a repo they've already analyzed is instant — no LLM call, no wait.

## How it works

1. **Fetch** — repo metadata and the full recursive file tree come from the GitHub REST API (Basic-auth with the app's own OAuth credentials for public repos, to stay well under the 60 req/hr unauthenticated limit; the user's Bearer token for private ones).
2. **Filter** — `node_modules`, `.git`, lockfiles, build output directories, and binary/media extensions are stripped before anything is sent to a model. What's left is capped to a few hundred entries per prompt to keep calls fast and cheap.
3. **Explain** — one LLM call turns the filtered tree plus the README into a short architecture explanation (Gemini, `gemini-3.5-flash-lite` by default — cheap and fast enough to stay inside free-tier limits; configurable via `GEMINI_MODEL`).
4. **Graph** — a second call asks for a JSON graph (groups, nodes, edges) with the constraint that every node's `path` must be a real path from the tree. The response is validated against the actual file list; if any node or edge references something that doesn't exist, the model is re-prompted with the specific error and given up to three attempts before the response is repaired by dropping only the invalid parts.
5. **Render** — the validated graph is compiled to Mermaid.js on the client: nodes get a shape based on their role (entry point, service, data store, or plain file/dir) and are grouped into color-coded lanes by architectural layer.
6. **Persist** — if the user is signed in, the tree, explanation, and graph are saved to SQLite so the same analysis reopens instantly later. Anonymous checks on public repos still work end to end, they just aren't saved anywhere.

## Stack

- **Client** — React 18 + Vite, plain JS. No router library; routing is a one-line pathname switch in `main.jsx` (`/`, `/sign`, `/analyze`, `/dashboard`). Mermaid.js renders diagrams, Shiki highlights previewed source files, `markdown-to-jsx` renders the explanation text. Every page and section has its own hand-written CSS file — no CSS framework or component library is in use.
- **Server** — Express (ESM), zero build step. Analysis progress streams to the client over Server-Sent Events rather than a single blocking request, since a real LLM call can take several seconds and the UI should show what's actually happening, not a spinner.
- **Persistence** — Node's native `node:sqlite` locally (no ORM), [Turso](https://turso.tech) (libSQL, wire-compatible SQLite) in production. Every table is accessed through a small async repository layer in `server/db/repository/`; `server/db/client.js` picks the backend via `DATABASE_PROVIDER` and the repository code never changes either way.
- **Auth** — standard GitHub OAuth Authorization Code flow, hand-rolled (no `passport` or session middleware dependency). Sessions are opaque tokens in an `HttpOnly` cookie; the underlying GitHub access token is encrypted at rest with AES-256-GCM and is never sent to the client or logged.

No dependency was added for something a native Node or browser API already covers — `fetch`, `crypto`, and `node:sqlite` do most of the heavy lifting.

## Getting started

You'll need Node 22+ (for `node:sqlite`), a GitHub OAuth App, and a Gemini API key.

```bash
git clone https://github.com/auraCodesKM/gitReason.git
cd gitReason
(cd client && npm install)
(cd server && npm install)
```

**GitHub OAuth App** — create one at [github.com/settings/developers](https://github.com/settings/developers):
- Homepage URL: `http://localhost:5173`
- Authorization callback URL: `http://localhost:4000/api/auth/github/callback`

**Gemini API key** — get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

**Environment** — copy the example and fill it in:

```bash
cd server
cp .env.example .env
```

```
GITHUB_CLIENT_ID=<from the OAuth app>
GITHUB_CLIENT_SECRET=<from the OAuth app>
GITHUB_CALLBACK_URL=http://localhost:4000/api/auth/github/callback
CLIENT_ORIGIN=http://localhost:5173

SESSION_SECRET=<generate with the command below>
GEMINI_API_KEY=<from AI Studio>
GEMINI_MODEL=gemini-3.5-flash-lite
```

Generate `SESSION_SECRET` (it encrypts GitHub tokens at rest, so it's required — the server refuses to start without it):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Run it** (two terminals):

```bash
cd server && npm run dev
cd client && npm run dev
```

Open `http://localhost:5173`.

## Project layout

```
client/src/
  App.jsx, sections/        landing page
  pages/SignPage.jsx         GitHub OAuth entry point
  pages/AnalyzePage.jsx      diagram + explanation + file preview
  pages/DashboardPage.jsx    identity, history, stats
  lib/graphToMermaid.js      graph AST -> Mermaid syntax compiler

server/
  github.js                  GitHub REST API calls
  llm.js                     Gemini API calls
  analyze.js                 the pipeline described above, streamed over SSE
  noiseFilter.js              tree filtering rules
  auth.js, session.js         OAuth flow, cookies, session lookup
  db/
    schema.js                 shared SQL schema (both providers)
    sqlite.js, turso.js        low-level adapters, same prepare().run/get/all() shape
    client.js                  picks the adapter via DATABASE_PROVIDER
    repository/                users/sessions/analyses — the only thing other modules import from
```

## Deployment (V1 team evaluation)

Topology: **Vercel** (frontend, static) → **Render** (backend, Node) → **Turso** (database). Nobody needs local Node, a cloned repo, or local env vars to use the deployed app — only to develop on it.

### A. Turso (database)

1. Install the CLI and sign up: `curl -sSfL https://get.tur.so/install.sh | bash` then `turso auth signup` (or use the [Turso dashboard](https://turso.tech) instead of the CLI throughout).
2. Create a database: `turso db create gitreason`.
3. Get the connection values:
   ```bash
   turso db show gitreason --url          # → TURSO_DATABASE_URL
   turso db tokens create gitreason       # → TURSO_AUTH_TOKEN
   ```
4. Nothing else to do — the app creates its own tables on first connect (same `CREATE TABLE IF NOT EXISTS` schema as local SQLite, from `server/db/schema.js`).

### B. Render (backend)

1. New **Web Service** → connect this repo → **Root Directory: `server`**.
2. Build command: `npm install`. Start command: `npm start`.
3. Environment variables (Render dashboard → Environment):
   ```
   NODE_ENV=production
   PORT=4000                                  # Render sets/overrides this itself — fine either way
   CLIENT_ORIGIN=https://<your-vercel-domain>.vercel.app
   GITHUB_CLIENT_ID=...
   GITHUB_CLIENT_SECRET=...
   GITHUB_CALLBACK_URL=https://<your-render-service>.onrender.com/api/auth/github/callback
   SESSION_SECRET=...                         # generate fresh for production, don't reuse the local one
   GEMINI_API_KEY=...
   GEMINI_MODEL=gemini-3.5-flash-lite
   DATABASE_PROVIDER=turso
   TURSO_DATABASE_URL=...
   TURSO_AUTH_TOKEN=...
   ```
4. Deploy, then check `https://<your-render-service>.onrender.com/health` returns `{"status":"ok","database":"ok",...}`.
5. Free tier note: the service spins down after inactivity and takes ~30-60s to wake on the next request — expected for a free V1 evaluation deploy, not a bug.

### C. Vercel (frontend)

1. New Project → connect this repo → **Root Directory: `client`**.
2. Framework preset: Vite (auto-detected). Build command `npm run build`, output `dist` (defaults — no change needed).
3. Environment variable:
   ```
   VITE_API_URL=https://<your-render-service>.onrender.com
   ```
4. Deploy. `client/vercel.json` already handles SPA routing (`/analyze`, `/sign`, `/dashboard` all serve `index.html` on direct load/refresh).

### D. GitHub OAuth App configuration

Once both URLs are known:

1. [github.com/settings/developers](https://github.com/settings/developers) → your OAuth App (or create one for this deployment specifically, separate from your local-dev app).
2. Homepage URL: `https://<your-vercel-domain>.vercel.app`
3. Authorization callback URL: `https://<your-render-service>.onrender.com/api/auth/github/callback` — must match `GITHUB_CALLBACK_URL` on Render **exactly**, including scheme.
4. Put that app's Client ID/Secret into Render's env vars (step B.3), not Vercel's — the frontend never sees them.

### Deployment checklist

- [ ] Turso database created, `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` in hand
- [ ] Render service deployed with `DATABASE_PROVIDER=turso` and all env vars from B.3 set
- [ ] `GET https://<render-service>.onrender.com/health` → `{"status":"ok","database":"ok"}`
- [ ] Vercel project deployed with `VITE_API_URL` pointing at the Render URL
- [ ] GitHub OAuth App's callback URL matches `GITHUB_CALLBACK_URL` on Render exactly
- [ ] Fresh `SESSION_SECRET` generated for production (not copied from local `.env`)
- [ ] Full flow tested end to end on the live URLs: sign in with GitHub → analyze a public repo → analyze a private repo → reload `/dashboard` and confirm history persists (proves Turso, not just in-memory state)
- [ ] `.env`, `.env.local`, and no `*.db` files present in `git status` before pushing
- [ ] Local dev still works unchanged: `server && npm run dev` (defaults to local SQLite), `client && npm run dev` (relative `/api` paths via the Vite proxy)

## Current scope

This covers repository structure, dependencies, and architecture — a public/private repo URL in, an explained and diagrammed codebase out, with history for signed-in users. It does not yet do retrieval-augmented Q&A over the codebase, git-history-based risk scoring, or change-impact analysis. The pipeline is staged specifically so those can be added as later steps without rewriting what's already here.
