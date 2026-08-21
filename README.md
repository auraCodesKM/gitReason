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
- **Analysis history** — signed-in users can reopen saved analyses without paying for another model call.

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

- Native `node:sqlite` for local development
- Turso / libSQL for production
- Small repository layer keeps application code independent of the database backend

### Authentication

- GitHub OAuth Authorization Code flow
- Opaque `HttpOnly` sessions
- GitHub access tokens encrypted at rest with AES-256-GCM
- Tokens are never exposed to the client or written to logs

## Local development

### Requirements

- Node.js 22+
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

## Project structure

```text
client/
  src/
    pages/          application pages
    sections/       landing page sections
    graph/          interactive codebase graph
    lib/            shared client utilities

server/
  server.js         Express entry point
  analyze.js        repository analysis pipeline
  github.js         GitHub API integration
  llm.js            Gemini integration
  noiseFilter.js    repository tree filtering
  auth.js           GitHub OAuth flow
  session.js        session handling
  db/
    schema.js       shared schema
    client.js       database provider selection
    sqlite.js       local SQLite adapter
    turso.js        production Turso adapter
    repository/     users, sessions, and analyses
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
Turso
  │
  └── persistent application data
```

Gemini is used as the production model provider. Local development can use the same application with a local provider where configured.

### Turso

1. Create a database in the [Turso dashboard](https://turso.tech) or with the CLI.
2. Obtain:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
3. Set `DATABASE_PROVIDER=turso` in production.

The application creates its required tables automatically from the shared schema.

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
DATABASE_PROVIDER=turso
TURSO_DATABASE_URL=...
TURSO_AUTH_TOKEN=...
```

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

GitReason currently focuses on repository structure and architecture understanding: repository ingestion, architecture explanation, structured diagrams, interactive graph exploration, source inspection, authentication, and analysis history.

Planned directions include retrieval-augmented codebase Q&A, git-history risk analysis, change-impact analysis, persistent codebase knowledge, and agent-facing context/MCP integrations.

## Why GitReason

Coding agents are good at working inside a codebase. GitReason focuses on the step before that: building a fast, visual mental model of an unfamiliar system.

**Paste a repository. Map the system. Understand what you're changing.**
