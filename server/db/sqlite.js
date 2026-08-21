import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { SCHEMA_SQL } from "./schema.js";

// node:sqlite's API is synchronous — wrapped in resolved Promises so
// db/repository/*.js can `await` uniformly regardless of which provider
// (this or turso.js) is actually running underneath.
export function createSqliteDb() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dataDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const raw = new DatabaseSync(path.join(dataDir, "gitreason.db"));
  raw.exec(SCHEMA_SQL);

  return {
    prepare(sql) {
      const stmt = raw.prepare(sql);
      return {
        run: async (...params) => stmt.run(...params),
        get: async (...params) => stmt.get(...params),
        all: async (...params) => stmt.all(...params),
      };
    },
  };
}
