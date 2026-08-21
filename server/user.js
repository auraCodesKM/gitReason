import { usersRepo, analysesRepo } from "./db/index.js";
import { getSession } from "./session.js";

export function handleUserMe(req, res) {
  const session = getSession(req);
  if (!session) return res.json({ authenticated: false, user: null });

  const user = usersRepo.findById(session.userId);
  res.json({
    authenticated: true,
    user: user ? { id: user.id, username: user.username, avatarUrl: user.avatar_url } : null,
  });
}

export function handleUserHistory(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ status: "error", message: "Not signed in." });

  res.json({ history: analysesRepo.listByUser(session.userId) });
}

export function handleUserHistoryItem(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ status: "error", message: "Not signed in." });

  const analysis = analysesRepo.findById(req.params.id);
  if (!analysis || analysis.userId !== session.userId) {
    return res.status(404).json({ status: "not_found" });
  }

  res.json({ analysis });
}
