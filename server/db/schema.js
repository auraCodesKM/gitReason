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

export const MIGRATIONS = [
  `ALTER TABLE users ADD COLUMN gemini_key_enc TEXT`,
  `ALTER TABLE analyses ADD COLUMN language TEXT`,
];

export function isDuplicateColumnError(err) {
  return /duplicate column name/i.test(err?.message || "");
}
