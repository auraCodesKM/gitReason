import { useState } from "react";

export function useRepoCheck() {
  const [repoStatus, setRepoStatus] = useState(null); // 'checking' | 'invalid' | 'not_found' | 'error' | 'rate_limited'

  async function checkRepo(rawInput) {
    setRepoStatus("checking");
    try {
      const res = await fetch(`/api/repo/check?url=${encodeURIComponent(rawInput)}`);
      const data = await res.json();

      if (data.status === "ready") {
        window.location.href = `/analyze?repo=${encodeURIComponent(data.repo.fullName)}`;
        return;
      }

      if (data.status === "auth_required") {
        window.location.href = `/sign?repo=${encodeURIComponent(data.repo)}`;
        return;
      }

      if (data.status === "not_found") setRepoStatus("not_found");
      else if (data.status === "invalid") setRepoStatus("invalid");
      else if (data.status === "rate_limited") setRepoStatus("rate_limited");
      else setRepoStatus("error"); // server-side error (e.g. GitHub unreachable) is not a bad input
    } catch {
      setRepoStatus("error");
    }
  }

  function resetRepoCheck() {
    setRepoStatus(null);
  }

  // clears a stale invalid/not_found/error message once the user edits the
  // text again, so the old error doesn't linger next to newly-typed input
  function clearStaleError() {
    setRepoStatus((s) => (s === "checking" ? s : null));
  }

  return { repoStatus, checkRepo, resetRepoCheck, clearStaleError };
}
