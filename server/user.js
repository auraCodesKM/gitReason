import { usersRepo, analysesRepo } from "./db/index.js";
import { getSession } from "./session.js";
import { validateGeminiKey } from "./llm.js";

export async function handleUserMe(req, res) {
  const session = await getSession(req);
  if (!session) return res.json({ authenticated: false, user: null });

  const user = await usersRepo.findById(session.userId);
  res.json({
    authenticated: true,
    user: user
      ? { id: user.id, username: user.username, avatarUrl: user.avatar_url, hasGeminiKey: Boolean(user.gemini_key_enc) }
      : null,
  });
}

// Bring-your-own-key: the plaintext key is accepted here, validated with a
// zero-cost auth check against Gemini, encrypted at rest, and never sent
// back in any response — not here, not from handleUserMe, nowhere. Only
// analyze.js ever decrypts it, server-side, to make the actual LLM call.
export async function handleSetGeminiKey(req, res) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ status: "error", message: "Not signed in." });

  const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
  if (!apiKey) return res.status(400).json({ status: "error", message: "API key is required." });

  const valid = await validateGeminiKey(apiKey);
  if (!valid) return res.status(400).json({ status: "error", message: "That key didn't work — check it's correct and has the Generative Language API enabled." });

  await usersRepo.setGeminiKey(session.userId, apiKey);
  res.json({ ok: true });
}

export async function handleClearGeminiKey(req, res) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ status: "error", message: "Not signed in." });

  await usersRepo.clearGeminiKey(session.userId);
  res.json({ ok: true });
}

export async function handleUserHistory(req, res) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ status: "error", message: "Not signed in." });

  res.json({ history: await analysesRepo.listByUser(session.userId) });
}

export async function handleUserHistoryItem(req, res) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ status: "error", message: "Not signed in." });

  const analysis = await analysesRepo.findById(req.params.id);
  if (!analysis || analysis.userId !== session.userId) {
    return res.status(404).json({ status: "not_found" });
  }

  res.json({ analysis });
}
