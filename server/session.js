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

export function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const id = cookies[SESSION_COOKIE];
  if (!id) return null;
  return sessionsRepo.findById(id); // null if missing/expired (auto-deletes expired rows)
}

export function getSessionCookieId(req) {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE] || null;
}

export function setSessionCookie(res, id) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}
