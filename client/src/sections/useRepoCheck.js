import { useState } from "react";
import { apiFetch } from "../lib/api";

export function useRepoCheck() {
  const [repoStatus, setRepoStatus] = useState(null);

  async function checkRepo(rawInput) {
    setRepoStatus("checking");
    try {
      const res = await apiFetch(`/api/repo/check?url=${encodeURIComponent(rawInput)}`);
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
      else setRepoStatus("error");
    } catch {
      setRepoStatus("error");
    }
  }

  function resetRepoCheck() {
    setRepoStatus(null);
  }

  function clearStaleError() {
    setRepoStatus((s) => (s === "checking" ? s : null));
  }

  return { repoStatus, checkRepo, resetRepoCheck, clearStaleError };
}
