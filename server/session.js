import { sessionsRepo } from "./db/index.js";

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_COOKIE = "gr_session";

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export async function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const id = cookies[SESSION_COOKIE];
  if (!id) return null;
  return await sessionsRepo.findById(id); // null if missing/expired (auto-deletes expired rows)
}

export function getSessionCookieId(req) {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE] || null;
}

// Local dev: client (:5173) and server (:4000) are different ports, but
// Vite's dev proxy makes every /api request same-origin from the browser's
// point of view, so SameSite=Lax works. Production (Vercel frontend, Render
// backend) is genuinely cross-site — the browser talks to a different
// origin directly, which SameSite=Lax cookies are never sent on. That
// requires SameSite=None, which browsers only honor together with Secure.
// Not a weaker cookie either way: still HttpOnly, still Secure in prod,
// still an unguessable random id — SameSite=None is the correct setting
// for this topology, not a relaxation for convenience.
function cookieAttrs() {
  return process.env.NODE_ENV === "production" ? "; Secure; SameSite=None" : "; SameSite=Lax";
}

export function setSessionCookie(res, id) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${id}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${cookieAttrs()}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0${cookieAttrs()}`);
}
