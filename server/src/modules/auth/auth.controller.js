// Authentication: "who is this?" - GitHub OAuth sign-in, session status, logout.
//
// Sign-in flow (OAuth 2.0 authorization code):
//   1. GET /api/auth/github/start    -> redirect the browser to GitHub with a random `state`
//   2. user approves on github.com   -> GitHub redirects to our callback with ?code&state
//   3. GET /api/auth/github/callback -> check state, swap code for a token (server-to-server),
//      fetch the GitHub profile, upsert the user, create a session, set the cookie,
//      redirect back to the frontend.
// Every failure in step 3 redirects to /sign?auth=error&reason=... without detail.
import { githubOAuth, clientOrigins } from "../../config/env.js";
import { parseRepoPath, fetchRepo, exchangeCodeForToken, fetchGitHubUser } from "../../integrations/github.js";
import { userService } from "../users/user.service.js";
import { sessionService, getSessionFromRequest } from "./session.service.js";
import { getSessionCookieId, setSessionCookie, clearSessionCookie, SESSION_TTL_MS } from "./session.cookie.js";
import { createOAuthState, peekOAuthState, consumeOAuthState } from "./auth.service.js";

// Sends a 500 and returns null when the OAuth App is not configured on this server.
function requireGithubConfig(res) {
  const config = githubOAuth();
  if (!config.clientId || !config.clientSecret || !config.callbackUrl) {
    res.status(500).json({ status: "error", message: "GitHub OAuth is not configured on the server." });
    return null;
  }
  return config;
}

/** GET /api/auth/github/start[?repo=owner/name] - step 1: redirect to GitHub's consent page. */
export function handleAuthStart(req, res) {
  const config = requireGithubConfig(res);
  if (!config) return;

  let repoFullName = null;
  if (req.query.repo) {
    const parsed = parseRepoPath(req.query.repo);
    if (!parsed) return res.status(400).json({ status: "invalid" });
    repoFullName = parsed.fullName;
  }

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", config.callbackUrl); // from server config, never from the request
  authorizeUrl.searchParams.set("scope", "repo"); // lets signed-in users analyze their private repositories
  authorizeUrl.searchParams.set("state", createOAuthState(repoFullName));
  authorizeUrl.searchParams.set("allow_signup", "false");
  res.redirect(authorizeUrl.toString());
}

/** GET /api/auth/github/callback?code&state - step 3: turn GitHub's answer into a session. */
export async function handleAuthCallback(req, res) {
  const origin = clientOrigins()[0] || "";
  const { code, state, error } = req.query;

  function signError(reason, repo) {
    const repoPart = repo ? `&repo=${encodeURIComponent(repo)}` : "";
    res.redirect(`${origin}/sign?auth=error&reason=${reason}${repoPart}`);
  }

  // The user pressed "Cancel" on GitHub.
  if (error) return signError("cancelled", peekOAuthState(state)?.repo);

  // Only accept callbacks for sign-ins this server started, once, within 10 minutes.
  const pending = consumeOAuthState(state);
  if (!pending) return signError("state_mismatch");
  if (pending.expired) return signError("expired", pending.repo);

  const config = requireGithubConfig(res);
  if (!config) return;
  if (!code) return signError("no_code", pending.repo);

  const token = await exchangeCodeForToken({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    code,
    redirectUri: config.callbackUrl,
  });
  if (!token) return signError("token_exchange_failed", pending.repo);

  let githubUser;
  try {
    // Signing in to analyze a specific repository: make sure this account can see it.
    if (pending.repo) {
      const [owner, repo] = pending.repo.split("/");
      const result = await fetchRepo(owner, repo, token);
      if (!result.found) return signError("not_found", pending.repo);
    }
    githubUser = await fetchGitHubUser(token);
  } catch {
    return signError("github_unreachable", pending.repo);
  }
  if (!githubUser) return signError("github_unreachable", pending.repo);

  // GitHub has proven who this is. Record the user and start a server-side session.
  const user = await userService.upsertFromGitHub(githubUser);
  const sessionId = await sessionService.create({ userId: user.id, token, ttlMs: SESSION_TTL_MS });
  setSessionCookie(res, sessionId);

  const dest = pending.repo ? `/?auth=success&repo=${encodeURIComponent(pending.repo)}` : "/dashboard?auth=success";
  res.redirect(`${origin}${dest}`);
}

/** GET /api/auth/session - public: { authenticated, user } for the landing page header. */
export async function handleAuthSession(req, res) {
  const session = await getSessionFromRequest(req);
  if (!session) return res.json({ authenticated: false, user: null });

  const user = await userService.findById(session.userId);
  res.json({
    authenticated: true,
    user: user ? { username: user.username, avatarUrl: user.avatarUrl } : null,
  });
}

/** POST /api/auth/logout - deletes the session row (the old cookie stops working) and clears the cookie. */
export async function handleAuthLogout(req, res) {
  const id = getSessionCookieId(req);
  if (id) await sessionService.deleteById(id);
  clearSessionCookie(res);
  res.json({ ok: true });
}
