import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { SCHEMA_SQL, MIGRATIONS, isDuplicateColumnError } from "./schema.js";

export function createSqliteDb() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dataDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const raw = new DatabaseSync(path.join(dataDir, "gitreason.db"));
  raw.exec(SCHEMA_SQL);
  for (const sql of MIGRATIONS) {
    try {
      raw.exec(sql);
    } catch (err) {
      if (!isDuplicateColumnError(err)) throw err;
    }
  }

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
