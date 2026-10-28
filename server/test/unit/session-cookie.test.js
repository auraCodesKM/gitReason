// Unit tests: parsing and writing the gr_session cookie.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCookies, getSessionCookieId, setSessionCookie, clearSessionCookie } from "../../src/modules/auth/session.cookie.js";

function fakeResponse() {
  const headers = {};
  return { headers, setHeader(name, value) { headers[name.toLowerCase()] = value; } };
}

function withNodeEnv(value, fn) {
  const before = process.env.NODE_ENV;
  process.env.NODE_ENV = value;
  try {
    fn();
  } finally {
    if (before === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = before;
  }
}

test("parseCookies: several cookies, spaces, '=' inside values, encoded values", () => {
  assert.deepEqual(parseCookies("a=1; gr_session=abc; theme=dark=x; name=J%C3%BCrgen"), {
    a: "1", gr_session: "abc", theme: "dark=x", name: "Jürgen",
  });
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(parseCookies("novalue; =orphan"), {});
});

test("parseCookies: a malformed %-escape is skipped, not thrown", () => {
  assert.deepEqual(parseCookies("gr_session=%E0%A4%A; other=ok"), { other: "ok" });
  assert.equal(getSessionCookieId({ headers: { cookie: "gr_session=%E0%A4%A" } }), null);
});

test("session cookie: HttpOnly, 24 h, SameSite=Lax in development", () => {
  withNodeEnv("development", () => {
    const res = fakeResponse();
    setSessionCookie(res, "abc123");
    assert.equal(res.headers["set-cookie"], "gr_session=abc123; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax");
  });
});

test("session cookie: Secure + SameSite=None in production; logout expires it", () => {
  withNodeEnv("production", () => {
    const res = fakeResponse();
    setSessionCookie(res, "abc123");
    assert.match(res.headers["set-cookie"], /; HttpOnly; .*; Secure; SameSite=None$/);
    const out = fakeResponse();
    clearSessionCookie(out);
    assert.equal(out.headers["set-cookie"], "gr_session=; HttpOnly; Path=/; Max-Age=0; Secure; SameSite=None");
  });
});
