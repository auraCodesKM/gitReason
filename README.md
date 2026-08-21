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
- **Persistence** — Node's native `node:sqlite` (no ORM). Every table is accessed through a small repository layer in `server/db/`, so the storage backend can be swapped later (Mongo, Postgres, whatever) without touching any call site.
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
  db/                         SQLite schema + repository layer (users, sessions, analyses)
```

## Current scope

This covers repository structure, dependencies, and architecture — a public/private repo URL in, an explained and diagrammed codebase out, with history for signed-in users. It does not yet do retrieval-augmented Q&A over the codebase, git-history-based risk scoring, or change-impact analysis. The pipeline is staged specifically so those can be added as later steps without rewriting what's already here.
