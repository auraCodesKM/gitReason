import { useEffect, useRef, useState } from "react";
import { useRepoCheck } from "../sections/useRepoCheck";
import { normalizeRepoInput, isValidRepoPath } from "../lib/repo";
import "./analyze-repo-button.css";

const ERROR_COPY = {
  invalid: "Enter a valid GitHub repository, like owner/repository.",
  not_found: "Repository not found or still not accessible with this account.",
  error: "Couldn't reach GitHub. Try again.",
  rate_limited: "GitHub rate limit reached. Try again shortly.",
};

export function AnalyzeRepoButton({ className = "", label = "+ Analyze repository", autoOpen = false }) {
  const [open, setOpen] = useState(autoOpen);
  const [value, setValue] = useState("");
  const { repoStatus, checkRepo, clearStaleError } = useRepoCheck();
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function submit(e) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!isValidRepoPath(trimmed)) return;
    checkRepo(trimmed);
  }

  return (
    <div className={`analyze-repo-trigger ${className}`} ref={ref}>
      <button type="button" className="btn btn-solid" onClick={() => setOpen((v) => !v)}>
        {label}
      </button>
      {open && (
        <div className="analyze-repo-popover">
          <form onSubmit={submit}>
            <span className="analyze-repo-prefix">github.com/</span>
            <input
              type="text"
              placeholder="owner/repository"
              value={value}
              onChange={(e) => { setValue(normalizeRepoInput(e.target.value)); clearStaleError(); }}
              disabled={repoStatus === "checking"}
              autoFocus
            />
            <button type="submit" className="btn btn-solid" disabled={repoStatus === "checking" || !isValidRepoPath(value.trim())}>
              {repoStatus === "checking" ? "Checking…" : "Analyze"}
            </button>
          </form>
          {repoStatus && repoStatus !== "checking" && (
            <p className="analyze-repo-error">{ERROR_COPY[repoStatus] || ERROR_COPY.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
