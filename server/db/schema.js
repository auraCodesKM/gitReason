// Shared by both adapters (sqlite.js, turso.js) so the schema can never
// drift between local dev and production — one source of truth.
export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    github_id INTEGER UNIQUE NOT NULL,
    username TEXT NOT NULL,
    avatar_url TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    github_token_enc TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    repo_full_name TEXT NOT NULL,
    status TEXT NOT NULL,
    file_tree_json TEXT NOT NULL,
    explanation TEXT,
    graph_json TEXT,
    error_message TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_analyses_user ON analyses(user_id, created_at DESC);
`;

// Forward-only, idempotent migrations for columns added after the initial
// CREATE TABLE — SQLite/libSQL don't support "ADD COLUMN IF NOT EXISTS"
// portably, so each adapter runs these individually and ignores the
// "duplicate column" error when a column already exists.
export const MIGRATIONS = [
  // Encrypted per-user Gemini API key (AES-256-GCM, same as github_token_enc)
  // — lets a signed-in user use their own quota instead of the shared
  // server key. NULL means "use the server's GEMINI_API_KEY".
  `ALTER TABLE users ADD COLUMN gemini_key_enc TEXT`,
  // GitHub's own repo.language, already fetched by fetchRepo() during
  // analysis but never persisted — the dashboard's codebase list needs it
  // to avoid inventing one. NULL for rows analyzed before this existed, or
  // for repos GitHub itself reports no primary language for.
  `ALTER TABLE analyses ADD COLUMN language TEXT`,
];

export function isDuplicateColumnError(err) {
  return /duplicate column name/i.test(err?.message || "");
}
