// Unit tests: environment configuration helpers (values are never printed).
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { missingRequiredEnv, databaseName, clientOrigins, uploadDir, SERVER_ROOT } from "../../src/config/env.js";

function withEnv(values, fn) {
  const saved = Object.fromEntries(Object.keys(values).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("missingRequiredEnv lists SESSION_SECRET and MONGODB_URI when unset or empty", () => {
  withEnv({ SESSION_SECRET: undefined, MONGODB_URI: "" }, () => {
    assert.deepEqual(missingRequiredEnv(), ["SESSION_SECRET", "MONGODB_URI"]);
  });
  withEnv({ SESSION_SECRET: "s", MONGODB_URI: "mongodb://localhost" }, () => {
    assert.deepEqual(missingRequiredEnv(), []);
  });
});

test("databaseName defaults to gitreason; MONGODB_DB overrides it", () => {
  withEnv({ MONGODB_DB: undefined }, () => assert.equal(databaseName(), "gitreason"));
  withEnv({ MONGODB_DB: "gitreason_test" }, () => assert.equal(databaseName(), "gitreason_test"));
});

test("clientOrigins splits and trims CLIENT_ORIGIN", () => {
  withEnv({ CLIENT_ORIGIN: " http://localhost:5173 , https://app.example.com ," }, () => {
    assert.deepEqual(clientOrigins(), ["http://localhost:5173", "https://app.example.com"]);
  });
  withEnv({ CLIENT_ORIGIN: undefined }, () => assert.deepEqual(clientOrigins(), []));
});

test("uploadDir defaults to server/uploads", () => {
  withEnv({ UPLOAD_DIR: undefined }, () => assert.equal(uploadDir(), path.join(SERVER_ROOT, "uploads")));
  assert.equal(path.basename(SERVER_ROOT), "server");
});
