import { createSqliteDb } from "./sqlite.js";
import { createTursoDb } from "./turso.js";

const provider = process.env.DATABASE_PROVIDER === "turso" ? "turso" : "sqlite";

export const db = provider === "turso" ? await createTursoDb() : createSqliteDb();
