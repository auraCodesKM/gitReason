// HTTP handlers for the signed-in user's own account data.
// Except handleUserMe, every handler runs after requireAuth, so req.auth.userId
// is the user taken from the server-side session - never from the request.
import { userService } from "./user.service.js";
import { getSessionFromRequest } from "../auth/session.service.js";
import { validateGeminiKey } from "../../integrations/gemini.js";
import { fetchContributionCalendar, fetchRepoLanguages, parseRepoPath } from "../../integrations/github.js";

/** GET /api/user/me - public: answers "who am I?" ({ authenticated: false } when signed out). */
export async function handleUserMe(req, res) {
  const session = await getSessionFromRequest(req);
  if (!session) return res.json({ authenticated: false, user: null });

  const user = await userService.findById(session.userId);
  res.json({
    authenticated: true,
    user: user ? { id: user.id, username: user.username, avatarUrl: user.avatarUrl, hasGeminiKey: user.hasGeminiKey } : null,
  });
}

/** POST /api/user/gemini-key { apiKey } - checks the key with Google, then stores it encrypted. */
export async function handleSetGeminiKey(req, res) {
  const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
  if (!apiKey) return res.status(400).json({ status: "error", message: "API key is required." });

  const valid = await validateGeminiKey(apiKey);
  if (!valid) return res.status(400).json({ status: "error", message: "That key didn't work — check it's correct and has the Generative Language API enabled." });

  await userService.setGeminiKey(req.auth.userId, apiKey);
  res.json({ ok: true });
}

/** DELETE /api/user/gemini-key */
export async function handleClearGeminiKey(req, res) {
  await userService.clearGeminiKey(req.auth.userId);
  res.json({ ok: true });
}

/** GET /api/user/github-activity - contribution calendar for the dashboard (GitHub GraphQL, no database). */
export async function handleUserGithubActivity(req, res) {
  const user = await userService.findById(req.auth.userId);
  if (!user) return res.status(401).json({ status: "error", message: "Not signed in." });

  const calendar = await fetchContributionCalendar(user.username, req.auth.token).catch(() => null);
  if (!calendar) return res.json({ available: false });

  res.json({ available: true, ...calendar });
}

/** GET /api/user/repo-languages?repo=owner/name - language bytes from GitHub, with the user's token. */
export async function handleRepoLanguages(req, res) {
  const parsed = parseRepoPath(req.query.repo);
  if (!parsed) return res.status(400).json({ status: "invalid" });

  const languages = await fetchRepoLanguages(parsed.owner, parsed.repo, req.auth.token).catch(() => null);
  res.json({ languages: languages || {} });
}
