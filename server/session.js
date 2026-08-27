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
  return await sessionsRepo.findById(id);
}

export function getSessionCookieId(req) {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE] || null;
}

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
