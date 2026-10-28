// Integration tests: the real entry point (src/server.js) started as a child
// process, exactly as `npm start` does. The child gets only the variables
// listed here - never the developer's .env or Atlas credentials - and the
// successful start uses a throwaway in-memory MongoDB.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";

const SERVER = fileURLToPath(new URL("../../src/server.js", import.meta.url));
let mongod;

function startServer(env) {
  const child = spawn(process.execPath, [SERVER], { env: { PATH: process.env.PATH, ...env } });
  child.output = "";
  child.stdout.on("data", (d) => (child.output += d));
  child.stderr.on("data", (d) => (child.output += d));
  child.exited = once(child, "exit").then(([code]) => code);
  return child;
}

async function waitForOutput(child, pattern, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (!pattern.test(child.output)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${pattern}; output:\n${child.output}`);
    await new Promise((r) => setTimeout(r, 50));
  }
  return child.output.match(pattern);
}

after(async () => {
  await mongod?.stop();
});

test("startup: refuses to start without SESSION_SECRET or MONGODB_URI", async () => {
  const noSecret = startServer({ MONGODB_URI: "mongodb://127.0.0.1:1" });
  assert.equal(await noSecret.exited, 1);
  assert.match(noSecret.output, /SESSION_SECRET is not set/);

  const noUri = startServer({ SESSION_SECRET: "x" });
  assert.equal(await noUri.exited, 1);
  assert.match(noUri.output, /MONGODB_URI is not set/);
});

test("startup: a bad connection string exits with code 1 and the password is not logged", async () => {
  const child = startServer({ SESSION_SECRET: "x", MONGODB_URI: "not-mongodb://user:hunter2@cluster.example" });
  assert.equal(await child.exited, 1);
  assert.match(child.output, /Could not connect to MongoDB/);
  assert.doesNotMatch(child.output, /hunter2/);
  assert.doesNotMatch(child.output, /server running/, "never starts HTTP without a database");
});

test("startup: valid configuration connects, serves /health, and shuts down cleanly on SIGTERM", async () => {
  mongod = await MongoMemoryServer.create();
  const child = startServer({
    SESSION_SECRET: "x",
    MONGODB_URI: mongod.getUri(),
    MONGODB_DB: "gitreason_test",
    PORT: "0", // any free port
  });
  try {
    await waitForOutput(child, /MongoDB connected: database "gitreason_test"/);
    const [, port] = await waitForOutput(child, /server running on port (\d+)/);

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.database, "ok");
    assert.equal(body.databaseName, "gitreason_test");

    child.kill("SIGTERM");
    assert.equal(await child.exited, 0);
    assert.match(child.output, /SIGTERM received, shutting down/);
  } finally {
    child.kill("SIGKILL"); // no-op if it already exited
  }
});
