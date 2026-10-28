// Reading and writing the `gr_session` cookie. HTTP only - no database here.
import { isProduction } from "../../config/env.js";

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours, same for the cookie and the database row
export const SESSION_COOKIE = "gr_session";

/**
 * Parses a Cookie header into { name: value }. A value with a malformed
 * %-escape is skipped (treated as absent) instead of throwing, so a garbage
 * cookie means "signed out" (401), never a 500.
 * @param {string|undefined} header
 * @returns {Record<string, string>}
 */
export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      // malformed %-escape: ignore the cookie (treated as signed out), not a 500
    }
  }
  return out;
}

/** @returns {string|null} the raw session id from the request's cookie */
export function getSessionCookieId(req) {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE] || null;
}

// HttpOnly: page JavaScript cannot read the cookie, so an XSS bug cannot steal it.
// Production: the frontend and API are on different sites, so the cookie needs
// SameSite=None, which browsers only accept together with Secure (HTTPS only).
// Development (localhost): SameSite=Lax over plain HTTP.
export function cookieAttributes() {
  return isProduction() ? "; Secure; SameSite=None" : "; SameSite=Lax";
}

export function setSessionCookie(res, id) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${id}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${cookieAttributes()}`
  );
}

/** Max-Age=0 tells the browser to delete the cookie immediately. */
export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0${cookieAttributes()}`);
}
