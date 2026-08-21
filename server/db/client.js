import { createSqliteDb } from "./sqlite.js";
import { createTursoDb } from "./turso.js";

// DATABASE_PROVIDER=turso in production (Render + Turso). Unset/anything
// else falls back to local node:sqlite — the same default local dev has
// always used, no env setup required to keep developing locally.
const provider = process.env.DATABASE_PROVIDER === "turso" ? "turso" : "sqlite";

export const db = provider === "turso" ? await createTursoDb() : createSqliteDb();
