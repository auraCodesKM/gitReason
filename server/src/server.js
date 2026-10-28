// Entry point (npm start / npm run dev).
// Startup order: check required settings -> connect to MongoDB -> start HTTP.
// If any step fails the process exits with code 1: the API never runs
// without its database or its encryption secret.
import { createApp } from "./app.js";
import { REQUIRED_ENV, missingRequiredEnv, port } from "./config/env.js";
import { connectMongo, disconnectMongo, redactMongoError } from "./config/database.js";

for (const name of missingRequiredEnv()) {
  console.error(REQUIRED_ENV[name]);
  process.exit(1);
}

// Last-resort logging. An unexpected synchronous crash leaves the process in an
// unknown state, so it exits and the host restarts it.
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err?.stack || err?.message || err);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err?.stack || err?.message || err);
  process.exit(1);
});

// No database, no server: fail fast instead of running without persistence.
try {
  const conn = await connectMongo();
  console.log(`MongoDB connected: database "${conn.name}"`);
} catch (err) {
  console.error("Could not connect to MongoDB:", redactMongoError(err));
  process.exit(1);
}

const PORT = port();
const server = createApp().listen(PORT, "0.0.0.0", () => {
  console.log(`GitReason server running on port ${server.address().port}`);
});

// Close HTTP and the MongoDB pool on Ctrl+C / host restarts, so connections
// to the cluster are released instead of lingering until they time out.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    console.log(`${signal} received, shutting down`);
    server.close(() => disconnectMongo().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref(); // open SSE streams must not block exit
  });
}
