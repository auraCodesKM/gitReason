// The single MongoDB connection used by the whole backend (Mongoose keeps one
// shared connection pool per process).
//
// Called by: src/server.js at startup (and the test suite).
// Reads/writes: nothing itself; it builds the indexes declared in the models.
// On failure: connectMongo throws; server.js logs a redacted message and exits,
// so the API never runs without its database.
import mongoose from "mongoose";
import { databaseName } from "./env.js";
import { User } from "../modules/users/user.model.js";
import { Session } from "../modules/auth/session.model.js";
import { Analysis } from "../modules/analyses/analysis.model.js";
import { Upload } from "../modules/uploads/upload.model.js";

// Reject query filters on fields that are not in the schema instead of silently ignoring them.
mongoose.set("strictQuery", true);

/** Removes any connection string (which contains the password) from an error message before it is logged. */
export function redactMongoError(err) {
  return String(err?.message || err).replace(/mongodb(\+srv)?:\/\/\S+/gi, "<connection string redacted>");
}

/**
 * Connects to MongoDB and makes sure every model's indexes exist.
 * @param {string} [uri] defaults to MONGODB_URI
 * @returns {Promise<mongoose.Connection>}
 * @throws if MONGODB_URI is missing or the cluster cannot be reached within 10 s
 */
export async function connectMongo(uri = process.env.MONGODB_URI) {
  if (!uri) throw new Error("MONGODB_URI is not set. Add it to server/.env (see .env.example).");
  await mongoose.connect(uri, {
    dbName: databaseName(), // wins over any database name inside the URI
    serverSelectionTimeoutMS: 10000, // fail startup after 10 s instead of hanging
    maxPoolSize: 10, // well under the 500-connection limit of Atlas Free
  });
  // init() builds each schema's indexes (unique, TTL, compound) once at startup,
  // so uniqueness and session expiry are enforced by MongoDB itself.
  await Promise.all([User, Session, Analysis, Upload].map((model) => model.init()));
  return mongoose.connection;
}

export function disconnectMongo() {
  return mongoose.disconnect();
}

/** Used by GET /health. readyState 1 = connected. */
export function mongoStatus() {
  const conn = mongoose.connection;
  return { connected: conn.readyState === 1, name: conn.name || null };
}
