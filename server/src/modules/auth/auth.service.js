// OAuth `state`: a one-time random value that ties GitHub's callback to a
// sign-in this server actually started (protects the callback from forged or
// replayed requests).
//
// Kept in process memory: a sign-in that spans a server restart fails and must
// be retried, and the state is not bound to the browser that started it.
// Both are accepted limitations for this project (see EVALUATION_READINESS.md).
import crypto from "node:crypto";

export const STATE_TTL_MS = 10 * 60 * 1000; // a sign-in must finish within 10 minutes

const pendingStates = new Map(); // state -> { repo, createdAt }

function pruneExpired() {
  const now = Date.now();
  for (const [state, entry] of pendingStates) {
    if (now - entry.createdAt > STATE_TTL_MS) pendingStates.delete(state);
  }
}

/**
 * Starts a sign-in.
 * @param {string|null} repo repository to return to after sign-in, if any
 * @returns {string} the random state value to send to GitHub
 */
export function createOAuthState(repo) {
  pruneExpired();
  const state = crypto.randomBytes(24).toString("hex");
  pendingStates.set(state, { repo, createdAt: Date.now() });
  return state;
}

/** @returns {{ repo: string|null, createdAt: number } | null} the pending sign-in, without consuming it */
export function peekOAuthState(state) {
  return (state && pendingStates.get(state)) || null;
}

/**
 * Consumes a state exactly once (single use: a replayed callback finds nothing).
 * @returns {{ repo: string|null, expired: boolean } | null} null if unknown
 */
export function consumeOAuthState(state) {
  const pending = peekOAuthState(state);
  if (!pending) return null;
  pendingStates.delete(state);
  return { repo: pending.repo, expired: Date.now() - pending.createdAt > STATE_TTL_MS };
}
