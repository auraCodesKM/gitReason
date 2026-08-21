import crypto from "node:crypto";
import { parseRepoPath, fetchRepo, exchangeCodeForToken, fetchGitHubUser } from "./github.js";
import { usersRepo, sessionsRepo } from "./db/index.js";
import { getSession, getSessionCookieId, setSessionCookie, clearSessionCookie, SESSION_TTL_MS } from "./session.js";

const STATE_TTL_MS = 10 * 60 * 1000;

const pendingStates = new Map();

function prune(map, ttl) {
  const now = Date.now();
  for (const [key, entry] of map) {
    if (now - entry.createdAt > ttl) map.delete(key);
  }
}

function clientOrigin() {
  return process.env.CLIENT_ORIGIN || "";
}

function requireGithubEnv(res) {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_CALLBACK_URL } = process.env;
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !GITHUB_CALLBACK_URL) {
    res.status(500).json({
      status: "error",
      message: "GitHub OAuth is not configured on the server.",
    });
    return null;
  }
  return { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_CALLBACK_URL };
}

export async function handleRepoCheck(req, res) {
  const parsed = parseRepoPath(req.query.url);
  if (!parsed) {
    return res.status(400).json({ status: "invalid" });
  }

  const session = getSession(req);

  try {
    const result = await fetchRepo(parsed.owner, parsed.repo, session?.token);

    if (!result.found) {
      if (session) {
        return res.status(404).json({ status: "not_found", repo: parsed.fullName });
      }
      return res.json({ status: "auth_required", repo: parsed.fullName });
    }

    return res.json({ status: "ready", repo: result.repo });
  } catch (err) {
    if (err.message === "rate_limited") {
      return res.status(429).json({ status: "rate_limited", message: "GitHub rate limit reached." });
    }
    return res.status(502).json({ status: "error", message: "Could not reach GitHub." });
  }
}

export function handleAuthStart(req, res) {
  const env = requireGithubEnv(res);
  if (!env) return;

  const parsed = parseRepoPath(req.query.repo);
  if (!parsed) {
    return res.status(400).json({ status: "invalid" });
  }

  prune(pendingStates, STATE_TTL_MS);

  const state = crypto.randomBytes(24).toString("hex");
  pendingStates.set(state, { repo: parsed.fullName, createdAt: Date.now() });

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", env.GITHUB_CALLBACK_URL);
  authorizeUrl.searchParams.set("scope", "repo");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("allow_signup", "false");

  res.redirect(authorizeUrl.toString());
}

export async function handleAuthCallback(req, res) {
  const origin = clientOrigin();
  const { code, state, error } = req.query;

  function signError(reason, repo) {
    const repoPart = repo ? `&repo=${encodeURIComponent(repo)}` : "";
    res.redirect(`${origin}/sign?auth=error&reason=${reason}${repoPart}`);
  }

  if (error) {
    const pending = state && pendingStates.get(state);
    return signError("cancelled", pending?.repo);
  }

  const pending = state && pendingStates.get(state);
  if (!pending) {
    return signError("state_mismatch");
  }
  pendingStates.delete(state);

  if (Date.now() - pending.createdAt > STATE_TTL_MS) {
    return signError("expired", pending.repo);
  }

  const env = requireGithubEnv(res);
  if (!env) return;

  if (!code) {
    return signError("no_code", pending.repo);
  }

  const token = await exchangeCodeForToken({
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    code,
    redirectUri: env.GITHUB_CALLBACK_URL,
  });

  if (!token) {
    return signError("token_exchange_failed", pending.repo);
  }

  const [owner, repo] = pending.repo.split("/");

  let result;
  let githubUser;
  try {
    result = await fetchRepo(owner, repo, token);
    githubUser = await fetchGitHubUser(token);
  } catch (err) {
    return signError("github_unreachable", pending.repo);
  }

  if (!result.found) {
    return signError("not_found", pending.repo);
  }
  if (!githubUser) {
    return signError("github_unreachable", pending.repo);
  }

  const user = usersRepo.upsertFromGitHub(githubUser);
  const sessionId = sessionsRepo.create({ userId: user.id, token, ttlMs: SESSION_TTL_MS });
  setSessionCookie(res, sessionId);

  res.redirect(`${origin}/?auth=success&repo=${encodeURIComponent(pending.repo)}`);
}

export function handleAuthSession(req, res) {
  const session = getSession(req);
  if (!session) return res.json({ authenticated: false, user: null });

  const user = usersRepo.findById(session.userId);
  res.json({
    authenticated: true,
    user: user ? { username: user.username, avatarUrl: user.avatar_url } : null,
  });
}

export function handleAuthLogout(req, res) {
  const id = getSessionCookieId(req);
  if (id) sessionsRepo.deleteById(id);
  clearSessionCookie(res);
  res.json({ ok: true });
}
