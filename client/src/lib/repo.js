export function normalizeRepoInput(raw) {
  return raw
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.git$/i, "");
}

export function isValidRepoPath(path) {
  return /^[\w.-]+\/[\w.-]+$/.test(path);
}
