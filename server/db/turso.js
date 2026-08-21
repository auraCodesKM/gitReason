import { createClient } from "@libsql/client";
import { SCHEMA_SQL, MIGRATIONS, isDuplicateColumnError } from "./schema.js";

// Turso (libSQL) is wire-compatible SQLite over HTTP — same SQL, same `?`
// placeholders, genuinely async client. Exposes the identical
// prepare(sql).run/get/all(...params) shape as sqlite.js so
// db/repository/*.js never needs to know which provider is live.
export async function createTursoDb() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    throw new Error(
      "DATABASE_PROVIDER=turso requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to be set."
    );
  }

  const client = createClient({ url, authToken });
  await client.executeMultiple(SCHEMA_SQL);
  for (const sql of MIGRATIONS) {
    try {
      await client.execute(sql);
    } catch (err) {
      if (!isDuplicateColumnError(err)) throw err;
    }
  }

  return {
    prepare(sql) {
      return {
        run: async (...params) => {
          const result = await client.execute({ sql, args: params });
          return { changes: result.rowsAffected, lastInsertRowid: result.lastInsertRowid };
        },
        get: async (...params) => {
          const result = await client.execute({ sql, args: params });
          return result.rows[0] || undefined;
        },
        all: async (...params) => {
          const result = await client.execute({ sql, args: params });
          return result.rows;
        },
      };
    },
  };
}
