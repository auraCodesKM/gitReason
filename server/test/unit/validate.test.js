// Unit tests: request validation helpers (no database, no HTTP server).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePagination, validateObjectId } from "../../src/middleware/validate.js";

// Runs one middleware with a fake req/res and reports what it did.
function runMiddleware(middleware, params) {
  const result = { status: null, body: null, nextCalled: false };
  const res = {
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; },
  };
  middleware({ params }, res, () => { result.nextCalled = true; });
  return result;
}

test("parsePagination: defaults, accepted values and rejected values", () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 50 });
  assert.deepEqual(parsePagination({ page: "3", limit: "100" }), { page: 3, limit: 100 });
  for (const query of [{ page: "0" }, { page: "-1" }, { page: "1.5" }, { page: "abc" }, { limit: "0" }, { limit: "101" }, { limit: "" }]) {
    assert.equal(parsePagination(query), null, JSON.stringify(query));
  }
});

test("validateObjectId: 24 hex characters pass, anything else is a 400", () => {
  const check = validateObjectId("id");
  assert.equal(runMiddleware(check, { id: "0123456789abcdefABCDEF01" }).nextCalled, true);
  for (const id of ["not-an-id", "123", "0123456789abcdef0123456z", "", undefined, "0123456789abcdef01234567x"]) {
    const r = runMiddleware(check, { id });
    assert.equal(r.nextCalled, false, String(id));
    assert.equal(r.status, 400);
    assert.deepEqual(r.body, { status: "invalid", message: "Invalid id." });
  }
});
