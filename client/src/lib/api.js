// In production the frontend (Vercel) and backend (Render) are different
// origins, so every API call needs an absolute URL and credentials:include
// so the session cookie actually gets sent cross-site. Locally VITE_API_URL
// is unset, paths stay relative, and Vite's dev proxy handles the rest —
// same behavior as before this ever needed to be configurable.
export const API_URL = import.meta.env.VITE_API_URL || "";

export function apiUrl(path) {
  return `${API_URL}${path}`;
}

export function apiFetch(path, options = {}) {
  return fetch(apiUrl(path), { credentials: "include", ...options });
}
